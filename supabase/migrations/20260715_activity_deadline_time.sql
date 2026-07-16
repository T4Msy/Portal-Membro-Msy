-- ============================================================
-- MSY Portal - Horário no prazo das atividades
-- Adiciona horário ao prazo principal de activities.
-- Backfill: registros antigos continuam vencendo às 23:59.
-- ============================================================

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS deadline_time time;

UPDATE public.activities
SET deadline_time = COALESCE(deadline_time, '23:59:00'::time)
WHERE deadline_time IS NULL;

ALTER TABLE public.activities
  ALTER COLUMN deadline_time SET DEFAULT '23:59:00'::time,
  ALTER COLUMN deadline_time SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activities_deadline
  ON public.activities (deadline, deadline_time);

COMMENT ON COLUMN public.activities.deadline_time
  IS 'Horário do prazo principal da atividade. Usado junto com deadline.';
