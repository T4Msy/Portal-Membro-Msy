-- ============================================================
-- MSY PORTAL — Expansão de permissões granulares
-- Execute no Supabase Dashboard > SQL Editor depois das migrations base.
-- ============================================================

-- Garante helper usado pelas políticas novas.
CREATE OR REPLACE FUNCTION public.has_permission(perm text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.member_permissions
    WHERE user_id = auth.uid()
      AND perm = ANY(permissions)
  ) OR public.is_diretoria();
$$;

-- ============================================================
-- Sugestões
-- ============================================================
ALTER TABLE IF EXISTS public.msy_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Perm gerencia sugestoes select" ON public.msy_suggestions;
CREATE POLICY "Perm gerencia sugestoes select"
  ON public.msy_suggestions FOR SELECT
  USING (public.has_permission('gerenciar_sugestoes'));

DROP POLICY IF EXISTS "Perm gerencia sugestoes update" ON public.msy_suggestions;
CREATE POLICY "Perm gerencia sugestoes update"
  ON public.msy_suggestions FOR UPDATE
  USING (public.has_permission('gerenciar_sugestoes'))
  WITH CHECK (public.has_permission('gerenciar_sugestoes'));

DROP POLICY IF EXISTS "Perm gerencia sugestoes delete" ON public.msy_suggestions;
CREATE POLICY "Perm gerencia sugestoes delete"
  ON public.msy_suggestions FOR DELETE
  USING (public.has_permission('gerenciar_sugestoes'));

-- ============================================================
-- Mensalidade
-- ============================================================
ALTER TABLE IF EXISTS public.mensalidades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Perm gerencia mensalidades select" ON public.mensalidades;
CREATE POLICY "Perm gerencia mensalidades select"
  ON public.mensalidades FOR SELECT
  USING (public.has_permission('gerenciar_mensalidade'));

DROP POLICY IF EXISTS "Perm gerencia mensalidades insert" ON public.mensalidades;
CREATE POLICY "Perm gerencia mensalidades insert"
  ON public.mensalidades FOR INSERT
  WITH CHECK (public.has_permission('gerenciar_mensalidade'));

DROP POLICY IF EXISTS "Perm gerencia mensalidades update" ON public.mensalidades;
CREATE POLICY "Perm gerencia mensalidades update"
  ON public.mensalidades FOR UPDATE
  USING (public.has_permission('gerenciar_mensalidade'))
  WITH CHECK (public.has_permission('gerenciar_mensalidade'));

-- ============================================================
-- Reuniões
-- ============================================================
ALTER TABLE IF EXISTS public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.scheduled_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.meeting_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Perm gerencia meetings all" ON public.meetings;
CREATE POLICY "Perm gerencia meetings all"
  ON public.meetings FOR ALL
  USING (public.has_permission('gerenciar_reunioes'))
  WITH CHECK (public.has_permission('gerenciar_reunioes'));

DROP POLICY IF EXISTS "Perm gerencia scheduled meetings all" ON public.scheduled_meetings;
CREATE POLICY "Perm gerencia scheduled meetings all"
  ON public.scheduled_meetings FOR ALL
  USING (public.has_permission('gerenciar_reunioes'))
  WITH CHECK (public.has_permission('gerenciar_reunioes'));

DROP POLICY IF EXISTS "Perm gerencia meeting requests select" ON public.meeting_requests;
CREATE POLICY "Perm gerencia meeting requests select"
  ON public.meeting_requests FOR SELECT
  USING (public.has_permission('gerenciar_reunioes'));

DROP POLICY IF EXISTS "Perm gerencia meeting requests update" ON public.meeting_requests;
CREATE POLICY "Perm gerencia meeting requests update"
  ON public.meeting_requests FOR UPDATE
  USING (public.has_permission('gerenciar_reunioes'))
  WITH CHECK (public.has_permission('gerenciar_reunioes'));

-- ============================================================
-- Premiações
-- ============================================================
ALTER TABLE IF EXISTS public.premiacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.premiacao_vencedores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Perm gerencia premiacoes insert" ON public.premiacoes;
CREATE POLICY "Perm gerencia premiacoes insert"
  ON public.premiacoes FOR INSERT
  WITH CHECK (public.has_permission('gerenciar_premiacoes'));

DROP POLICY IF EXISTS "Perm gerencia premiacoes update" ON public.premiacoes;
CREATE POLICY "Perm gerencia premiacoes update"
  ON public.premiacoes FOR UPDATE
  USING (public.has_permission('gerenciar_premiacoes'))
  WITH CHECK (public.has_permission('gerenciar_premiacoes'));

DROP POLICY IF EXISTS "Perm gerencia premiacoes delete" ON public.premiacoes;
CREATE POLICY "Perm gerencia premiacoes delete"
  ON public.premiacoes FOR DELETE
  USING (public.has_permission('gerenciar_premiacoes'));

DROP POLICY IF EXISTS "Perm gerencia vencedores all" ON public.premiacao_vencedores;
CREATE POLICY "Perm gerencia vencedores all"
  ON public.premiacao_vencedores FOR ALL
  USING (public.has_permission('gerenciar_premiacoes'))
  WITH CHECK (public.has_permission('gerenciar_premiacoes'));

-- ============================================================
-- Feed social
-- ============================================================
ALTER TABLE IF EXISTS public.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.social_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.social_stories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Perm modera posts sociais" ON public.social_posts;
CREATE POLICY "Perm modera posts sociais"
  ON public.social_posts FOR UPDATE
  USING (public.has_permission('moderar_feed'))
  WITH CHECK (public.has_permission('moderar_feed'));

DROP POLICY IF EXISTS "Perm modera comentarios sociais" ON public.social_comments;
CREATE POLICY "Perm modera comentarios sociais"
  ON public.social_comments FOR UPDATE
  USING (public.has_permission('moderar_feed'))
  WITH CHECK (public.has_permission('moderar_feed'));

DROP POLICY IF EXISTS "Perm modera stories sociais" ON public.social_stories;
CREATE POLICY "Perm modera stories sociais"
  ON public.social_stories FOR UPDATE
  USING (public.has_permission('moderar_feed'))
  WITH CHECK (public.has_permission('moderar_feed'));

-- Feed legado, ainda usado em alguns módulos antigos.
ALTER TABLE IF EXISTS public.feed_atividade ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Perm modera feed legado update" ON public.feed_atividade;
CREATE POLICY "Perm modera feed legado update"
  ON public.feed_atividade FOR UPDATE
  USING (public.has_permission('moderar_feed'))
  WITH CHECK (public.has_permission('moderar_feed'));

DROP POLICY IF EXISTS "Perm modera feed legado delete" ON public.feed_atividade;
CREATE POLICY "Perm modera feed legado delete"
  ON public.feed_atividade FOR DELETE
  USING (public.has_permission('moderar_feed'));
