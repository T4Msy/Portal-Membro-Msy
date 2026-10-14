-- Reuniões v2: título próprio na reunião agendada e ata vinculada à reunião.
-- Seguro para rodar mais de uma vez.

ALTER TABLE public.scheduled_meetings
  ADD COLUMN IF NOT EXISTS title text;

ALTER TABLE public.meeting_minutes
  ADD COLUMN IF NOT EXISTS scheduled_meeting_id uuid
    REFERENCES public.scheduled_meetings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_meeting_minutes_scheduled_meeting
  ON public.meeting_minutes(scheduled_meeting_id);
