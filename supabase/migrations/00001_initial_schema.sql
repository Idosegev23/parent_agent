-- Parent Assistant Database Schema
-- Multi-tenant architecture with Row Level Security

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  full_name TEXT,
  daily_summary_time TIME DEFAULT '20:30',
  notification_settings JSONB DEFAULT '{
    "daily_summary_enabled": true,
    "immediate_alerts_enabled": true,
    "quiet_hours_start": "22:00",
    "quiet_hours_end": "07:00"
  }'::jsonb,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CHILDREN TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.children (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  birth_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- WHATSAPP SESSIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.wa_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'connecting', 'qr_required', 'unstable', 'manual_reauth_required')),
  last_heartbeat TIMESTAMPTZ,
  qr_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ============================================
-- GROUPS TABLE (WhatsApp Groups)
-- ============================================
CREATE TABLE IF NOT EXISTS public.groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  child_id UUID REFERENCES public.children(id) ON DELETE SET NULL,
  wa_group_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'general' CHECK (type IN ('class', 'activity', 'parents', 'general')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, wa_group_id)
);

-- ============================================
-- ACTIVITIES TABLE (Classes, Hobbies, etc.)
-- ============================================
CREATE TABLE IF NOT EXISTS public.activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  schedule JSONB DEFAULT '[]'::jsonb,
  address TEXT,
  instructor_name TEXT,
  instructor_phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ACTIVITY REQUIREMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.activity_requirements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('equipment', 'clothing', 'documents', 'other')),
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RAW WHATSAPP MESSAGES TABLE
-- Retention: 30 days
-- ============================================
CREATE TABLE IF NOT EXISTS public.wa_raw_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  wa_message_id TEXT NOT NULL,
  content TEXT NOT NULL,
  sender TEXT NOT NULL,
  sender_name TEXT,
  media_type TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_wa_raw_messages_group_id ON public.wa_raw_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_wa_raw_messages_received_at ON public.wa_raw_messages(received_at);
CREATE INDEX IF NOT EXISTS idx_wa_raw_messages_processed ON public.wa_raw_messages(processed) WHERE processed = FALSE;

-- ============================================
-- EXTRACTED ITEMS TABLE (AI-processed data)
-- ============================================
CREATE TABLE IF NOT EXISTS public.extracted_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES public.wa_raw_messages(id) ON DELETE CASCADE,
  child_id UUID REFERENCES public.children(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN ('equipment', 'food', 'event', 'schedule_change', 'parent_request', 'teacher_message', 'study_material', 'activity', 'noise')),
  urgency INTEGER DEFAULT 0 CHECK (urgency >= 0 AND urgency <= 10),
  action_required BOOLEAN DEFAULT FALSE,
  summary TEXT NOT NULL,
  data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_extracted_items_child_id ON public.extracted_items(child_id);
CREATE INDEX IF NOT EXISTS idx_extracted_items_category ON public.extracted_items(category);
CREATE INDEX IF NOT EXISTS idx_extracted_items_urgency ON public.extracted_items(urgency) WHERE urgency >= 7;

-- ============================================
-- DAILY DIGESTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.digests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  digest_date DATE NOT NULL,
  content TEXT NOT NULL,
  items_count INTEGER DEFAULT 0,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, digest_date)
);

-- ============================================
-- ALERTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  item_id UUID REFERENCES public.extracted_items(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  sent BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_user_id ON public.alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_sent ON public.alerts(sent) WHERE sent = FALSE;

-- ============================================
-- AUDIT LOGS TABLE (No sensitive content!)
-- ============================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_raw_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extracted_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view own data" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own data" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- Children policies
CREATE POLICY "Users can view own children" ON public.children
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own children" ON public.children
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own children" ON public.children
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own children" ON public.children
  FOR DELETE USING (auth.uid() = user_id);

-- WA Sessions policies
CREATE POLICY "Users can view own sessions" ON public.wa_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions" ON public.wa_sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- Groups policies
CREATE POLICY "Users can view own groups" ON public.groups
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own groups" ON public.groups
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own groups" ON public.groups
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own groups" ON public.groups
  FOR DELETE USING (auth.uid() = user_id);

-- Activities policies
CREATE POLICY "Users can view own activities" ON public.activities
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.children c
      WHERE c.id = activities.child_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own activities" ON public.activities
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.children c
      WHERE c.id = activities.child_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own activities" ON public.activities
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.children c
      WHERE c.id = activities.child_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own activities" ON public.activities
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.children c
      WHERE c.id = activities.child_id AND c.user_id = auth.uid()
    )
  );

-- Activity requirements policies
CREATE POLICY "Users can view own activity requirements" ON public.activity_requirements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.activities a
      JOIN public.children c ON c.id = a.child_id
      WHERE a.id = activity_requirements.activity_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage own activity requirements" ON public.activity_requirements
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.activities a
      JOIN public.children c ON c.id = a.child_id
      WHERE a.id = activity_requirements.activity_id AND c.user_id = auth.uid()
    )
  );

-- WA Raw Messages policies
CREATE POLICY "Users can view own messages" ON public.wa_raw_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = wa_raw_messages.group_id AND g.user_id = auth.uid()
    )
  );

-- Extracted items policies
CREATE POLICY "Users can view own extracted items" ON public.extracted_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.wa_raw_messages m
      JOIN public.groups g ON g.id = m.group_id
      WHERE m.id = extracted_items.message_id AND g.user_id = auth.uid()
    )
  );

-- Digests policies
CREATE POLICY "Users can view own digests" ON public.digests
  FOR SELECT USING (auth.uid() = user_id);

-- Alerts policies
CREATE POLICY "Users can view own alerts" ON public.alerts
  FOR SELECT USING (auth.uid() = user_id);

-- Audit logs policies (users can only see logs related to their actions)
CREATE POLICY "Users can view own audit logs" ON public.audit_logs
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name, phone)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'phone'
  );
  
  -- Create initial WA session
  INSERT INTO public.wa_sessions (user_id, status)
  VALUES (NEW.id, 'disconnected');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_children_updated_at
  BEFORE UPDATE ON public.children
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_wa_sessions_updated_at
  BEFORE UPDATE ON public.wa_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_groups_updated_at
  BEFORE UPDATE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_activities_updated_at
  BEFORE UPDATE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- CLEANUP FUNCTION (for 30-day retention)
-- ============================================
CREATE OR REPLACE FUNCTION public.cleanup_old_messages()
RETURNS void AS $$
BEGIN
  DELETE FROM public.wa_raw_messages
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;




