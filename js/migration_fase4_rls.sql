-- ============================================================
-- MSY PORTAL — Migration Fase 4: Hardening RLS
-- Tabelas sem políticas identificadas na auditoria de segurança
-- Execute no Supabase Dashboard > SQL Editor
-- ============================================================

-- ── Helper: has_permission ────────────────────────────────
-- Verifica se o usuário atual tem uma permissão específica
-- em member_permissions OU se é diretoria (tier override)
CREATE OR REPLACE FUNCTION public.has_permission(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.member_permissions
    WHERE user_id = auth.uid()
      AND p_name = ANY(permissions)
  ) OR public.is_diretoria();
$$;

-- ── Helper: is_diretoria (garante existência) ────────────
-- Já deve existir no Supabase; recriamos com OR REPLACE por segurança
CREATE OR REPLACE FUNCTION public.is_diretoria()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND tier = 'diretoria'
  );
$$;


-- ===========================================================
-- 1. PROFILES — SELECT (todos autenticados precisam ver membros)
-- ===========================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros leem todos os perfis" ON public.profiles;
CREATE POLICY "Membros leem todos os perfis"
  ON public.profiles FOR SELECT
  USING (auth.role() = 'authenticated');

-- UPDATE e INSERT já existem em migration_recordes.sql
-- DELETE: apenas diretoria (para remover membro da ordem)
DROP POLICY IF EXISTS "Diretoria remove perfis" ON public.profiles;
CREATE POLICY "Diretoria remove perfis"
  ON public.profiles FOR DELETE
  USING (public.is_diretoria());


-- ===========================================================
-- 2. ACTIVITIES — todas as operações
-- ===========================================================
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- SELECT: próprio (assigned_to/assigned_by/colaborador) ou diretoria
DROP POLICY IF EXISTS "Membros leem próprias atividades" ON public.activities;
CREATE POLICY "Membros leem próprias atividades"
  ON public.activities FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      public.is_diretoria()
      OR assigned_to  = auth.uid()
      OR assigned_by  = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.activity_collaborators ac
        WHERE ac.activity_id = id AND ac.user_id = auth.uid()
      )
    )
  );

-- INSERT: diretoria ou quem tem permissão criar_atividades
DROP POLICY IF EXISTS "Diretoria/perm cria atividades" ON public.activities;
CREATE POLICY "Diretoria/perm cria atividades"
  ON public.activities FOR INSERT
  WITH CHECK (
    public.has_permission('criar_atividades')
  );

-- UPDATE: diretoria, quem gerencia, ou o próprio assigned_to (atualizar status)
DROP POLICY IF EXISTS "Diretoria/perm atualiza atividades" ON public.activities;
CREATE POLICY "Diretoria/perm atualiza atividades"
  ON public.activities FOR UPDATE
  USING (
    public.is_diretoria()
    OR public.has_permission('gerenciar_atividades')
    OR public.has_permission('editar_atividades')
    OR assigned_to = auth.uid()
    OR assigned_by = auth.uid()
  )
  WITH CHECK (
    public.is_diretoria()
    OR public.has_permission('gerenciar_atividades')
    OR public.has_permission('editar_atividades')
    OR assigned_to = auth.uid()
    OR assigned_by = auth.uid()
  );

-- DELETE: apenas diretoria
DROP POLICY IF EXISTS "Diretoria deleta atividades" ON public.activities;
CREATE POLICY "Diretoria deleta atividades"
  ON public.activities FOR DELETE
  USING (public.is_diretoria());


-- ===========================================================
-- 3. COMUNICADOS
-- ===========================================================
ALTER TABLE public.comunicados ENABLE ROW LEVEL SECURITY;

-- SELECT: todos autenticados
DROP POLICY IF EXISTS "Membros leem comunicados" ON public.comunicados;
CREATE POLICY "Membros leem comunicados"
  ON public.comunicados FOR SELECT
  USING (auth.role() = 'authenticated');

-- INSERT: diretoria ou publicar_comunicados
DROP POLICY IF EXISTS "Diretoria/perm publica comunicados" ON public.comunicados;
CREATE POLICY "Diretoria/perm publica comunicados"
  ON public.comunicados FOR INSERT
  WITH CHECK (public.has_permission('publicar_comunicados'));

-- UPDATE: diretoria ou gerenciar_comunicados
DROP POLICY IF EXISTS "Diretoria/perm edita comunicados" ON public.comunicados;
CREATE POLICY "Diretoria/perm edita comunicados"
  ON public.comunicados FOR UPDATE
  USING (public.has_permission('gerenciar_comunicados'))
  WITH CHECK (public.has_permission('gerenciar_comunicados'));

-- DELETE: diretoria ou gerenciar_comunicados
DROP POLICY IF EXISTS "Diretoria/perm deleta comunicados" ON public.comunicados;
CREATE POLICY "Diretoria/perm deleta comunicados"
  ON public.comunicados FOR DELETE
  USING (public.has_permission('gerenciar_comunicados'));


-- ===========================================================
-- 4. NOTIFICATIONS
-- ===========================================================
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- SELECT: próprias notificações ou diretoria
DROP POLICY IF EXISTS "Membros leem próprias notificações" ON public.notifications;
CREATE POLICY "Membros leem próprias notificações"
  ON public.notifications FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_diretoria()
  );

-- INSERT: diretoria ou service_role (Edge Functions usam service_role)
DROP POLICY IF EXISTS "Diretoria cria notificações" ON public.notifications;
CREATE POLICY "Diretoria cria notificações"
  ON public.notifications FOR INSERT
  WITH CHECK (public.is_diretoria());

-- UPDATE: próprias (marcar lida) ou diretoria
DROP POLICY IF EXISTS "Membros atualizam próprias notificações" ON public.notifications;
CREATE POLICY "Membros atualizam próprias notificações"
  ON public.notifications FOR UPDATE
  USING (
    user_id = auth.uid()
    OR public.is_diretoria()
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_diretoria()
  );

-- DELETE: apenas diretoria (soft-delete via deleted_at preferível)
DROP POLICY IF EXISTS "Diretoria deleta notificações" ON public.notifications;
CREATE POLICY "Diretoria deleta notificações"
  ON public.notifications FOR DELETE
  USING (public.is_diretoria());


-- ===========================================================
-- 5. FEED_ATIVIDADE — SELECT e INSERT (UPDATE/DELETE já em v4_1)
-- ===========================================================
ALTER TABLE public.feed_atividade ENABLE ROW LEVEL SECURITY;

-- SELECT: todos autenticados
DROP POLICY IF EXISTS "Membros leem feed" ON public.feed_atividade;
CREATE POLICY "Membros leem feed"
  ON public.feed_atividade FOR SELECT
  USING (auth.role() = 'authenticated');

-- INSERT: diretoria ou publicar_feed
DROP POLICY IF EXISTS "Diretoria/perm publica feed" ON public.feed_atividade;
CREATE POLICY "Diretoria/perm publica feed"
  ON public.feed_atividade FOR INSERT
  WITH CHECK (public.has_permission('publicar_feed'));

-- (UPDATE e DELETE existem em migration_v4_1.sql — autor_id ou diretoria)


-- ===========================================================
-- 6. BIBLIOTECA_CONTEUDOS
-- ===========================================================
ALTER TABLE public.biblioteca_conteudos ENABLE ROW LEVEL SECURITY;

-- SELECT: todos autenticados
DROP POLICY IF EXISTS "Membros leem biblioteca" ON public.biblioteca_conteudos;
CREATE POLICY "Membros leem biblioteca"
  ON public.biblioteca_conteudos FOR SELECT
  USING (auth.role() = 'authenticated');

-- INSERT: diretoria ou gerenciar_biblioteca
DROP POLICY IF EXISTS "Diretoria/perm adiciona à biblioteca" ON public.biblioteca_conteudos;
CREATE POLICY "Diretoria/perm adiciona à biblioteca"
  ON public.biblioteca_conteudos FOR INSERT
  WITH CHECK (public.has_permission('gerenciar_biblioteca'));

-- UPDATE: diretoria ou gerenciar_biblioteca
DROP POLICY IF EXISTS "Diretoria/perm edita biblioteca" ON public.biblioteca_conteudos;
CREATE POLICY "Diretoria/perm edita biblioteca"
  ON public.biblioteca_conteudos FOR UPDATE
  USING (public.has_permission('gerenciar_biblioteca'))
  WITH CHECK (public.has_permission('gerenciar_biblioteca'));

-- DELETE: diretoria ou gerenciar_biblioteca
DROP POLICY IF EXISTS "Diretoria/perm deleta da biblioteca" ON public.biblioteca_conteudos;
CREATE POLICY "Diretoria/perm deleta da biblioteca"
  ON public.biblioteca_conteudos FOR DELETE
  USING (public.has_permission('gerenciar_biblioteca'));


-- ===========================================================
-- 7. PREMIACOES
-- ===========================================================
ALTER TABLE public.premiacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros leem premiações" ON public.premiacoes;
CREATE POLICY "Membros leem premiações"
  ON public.premiacoes FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Diretoria gerencia premiações INSERT" ON public.premiacoes;
CREATE POLICY "Diretoria gerencia premiações INSERT"
  ON public.premiacoes FOR INSERT
  WITH CHECK (public.is_diretoria());

DROP POLICY IF EXISTS "Diretoria gerencia premiações UPDATE" ON public.premiacoes;
CREATE POLICY "Diretoria gerencia premiações UPDATE"
  ON public.premiacoes FOR UPDATE
  USING (public.is_diretoria())
  WITH CHECK (public.is_diretoria());

DROP POLICY IF EXISTS "Diretoria gerencia premiações DELETE" ON public.premiacoes;
CREATE POLICY "Diretoria gerencia premiações DELETE"
  ON public.premiacoes FOR DELETE
  USING (public.is_diretoria());


-- ===========================================================
-- 8. PREMIACAO_VENCEDORES
-- ===========================================================
ALTER TABLE public.premiacao_vencedores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros leem vencedores" ON public.premiacao_vencedores;
CREATE POLICY "Membros leem vencedores"
  ON public.premiacao_vencedores FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Diretoria gerencia vencedores INSERT" ON public.premiacao_vencedores;
CREATE POLICY "Diretoria gerencia vencedores INSERT"
  ON public.premiacao_vencedores FOR INSERT
  WITH CHECK (public.is_diretoria());

DROP POLICY IF EXISTS "Diretoria gerencia vencedores UPDATE" ON public.premiacao_vencedores;
CREATE POLICY "Diretoria gerencia vencedores UPDATE"
  ON public.premiacao_vencedores FOR UPDATE
  USING (public.is_diretoria())
  WITH CHECK (public.is_diretoria());

DROP POLICY IF EXISTS "Diretoria gerencia vencedores DELETE" ON public.premiacao_vencedores;
CREATE POLICY "Diretoria gerencia vencedores DELETE"
  ON public.premiacao_vencedores FOR DELETE
  USING (public.is_diretoria());


-- ===========================================================
-- 9. ONBOARDING_STEPS
-- ===========================================================
ALTER TABLE public.onboarding_steps ENABLE ROW LEVEL SECURITY;

-- SELECT: próprias etapas ou diretoria
DROP POLICY IF EXISTS "Membros leem próprio onboarding" ON public.onboarding_steps;
CREATE POLICY "Membros leem próprio onboarding"
  ON public.onboarding_steps FOR SELECT
  USING (
    membro_id = auth.uid()
    OR public.is_diretoria()
  );

-- INSERT/UPDATE: próprio membro ou diretoria
DROP POLICY IF EXISTS "Membros gerenciam próprio onboarding" ON public.onboarding_steps;
CREATE POLICY "Membros gerenciam próprio onboarding"
  ON public.onboarding_steps FOR INSERT
  WITH CHECK (
    membro_id = auth.uid()
    OR public.is_diretoria()
  );

DROP POLICY IF EXISTS "Membros atualizam próprio onboarding" ON public.onboarding_steps;
CREATE POLICY "Membros atualizam próprio onboarding"
  ON public.onboarding_steps FOR UPDATE
  USING (
    membro_id = auth.uid()
    OR public.is_diretoria()
  )
  WITH CHECK (
    membro_id = auth.uid()
    OR public.is_diretoria()
  );

DROP POLICY IF EXISTS "Diretoria deleta onboarding" ON public.onboarding_steps;
CREATE POLICY "Diretoria deleta onboarding"
  ON public.onboarding_steps FOR DELETE
  USING (public.is_diretoria());


-- ===========================================================
-- 10. WEEKLY_RANKINGS
-- ===========================================================
ALTER TABLE public.weekly_rankings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros leem rankings" ON public.weekly_rankings;
CREATE POLICY "Membros leem rankings"
  ON public.weekly_rankings FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Diretoria gerencia rankings INSERT" ON public.weekly_rankings;
CREATE POLICY "Diretoria gerencia rankings INSERT"
  ON public.weekly_rankings FOR INSERT
  WITH CHECK (public.is_diretoria());

DROP POLICY IF EXISTS "Diretoria gerencia rankings UPDATE" ON public.weekly_rankings;
CREATE POLICY "Diretoria gerencia rankings UPDATE"
  ON public.weekly_rankings FOR UPDATE
  USING (public.is_diretoria())
  WITH CHECK (public.is_diretoria());

DROP POLICY IF EXISTS "Diretoria gerencia rankings DELETE" ON public.weekly_rankings;
CREATE POLICY "Diretoria gerencia rankings DELETE"
  ON public.weekly_rankings FOR DELETE
  USING (public.is_diretoria());


-- ===========================================================
-- 11. SCHEDULED_MEETINGS
-- ===========================================================
ALTER TABLE public.scheduled_meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros leem reuniões agendadas" ON public.scheduled_meetings;
CREATE POLICY "Membros leem reuniões agendadas"
  ON public.scheduled_meetings FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Diretoria/perm agenda reuniões" ON public.scheduled_meetings;
CREATE POLICY "Diretoria/perm agenda reuniões"
  ON public.scheduled_meetings FOR INSERT
  WITH CHECK (public.has_permission('criar_eventos'));

DROP POLICY IF EXISTS "Diretoria/perm atualiza reuniões" ON public.scheduled_meetings;
CREATE POLICY "Diretoria/perm atualiza reuniões"
  ON public.scheduled_meetings FOR UPDATE
  USING (public.has_permission('criar_eventos'))
  WITH CHECK (public.has_permission('criar_eventos'));

DROP POLICY IF EXISTS "Diretoria deleta reuniões agendadas" ON public.scheduled_meetings;
CREATE POLICY "Diretoria deleta reuniões agendadas"
  ON public.scheduled_meetings FOR DELETE
  USING (public.is_diretoria());


-- ===========================================================
-- 12. MEETING_MINUTES (Atas)
-- ===========================================================
ALTER TABLE public.meeting_minutes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros leem atas" ON public.meeting_minutes;
CREATE POLICY "Membros leem atas"
  ON public.meeting_minutes FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Diretoria/perm cria atas" ON public.meeting_minutes;
CREATE POLICY "Diretoria/perm cria atas"
  ON public.meeting_minutes FOR INSERT
  WITH CHECK (public.has_permission('criar_eventos'));

DROP POLICY IF EXISTS "Diretoria/perm edita atas" ON public.meeting_minutes;
CREATE POLICY "Diretoria/perm edita atas"
  ON public.meeting_minutes FOR UPDATE
  USING (public.has_permission('criar_eventos'))
  WITH CHECK (public.has_permission('criar_eventos'));

DROP POLICY IF EXISTS "Diretoria deleta atas" ON public.meeting_minutes;
CREATE POLICY "Diretoria deleta atas"
  ON public.meeting_minutes FOR DELETE
  USING (public.is_diretoria());


-- ===========================================================
-- 13. ACTIVITY_RESPONSES
-- ===========================================================
ALTER TABLE public.activity_responses ENABLE ROW LEVEL SECURITY;

-- SELECT: próprias respostas, ou quem é assigned_to/assigned_by da atividade, ou diretoria
DROP POLICY IF EXISTS "Membros leem respostas relevantes" ON public.activity_responses;
CREATE POLICY "Membros leem respostas relevantes"
  ON public.activity_responses FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_diretoria()
    OR EXISTS (
      SELECT 1 FROM public.activities a
      WHERE a.id = activity_id
        AND (a.assigned_to = auth.uid() OR a.assigned_by = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.activity_collaborators ac
      WHERE ac.activity_id = activity_responses.activity_id
        AND ac.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Membros criam próprias respostas" ON public.activity_responses;
CREATE POLICY "Membros criam próprias respostas"
  ON public.activity_responses FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "Membros editam próprias respostas" ON public.activity_responses;
CREATE POLICY "Membros editam próprias respostas"
  ON public.activity_responses FOR UPDATE
  USING (user_id = auth.uid() OR public.is_diretoria())
  WITH CHECK (user_id = auth.uid() OR public.is_diretoria());

DROP POLICY IF EXISTS "Membros/diretoria deleta respostas" ON public.activity_responses;
CREATE POLICY "Membros/diretoria deleta respostas"
  ON public.activity_responses FOR DELETE
  USING (user_id = auth.uid() OR public.is_diretoria());


-- ===========================================================
-- 14. ACTIVITY_COLLABORATORS
-- ===========================================================
ALTER TABLE public.activity_collaborators ENABLE ROW LEVEL SECURITY;

-- SELECT: própria participação, ou dono da atividade, ou diretoria
DROP POLICY IF EXISTS "Membros leem colaborações" ON public.activity_collaborators;
CREATE POLICY "Membros leem colaborações"
  ON public.activity_collaborators FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_diretoria()
    OR EXISTS (
      SELECT 1 FROM public.activities a
      WHERE a.id = activity_id
        AND (a.assigned_to = auth.uid() OR a.assigned_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Diretoria/perm insere colaboradores" ON public.activity_collaborators;
CREATE POLICY "Diretoria/perm insere colaboradores"
  ON public.activity_collaborators FOR INSERT
  WITH CHECK (public.has_permission('criar_atividades'));

DROP POLICY IF EXISTS "Diretoria deleta colaboradores" ON public.activity_collaborators;
CREATE POLICY "Diretoria deleta colaboradores"
  ON public.activity_collaborators FOR DELETE
  USING (public.is_diretoria());


-- ===========================================================
-- 15. EVENT_CO_CREATORS
-- ===========================================================
ALTER TABLE public.event_co_creators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros leem co-criadores" ON public.event_co_creators;
CREATE POLICY "Membros leem co-criadores"
  ON public.event_co_creators FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_diretoria()
  );

DROP POLICY IF EXISTS "Diretoria/perm insere co-criadores" ON public.event_co_creators;
CREATE POLICY "Diretoria/perm insere co-criadores"
  ON public.event_co_creators FOR INSERT
  WITH CHECK (public.has_permission('criar_eventos'));

DROP POLICY IF EXISTS "Diretoria deleta co-criadores" ON public.event_co_creators;
CREATE POLICY "Diretoria deleta co-criadores"
  ON public.event_co_creators FOR DELETE
  USING (public.is_diretoria());


-- ============================================================
-- FIM — migration_fase4_rls.sql
-- 15 tabelas protegidas + 2 helpers criados/garantidos
-- ============================================================
