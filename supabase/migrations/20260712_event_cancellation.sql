-- ============================================================
-- 20260712_event_cancellation.sql
-- Cancelamento de eventos com justificativa obrigatoria.
--
-- - Novos campos em events: cancel_reason, cancelled_at, cancelled_by.
-- - status = 'cancelado' passa a ser um valor valido em events.status
--   (coluna ja e texto livre, sem CHECK constraint — nenhuma alteracao
--   de constraint necessaria).
-- - events_select_policy passa a esconder eventos cancelados de quem
--   nao for diretoria nem tiver a permissao 'cancelar_eventos' /
--   'gerenciar_eventos' (nova permissao 'cancelar_eventos' e cadastrada
--   apenas no frontend — MSYPerms.ALL — nao precisa de tabela nova).
--
-- Helpers public.has_permission() / public.is_diretoria() ja existem
-- (migration_fase4_rls.sql / migration_eventos_premium.sql).
--
-- Aplicar manualmente no Supabase SQL Editor (ver CLAUDE.md).
-- ============================================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at  timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_events_status ON public.events(status);

COMMENT ON COLUMN public.events.cancel_reason IS 'Justificativa obrigatoria informada ao cancelar o evento.';
COMMENT ON COLUMN public.events.cancelled_at  IS 'Data/hora em que o evento foi cancelado.';
COMMENT ON COLUMN public.events.cancelled_by  IS 'Quem cancelou o evento.';

-- Politica de leitura unificada: mantem a regra de eventos privados
-- (migration_desempenho.sql) e adiciona a regra de eventos cancelados
-- (visiveis apenas para diretoria ou quem tem 'cancelar_eventos' /
-- 'gerenciar_eventos').
DROP POLICY IF EXISTS "events_select_policy" ON public.events;
CREATE POLICY "events_select_policy"
ON public.events FOR SELECT
USING (
  (
    is_private = false
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND tier = 'diretoria')
  )
  AND (
    status IS DISTINCT FROM 'cancelado'
    OR public.has_permission('cancelar_eventos')
    OR public.has_permission('gerenciar_eventos')
  )
);

-- ============================================================
-- FIM — 20260712_event_cancellation.sql
-- ============================================================
