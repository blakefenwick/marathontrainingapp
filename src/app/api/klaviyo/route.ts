import { NextResponse } from 'next/server';

// Version 1.7.0 - Remove subscriptions field from profile creation
const KLAVIYO_API_KEY = process.env.KLAVIYO_API_KEY;
const KLAVIYO_LIST_ID = process.env.KLAVIYO_LIST_ID || 'UEyYQh';

// Validate environment variables
if (!KLAVIYO_API_KEY) {
  console.error('KLAVIYO_API_KEY is not configured');
}

if (!KLAVIYO_LIST_ID) {
  console.error('KLAVIYO_LIST_ID is not configured');
}

async function createOrUpdateProfile(email: string) {
  console.log('Creating/updating Klaviyo profile:', {
    apiKeyConfigured: !!KLAVIYO_API_KEY,
    email
  });

  try {
    const response = await fetch('https://a.klaviyo.com/api/profiles/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
        'revision': '2023-02-22'
      },
      body: JSON.stringify({
        data: {
          type: 'profile',
          attributes: {
            email: email
          }
        }
      }),
    });

    const responseData = await response.json();
    
    if (!response.ok) {
      console.error('Failed to create/update profile:', {
        status: response.status,
        statusText: response.statusText,
        error: responseData
      });
      console.error('Full response body:', responseData); // Add full response logging
      throw new Error(responseData.errors?.[0]?.detail || 'Error creating/updating profile');
    }
    
    console.log('Profile created/updated successfully:', responseData);
    return responseData.data.id;
  } catch (error) {
    console.error('Error in createOrUpdateProfile:', error);
    throw error;
  }
}

async function subscribeToList(profileId: string) {
  console.log('Subscribing profile to list:', {
    listId: KLAVIYO_LIST_ID,
    profileId
  });

  try {
    const response = await fetch(`https://a.klaviyo.com/api/lists/${KLAVIYO_LIST_ID}/relationships/profiles/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
        'revision': '2023-02-22'
      },
      body: JSON.stringify({
        data: [{
          type: 'profile',
          id: profileId
        }]
      }),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error('Failed to subscribe profile to list:', {
        status: response.status,
        statusText: response.statusText,
        error: responseData
      });
      throw new Error(responseData.errors?.[0]?.detail || 'Error subscribing profile to list');
    }

    console.log('Profile successfully subscribed to list');
    return responseData;
  } catch (error) {
    console.error('Error in subscribeToList:', error);
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

    // Step 1: Create or update the profile
    console.log('Starting Klaviyo subscription process for:', email);
    const profileId = await createOrUpdateProfile(email);

    // Step 2: Subscribe the profile to the list
    await subscribeToList(profileId);

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