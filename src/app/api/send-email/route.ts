import { NextResponse } from 'next/server';
import { Resend } from 'resend';

// Use Edge runtime for better compatibility
export const runtime = 'edge';

console.log('Initializing send-email route with Resend...');

if (!process.env.RESEND_API_KEY) {
  console.error('Missing RESEND_API_KEY environment variable');
  throw new Error('Missing RESEND_API_KEY environment variable');
}

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    console.log('Starting email send request...');
    
    const { email, subject, plan, raceDate } = await req.json();
    console.log('Received email request for:', email);

    // Use the email address you signed up with
    const fromEmail = email; // This will use the same email as the recipient
    console.log('Sending from:', fromEmail);

    try {
      const data = await resend.emails.send({
        from: fromEmail,
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
      return NextResponse.json({ success: true, data });
    } catch (sendError) {
      console.error('Failed to send email:', sendError);
      console.error('Error details:', {
        error: sendError instanceof Error ? sendError.message : 'Unknown error',
        stack: sendError instanceof Error ? sendError.stack : undefined
      });
      throw new Error('Failed to send email: ' + (sendError instanceof Error ? sendError.message : 'Unknown error'));
    }
  } catch (error) {
    console.error('Error in email route:', error);
    console.error('Full error details:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send email' },
      { status: 500 }
    );
  }
} 