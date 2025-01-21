import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';
import { differenceInDays, addDays, format } from 'date-fns';
import { Redis } from '@upstash/redis';

// Configure runtime
export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Version check - v1.2.7 (Performance Optimization)
console.log('Running Edge Runtime version - v1.2.7');

// Validate environment variables
const requiredEnvVars = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  VERCEL_URL: process.env.VERCEL_URL
};

console.log('Environment Variables Status:', {
  OPENAI_API_KEY: !!process.env.OPENAI_API_KEY ? 'Set' : 'Missing',
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL ? 'Set' : 'Missing',
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN ? 'Set' : 'Missing',
  VERCEL_URL: process.env.VERCEL_URL ? 'Set' : 'Missing'
});

// Define types
interface PlanState {
  status: 'initialized' | 'in_progress' | 'completed' | 'error';
  email: string;
  raceDate: string;
  goalTime: {
    hours: string;
    minutes: string;
    seconds: string;
  };
  currentMileage: string;
  totalWeeks: number;
  currentWeek: number;
  weeks: Record<string, string>;
  error: string | null;
  startTime: string;
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

// Initialize Redis client with explicit error handling
function initializeRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.error('Redis credentials missing:', {
      hasUrl: !!url,
      hasToken: !!token
    });
    throw new Error('Redis credentials not configured');
  }

  console.log('Initializing Redis with URL:', url.substring(0, 20) + '...');
  
  return new Redis({
    url,
    token,
    automaticDeserialization: false  // Handle JSON manually for better error control
  });
}

const redis = initializeRedis();

// Calculate total weeks between dates
function calculateTotalWeeks(startDate: Date, raceDate: Date): number {
  const totalDays = differenceInDays(raceDate, startDate);
  return Math.ceil(totalDays / 7);
}

// Add validation function
function isValidPlanState(state: any): state is PlanState {
  return (
    state &&
    typeof state === 'object' &&
    typeof state.status === 'string' &&
    ['initialized', 'in_progress', 'completed', 'error'].includes(state.status) &&
    typeof state.email === 'string' &&
    typeof state.raceDate === 'string' &&
    state.goalTime &&
    typeof state.goalTime === 'object' &&
    typeof state.goalTime.hours === 'string' &&
    typeof state.goalTime.minutes === 'string' &&
    typeof state.goalTime.seconds === 'string' &&
    typeof state.currentMileage === 'string' &&
    typeof state.totalWeeks === 'number' &&
    typeof state.currentWeek === 'number' &&
    typeof state.weeks === 'object' &&
    (state.error === null || typeof state.error === 'string') &&
    typeof state.startTime === 'string'
  );
}

export async function POST(req: Request) {
  try {
    // Validate OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key is not configured');
    }

    const { raceDate, goalTime, currentMileage, email } = await req.json();
    const requestId = crypto.randomUUID();
    const today = new Date();
    const raceDateObj = new Date(raceDate);
    const totalWeeks = calculateTotalWeeks(today, raceDateObj);

    const initialState: PlanState = {
      status: 'initialized',
      email,
      raceDate,
      goalTime,
      currentMileage,
      totalWeeks,
      currentWeek: 0,
      weeks: {},
      error: null,
      startTime: new Date().toISOString()
    };

    // Initialize request in Redis
    await redis.set(`request:${requestId}`, JSON.stringify(initialState), { ex: 3600 }); // Expire in 1 hour

    return NextResponse.json({
      message: "Training plan generation initialized",
      requestId,
      totalWeeks
    });

  } catch (error) {
    console.error('Error in POST handler:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to initialize plan generation' },
      { status: 500 }
    );
  }
}

// Update PUT handler
export async function PUT(req: Request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000); // 25 second timeout

  try {
    const { requestId, weekNumber } = await req.json();
    console.log('Generating week', weekNumber, 'for request', requestId);
    
    const stateStr = await redis.get<string>(`request:${requestId}`);
    if (!stateStr) {
      throw new Error('Request not found');
    }

    const state = JSON.parse(stateStr);
    if (!isValidPlanState(state)) {
      throw new Error('Invalid state data structure');
    }

    // Update status to show which week is being generated
    state.status = 'in_progress';
    state.currentWeek = weekNumber;
    await redis.set(`request:${requestId}`, JSON.stringify(state), { ex: 3600 });

    const raceDateObj = new Date(state.raceDate);
    const today = new Date();
    const startDate = addDays(today, (weekNumber - 1) * 7);
    const endDate = addDays(startDate, 6);
    const lastTrainingDay = endDate > raceDateObj ? raceDateObj : endDate;

    if (startDate >= raceDateObj) {
      throw new Error('Week is beyond race date');
    }

    // Simplified prompt for faster response
    const prompt = `Create a concise marathon training plan for Week ${weekNumber}.
Runner: Goal ${state.goalTime.hours}h${state.goalTime.minutes}m, Current ${state.currentMileage} miles/week
Dates: ${format(startDate, 'MMM d')} - ${format(lastTrainingDay, 'MMM d')}

Format:
## Week ${weekNumber}
Weekly Target: [X] miles
Key Workouts: Long run, Speed work

Daily format:
[Day]: [Distance] miles - [Type] - [Pace]`;

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a marathon coach. Create specific daily workouts that build progressively.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 500, // Reduced from 1000
      temperature: 0.3, // Reduced from 0.5 for more consistent responses
    }, { signal: controller.signal });

    clearTimeout(timeout);

    const weekPlan = response.choices[0]?.message?.content || '';
    
    // Update state with new week
    state.weeks[weekNumber] = weekPlan;
    state.status = weekNumber === state.totalWeeks ? 'completed' : 'in_progress';
    
    if (state.status === 'completed') {
      const fullPlan = Object.entries(state.weeks)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([_, plan]) => plan)
        .join('\n\n');

      const emailResponse = await fetch(
        `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/api/send-email`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: state.email,
            subject: 'Your Complete Marathon Training Plan',
            plan: fullPlan,
            raceDate: format(raceDateObj, 'MMMM d, yyyy')
          }),
        }
      );

      if (!emailResponse.ok) {
        console.error('Failed to send email');
      }
    }

    await redis.set(`request:${requestId}`, JSON.stringify(state), { ex: 3600 });

    return NextResponse.json({
      status: state.status,
      weekPlan,
      currentWeek: weekNumber,
      totalWeeks: state.totalWeeks
    });

  } catch (error) {
    clearTimeout(timeout);
    console.error('Error generating week:', error);
    
    // Type guard for AbortError
    if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Generation timeout - please try again' },
        { status: 408 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate week' },
      { status: 500 }
    );
  }
}

// Update connection check
async function checkRedisConnection() {
  try {
    console.log('Testing Redis connection...');
    
    // Test 1: Basic set/get
    const testKey = `test-connection-${Date.now()}`;
    const testValue = `test-value-${Date.now()}`;
    
    console.log('Test 1: Setting test value...');
    await redis.set(testKey, testValue, { ex: 60 });
    
    console.log('Test 1: Getting test value...');
    const retrievedValue = await redis.get(testKey);
    
    console.log('Test 1: Cleaning up...');
    await redis.del(testKey);
    
    if (retrievedValue !== testValue) {
      console.error('Redis value mismatch:', {
        expected: testValue,
        received: retrievedValue
      });
      return false;
    }

    // Test 2: JSON handling
    const jsonKey = `test-json-${Date.now()}`;
    const jsonValue = {
      test: true,
      timestamp: Date.now()
    };

    console.log('Test 2: Setting JSON value...');
    await redis.set(jsonKey, JSON.stringify(jsonValue), { ex: 60 });

    console.log('Test 2: Getting JSON value...');
    const retrievedJson = await redis.get(jsonKey);

    console.log('Test 2: Cleaning up...');
    await redis.del(jsonKey);

    if (!retrievedJson || typeof retrievedJson !== 'string') {
      console.error('Redis JSON test failed:', {
        received: retrievedJson,
        type: typeof retrievedJson
      });
      return false;
    }

    try {
      JSON.parse(retrievedJson);
    } catch (e) {
      console.error('Failed to parse JSON from Redis:', e);
      return false;
    }

    console.log('All Redis tests passed successfully');
    return true;
  } catch (error) {
    console.error('Redis connection test failed with error:', error);
    return false;
  }
}

// Update GET handler
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const requestId = url.searchParams.get('requestId');

    // Log Redis configuration
    console.log('Redis Configuration:', {
      hasUrl: !!process.env.UPSTASH_REDIS_REST_URL,
      hasToken: !!process.env.UPSTASH_REDIS_REST_TOKEN,
      url: process.env.UPSTASH_REDIS_REST_URL?.substring(0, 20) + '...',
    });

    // Test Redis connection
    const isConnected = await checkRedisConnection();
    console.log('Redis connection test:', isConnected ? 'Success' : 'Failed');

    if (!isConnected) {
      return NextResponse.json(
        { 
          error: 'Database connection failed',
          details: 'Unable to connect to Redis'
        },
        { status: 500 }
      );
    }

    if (!requestId) {
      console.error('Status check failed: No requestId provided');
      return NextResponse.json(
        { error: 'No requestId provided' },
        { status: 400 }
      );
    }

    console.log('Checking status for requestId:', requestId);

    try {
      // Try to get the data
      const data = await redis.get<string>(`request:${requestId}`);
      
      // Log the raw response
      console.log('Raw Redis response type:', typeof data);
      console.log('Raw Redis response:', data);
      
      if (!data) {
        console.error('Status check failed: Request not found for ID:', requestId);
        return NextResponse.json(
          { error: 'Request not found' },
          { status: 404 }
        );
      }

      try {
        // Try to parse the data
        const parsedData = JSON.parse(data);
        console.log('Successfully parsed data type:', typeof parsedData);
        console.log('Parsed data structure:', {
          hasStatus: typeof parsedData?.status === 'string',
          statusValue: parsedData?.status,
          hasEmail: typeof parsedData?.email === 'string',
          hasRaceDate: typeof parsedData?.raceDate === 'string',
          hasGoalTime: typeof parsedData?.goalTime === 'object',
          hasMileage: typeof parsedData?.currentMileage === 'string',
          hasWeeks: typeof parsedData?.weeks === 'object',
          keys: Object.keys(parsedData || {})
        });

        if (!isValidPlanState(parsedData)) {
          console.error('Invalid state structure:', parsedData);
          return NextResponse.json(
            { 
              error: 'Invalid state data structure',
              details: {
                hasStatus: typeof parsedData?.status === 'string',
                statusValue: parsedData?.status,
                hasEmail: typeof parsedData?.email === 'string',
                hasRaceDate: typeof parsedData?.raceDate === 'string',
                hasGoalTime: typeof parsedData?.goalTime === 'object',
                hasMileage: typeof parsedData?.currentMileage === 'string',
                hasWeeks: typeof parsedData?.weeks === 'object',
                actualKeys: Object.keys(parsedData || {})
              }
            },
            { status: 500 }
          );
        }

        const state = parsedData;
        return NextResponse.json({
          status: state.status,
          currentWeek: state.currentWeek,
          totalWeeks: state.totalWeeks,
          weeks: state.weeks,
          startTime: state.startTime
        });
      } catch (parseError) {
        console.error('Failed to parse state data:', parseError);
        console.error('Raw data that failed to parse:', data);
        return NextResponse.json(
          { 
            error: 'Invalid state data',
            details: {
              parseError: parseError instanceof Error ? parseError.message : 'Unknown parse error',
              rawDataLength: data.length,
              rawDataPreview: data.slice(0, 100) + '...',
              rawDataType: typeof data
            }
          },
          { status: 500 }
        );
      }
    } catch (redisError) {
      console.error('Redis error:', redisError);
      return NextResponse.json(
        { 
          error: 'Database error',
          details: redisError instanceof Error ? redisError.message : 'Unknown Redis error'
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error in GET handler:', error);
    return NextResponse.json(
      { 
        error: 'Failed to check status', 
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 