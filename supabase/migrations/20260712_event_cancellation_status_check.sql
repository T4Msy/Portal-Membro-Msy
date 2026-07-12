-- ============================================================
-- 20260712_event_cancellation_status_check.sql
-- Corrige a constraint events_status_check para aceitar o novo
-- status 'cancelado' (introduzido em 20260712_event_cancellation.sql).
--
-- Erro visto ao cancelar um evento sem esta migration:
--   new row for relation "events" violates check constraint
--   "events_status_check"
--
-- Aplicar manualmente no Supabase SQL Editor, depois de
-- 20260712_event_cancellation.sql (ver CLAUDE.md).
-- ============================================================

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_status_check;

ALTER TABLE public.events
  ADD CONSTRAINT events_status_check
  CHECK (status IN ('ativo','concluido','cancelado'));

-- ============================================================
-- FIM — 20260712_event_cancellation_status_check.sql
-- ============================================================
