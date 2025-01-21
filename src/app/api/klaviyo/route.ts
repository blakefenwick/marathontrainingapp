import { NextResponse } from 'next/server';

const KLAVIYO_API_KEY = process.env.KLAVIYO_API_KEY;
const KLAVIYO_LIST_ID = 'UEyYQh';

async function createProfile(email: string) {
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

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error creating profile');
  }
  
  return response.json();
}

async function subscribeToList(email: string) {
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

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error subscribing to list');
  }

  return response.json();
}

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Create or update profile
    console.log('Creating Klaviyo profile for:', email);
    await createProfile(email);

    // Subscribe to list
    console.log('Subscribing to Klaviyo list:', KLAVIYO_LIST_ID);
    await subscribeToList(email);

    return NextResponse.json({
      message: 'Successfully subscribed to Klaviyo'
    });

  } catch (error) {
    console.error('Klaviyo API error:', error);
    return NextResponse.json(
      { error: 'Failed to subscribe to Klaviyo' },
      { status: 500 }
    );
  }
} 