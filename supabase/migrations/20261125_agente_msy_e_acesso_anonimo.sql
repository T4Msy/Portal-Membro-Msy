-- ============================================================
-- 20261125_agente_msy_e_acesso_anonimo.sql
--
-- 1. Fecha leitura sem login (role anon) de 6 tabelas que estavam abertas para
--    qualquer pessoa com a chave pública do portal (que é pública por definição:
--    está no js/config.js). Auditoria de 25/11/2026, só com a chave anon:
--      events (32 linhas), meetings (2), scheduled_meetings (24),
--      meeting_requests (1), event_presencas (281), event_cancel_requests (21).
--    Causa: policies de SELECT sem "TO authenticated" e sem exigir auth.uid(),
--    por exemplo events_select_policy (só filtrava is_private).
--    O portal só lê essas tabelas com o membro logado; o app mobile, o /api/whatsapp
--    e as Edge Functions também usam login ou service_role. Nada depende do anon.
--    Rollback (só se algum fluxo externo sem login quebrar, e corrija o fluxo depois):
--      GRANT SELECT ON public.<tabela> TO anon;
--
-- 2. Agente MSY: o responsável por uma tarefa de projeto (que não é gestor) só pode
--    mudar, por update direto, a nota de execução. A policy de UPDATE de project_tasks
--    liberava a linha inteira para quem está em assigned_to (título, prazo, prioridade,
--    responsável…). Status e tempo continuam mudando pelas funções task_start /
--    task_request_review, que rodam como dono da função (current_user <> authenticated).
--
-- Aplicar no SQL Editor do Supabase. Idempotente.
-- Verificação depois de aplicar: scripts/auditar-acesso-anonimo.sh (deve listar 0 tabelas).
-- ============================================================

-- ── 1. Acesso anônimo ───────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['events','meetings','scheduled_meetings','meeting_requests','event_presencas','event_cancel_requests']
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    END IF;
  END LOOP;
END $$;

-- A policy de eventos passa a valer só para quem está logado (defesa em profundidade:
-- se alguém der GRANT para anon de novo no futuro, a policy continua fechada).
DROP POLICY IF EXISTS "events_select_policy" ON public.events;
CREATE POLICY "events_select_policy"
ON public.events FOR SELECT
TO authenticated
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

-- ── 2. Colunas que o responsável (não gestor) pode mudar ────
-- SECURITY INVOKER de propósito: current_user mostra quem está executando o UPDATE.
-- Pela API é 'authenticated'; dentro das funções SECURITY DEFINER do portal é o dono delas.
CREATE OR REPLACE FUNCTION public.enforce_task_assignee_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF public.can_manage_project(OLD.project_id) THEN
    RETURN NEW;
  END IF;
  IF NEW.project_id         IS DISTINCT FROM OLD.project_id
  OR NEW.category_id        IS DISTINCT FROM OLD.category_id
  OR NEW.title              IS DISTINCT FROM OLD.title
  OR NEW.description        IS DISTINCT FROM OLD.description
  OR NEW.assigned_to        IS DISTINCT FROM OLD.assigned_to
  OR NEW.prioridade         IS DISTINCT FROM OLD.prioridade
  OR NEW.status             IS DISTINCT FROM OLD.status
  OR NEW.prazo              IS DISTINCT FROM OLD.prazo
  OR NEW.prazo_hora         IS DISTINCT FROM OLD.prazo_hora
  OR NEW.observacoes        IS DISTINCT FROM OLD.observacoes
  OR NEW.created_by         IS DISTINCT FROM OLD.created_by
  OR NEW.created_at         IS DISTINCT FROM OLD.created_at
  OR NEW.started_at         IS DISTINCT FROM OLD.started_at
  OR NEW.completed_at       IS DISTINCT FROM OLD.completed_at
  OR NEW.period_start       IS DISTINCT FROM OLD.period_start
  OR NEW.time_spent_seconds IS DISTINCT FROM OLD.time_spent_seconds
  OR NEW.revisions_count    IS DISTINCT FROM OLD.revisions_count
  OR NEW.review_note        IS DISTINCT FROM OLD.review_note
  THEN
    RAISE EXCEPTION 'O responsável pode alterar só a nota de execução e o checklist. Para iniciar ou enviar para revisão use os botões da tarefa; título, prazo, prioridade e responsável são com o gestor do projeto.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_task_assignee_columns ON public.project_tasks;
CREATE TRIGGER trg_enforce_task_assignee_columns
  BEFORE UPDATE ON public.project_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_task_assignee_columns();

COMMENT ON FUNCTION public.enforce_task_assignee_columns() IS
  'Responsável não gestor só altera exec_note/updated_at por update direto; status e tempo mudam pelas funções task_*.';

-- ============================================================
-- FIM — 20261125_agente_msy_e_acesso_anonimo.sql
-- ============================================================
