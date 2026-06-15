-- ============================================================
-- MSY PORTAL — Permite que membros com a permissão "gerenciar_ranking"
-- gravem rankings (semanal/mensal) e atualizem o Trono dos Recordes.
--
-- Problema: a RLS dessas tabelas exigia diretoria, então um membro
-- com a permissão "gerenciar_ranking" via o botão (a UI libera), mas
-- recebia "Erro ao salvar." ao tentar gravar.
--
-- public.has_permission(perm) já retorna true para diretoria também,
-- então usá-lo cobre os dois casos.
--
-- Execute no Supabase Dashboard > SQL Editor.
-- ============================================================

-- ── 1. weekly_rankings (ranking semanal / mensal) ───────────
ALTER TABLE public.weekly_rankings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Diretoria gerencia rankings INSERT" ON public.weekly_rankings;
DROP POLICY IF EXISTS "Perm gerencia rankings INSERT" ON public.weekly_rankings;
CREATE POLICY "Perm gerencia rankings INSERT"
  ON public.weekly_rankings FOR INSERT
  WITH CHECK (public.has_permission('gerenciar_ranking'));

DROP POLICY IF EXISTS "Diretoria gerencia rankings UPDATE" ON public.weekly_rankings;
DROP POLICY IF EXISTS "Perm gerencia rankings UPDATE" ON public.weekly_rankings;
CREATE POLICY "Perm gerencia rankings UPDATE"
  ON public.weekly_rankings FOR UPDATE
  USING (public.has_permission('gerenciar_ranking'))
  WITH CHECK (public.has_permission('gerenciar_ranking'));

DROP POLICY IF EXISTS "Diretoria gerencia rankings DELETE" ON public.weekly_rankings;
DROP POLICY IF EXISTS "Perm gerencia rankings DELETE" ON public.weekly_rankings;
CREATE POLICY "Perm gerencia rankings DELETE"
  ON public.weekly_rankings FOR DELETE
  USING (public.has_permission('gerenciar_ranking'));

-- ── 2. msy_recordes_top3 (Trono dos Recordes) ───────────────
ALTER TABLE public.msy_recordes_top3 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Diretoria insere top3" ON public.msy_recordes_top3;
DROP POLICY IF EXISTS "Perm gerencia top3 INSERT" ON public.msy_recordes_top3;
CREATE POLICY "Perm gerencia top3 INSERT"
  ON public.msy_recordes_top3 FOR INSERT
  WITH CHECK (public.has_permission('gerenciar_ranking'));

DROP POLICY IF EXISTS "Diretoria atualiza top3" ON public.msy_recordes_top3;
DROP POLICY IF EXISTS "Perm gerencia top3 UPDATE" ON public.msy_recordes_top3;
CREATE POLICY "Perm gerencia top3 UPDATE"
  ON public.msy_recordes_top3 FOR UPDATE
  USING (public.has_permission('gerenciar_ranking'))
  WITH CHECK (public.has_permission('gerenciar_ranking'));

DROP POLICY IF EXISTS "Diretoria deleta top3" ON public.msy_recordes_top3;
DROP POLICY IF EXISTS "Perm gerencia top3 DELETE" ON public.msy_recordes_top3;
CREATE POLICY "Perm gerencia top3 DELETE"
  ON public.msy_recordes_top3 FOR DELETE
  USING (public.has_permission('gerenciar_ranking'));

-- ── 3. jornal_avisos: INSERT também para quem gerencia ranking ──
-- O Trono dos Recordes publica eventos automáticos no Jornal.
-- Mantém diretoria e adiciona gerenciar_ranking (e gerenciar_jornal).
ALTER TABLE public.jornal_avisos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "diretoria_insere_jornal" ON public.jornal_avisos;
CREATE POLICY "diretoria_insere_jornal"
  ON public.jornal_avisos FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND tier = 'diretoria')
    OR public.has_permission('gerenciar_ranking')
    OR public.has_permission('gerenciar_jornal')
  );
