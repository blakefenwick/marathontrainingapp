import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';
import { differenceInDays, addDays, format, subDays } from 'date-fns';

// Configure runtime
export const runtime = 'edge';

// Version check
console.log('Running Edge Runtime version with streaming - v2');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface TrainingChunk {
  startDate: Date;
  endDate: Date;
  weekNumber: number;
}

// Function to generate prompt for a specific date range
function generatePromptForDateRange(
  startDate: Date,
  endDate: Date,
  isFirst: boolean,
  raceDay: string,
  goalTime: any,
  currentMileage: string,
  totalDays: number,
  weekNumber: number
) {
  const dates = [];
  let currentDate = startDate;
  while (currentDate <= endDate) {
    dates.push(format(currentDate, 'EEEE, MMMM d, yyyy'));
    currentDate = addDays(currentDate, 1);
  }

  let promptText = isFirst 
    ? `Create a marathon training plan for the first month. This is part of a ${totalDays} day training plan.

Runner Profile:
- Race Day: ${raceDay}
- Goal Time: ${goalTime.hours}h${goalTime.minutes}m${goalTime.seconds}s
- Current Weekly Mileage: ${currentMileage} miles

Training Overview:
Provide a brief overview of the training approach for the first month.

Now, here are your daily workouts for this section:`
    : 'Continue the marathon training plan with the following days:';

  promptText += `

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

Make sure the daily workouts add up to the weekly target mileage.

Provide the plan for these specific dates:`;

  // Add each date to the prompt
  dates.forEach(date => {
    promptText += `\n\n**${date}**\nRun: [Workout for this day]\nPace: [Specific pace]\nNotes: [Tips for this day]`;
  });

  return promptText;
}

export async function POST(req: Request) {
  try {
    const { raceDate, goalTime, currentMileage } = await req.json();

    // Calculate days between today and race date
    const today = new Date();
    const raceDateObj = new Date(raceDate);
    const daysUntilRace = Math.max(1, differenceInDays(raceDateObj, today) + 1);
    
    // Only generate first month (28 days)
    const endDate = addDays(today, 27);
    const lastTrainingDay = endDate > raceDateObj ? raceDateObj : endDate;

    // Generate first month's plan
    const prompt = generatePromptForDateRange(
      today,
      lastTrainingDay,
      true,
      format(raceDateObj, 'EEEE, MMMM d, yyyy'),
      goalTime,
      currentMileage,
      daysUntilRace,
      1
    );

    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are a marathon coach creating a training plan. Start each week with a mileage summary, then provide specific instructions for each day. Make sure daily workouts add up to weekly targets. Do not skip any days. Do not summarize."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      model: "gpt-3.5-turbo",
      temperature: 0.7,
      max_tokens: 2000
    });

    return NextResponse.json({ 
      plan: completion.choices[0].message.content,
      hasMore: lastTrainingDay < raceDateObj,
      nextDate: addDays(lastTrainingDay, 1)
    });

  } catch (error) {
    console.error('Error generating training plan:', error);
    return NextResponse.json(
      { error: 'Failed to generate training plan' },
      { status: 500 }
    );
  }
} 