import { NextResponse } from 'next/server';

// Version 1.7.3 - Handle existing profiles gracefully
const KLAVIYO_API_KEY = process.env.KLAVIYO_API_KEY?.trim();
const KLAVIYO_LIST_ID = process.env.KLAVIYO_LIST_ID?.trim() || 'UEyYQh';

// Validate environment variables
if (!KLAVIYO_API_KEY) {
  console.error('KLAVIYO_API_KEY is not configured');
} else {
  console.log('Using Klaviyo API key:', `${KLAVIYO_API_KEY.substring(0, 8)}...`);
}

if (!KLAVIYO_LIST_ID) {
  console.error('KLAVIYO_LIST_ID is not configured');
} else {
  console.log('Using Klaviyo List ID:', KLAVIYO_LIST_ID);
}

async function getExistingProfile(email: string) {
  console.log('Checking for existing profile:', email);
  
  try {
    const response = await fetch(`https://a.klaviyo.com/api/profiles/?filter=equals(email,"${email}")`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
        'revision': '2023-02-22'
      }
    });

    const responseText = await response.text();
    console.log('Raw response from Klaviyo (get profile):', responseText);

    if (!responseText) {
      return null;
    }

    const responseData = JSON.parse(responseText);
    
    if (!response.ok) {
      console.error('Failed to get profile:', {
        status: response.status,
        error: responseData
      });
      return null;
    }

    if (responseData.data && responseData.data.length > 0) {
      console.log('Found existing profile:', responseData.data[0].id);
      return responseData.data[0].id;
    }

    return null;
  } catch (error) {
    console.error('Error checking for existing profile:', error);
    return null;
  }
}

async function createOrUpdateProfile(email: string) {
  // First check if profile exists
  const existingProfileId = await getExistingProfile(email);
  if (existingProfileId) {
    console.log('Using existing profile:', existingProfileId);
    return existingProfileId;
  }

  console.log('Creating new Klaviyo profile:', email);

  try {
    const payload = {
      data: {
        type: 'profile',
        attributes: { email }
      }
    };

    console.log('Request payload:', JSON.stringify(payload));

    const response = await fetch('https://a.klaviyo.com/api/profiles/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
        'revision': '2023-02-22'
      },
      body: JSON.stringify(payload)
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    const responseText = await response.text();
    console.log('Raw response from Klaviyo:', responseText);

    if (!responseText) {
      console.error('Klaviyo API returned an empty response');
      throw new Error('Empty response from Klaviyo API');
    }

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (error) {
      console.error('Failed to parse JSON response:', error);
      throw new Error('Unexpected response format from Klaviyo API');
    }

    if (!response.ok) {
      console.error('Failed to create profile:', {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        error: responseData
      });
      throw new Error(responseData.errors?.[0]?.detail || 'Error creating profile');
    }

    console.log('Profile created successfully:', responseData);
    return responseData.data.id;
  } catch (error) {
    console.error('Error in createOrUpdateProfile:', error);
    throw error;
  }
}

// Version 1.7.4 - Handle empty responses from list subscription
async function subscribeToList(profileId: string) {
  console.log('Subscribing profile to list:', {
    listId: KLAVIYO_LIST_ID,
    profileId
  });

  try {
    const payload = {
      data: [{
        type: 'profile',
        id: profileId
      }]
    };

    console.log('Request payload:', JSON.stringify(payload));

    const response = await fetch(`https://a.klaviyo.com/api/lists/${KLAVIYO_LIST_ID}/relationships/profiles/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
        'revision': '2023-02-22'
      },
      body: JSON.stringify(payload)
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    // For 204 No Content, we don't need to parse the response
    if (response.status === 204) {
      console.log('Profile successfully subscribed to list (204 No Content)');
      return { success: true };
    }

    const responseText = await response.text();
    console.log('Raw response from Klaviyo:', responseText);

    // Only try to parse if we have content
    if (responseText) {
      try {
        const responseData = JSON.parse(responseText);
        if (!response.ok) {
          console.error('Failed to subscribe profile to list:', {
            status: response.status,
            headers: Object.fromEntries(response.headers.entries()),
            error: responseData
          });
          throw new Error(responseData.errors?.[0]?.detail || 'Error subscribing profile to list');
        }
        return responseData;
      } catch (error) {
        console.error('Failed to parse JSON response:', error);
        throw new Error('Unexpected response format from Klaviyo API');
      }
    }

    // If we get here with a non-204 status and no content, that's an error
    if (!response.ok) {
      console.error('Failed to subscribe profile to list:', {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries())
      });
      throw new Error('Error subscribing profile to list');
    }

    console.log('Profile successfully subscribed to list');
    return { success: true };
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