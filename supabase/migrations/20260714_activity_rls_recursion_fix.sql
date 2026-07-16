-- 20260714_activity_rls_recursion_fix.sql
-- Quebra a recursão de RLS entre `activities` e `activity_collaborators`.
--
-- Sintoma:
--   42P17 infinite recursion detected in policy for relation "activities"
--
-- Causa:
--   A policy de `activities` consultava `activity_collaborators` e a
--   policy de `activity_collaborators` consultava `activities`.
--
-- Solução:
--   Centralizar a checagem em funções SECURITY DEFINER e usar essas
--   funções nas policies, evitando referência direta cruzada entre tabelas.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_activity_collaborator(
  p_activity_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.activity_collaborators ac
    WHERE ac.activity_id = p_activity_id
      AND ac.user_id = p_user_id
  );
$$;

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
        OR public.is_activity_collaborator(a.id, auth.uid())
      )
  );
$$;

DROP POLICY IF EXISTS "Membros leem próprias atividades" ON public.activities;
CREATE POLICY "Membros leem próprias atividades"
  ON public.activities FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND public.can_access_activity(id)
  );

DROP POLICY IF EXISTS "Membros leem respostas relevantes" ON public.activity_responses;
CREATE POLICY "Membros leem respostas relevantes"
  ON public.activity_responses FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_diretoria()
    OR public.has_permission('gerenciar_atividades')
    OR public.has_permission('criar_atividades')
    OR public.has_permission('editar_atividades')
    OR public.can_access_activity(activity_id)
    OR public.is_activity_collaborator(activity_id, auth.uid())
  );

DROP POLICY IF EXISTS "Membros leem colaborações" ON public.activity_collaborators;
CREATE POLICY "Membros leem colaborações"
  ON public.activity_collaborators FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_diretoria()
    OR public.has_permission('gerenciar_atividades')
    OR public.has_permission('criar_atividades')
    OR public.has_permission('editar_atividades')
    OR public.can_access_activity(activity_id)
  );

DROP POLICY IF EXISTS "Membros leem anexos de atividades" ON public.activity_attachments;
CREATE POLICY "Membros leem anexos de atividades"
  ON public.activity_attachments FOR SELECT
  USING (public.can_access_activity(activity_id));

