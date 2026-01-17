-- Worker Stability Improvements
-- Adds worker_id for tracking which worker instance is handling a session
-- Adds message_date column to extracted_items for better date tracking

-- Add worker_id to wa_sessions
ALTER TABLE public.wa_sessions 
ADD COLUMN IF NOT EXISTS worker_id TEXT;

-- Add message_date to extracted_items if not exists
ALTER TABLE public.extracted_items 
ADD COLUMN IF NOT EXISTS message_date DATE;

-- Add index for faster message lookups by date
CREATE INDEX IF NOT EXISTS idx_extracted_items_message_date 
ON public.extracted_items(message_date);

-- Add unique constraint on wa_raw_messages to prevent duplicates
-- (group_id + wa_message_id should be unique)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'wa_raw_messages_group_wa_message_unique'
  ) THEN
    ALTER TABLE public.wa_raw_messages 
    ADD CONSTRAINT wa_raw_messages_group_wa_message_unique 
    UNIQUE (group_id, wa_message_id);
  END IF;
END $$;

-- Function to auto-detect stale sessions and mark them as unstable
CREATE OR REPLACE FUNCTION public.mark_stale_sessions()
RETURNS void AS $$
BEGIN
  UPDATE public.wa_sessions
  SET status = 'unstable'
  WHERE status = 'connected'
    AND last_heartbeat < NOW() - INTERVAL '2 minutes';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add wa_opt_in column if not exists
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS wa_opt_in BOOLEAN DEFAULT TRUE;

-- Update types.ts comment: Remember to regenerate types after running this migration
