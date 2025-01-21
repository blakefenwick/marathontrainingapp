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
    const { raceDate, goalTime, currentMileage, requestId, weekNumber = 1 } = await req.json();

    // If this is the first request, generate a new requestId
    const currentRequestId = requestId || crypto.randomUUID();
    
    const today = weekNumber === 1 ? new Date() : new Date(raceDate);
    const raceDateObj = new Date(raceDate);
    const startDate = weekNumber === 1 ? today : addDays(today, (weekNumber - 1) * 7);
    const endDate = addDays(startDate, 6);
    const lastTrainingDay = endDate > raceDateObj ? raceDateObj : endDate;

    // If we're past the race date, return completed
    if (startDate >= raceDateObj) {
      return NextResponse.json({
        requestId: currentRequestId,
        plan: '',
        hasMore: false
      });
    }

    const prompt = `Create a marathon training plan for Week ${weekNumber}.
${weekNumber === 1 ? `
Runner Profile:
- Race Day: ${format(raceDateObj, 'EEEE, MMMM d, yyyy')}
- Goal Time: ${goalTime.hours}h${goalTime.minutes}m${goalTime.seconds}s
- Current Weekly Mileage: ${currentMileage} miles

Training Overview:
Provide a brief overview of the training approach.
` : ''}

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
    
    // Get existing plan from Redis
    const existingPlanData = await redis.get<string>(currentRequestId);
    const existingPlan = existingPlanData ? JSON.parse(existingPlanData).plan : '';
    
    // Combine existing plan with new week
    const fullPlan = existingPlan ? existingPlan + '\n\n' + weekPlan : weekPlan;
    
    // Store updated plan in Redis
    await redis.set(currentRequestId, JSON.stringify({
      plan: fullPlan,
      weekNumber,
      hasMore: lastTrainingDay < raceDateObj
    }), { ex: 3600 }); // Expire after 1 hour
    
    return NextResponse.json({
      requestId: currentRequestId,
      plan: weekPlan,
      hasMore: lastTrainingDay < raceDateObj,
      nextWeek: weekNumber + 1
    });

  } catch (error) {
    console.error('Error generating plan:', error);
    return NextResponse.json(
      { error: 'Failed to generate plan' },
      { status: 500 }
    );
  }
}

// Endpoint to get the full plan
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
    console.error('Error retrieving plan:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve plan' },
      { status: 500 }
    );
  }
} 