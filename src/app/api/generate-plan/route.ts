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
    const { raceDate, goalTime, currentMileage, email } = await req.json();
    const requestId = crypto.randomUUID();

    // Store initial request in Redis
    await redis.set(`request:${requestId}`, JSON.stringify({
      status: 'processing',
      email,
      raceDate,
      goalTime,
      currentMileage,
      plan: '',
      completedWeeks: 0
    }), { ex: 3600 }); // Expire after 1 hour

    // Start background processing
    generateFullPlan(requestId, raceDate, goalTime, currentMileage, email).catch(console.error);

    return NextResponse.json({
      message: "Your training plan is being generated. You'll receive an email when it's ready.",
      requestId
    });

  } catch (error) {
    console.error('Error initiating plan generation:', error);
    return NextResponse.json(
      { error: 'Failed to initiate plan generation' },
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
    const raceDateObj = new Date(raceDate);
    const today = new Date();
    let currentWeek = 1;
    let fullPlan = '';

    while (true) {
      const startDate = currentWeek === 1 ? today : addDays(today, (currentWeek - 1) * 7);
      const endDate = addDays(startDate, 6);
      const lastTrainingDay = endDate > raceDateObj ? raceDateObj : endDate;

      // If we're past the race date, break
      if (startDate >= raceDateObj) break;

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

      const weekPlan = response.choices[0]?.message?.content || '';
      fullPlan += (fullPlan ? '\n\n' : '') + weekPlan;

      // Update progress in Redis
      await redis.set(`request:${requestId}`, JSON.stringify({
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

    // Send email using the separate email endpoint
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
      throw new Error('Failed to send email');
    }

    // Update final status in Redis
    await redis.set(`request:${requestId}`, JSON.stringify({
      status: 'completed',
      email,
      raceDate,
      goalTime,
      currentMileage,
      plan: fullPlan,
      completedWeeks: currentWeek
    }), { ex: 3600 });

  } catch (error) {
    console.error('Error generating full plan:', error);
    // Update error status in Redis
    await redis.set(`request:${requestId}`, JSON.stringify({
      status: 'error',
      error: 'Failed to generate plan'
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

    const data = await redis.get<string>(`request:${requestId}`);
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