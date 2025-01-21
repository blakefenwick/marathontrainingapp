import { NextResponse } from 'next/server';

// Version 1.6.7 - Fix Klaviyo API key format
const KLAVIYO_API_KEY = process.env.KLAVIYO_API_KEY;
const KLAVIYO_LIST_ID = process.env.KLAVIYO_LIST_ID || 'UEyYQh';

// Validate environment variables
if (!KLAVIYO_API_KEY) {
  console.error('KLAVIYO_API_KEY is not configured');
}

if (!KLAVIYO_LIST_ID) {
  console.error('KLAVIYO_LIST_ID is not configured');
}

async function createProfile(email: string) {
  console.log('Creating Klaviyo profile with config:', {
    apiKeyConfigured: !!KLAVIYO_API_KEY,
    listIdConfigured: !!KLAVIYO_LIST_ID,
    email
  });

  try {
    const response = await fetch('https://a.klaviyo.com/api/v2/list/' + KLAVIYO_LIST_ID + '/members', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': `${KLAVIYO_API_KEY}`
      },
      body: JSON.stringify({
        profiles: [{
          email: email
        }]
      }),
    });

    const responseText = await response.text();
    let responseData;
    try {
      responseData = responseText ? JSON.parse(responseText) : {};
    } catch (e) {
      console.error('Failed to parse response:', responseText);
      responseData = {};
    }
    
    if (!response.ok) {
      console.error('Klaviyo profile creation failed:', {
        status: response.status,
        statusText: response.statusText,
        error: responseData,
        responseText,
        requestBody: {
          profiles: [{
            email: email
          }]
        }
      });
      throw new Error(responseData.detail || responseText || 'Error creating profile');
    }
    
    console.log('Klaviyo profile created successfully:', responseData);
    return responseData;
  } catch (error) {
    console.error('Error in createProfile:', error);
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      console.error('Klaviyo API called without email');
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    if (!KLAVIYO_API_KEY) {
      console.error('Klaviyo API key not configured');
      return NextResponse.json(
        { error: 'Klaviyo API key not configured' },
        { status: 500 }
      );
    }

    // Create profile and subscribe to list in one call
    console.log('Starting Klaviyo subscription process for:', email);
    await createProfile(email);

    console.log('Klaviyo subscription process completed successfully');
    return NextResponse.json({
      message: 'Successfully subscribed to Klaviyo'
    });

  } catch (error) {
    console.error('Klaviyo API error:', {
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack
      } : error
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to subscribe to Klaviyo' },
      { status: 500 }
    );
  }
} 