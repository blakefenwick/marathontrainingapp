import { NextResponse } from 'next/server';

// Version 1.6.8 - Update to correct Klaviyo API endpoint
const KLAVIYO_API_KEY = process.env.KLAVIYO_API_KEY;
const KLAVIYO_LIST_ID = process.env.KLAVIYO_LIST_ID || 'UEyYQh';

// Validate environment variables
if (!KLAVIYO_API_KEY) {
  console.error('KLAVIYO_API_KEY is not configured');
}

if (!KLAVIYO_LIST_ID) {
  console.error('KLAVIYO_LIST_ID is not configured');
}

async function subscribeToKlaviyo(email: string) {
  console.log('Subscribing to Klaviyo with config:', {
    apiKeyConfigured: !!KLAVIYO_API_KEY,
    listIdConfigured: !!KLAVIYO_LIST_ID,
    email
  });

  try {
    const response = await fetch(`https://a.klaviyo.com/api/v2/list/${KLAVIYO_LIST_ID}/subscribe/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`
      },
      body: JSON.stringify({
        profiles: [{
          email: email,
          opt_in_status: 'explicit'
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
      console.error('Klaviyo subscription failed:', {
        status: response.status,
        statusText: response.statusText,
        error: responseData,
        responseText,
        requestBody: {
          profiles: [{
            email: email,
            opt_in_status: 'explicit'
          }]
        }
      });
      throw new Error(responseData.detail || responseText || 'Error subscribing user');
    }
    
    console.log('Successfully subscribed to Klaviyo:', responseData);
    return responseData;
  } catch (error) {
    console.error('Error in subscribeToKlaviyo:', error);
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

    // Subscribe to Klaviyo list
    console.log('Starting Klaviyo subscription process for:', email);
    await subscribeToKlaviyo(email);

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