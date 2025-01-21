import { NextResponse } from 'next/server';
import { Resend } from 'resend';

// Use Edge runtime for better compatibility
export const runtime = 'edge';

if (!process.env.RESEND_API_KEY) {
  throw new Error('Missing RESEND_API_KEY environment variable');
}

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    console.log('Starting email send request...');
    
    const { email, subject, plan, raceDate } = await req.json();
    console.log('Received email request for:', email);

    try {
      const data = await resend.emails.send({
        from: 'Marathon Training Plan <onboarding@resend.dev>',
        to: email,
        subject: subject,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #2563eb;">Your Marathon Training Plan</h1>
            <p>Here's your personalized training plan for your marathon on ${raceDate}.</p>
            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; white-space: pre-wrap; font-family: monospace;">
              ${plan}
            </div>
            <p style="margin-top: 20px; color: #4b5563;">
              Good luck with your training! Remember to listen to your body and adjust the plan as needed.
            </p>
          </div>
        `
      });

      console.log('Email sent successfully:', data);
      return NextResponse.json({ success: true });
    } catch (sendError) {
      console.error('Failed to send email:', sendError);
      throw new Error('Failed to send email: ' + (sendError instanceof Error ? sendError.message : 'Unknown error'));
    }
  } catch (error) {
    console.error('Error in email route:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send email' },
      { status: 500 }
    );
  }
} 