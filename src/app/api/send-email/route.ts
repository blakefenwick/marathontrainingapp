import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

// Use Node.js runtime instead of Edge
export const runtime = 'nodejs';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export async function POST(req: Request) {
  try {
    const { email, subject, plan, raceDate } = await req.json();

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error sending email:', error);
    return NextResponse.json(
      { error: 'Failed to send email' },
      { status: 500 }
    );
  }
} 