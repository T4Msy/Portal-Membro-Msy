-- ============================================================
-- MSY PORTAL — GESTÃO DE PROJETOS v2
-- Fluxo de trabalho com aprovação, rastreamento de tempo,
-- agenda (hora de entrega) e governança por projeto.
-- Pré-requisito: 20260615_gestao_projetos.sql já aplicado.
-- Execute no Supabase Dashboard > SQL Editor.
-- ============================================================

-- ============================================================
-- 1. NOVAS COLUNAS EM project_tasks
-- ============================================================
ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS prazo_hora         time,
  ADD COLUMN IF NOT EXISTS started_at         timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at       timestamptz,
  ADD COLUMN IF NOT EXISTS period_start       timestamptz,
  ADD COLUMN IF NOT EXISTS time_spent_seconds bigint  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revisions_count    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exec_note          text,
  ADD COLUMN IF NOT EXISTS review_note        text;

-- Atualiza o CHECK de status para incluir 'necessita_ajustes'
-- (mantém 'bloqueada' por compatibilidade com dados existentes).
ALTER TABLE public.project_tasks
  DROP CONSTRAINT IF EXISTS project_tasks_status_check;
ALTER TABLE public.project_tasks
  ADD CONSTRAINT project_tasks_status_check
  CHECK (status IN ('nao_iniciada','em_andamento','em_revisao','necessita_ajustes','concluida','bloqueada'));

CREATE INDEX IF NOT EXISTS idx_ptasks_agenda
  ON public.project_tasks(project_id, prazo, prazo_hora);

-- ============================================================
-- 2. GOVERNANÇA — redefinir can_manage_project
-- Independente das permissões globais do portal: gerência é
-- do criador do projeto ou de participantes marcados como gestor.
-- (is_project_member mantém is_diretoria() apenas para LEITURA.)
-- ============================================================
CREATE OR REPLACE FUNCTION public.can_manage_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = p_project_id
        AND p.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.project_participants pp
      WHERE pp.project_id = p_project_id
        AND pp.user_id = auth.uid()
        AND pp.is_manager = true
    );
$$;

-- Diretoria pode ENTRAR num projeto (self-join) para assumir gestão,
-- mas não controla automaticamente sem participar.
DROP POLICY IF EXISTS "Gestor gerencia participantes" ON public.project_participants;
CREATE POLICY "Gestor gerencia participantes"
  ON public.project_participants FOR ALL
  USING (
    public.can_manage_project(project_id)
    OR (public.is_diretoria() AND user_id = auth.uid())
  )
  WITH CHECK (
    public.can_manage_project(project_id)
    OR (public.is_diretoria() AND user_id = auth.uid())
  );

-- ============================================================
-- 3. TRIGGER — regras de transição de status
-- Garante (mesmo em chamadas diretas à API):
--   • 'concluida'/'necessita_ajustes' só por gestor que NÃO é o responsável
--   • demais transições só pelo responsável OU por um gestor
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_task_status_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_manage boolean;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_manage := public.can_manage_project(NEW.project_id);

    IF NEW.status IN ('concluida','necessita_ajustes') THEN
      IF NOT v_manage OR v_uid = OLD.assigned_to THEN
        RAISE EXCEPTION 'Apenas um gestor do projeto (diferente do responsável) pode aprovar ou solicitar ajustes.';
      END IF;
    ELSE
      IF NOT (v_manage OR v_uid = OLD.assigned_to) THEN
        RAISE EXCEPTION 'Sem permissão para alterar o status desta tarefa.';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_task_status ON public.project_tasks;
CREATE TRIGGER trg_enforce_task_status
  BEFORE UPDATE ON public.project_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_task_status_rules();

-- ============================================================
-- 4. RPCs DE CICLO DE VIDA (SECURITY DEFINER)
-- ============================================================

-- Responsável inicia / retoma o trabalho
CREATE OR REPLACE FUNCTION public.task_start(p_task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE t public.project_tasks%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.project_tasks WHERE id = p_task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa não encontrada.'; END IF;
  IF t.assigned_to IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Apenas o responsável pode iniciar a tarefa.';
  END IF;
  IF t.status NOT IN ('nao_iniciada','necessita_ajustes') THEN
    RAISE EXCEPTION 'A tarefa não pode ser iniciada no status atual.';
  END IF;

  UPDATE public.project_tasks
     SET status = 'em_andamento',
         period_start = now(),
         started_at = COALESCE(started_at, now()),
         updated_at = now()
   WHERE id = p_task_id;

  INSERT INTO public.project_history (project_id, actor_id, action, target_type, target_id, metadata)
  VALUES (t.project_id, auth.uid(), 'tarefa_iniciada', 'task', p_task_id, jsonb_build_object('title', t.title));
END;
$$;

-- Responsável solicita revisão
CREATE OR REPLACE FUNCTION public.task_request_review(p_task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.project_tasks%ROWTYPE;
  v_secs bigint := 0;
BEGIN
  SELECT * INTO t FROM public.project_tasks WHERE id = p_task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa não encontrada.'; END IF;
  IF t.assigned_to IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Apenas o responsável pode solicitar revisão.';
  END IF;
  IF t.status <> 'em_andamento' THEN
    RAISE EXCEPTION 'Só é possível solicitar revisão de uma tarefa em andamento.';
  END IF;

  IF t.period_start IS NOT NULL THEN
    v_secs := GREATEST(0, EXTRACT(EPOCH FROM (now() - t.period_start))::bigint);
  END IF;

  UPDATE public.project_tasks
     SET status = 'em_revisao',
         time_spent_seconds = time_spent_seconds + v_secs,
         period_start = NULL,
         revisions_count = revisions_count + 1,
         updated_at = now()
   WHERE id = p_task_id;

  INSERT INTO public.project_history (project_id, actor_id, action, target_type, target_id, metadata)
  VALUES (t.project_id, auth.uid(), 'tarefa_em_revisao', 'task', p_task_id, jsonb_build_object('title', t.title));
END;
$$;

-- Gestor aprova (não pode ser o responsável)
CREATE OR REPLACE FUNCTION public.task_approve(p_task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE t public.project_tasks%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.project_tasks WHERE id = p_task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa não encontrada.'; END IF;
  IF NOT public.can_manage_project(t.project_id) OR auth.uid() = t.assigned_to THEN
    RAISE EXCEPTION 'Apenas um gestor (diferente do responsável) pode aprovar.';
  END IF;
  IF t.status <> 'em_revisao' THEN
    RAISE EXCEPTION 'Só é possível aprovar tarefas em revisão.';
  END IF;

  UPDATE public.project_tasks
     SET status = 'concluida',
         completed_at = now(),
         period_start = NULL,
         updated_at = now()
   WHERE id = p_task_id;

  INSERT INTO public.project_history (project_id, actor_id, action, target_type, target_id, metadata)
  VALUES (t.project_id, auth.uid(), 'tarefa_concluida', 'task', p_task_id, jsonb_build_object('title', t.title));
END;
$$;

-- Gestor solicita ajustes (não pode ser o responsável)
CREATE OR REPLACE FUNCTION public.task_request_changes(p_task_id uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE t public.project_tasks%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.project_tasks WHERE id = p_task_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa não encontrada.'; END IF;
  IF NOT public.can_manage_project(t.project_id) OR auth.uid() = t.assigned_to THEN
    RAISE EXCEPTION 'Apenas um gestor (diferente do responsável) pode solicitar ajustes.';
  END IF;
  IF t.status <> 'em_revisao' THEN
    RAISE EXCEPTION 'Só é possível solicitar ajustes de tarefas em revisão.';
  END IF;

  UPDATE public.project_tasks
     SET status = 'necessita_ajustes',
         review_note = p_note,
         updated_at = now()
   WHERE id = p_task_id;

  INSERT INTO public.project_history (project_id, actor_id, action, target_type, target_id, metadata)
  VALUES (t.project_id, auth.uid(), 'tarefa_ajustes', 'task', p_task_id, jsonb_build_object('title', t.title, 'note', p_note));
END;
$$;

GRANT EXECUTE ON FUNCTION public.task_start(uuid)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.task_request_review(uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.task_approve(uuid)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.task_request_changes(uuid, text) TO authenticated;

-- ============================================================
-- 5. DOCUMENTAÇÃO
-- ============================================================
COMMENT ON COLUMN public.project_tasks.time_spent_seconds IS 'Tempo acumulado de trabalho (somado a cada solicitação de revisão).';
COMMENT ON COLUMN public.project_tasks.revisions_count   IS 'Quantidade de vezes que a tarefa entrou em revisão.';
COMMENT ON COLUMN public.project_tasks.exec_note         IS 'Observação de execução escrita pelo responsável.';
COMMENT ON COLUMN public.project_tasks.review_note       IS 'Feedback do gestor ao solicitar ajustes.';
COMMENT ON FUNCTION public.can_manage_project(uuid) IS 'Gerência por projeto (criador ou participante gestor) — independente das permissões globais do portal.';
