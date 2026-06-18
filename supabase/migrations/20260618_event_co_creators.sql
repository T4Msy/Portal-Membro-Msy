-- ============================================================
-- 20260618_event_co_creators.sql
-- Cria a tabela de co-criadores extras de eventos (do 2º em diante).
-- O criador e o 1º co-criador ficam direto em events (created_by / helper_id);
-- esta tabela guarda os co-criadores adicionais.
--
-- Schema alinhado ao uso do frontend (js/app.js openNewEventModal):
--   insert { event_id, helper_id } · select helper_id · delete by event_id.
--
-- Aplicar manualmente no Supabase SQL Editor (ver CLAUDE.md).
-- Helpers public.has_permission() / public.is_diretoria() já existem
-- (migration_fase4_rls.sql). has_permission() já inclui is_diretoria().
-- ============================================================

CREATE TABLE IF NOT EXISTS public.event_co_creators (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid NOT NULL REFERENCES public.events(id)   ON DELETE CASCADE,
  helper_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (event_id, helper_id)
);

CREATE INDEX IF NOT EXISTS idx_event_co_creators_event  ON public.event_co_creators(event_id);
CREATE INDEX IF NOT EXISTS idx_event_co_creators_helper ON public.event_co_creators(helper_id);

ALTER TABLE public.event_co_creators ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer membro autenticado (eventos são visíveis a todos)
DROP POLICY IF EXISTS "Membros leem co-criadores" ON public.event_co_creators;
CREATE POLICY "Membros leem co-criadores"
  ON public.event_co_creators FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- INSERT: quem pode criar/editar/gerenciar eventos (inclui diretoria)
DROP POLICY IF EXISTS "Diretoria/perm insere co-criadores" ON public.event_co_creators;
DROP POLICY IF EXISTS "Perm insere co-criadores" ON public.event_co_creators;
CREATE POLICY "Perm insere co-criadores"
  ON public.event_co_creators FOR INSERT
  WITH CHECK (
    public.has_permission('criar_eventos')
    OR public.has_permission('editar_eventos')
    OR public.has_permission('gerenciar_eventos')
  );

-- DELETE: idem (a edição apaga e reinsere a lista de co-criadores)
DROP POLICY IF EXISTS "Diretoria deleta co-criadores" ON public.event_co_creators;
DROP POLICY IF EXISTS "Perm deleta co-criadores" ON public.event_co_creators;
CREATE POLICY "Perm deleta co-criadores"
  ON public.event_co_creators FOR DELETE
  USING (
    public.has_permission('criar_eventos')
    OR public.has_permission('editar_eventos')
    OR public.has_permission('gerenciar_eventos')
  );

-- ============================================================
-- FIM — 20260618_event_co_creators.sql
-- ============================================================
