-- Supervisao Premium: equipe, casos operacionais, auditoria e notificacoes.
-- Execute depois das migrations 20260717_* da Supervisao.

CREATE TABLE IF NOT EXISTS public.supervision_team (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'coordinator' CHECK (role IN ('coordinator', 'observer')),
  receive_alerts boolean NOT NULL DEFAULT true,
  added_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.supervision_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL,
  source_id uuid,
  source_key text NOT NULL,
  priority text NOT NULL DEFAULT 'attention' CHECK (priority IN ('critical', 'attention', 'info')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'dismissed')),
  title text NOT NULL,
  description text,
  member_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_at timestamptz,
  next_step text,
  resolution_note text,
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_type, source_key)
);

CREATE TABLE IF NOT EXISTS public.supervision_case_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.supervision_cases(id) ON DELETE CASCADE,
  action text NOT NULL,
  note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supervision_cases_queue ON public.supervision_cases(status, priority, due_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supervision_cases_assignee ON public.supervision_cases(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_supervision_case_history_case ON public.supervision_case_history(case_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.is_supervision_operator()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_diretoria() OR EXISTS (
    SELECT 1 FROM public.supervision_team t
    WHERE t.user_id = auth.uid() AND t.role = 'coordinator'
  );
$$;

CREATE OR REPLACE FUNCTION public.upsert_supervision_case(
  p_source_type text, p_source_id uuid, p_source_key text, p_priority text,
  p_title text, p_description text DEFAULT NULL, p_member_id uuid DEFAULT NULL,
  p_due_at timestamptz DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_is_new boolean := false;
BEGIN
  INSERT INTO public.supervision_cases(source_type, source_id, source_key, priority, title, description, member_id, due_at)
  VALUES (p_source_type, p_source_id, p_source_key, p_priority, p_title, p_description, p_member_id, p_due_at)
  ON CONFLICT (source_type, source_key) DO UPDATE SET
    priority = EXCLUDED.priority, title = EXCLUDED.title, description = EXCLUDED.description,
    member_id = EXCLUDED.member_id, due_at = EXCLUDED.due_at, updated_at = now()
  RETURNING id, (xmax = 0) INTO v_id, v_is_new;
  IF v_is_new THEN
    INSERT INTO public.supervision_case_history(case_id, action, note, actor_id)
    VALUES (v_id, 'created', 'Caso criado automaticamente pela Supervisao.', auth.uid());
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_supervision_case(
  p_case_id uuid, p_status text DEFAULT NULL, p_assigned_to uuid DEFAULT NULL,
  p_due_at timestamptz DEFAULT NULL, p_next_step text DEFAULT NULL, p_note text DEFAULT NULL
) RETURNS public.supervision_cases LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_case public.supervision_cases; v_actor uuid := auth.uid();
BEGIN
  IF NOT public.is_supervision_operator() THEN RAISE EXCEPTION 'Somente a coordenacao pode operar casos.'; END IF;
  SELECT * INTO v_case FROM public.supervision_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Caso nao encontrado.'; END IF;
  IF p_status IN ('resolved', 'dismissed') AND nullif(btrim(coalesce(p_note, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Registre como o caso foi resolvido ou dispensado.';
  END IF;
  UPDATE public.supervision_cases SET
    status = coalesce(p_status, status), assigned_to = coalesce(p_assigned_to, assigned_to),
    due_at = coalesce(p_due_at, due_at), next_step = coalesce(p_next_step, next_step),
    resolution_note = CASE WHEN p_status IN ('resolved','dismissed') THEN p_note ELSE resolution_note END,
    resolved_by = CASE WHEN p_status IN ('resolved','dismissed') THEN v_actor ELSE resolved_by END,
    resolved_at = CASE WHEN p_status IN ('resolved','dismissed') THEN now() ELSE resolved_at END,
    updated_at = now()
  WHERE id = p_case_id RETURNING * INTO v_case;
  INSERT INTO public.supervision_case_history(case_id, action, note, metadata, actor_id)
  VALUES (p_case_id, coalesce(p_status, 'updated'), p_note,
    jsonb_build_object('assigned_to', p_assigned_to, 'due_at', p_due_at, 'next_step', p_next_step), v_actor);
  RETURN v_case;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_supervision_team_member(p_user_id uuid, p_role text, p_receive_alerts boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_diretoria() THEN RAISE EXCEPTION 'Somente a diretoria administra a equipe.'; END IF;
  IF p_role NOT IN ('coordinator', 'observer') THEN RAISE EXCEPTION 'Papel invalido.'; END IF;
  INSERT INTO public.supervision_access(user_id, allowed, updated_at, updated_by)
  VALUES (p_user_id, true, now(), auth.uid())
  ON CONFLICT (user_id) DO UPDATE SET allowed = true, updated_at = now(), updated_by = auth.uid();
  INSERT INTO public.supervision_team(user_id, role, receive_alerts, added_by, updated_at)
  VALUES (p_user_id, p_role, p_receive_alerts, auth.uid(), now())
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, receive_alerts = EXCLUDED.receive_alerts, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_supervision_case()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_member record; v_actionable boolean;
BEGIN
  v_actionable := NEW.status IN ('open','in_progress') AND NEW.priority IN ('critical','attention')
    AND (TG_OP = 'INSERT' OR OLD.priority IS DISTINCT FROM NEW.priority OR OLD.status IS DISTINCT FROM NEW.status);
  IF NOT v_actionable THEN RETURN NEW; END IF;
  FOR v_member IN SELECT t.user_id FROM public.supervision_team t
    JOIN public.profiles p ON p.id = t.user_id
    WHERE t.receive_alerts IS TRUE AND p.status = 'ativo'
  LOOP
    INSERT INTO public.notifications(user_id, actor_id, message, type, icon, link, target_type, target_id, target_url, metadata)
    VALUES (v_member.user_id, auth.uid(),
      CASE WHEN NEW.priority = 'critical' THEN 'Caso critico: ' ELSE 'Caso requer atencao: ' END || NEW.title,
      'supervision_case', CASE WHEN NEW.priority = 'critical' THEN '🚨' ELSE '⚠️' END,
      'supervisao.html#central/' || NEW.id::text, 'supervision_case', NEW.id,
      'supervisao.html#central/' || NEW.id::text,
      jsonb_build_object('supervision_case_id', NEW.id, 'priority', NEW.priority));
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_supervision_case ON public.supervision_cases;
CREATE TRIGGER trg_notify_supervision_case AFTER INSERT OR UPDATE OF priority, status ON public.supervision_cases
  FOR EACH ROW EXECUTE FUNCTION public.notify_supervision_case();

-- Os registros existentes continuam visiveis na Central assim que forem acompanhados.
INSERT INTO public.supervision_cases(source_type, source_id, source_key, priority, status, title, description, member_id, due_at)
SELECT 'alert', a.id, a.id::text,
  CASE WHEN a.severity = 'critical' THEN 'critical' WHEN a.severity = 'attention' THEN 'attention' ELSE 'info' END,
  CASE WHEN a.status IN ('resolved','dismissed') THEN a.status ELSE 'open' END,
  a.title, a.description, a.member_id, NULL
FROM public.supervision_alerts a
ON CONFLICT (source_type, source_key) DO NOTHING;

INSERT INTO public.supervision_cases(source_type, source_id, source_key, priority, status, title, description, due_at)
SELECT 'reminder', r.id, r.id::text,
  CASE WHEN r.category = 'finance' THEN 'info' WHEN r.approval_status = 'pending_approval' THEN 'attention' ELSE 'info' END,
  CASE WHEN r.status = 'completed' THEN 'resolved' WHEN r.status = 'dismissed' THEN 'dismissed' ELSE 'open' END,
  r.title, r.description, r.due_at
FROM public.supervision_reminders r
ON CONFLICT (source_type, source_key) DO NOTHING;

ALTER TABLE public.supervision_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervision_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervision_case_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Supervisao: le equipe" ON public.supervision_team FOR SELECT TO authenticated USING (public.can_access_supervision());
CREATE POLICY "Supervisao: diretoria gerencia equipe" ON public.supervision_team FOR ALL TO authenticated USING (public.is_diretoria()) WITH CHECK (public.is_diretoria());
CREATE POLICY "Supervisao: le casos" ON public.supervision_cases FOR SELECT TO authenticated USING (public.can_access_supervision());
CREATE POLICY "Supervisao: coordena casos" ON public.supervision_cases FOR UPDATE TO authenticated USING (public.is_supervision_operator()) WITH CHECK (public.is_supervision_operator());
CREATE POLICY "Supervisao: le historico de casos" ON public.supervision_case_history FOR SELECT TO authenticated USING (public.can_access_supervision());

GRANT EXECUTE ON FUNCTION public.is_supervision_operator() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_supervision_case(text, uuid, text, text, text, text, uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_supervision_case(uuid, text, uuid, timestamptz, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_supervision_team_member(uuid, text, boolean) TO authenticated;
