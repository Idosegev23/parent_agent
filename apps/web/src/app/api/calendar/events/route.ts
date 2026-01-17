import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // Get user from session
    const cookieStore = await cookies();
    const authToken = cookieStore.get('sb-vzfmavjctgxowcqfbwny-auth-token')?.value;
    
    if (!authToken) {
      return NextResponse.json({ events: [] });
    }

    // Parse auth token
    let userId: string;
    try {
      const parsed = JSON.parse(authToken);
      userId = parsed.user?.id || parsed[0]?.user?.id;
      
      if (!userId) {
        const accessToken = parsed.access_token || parsed[0];
        const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
        if (userError || !userData.user) {
          return NextResponse.json({ events: [] });
        }
        userId = userData.user.id;
      }
    } catch (e) {
      return NextResponse.json({ events: [] });
    }

    // Get calendar connection
    const { data: connection, error: connError } = await supabase
      .from('calendar_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .eq('is_active', true)
      .single();

    if (connError || !connection) {
      return NextResponse.json({ events: [], connected: false });
    }

    // Check if token needs refresh
    let accessToken = connection.access_token;
    if (connection.token_expires_at) {
      const expiresAt = new Date(connection.token_expires_at);
      const now = new Date();
      
      if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000 && connection.refresh_token) {
        // Refresh token
        const response = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_SECRET_ID!,
            refresh_token: connection.refresh_token,
            grant_type: 'refresh_token',
          }),
        });

        const tokens = await response.json();
        
        if (response.ok && tokens.access_token) {
          accessToken = tokens.access_token;
          
          const newExpiresAt = new Date();
          newExpiresAt.setSeconds(newExpiresAt.getSeconds() + tokens.expires_in);

          await supabase
            .from('calendar_connections')
            .update({
              access_token: tokens.access_token,
              token_expires_at: newExpiresAt.toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', connection.id);
        }
      }
    }

    // Fetch events from Google Calendar
    const timeMin = new Date();
    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + 30); // Next 30 days

    const calendarUrl = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${connection.calendar_id || 'primary'}/events`
    );
    calendarUrl.searchParams.set('timeMin', timeMin.toISOString());
    calendarUrl.searchParams.set('timeMax', timeMax.toISOString());
    calendarUrl.searchParams.set('singleEvents', 'true');
    calendarUrl.searchParams.set('orderBy', 'startTime');
    calendarUrl.searchParams.set('maxResults', '50');

    const response = await fetch(calendarUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('[Calendar API] Failed to fetch events:', error);
      return NextResponse.json({ events: [], connected: true, error: 'fetch_failed' });
    }

    const data = await response.json();

    // Transform events
    const events = (data.items || []).map((event: any) => ({
      id: event.id,
      summary: event.summary || '(ללא כותרת)',
      description: event.description,
      location: event.location,
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      allDay: !event.start?.dateTime,
      htmlLink: event.htmlLink,
    }));

    return NextResponse.json({ events, connected: true });

  } catch (error) {
    console.error('[Calendar API] Error:', error);
    return NextResponse.json({ events: [], error: 'server_error' });
  }
}

