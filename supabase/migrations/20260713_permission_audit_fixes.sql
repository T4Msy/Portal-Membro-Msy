-- ============================================================
-- 20260713_permission_audit_fixes.sql
-- Auditoria completa do sistema de permissões granulares —
-- corrige permissões que eram concedidas na tela mas não tinham
-- efeito real no banco (RLS nunca checava a permissão).
--
-- Bug relatado: um membro recebeu 'gerenciar_atividades' e mesmo
-- assim só via as próprias atividades — a policy de SELECT de
-- `activities` nunca checava essa permissão.
--
-- Aplicar manualmente no Supabase SQL Editor (ver CLAUDE.md).
-- Todas as mudanças abaixo são aditivas/substituições de políticas
-- já conhecidas — nenhuma remove acesso que já funcionava para a
-- diretoria (has_permission() já inclui is_diretoria() internamente).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1) ATIVIDADES — 'gerenciar_atividades' agora libera ver TODAS
--    as atividades (igual à intenção do frontend), não só as
--    próprias/atribuídas/colaborativas.
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Membros leem próprias atividades" ON public.activities;
CREATE POLICY "Membros leem próprias atividades"
  ON public.activities FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      public.is_diretoria()
      OR assigned_to  = auth.uid()
      OR assigned_by  = auth.uid()
      OR public.has_permission('gerenciar_atividades')
      OR public.has_permission('criar_atividades')
      OR public.has_permission('editar_atividades')
      OR EXISTS (
        SELECT 1 FROM public.activity_collaborators ac
        WHERE ac.activity_id = id AND ac.user_id = auth.uid()
      )
    )
  );

-- 'concluir_atividades' agora também é aceito para concluir/cancelar/
-- reabrir atividades (o botão já ficava restrito só à diretoria;
-- o frontend foi corrigido para mostrá-lo a quem tem essa permissão).
DROP POLICY IF EXISTS "Diretoria/perm atualiza atividades" ON public.activities;
CREATE POLICY "Diretoria/perm atualiza atividades"
  ON public.activities FOR UPDATE
  USING (
    public.is_diretoria()
    OR public.has_permission('gerenciar_atividades')
    OR public.has_permission('editar_atividades')
    OR public.has_permission('concluir_atividades')
    OR assigned_to = auth.uid()
    OR assigned_by = auth.uid()
  )
  WITH CHECK (
    public.is_diretoria()
    OR public.has_permission('gerenciar_atividades')
    OR public.has_permission('editar_atividades')
    OR public.has_permission('concluir_atividades')
    OR assigned_to = auth.uid()
    OR assigned_by = auth.uid()
  );

-- Anexos de atividade seguem a mesma regra de visibilidade da
-- atividade em si — função usada pela policy de activity_attachments.
CREATE OR REPLACE FUNCTION public.can_access_activity(p_activity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.activities a
    WHERE a.id = p_activity_id
      AND (
        public.is_diretoria()
        OR a.assigned_to = auth.uid()
        OR a.assigned_by = auth.uid()
        OR public.has_permission('gerenciar_atividades')
        OR public.has_permission('criar_atividades')
        OR public.has_permission('editar_atividades')
        OR EXISTS (
          SELECT 1
          FROM public.activity_collaborators ac
          WHERE ac.activity_id = a.id
            AND ac.user_id = auth.uid()
        )
      )
  );
$$;

-- Respostas enviadas pelos membros nas atividades seguem a mesma
-- regra — sem isso, quem tem 'gerenciar_atividades' via a atividade
-- na lista mas não via as respostas enviadas por outros membros.
DROP POLICY IF EXISTS "Membros leem respostas relevantes" ON public.activity_responses;
CREATE POLICY "Membros leem respostas relevantes"
  ON public.activity_responses FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_diretoria()
    OR public.has_permission('gerenciar_atividades')
    OR public.has_permission('criar_atividades')
    OR public.has_permission('editar_atividades')
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

-- Colaboradores de atividade — mesma regra (afeta a lista de
-- colaboradores mostrada no modal e o filtro por membro na listagem).
DROP POLICY IF EXISTS "Membros leem colaborações" ON public.activity_collaborators;
CREATE POLICY "Membros leem colaborações"
  ON public.activity_collaborators FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_diretoria()
    OR public.has_permission('gerenciar_atividades')
    OR public.has_permission('criar_atividades')
    OR public.has_permission('editar_atividades')
    OR EXISTS (
      SELECT 1 FROM public.activities a
      WHERE a.id = activity_id
        AND (a.assigned_to = auth.uid() OR a.assigned_by = auth.uid())
    )
  );

-- ────────────────────────────────────────────────────────────
-- 2) MEMBROS — 'aprovar_membros' / 'editar_membros' /
--    'remover_membros' liberavam o botão na tela, mas a única
--    policy de UPDATE em profiles era "cada um edita só o próprio
--    perfil". Sem isso, ninguém com só essas permissões conseguia
--    de fato aprovar, editar ou desativar outro membro.
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Perm gerencia membros update" ON public.profiles;
CREATE POLICY "Perm gerencia membros update"
  ON public.profiles FOR UPDATE
  USING (
    public.has_permission('aprovar_membros')
    OR public.has_permission('editar_membros')
    OR public.has_permission('remover_membros')
  )
  WITH CHECK (
    public.has_permission('aprovar_membros')
    OR public.has_permission('editar_membros')
    OR public.has_permission('remover_membros')
  );

-- Trava de segurança: RLS não restringe COLUNAS, só linhas — sem
-- isso, quem tem qualquer uma das permissões acima poderia em teoria
-- também alterar o campo `tier` (cargo) de outro membro para
-- 'diretoria'. Este gatilho bloqueia qualquer troca de `tier` que
-- não seja feita por alguém que já é diretoria.
CREATE OR REPLACE FUNCTION public.prevent_tier_change_by_non_diretoria()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tier IS DISTINCT FROM OLD.tier AND NOT public.is_diretoria() THEN
    RAISE EXCEPTION 'Apenas a diretoria pode alterar o cargo (tier) de um membro.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_protect_tier ON public.profiles;
CREATE TRIGGER trg_profiles_protect_tier
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_tier_change_by_non_diretoria();

-- ────────────────────────────────────────────────────────────
-- 3) PROJETOS — 'gerenciar_projetos' já liberava editar/excluir
--    projetos (can_manage_project), mas quem só tinha essa
--    permissão não conseguia nem listar projetos dos quais não
--    já participava (is_project_member não checava a permissão).
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_diretoria()
    OR public.has_permission('gerenciar_projetos')
    OR EXISTS (
      SELECT 1 FROM public.project_participants pp
      WHERE pp.project_id = p_project_id
        AND pp.user_id = auth.uid()
    )
    OR EXISTS (
      -- criador/responsável sempre enxergam o projeto (mesmo antes de virar participante)
      SELECT 1 FROM public.projects p
      WHERE p.id = p_project_id
        AND (p.created_by = auth.uid() OR p.responsavel_id = auth.uid())
    );
$$;

-- ────────────────────────────────────────────────────────────
-- 4) EVENTOS — as policies base de INSERT/UPDATE/DELETE da tabela
--    `events` foram criadas direto no Supabase Studio antes das
--    migrations versionadas deste repositório, então não sabemos
--    o texto exato delas. Em vez de arriscar sobrescrever algo
--    que já funciona, adicionamos políticas extras (permissivas —
--    o Postgres combina com OR): isso garante que
--    'criar_eventos', 'editar_eventos', 'cancelar_eventos',
--    'concluir_eventos', 'excluir_eventos' e 'gerenciar_eventos'
--    realmente funcionem, sem tirar nada que já existia.
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Perm gerencia eventos insert" ON public.events;
CREATE POLICY "Perm gerencia eventos insert"
  ON public.events FOR INSERT
  WITH CHECK (
    public.has_permission('criar_eventos')
    OR public.has_permission('gerenciar_eventos')
  );

DROP POLICY IF EXISTS "Perm gerencia eventos update" ON public.events;
CREATE POLICY "Perm gerencia eventos update"
  ON public.events FOR UPDATE
  USING (
    public.has_permission('editar_eventos')
    OR public.has_permission('cancelar_eventos')
    OR public.has_permission('concluir_eventos')
    OR public.has_permission('gerenciar_eventos')
  )
  WITH CHECK (
    public.has_permission('editar_eventos')
    OR public.has_permission('cancelar_eventos')
    OR public.has_permission('concluir_eventos')
    OR public.has_permission('gerenciar_eventos')
  );

DROP POLICY IF EXISTS "Perm gerencia eventos delete" ON public.events;
CREATE POLICY "Perm gerencia eventos delete"
  ON public.events FOR DELETE
  USING (
    public.has_permission('excluir_eventos')
    OR public.has_permission('gerenciar_eventos')
  );

-- ============================================================
-- FIM — 20260713_permission_audit_fixes.sql
-- ============================================================
