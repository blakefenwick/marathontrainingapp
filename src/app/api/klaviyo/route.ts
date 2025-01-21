import { NextResponse } from 'next/server';

// Version 1.6.1 - Enhanced Klaviyo error handling
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

  const response = await fetch('https://a.klaviyo.com/api/profiles/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
      'revision': '2023-12-15'
    },
    body: JSON.stringify({
      data: {
        type: 'profile',
        attributes: {
          email: email,
          subscriptions: {
            email: {
              marketing: {
                consent: 'SUBSCRIBED'
              }
            }
          }
        },
      },
    }),
  });

  const responseData = await response.json();
  
  if (!response.ok) {
    console.error('Klaviyo profile creation failed:', {
      status: response.status,
      statusText: response.statusText,
      error: responseData
    });
    throw new Error(responseData.detail || 'Error creating profile');
  }
  
  console.log('Klaviyo profile created successfully');
  return responseData;
}

async function subscribeToList(email: string) {
  console.log('Subscribing to Klaviyo list:', {
    listId: KLAVIYO_LIST_ID,
    email
  });

  const response = await fetch(`https://a.klaviyo.com/api/lists/${KLAVIYO_LIST_ID}/relationships/profiles/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
      'revision': '2023-12-15'
    },
    body: JSON.stringify({
      data: [{
        type: 'profile',
        attributes: {
          email: email
        }
      }]
    }),
  });

  const responseData = await response.json();

  if (!response.ok) {
    console.error('Klaviyo list subscription failed:', {
      status: response.status,
      statusText: response.statusText,
      error: responseData
    });
    throw new Error(responseData.detail || 'Error subscribing to list');
  }

  console.log('Successfully subscribed to Klaviyo list');
  return responseData;
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

    // Create or update profile
    console.log('Starting Klaviyo subscription process for:', email);
    await createProfile(email);

    // Subscribe to list
    await subscribeToList(email);

    console.log('Klaviyo subscription process completed successfully');
    return NextResponse.json({
      message: 'Successfully subscribed to Klaviyo'
    });

  } catch (error) {
    console.error('Klaviyo API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to subscribe to Klaviyo' },
      { status: 500 }
    );
  }
} 