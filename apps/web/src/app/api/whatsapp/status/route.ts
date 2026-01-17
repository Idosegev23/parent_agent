import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: session } = await supabase
    .from('wa_sessions')
    .select('status, last_heartbeat, qr_code')
    .eq('user_id', user.id)
    .single();

  return NextResponse.json(session || { status: 'disconnected' });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { action } = body;

  if (action === 'request_qr') {
    // Update session to trigger QR generation
    await (supabase
      .from('wa_sessions') as any)
      .update({ status: 'qr_required' })
      .eq('user_id', user.id);

    return NextResponse.json({ success: true });
  }

  if (action === 'disconnect') {
    await (supabase
      .from('wa_sessions') as any)
      .update({ status: 'disconnected' })
      .eq('user_id', user.id);

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
