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
--    Em produção também havia policies FOR ALL USING (true) (ecr_all, ep_all, mr_all, meet_all,
--    sched_all): qualquer um, até sem login, inseria, alterava e apagava. Removidas na seção 1b.
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

-- ── 1b. Policies "FOR ALL USING (true)" ─────────────────────
-- Em produção (não estavam nas migrations do repositório) havia policies abertas a qualquer
-- papel, inclusive anon: qualquer pessoa podia inserir, alterar e apagar linhas destas tabelas.
-- As policies específicas que já existem cobrem o uso do portal (conferido em js/app.js,
-- js/modules2.js, js/modules3.js e js/reunioes.js). As duas abaixo cobrem quem revisa
-- justificativas com as permissões da tela de eventos (cancelar_eventos e
-- revisar_justificativas_eventos), que antes dependiam da policy aberta.
DROP POLICY IF EXISTS ecr_all   ON public.event_cancel_requests;
DROP POLICY IF EXISTS ep_all    ON public.event_presencas;
DROP POLICY IF EXISTS mr_all    ON public.meeting_requests;
DROP POLICY IF EXISTS meet_all  ON public.meetings;
DROP POLICY IF EXISTS sched_all ON public.scheduled_meetings;

DROP POLICY IF EXISTS "Revisores gerenciam solicitações de cancelamento" ON public.event_cancel_requests;
CREATE POLICY "Revisores gerenciam solicitações de cancelamento"
  ON public.event_cancel_requests FOR ALL
  TO authenticated
  USING (
    public.is_diretoria()
    OR public.has_permission('cancelar_eventos')
    OR public.has_permission('gerenciar_eventos')
    OR public.has_permission('revisar_justificativas_eventos')
  )
  WITH CHECK (
    public.is_diretoria()
    OR public.has_permission('cancelar_eventos')
    OR public.has_permission('gerenciar_eventos')
    OR public.has_permission('revisar_justificativas_eventos')
  );

-- Aprovar um cancelamento lê e grava a presença do membro como "justificado" (sem apagar nada).
DROP POLICY IF EXISTS "Revisores de justificativa gravam presenças" ON public.event_presencas;
DROP POLICY IF EXISTS "Revisores de justificativa leem presenças" ON public.event_presencas;
DROP POLICY IF EXISTS "Revisores de justificativa criam presenças" ON public.event_presencas;
DROP POLICY IF EXISTS "Revisores de justificativa atualizam presenças" ON public.event_presencas;
CREATE POLICY "Revisores de justificativa leem presenças"
  ON public.event_presencas FOR SELECT TO authenticated
  USING (public.has_permission('cancelar_eventos') OR public.has_permission('revisar_justificativas_eventos'));
CREATE POLICY "Revisores de justificativa criam presenças"
  ON public.event_presencas FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('cancelar_eventos') OR public.has_permission('revisar_justificativas_eventos'));
CREATE POLICY "Revisores de justificativa atualizam presenças"
  ON public.event_presencas FOR UPDATE TO authenticated
  USING (public.has_permission('cancelar_eventos') OR public.has_permission('revisar_justificativas_eventos'))
  WITH CHECK (public.has_permission('cancelar_eventos') OR public.has_permission('revisar_justificativas_eventos'));

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
