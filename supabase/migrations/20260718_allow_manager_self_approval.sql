-- MSY PORTAL — Permite que o gestor aprove a própria tarefa de projeto.
-- O gestor continua sendo o único autorizado a concluir tarefas em revisão;
-- solicitar ajustes permanece uma ação destinada a outro gestor.

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

    IF NEW.status = 'concluida' THEN
      IF NOT v_manage THEN
        RAISE EXCEPTION 'Apenas um gestor do projeto pode aprovar a tarefa.';
      END IF;
    ELSIF NEW.status = 'necessita_ajustes' THEN
      IF NOT v_manage OR v_uid = OLD.assigned_to THEN
        RAISE EXCEPTION 'Apenas um gestor do projeto diferente do responsável pode solicitar ajustes.';
      END IF;
    ELSIF NOT (v_manage OR v_uid = OLD.assigned_to) THEN
      RAISE EXCEPTION 'Sem permissão para alterar o status desta tarefa.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

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
  IF NOT public.can_manage_project(t.project_id) THEN
    RAISE EXCEPTION 'Apenas um gestor do projeto pode aprovar.';
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
