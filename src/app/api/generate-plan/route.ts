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

// Initialize Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export async function POST(req: Request) {
  try {
    const { raceDate, goalTime, currentMileage } = await req.json();
    
    // Generate a unique ID for this request
    const requestId = crypto.randomUUID();
    
    // Store initial status in Redis
    await redis.set(requestId, JSON.stringify({
      status: 'processing',
      progress: 0,
      plan: ''
    }), { ex: 3600 }); // Expire after 1 hour

    // Start plan generation in the background
    generatePlanInBackground(requestId, raceDate, goalTime, currentMileage);

    // Return immediately with the request ID
    return NextResponse.json({ 
      requestId,
      message: 'Plan generation started',
      status: 'processing'
    });

  } catch (error) {
    console.error('Error initiating plan generation:', error);
    return NextResponse.json(
      { error: 'Failed to start plan generation' },
      { status: 500 }
    );
  }
}

// New endpoint to check status
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

    const planData = await redis.get<string>(requestId);
    if (!planData) {
      return NextResponse.json(
        { error: 'Plan not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(JSON.parse(planData));

  } catch (error) {
    console.error('Error checking plan status:', error);
    return NextResponse.json(
      { error: 'Failed to check plan status' },
      { status: 500 }
    );
  }
}

async function generatePlanInBackground(requestId: string, raceDate: string, goalTime: any, currentMileage: string) {
  try {
    const today = new Date();
    const raceDateObj = new Date(raceDate);
    const totalDays = differenceInDays(raceDateObj, today);
    let currentDate = today;
    let weekNumber = 1;
    let fullPlan = '';

    // Generate plan week by week
    while (currentDate < raceDateObj) {
      const endDate = addDays(currentDate, 6);
      const lastTrainingDay = endDate > raceDateObj ? raceDateObj : endDate;

      const prompt = `Create a marathon training plan for the following 7 days.
${weekNumber === 1 ? `
Runner Profile:
- Race Day: ${format(raceDateObj, 'EEEE, MMMM d, yyyy')}
- Goal Time: ${goalTime.hours}h${goalTime.minutes}m${goalTime.seconds}s
- Current Weekly Mileage: ${currentMileage} miles

Training Overview:
Provide a brief overview of the training approach.
` : ''}

Format each week like this:
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
${Array.from({ length: differenceInDays(lastTrainingDay, currentDate) + 1 }).map((_, i) => {
  const date = addDays(currentDate, i);
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
      fullPlan += (weekNumber > 1 ? '\n\n' : '') + weekPlan;

      // Update progress in Redis
      const progress = Math.min(100, Math.round((differenceInDays(lastTrainingDay, today) / totalDays) * 100));
      await redis.set(requestId, JSON.stringify({
        status: 'processing',
        progress,
        plan: fullPlan
      }), { ex: 3600 }); // Expire after 1 hour

      // Move to next week
      currentDate = addDays(lastTrainingDay, 1);
      weekNumber++;
    }

    // Mark as complete in Redis
    await redis.set(requestId, JSON.stringify({
      status: 'complete',
      progress: 100,
      plan: fullPlan
    }), { ex: 3600 }); // Expire after 1 hour

  } catch (error) {
    console.error('Error generating plan:', error);
    await redis.set(requestId, JSON.stringify({
      status: 'error',
      progress: 0,
      error: 'Failed to generate plan'
    }), { ex: 3600 }); // Expire after 1 hour
  }
} 