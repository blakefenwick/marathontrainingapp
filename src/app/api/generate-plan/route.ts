import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';
import { differenceInDays, addDays, format } from 'date-fns';
import { Redis } from '@upstash/redis';

// Configure runtime
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Version check
console.log('Running Edge Runtime version with streaming - v2');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Redis client or use in-memory storage for local development
let redis: Redis | null = null;
const inMemoryStore = new Map<string, string>();

try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    console.log('Redis initialized');
  } else {
    console.log('Using in-memory storage for local development');
  }
} catch (error) {
  console.error('Failed to initialize Redis:', error);
  console.log('Falling back to in-memory storage');
}

// Helper function to handle storage operations
async function storage(operation: 'get' | 'set', key: string, value?: any, options?: { ex: number }) {
  try {
    if (redis) {
      if (operation === 'get') {
        return await redis.get(key);
      } else {
        return await redis.set(key, value, options);
      }
    } else {
      if (operation === 'get') {
        return inMemoryStore.get(key);
      } else {
        inMemoryStore.set(key, value);
        if (options?.ex) {
          setTimeout(() => inMemoryStore.delete(key), options.ex * 1000);
        }
        return 'OK';
      }
    }
  } catch (error) {
    console.error(`Storage operation failed (${operation}):`, error);
    if (operation === 'get') {
      return inMemoryStore.get(key);
    } else {
      inMemoryStore.set(key, value);
      if (options?.ex) {
        setTimeout(() => inMemoryStore.delete(key), options.ex * 1000);
      }
      return 'OK';
    }
  }
}

export async function POST(req: Request) {
  try {
    console.log('Starting plan generation request...');
    
    const { raceDate, goalTime, currentMileage, email } = await req.json();
    console.log('Received data:', { raceDate, goalTime, currentMileage, email });
    
    const requestId = crypto.randomUUID();
    console.log('Generated requestId:', requestId);

    // Store initial request
    await storage('set', `request:${requestId}`, JSON.stringify({
      status: 'processing',
      email,
      raceDate,
      goalTime,
      currentMileage,
      plan: '',
      completedWeeks: 0
    }), { ex: 3600 });

    // Start background processing
    generateFullPlan(requestId, raceDate, goalTime, currentMileage, email).catch(error => {
      console.error('Background processing failed:', error);
    });

    console.log('Background processing initiated');
    return NextResponse.json({
      message: "Your training plan is being generated. You'll receive an email when it's ready.",
      requestId
    });

  } catch (error) {
    console.error('Error in POST handler:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to initiate plan generation' },
      { status: 500 }
    );
  }
}

async function generateFullPlan(
  requestId: string,
  raceDate: string,
  goalTime: { hours: string; minutes: string; seconds: string },
  currentMileage: string,
  email: string
) {
  try {
    console.log('Starting plan generation for requestId:', requestId);
    
    const raceDateObj = new Date(raceDate);
    const today = new Date();
    let currentWeek = 1;
    let fullPlan = '';

    while (true) {
      console.log(`Generating week ${currentWeek}...`);
      
      const startDate = currentWeek === 1 ? today : addDays(today, (currentWeek - 1) * 7);
      const endDate = addDays(startDate, 6);
      const lastTrainingDay = endDate > raceDateObj ? raceDateObj : endDate;

      if (startDate >= raceDateObj) {
        console.log('Reached race date, stopping generation');
        break;
      }

      // Generate plan for current week
      try {
        const prompt = `Create a marathon training plan for Week ${currentWeek}.
${currentWeek === 1 ? `
Runner Profile:
- Race Day: ${format(raceDateObj, 'EEEE, MMMM d, yyyy')}
- Goal Time: ${goalTime.hours}h${goalTime.minutes}m${goalTime.seconds}s
- Current Weekly Mileage: ${currentMileage} miles

Training Overview:
Provide a brief overview of the training approach.
` : ''}

Format the week like this:
## Week ${currentWeek}
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
        console.log(`Week ${currentWeek} generated successfully`);

        const weekPlan = response.choices[0]?.message?.content || '';
        fullPlan += (fullPlan ? '\n\n' : '') + weekPlan;
      } catch (openaiError) {
        console.error('OpenAI API error:', openaiError);
        throw new Error('Failed to generate training plan');
      }

      // Update progress
      await storage('set', `request:${requestId}`, JSON.stringify({
        status: 'processing',
        email,
        raceDate,
        goalTime,
        currentMileage,
        plan: fullPlan,
        completedWeeks: currentWeek
      }), { ex: 3600 });

      if (lastTrainingDay >= raceDateObj) break;
      currentWeek++;
    }

    console.log('Plan generation completed, sending email...');
    
    // Send email using the separate email endpoint
    try {
      const emailResponse = await fetch(`${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/api/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          subject: 'Your Marathon Training Plan',
          plan: fullPlan,
          raceDate: format(raceDateObj, 'MMMM d, yyyy')
        }),
      });

      if (!emailResponse.ok) {
        const errorData = await emailResponse.json();
        console.error('Email sending failed:', errorData);
        throw new Error('Failed to send email');
      }
      console.log('Email sent successfully');
    } catch (emailError) {
      console.error('Email error:', emailError);
      throw new Error('Failed to send email');
    }

    // Update final status
    await storage('set', `request:${requestId}`, JSON.stringify({
      status: 'completed',
      email,
      raceDate,
      goalTime,
      currentMileage,
      plan: fullPlan,
      completedWeeks: currentWeek
    }), { ex: 3600 });

  } catch (error) {
    console.error('Error in generateFullPlan:', error);
    await storage('set', `request:${requestId}`, JSON.stringify({
      status: 'error',
      error: error instanceof Error ? error.message : 'Failed to generate plan'
    }), { ex: 3600 });
  }
}

// Endpoint to check status
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

    const data = await storage('get', `request:${requestId}`);
    if (!data) {
      return NextResponse.json(
        { error: 'Request not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(JSON.parse(data));

  } catch (error) {
    console.error('Error checking status:', error);
    return NextResponse.json(
      { error: 'Failed to check status' },
      { status: 500 }
    );
  }
} 