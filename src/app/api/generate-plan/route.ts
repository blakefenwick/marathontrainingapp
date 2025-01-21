import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';
import { differenceInDays, addDays, format, subDays, startOfWeek, endOfWeek } from 'date-fns';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
    ? `Create a marathon training plan. This is part of a ${totalDays} day training plan.

Runner Profile:
- Race Day: ${raceDay}
- Goal Time: ${goalTime.hours}h${goalTime.minutes}m${goalTime.seconds}s
- Current Weekly Mileage: ${currentMileage} miles

Training Overview:
Provide a brief overview of the training approach.

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
    const lastTrainingDay = subDays(raceDateObj, 1);

    // Break the plan into 30-day chunks
    const chunks = [];
    let currentStartDate = today;
    let weekNumber = 1;

    while (currentStartDate < lastTrainingDay) {
      const chunkEndDate = addDays(currentStartDate, 29); // 30 days per chunk
      const actualEndDate = chunkEndDate > lastTrainingDay ? lastTrainingDay : chunkEndDate;
      
      chunks.push({
        startDate: currentStartDate,
        endDate: actualEndDate,
        weekNumber: weekNumber
      });
      
      // Calculate how many weeks are in this chunk
      const weeksInChunk = Math.ceil(differenceInDays(actualEndDate, currentStartDate) / 7);
      weekNumber += weeksInChunk;
      currentStartDate = addDays(actualEndDate, 1);
    }

    // Generate plan for each chunk
    let fullPlan = '';
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const prompt = generatePromptForDateRange(
        chunk.startDate,
        chunk.endDate,
        i === 0, // is this the first chunk?
        format(raceDateObj, 'EEEE, MMMM d, yyyy'),
        goalTime,
        currentMileage,
        daysUntilRace,
        chunk.weekNumber
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
        model: "gpt-4-turbo-preview",
        temperature: 0.7,
        max_tokens: 4000,
        response_format: { type: "text" }
      });

      // For chunks after the first, remove any overview text before the first week header
      let chunkContent = completion.choices[0].message.content || '';
      if (i > 0 && chunkContent) {
        const firstWeekIndex = chunkContent.indexOf('## Week');
        if (firstWeekIndex > 0) {
          chunkContent = chunkContent.substring(firstWeekIndex);
        }
      }

      fullPlan += (i > 0 ? '\n\n' : '') + chunkContent;
    }

    return NextResponse.json({ plan: fullPlan });
  } catch (error) {
    console.error('Error generating training plan:', error);
    return NextResponse.json(
      { error: 'Failed to generate training plan' },
      { status: 500 }
    );
  }
} 