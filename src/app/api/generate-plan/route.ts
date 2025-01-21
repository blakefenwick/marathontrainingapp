import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';
import { differenceInDays, addDays, format } from 'date-fns';

// Configure runtime
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Version check
console.log('Running Edge Runtime version with streaming - v2');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  // Create a TransformStream for streaming the response
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  // Start processing in the background
  (async () => {
    try {
      const { raceDate, goalTime, currentMileage, startDate } = await req.json();

      // Send initial response to prevent timeout
      await writer.write(encoder.encode('Generating your training plan...\n\n'));

      // Calculate dates
      const today = startDate ? new Date(startDate) : new Date();
      const raceDateObj = new Date(raceDate);
      const totalDays = differenceInDays(raceDateObj, today);
      
      // Generate plan for next 7 days only (reduced from 14 for faster response)
      const endDate = addDays(today, 6);
      const lastTrainingDay = endDate > raceDateObj ? raceDateObj : endDate;
      const weekNumber = Math.floor(differenceInDays(today, new Date()) / 7) + 1;

      // Create optimized prompt
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
        stream: true,
      });

      // Stream the response
      for await (const chunk of response) {
        const text = chunk.choices[0]?.delta?.content || '';
        if (text) {
          await writer.write(encoder.encode(text));
        }
      }

      // Send metadata at the end
      await writer.write(encoder.encode('\n\n__METADATA__' + JSON.stringify({
        hasMore: lastTrainingDay < raceDateObj,
        nextDate: addDays(lastTrainingDay, 1).toISOString()
      })));

    } catch (error) {
      console.error('Error generating plan:', error);
      await writer.write(encoder.encode('Error: Failed to generate training plan'));
    } finally {
      await writer.close();
    }
  })();

  // Return the stream immediately
  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    },
  });
} 