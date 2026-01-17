-- Google Calendar Integration Tables
-- ==================================
-- Run this in Supabase Dashboard -> SQL Editor

-- Store Google Calendar OAuth connections
CREATE TABLE IF NOT EXISTS calendar_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'google',
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  calendar_id TEXT, -- specific calendar to use, null = primary
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

-- Pending schedule approvals (sent via WhatsApp)
CREATE TABLE IF NOT EXISTS pending_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  child_id UUID REFERENCES children(id) ON DELETE SET NULL,
  extracted_item_id UUID REFERENCES extracted_items(id) ON DELETE CASCADE,
  
  -- Event details
  title TEXT NOT NULL,
  description TEXT,
  event_date DATE,
  start_time TIME,
  end_time TIME,
  location TEXT,
  is_recurring BOOLEAN DEFAULT false,
  recurrence_rule TEXT, -- iCal RRULE format
  
  -- Approval status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  approval_code TEXT UNIQUE, -- short code for WhatsApp reply (e.g., "1234")
  message_sent_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  
  -- Calendar sync
  google_event_id TEXT, -- after approved and synced
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '48 hours')
);

-- Calendar events (our local copy)
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  child_id UUID REFERENCES children(id) ON DELETE SET NULL,
  
  title TEXT NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  location TEXT,
  
  -- Recurrence
  is_recurring BOOLEAN DEFAULT false,
  recurrence_rule TEXT,
  parent_event_id UUID REFERENCES calendar_events(id), -- for recurring instances
  
  -- Sync status
  google_event_id TEXT,
  last_synced_at TIMESTAMPTZ,
  
  -- Source
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'whatsapp', 'import')),
  source_message_id UUID,
  
  -- Reminders
  reminder_sent BOOLEAN DEFAULT false,
  reminder_minutes_before INTEGER DEFAULT 60,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_pending_approvals_user_status ON pending_approvals(user_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_approvals_code ON pending_approvals(approval_code);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_date ON calendar_events(user_id, event_date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_child ON calendar_events(child_id, event_date);
CREATE INDEX IF NOT EXISTS idx_calendar_connections_user ON calendar_connections(user_id);

-- RLS Policies
ALTER TABLE calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- calendar_connections policies
CREATE POLICY "Users can view own calendar connections" ON calendar_connections
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own calendar connections" ON calendar_connections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own calendar connections" ON calendar_connections
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own calendar connections" ON calendar_connections
  FOR DELETE USING (auth.uid() = user_id);

-- pending_approvals policies
CREATE POLICY "Users can view own pending approvals" ON pending_approvals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own pending approvals" ON pending_approvals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pending approvals" ON pending_approvals
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own pending approvals" ON pending_approvals
  FOR DELETE USING (auth.uid() = user_id);

-- calendar_events policies
CREATE POLICY "Users can view own calendar events" ON calendar_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own calendar events" ON calendar_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own calendar events" ON calendar_events
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own calendar events" ON calendar_events
  FOR DELETE USING (auth.uid() = user_id);


