import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';
import { differenceInDays, addDays, format } from 'date-fns';
import { Redis } from '@upstash/redis';

// Configure runtime
export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Version check
console.log('Running Edge Runtime version - v1.2.0 (Chunked Generation)');

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

// Initialize Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

// Calculate total weeks between dates
function calculateTotalWeeks(startDate: Date, raceDate: Date): number {
  const totalDays = differenceInDays(raceDate, startDate);
  return Math.ceil(totalDays / 7);
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

// Generate a specific week's plan
export async function PUT(req: Request) {
  try {
    const { requestId, weekNumber } = await req.json();
    
    // Get current state
    const stateStr = await redis.get<string>(`request:${requestId}`);
    if (!stateStr) {
      throw new Error('Request not found');
    }
    
    const state = JSON.parse(stateStr) as PlanState;
    const raceDateObj = new Date(state.raceDate);
    const today = new Date();
    
    // Calculate dates for this week
    const startDate = addDays(today, (weekNumber - 1) * 7);
    const endDate = addDays(startDate, 6);
    const lastTrainingDay = endDate > raceDateObj ? raceDateObj : endDate;

    if (startDate >= raceDateObj) {
      throw new Error('Week is beyond race date');
    }

    // Generate plan for this week
    const prompt = `Create a marathon training plan for Week ${weekNumber}.
Runner Profile:
- Race Day: ${format(raceDateObj, 'EEEE, MMMM d, yyyy')}
- Goal Time: ${state.goalTime.hours}h${state.goalTime.minutes}m${state.goalTime.seconds}s
- Current Weekly Mileage: ${state.currentMileage} miles

Format the week like this:
## Week ${weekNumber}
> Weekly Target: [X] miles
> Key Workouts: Long run ([X] miles), Speed work ([X] miles)
> Build: [+/- X] miles from previous week

Then list each day in this format:
**[Full Day and Date]**
Run: [Exact workout with distance]
Pace: [Specific pace]
Notes: [Brief tips]

Generate the plan for these dates:
${Array.from({ length: differenceInDays(lastTrainingDay, startDate) + 1 }).map((_, i) => {
  const date = addDays(startDate, i);
  return format(date, 'EEEE, MMMM d, yyyy');
}).join('\n')}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a marathon coach. Create specific daily workouts that build progressively. Include distances, paces, and brief tips.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 1000,
      temperature: 0.5,
    });

    const weekPlan = response.choices[0]?.message?.content || '';
    
    // Update state with new week
    state.weeks[weekNumber] = weekPlan;
    state.currentWeek = weekNumber;
    state.status = weekNumber === state.totalWeeks ? 'completed' : 'in_progress';
    
    // If this is the last week, send email
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

    // Save updated state
    await redis.set(`request:${requestId}`, JSON.stringify(state), { ex: 3600 });

    return NextResponse.json({
      status: state.status,
      weekPlan,
      currentWeek: weekNumber,
      totalWeeks: state.totalWeeks
    });

  } catch (error) {
    console.error('Error generating week:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate week' },
      { status: 500 }
    );
  }
}

// Get current status
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const requestId = url.searchParams.get('requestId');

    if (!requestId) {
      return NextResponse.json(
        { error: 'No requestId provided' },
        { status: 400 }
      );
    }

    const data = await redis.get<string>(`request:${requestId}`);
    if (!data) {
      return NextResponse.json(
        { error: 'Request not found' },
        { status: 404 }
      );
    }

    const state = JSON.parse(data) as PlanState;
    return NextResponse.json({
      status: state.status,
      currentWeek: state.currentWeek,
      totalWeeks: state.totalWeeks,
      weeks: state.weeks,
      startTime: state.startTime
    });

  } catch (error) {
    console.error('Error checking status:', error);
    return NextResponse.json(
      { error: 'Failed to check status' },
      { status: 500 }
    );
  }
} 