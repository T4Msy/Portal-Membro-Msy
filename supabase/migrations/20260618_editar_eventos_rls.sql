-- ============================================================
-- 20260618_editar_eventos_rls.sql
-- Permite que membros com a permissão `editar_eventos` (além de
-- `gerenciar_eventos` e da diretoria) editem eventos já criados,
-- incluindo a reconciliação de co-criadores.
--
-- Policies permissivas combinam por OR no PostgreSQL, então estas
-- regras apenas AMPLIAM o acesso — não removem o que já existe.
--
-- Aplicar manualmente no Supabase SQL Editor (ver CLAUDE.md).
-- Helpers public.has_permission() e public.is_diretoria() já foram
-- criados em migration_fase4_rls.sql.
-- ============================================================

-- ── events: UPDATE (editar evento existente) ──────────────
DROP POLICY IF EXISTS "Diretoria/perm edita eventos" ON public.events;
CREATE POLICY "Diretoria/perm edita eventos"
  ON public.events FOR UPDATE
  USING (
    public.is_diretoria()
    OR public.has_permission('gerenciar_eventos')
    OR public.has_permission('editar_eventos')
    OR public.has_permission('concluir_eventos')
  )
  WITH CHECK (
    public.is_diretoria()
    OR public.has_permission('gerenciar_eventos')
    OR public.has_permission('editar_eventos')
    OR public.has_permission('concluir_eventos')
  );

-- ── event_co_creators: INSERT (incluir editar_eventos) ────
DROP POLICY IF EXISTS "Diretoria/perm insere co-criadores" ON public.event_co_creators;
CREATE POLICY "Diretoria/perm insere co-criadores"
  ON public.event_co_creators FOR INSERT
  WITH CHECK (
    public.has_permission('criar_eventos')
    OR public.has_permission('editar_eventos')
    OR public.has_permission('gerenciar_eventos')
  );

-- ── event_co_creators: DELETE (incluir editar_eventos) ────
DROP POLICY IF EXISTS "Diretoria deleta co-criadores" ON public.event_co_creators;
DROP POLICY IF EXISTS "Diretoria/perm deleta co-criadores" ON public.event_co_creators;
CREATE POLICY "Diretoria/perm deleta co-criadores"
  ON public.event_co_creators FOR DELETE
  USING (
    public.is_diretoria()
    OR public.has_permission('editar_eventos')
    OR public.has_permission('gerenciar_eventos')
  );

-- ============================================================
-- FIM — 20260618_editar_eventos_rls.sql
-- ============================================================
