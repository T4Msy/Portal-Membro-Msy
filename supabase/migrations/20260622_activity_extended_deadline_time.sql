-- ============================================================
-- MSY Portal - Horário no prazo estendido de atividades
-- Adiciona coluna opcional para o horário do prazo estendido.
-- A data continua em activities.extended_deadline (date);
-- o horário fica em extended_deadline_time (time, nullable).
-- Quando nulo, o prazo vale até 23:59 do dia (comportamento antigo).
-- ============================================================

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS extended_deadline_time time;

COMMENT ON COLUMN public.activities.extended_deadline_time
  IS 'Horário do prazo estendido (par com extended_deadline). NULL = 23:59.';
