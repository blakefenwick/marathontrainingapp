import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';
import { differenceInDays, addDays, format } from 'date-fns';

// Configure runtime
export const runtime = 'edge';

// Version check
console.log('Running Edge Runtime version with streaming - v2');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { raceDate, goalTime, currentMileage, startDate } = await req.json();

    // Calculate dates
    const today = startDate ? new Date(startDate) : new Date();
    const raceDateObj = new Date(raceDate);
    const totalDays = differenceInDays(raceDateObj, today);
    
    // Generate plan for next 14 days only
    const endDate = addDays(today, 13); // 14 days
    const lastTrainingDay = endDate > raceDateObj ? raceDateObj : endDate;
    const weekNumber = Math.floor(differenceInDays(today, new Date()) / 7) + 1;

    // Create optimized prompt
    const prompt = `Create a marathon training plan for the following 14 days.
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
${Array.from({ length: differenceInDays(lastTrainingDay, today) + 1 }).map((_, i) => {
  const date = addDays(today, i);
  return format(date, 'EEEE, MMMM d, yyyy');
}).join('\n')}`;

    // Make API call with reduced tokens and temperature
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

    const plan = response.choices[0]?.message?.content || '';
    
    return NextResponse.json({
      plan,
      hasMore: lastTrainingDay < raceDateObj,
      nextDate: addDays(lastTrainingDay, 1).toISOString()
    });

  } catch (error) {
    console.error('Error generating plan:', error);
    return NextResponse.json(
      { error: 'Failed to generate training plan' },
      { status: 500 }
    );
  }
} 