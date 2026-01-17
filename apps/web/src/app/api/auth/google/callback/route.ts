import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Handle errors from Google
  if (error) {
    console.error('[Google OAuth] Error:', error);
    return NextResponse.redirect(new URL('/settings?error=google_oauth_failed', request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/settings?error=no_code', request.url));
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_SECRET_ID!,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('[Google OAuth] Token exchange failed:', tokens);
      return NextResponse.redirect(new URL('/settings?error=token_exchange_failed', request.url));
    }

    // Get the current user from Supabase auth
    const cookieStore = await cookies();
    const authToken = cookieStore.get('sb-vzfmavjctgxowcqfbwny-auth-token')?.value;
    
    if (!authToken) {
      console.error('[Google OAuth] No auth token found');
      return NextResponse.redirect(new URL('/login?error=not_authenticated', request.url));
    }

    // Parse the auth token to get user ID
    let userId: string;
    try {
      const parsed = JSON.parse(authToken);
      userId = parsed.user?.id || parsed[0]?.user?.id;
      
      if (!userId) {
        // Try to get user from access token
        const accessToken = parsed.access_token || parsed[0];
        const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
        if (userError || !userData.user) {
          throw new Error('Could not get user');
        }
        userId = userData.user.id;
      }
    } catch (e) {
      console.error('[Google OAuth] Failed to parse auth token:', e);
      return NextResponse.redirect(new URL('/login?error=invalid_session', request.url));
    }

    // Calculate token expiration
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + (tokens.expires_in || 3600));

    // Save or update calendar connection
    const { error: dbError } = await supabase
      .from('calendar_connections')
      .upsert({
        user_id: userId,
        provider: 'google',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: expiresAt.toISOString(),
        calendar_id: 'primary',
        is_active: true,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,provider',
      });

    if (dbError) {
      console.error('[Google OAuth] Database error:', dbError);
      return NextResponse.redirect(new URL('/settings?error=database_error', request.url));
    }

    console.log('[Google OAuth] Successfully connected calendar for user:', userId);
    return NextResponse.redirect(new URL('/settings?success=calendar_connected', request.url));

  } catch (error) {
    console.error('[Google OAuth] Unexpected error:', error);
    return NextResponse.redirect(new URL('/settings?error=unexpected_error', request.url));
  }
}

