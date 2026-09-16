-- Correcoes de seguranca e integridade da Supervisao.
-- Execute depois de 20260808_supervisao_briefing.sql.

CREATE OR REPLACE FUNCTION public.upsert_supervision_case(
  p_source_type text, p_source_id uuid, p_source_key text, p_priority text,
  p_title text, p_description text DEFAULT NULL, p_member_id uuid DEFAULT NULL,
  p_due_at timestamptz DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_is_new boolean := false;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_supervision_operator() THEN
    RAISE EXCEPTION 'Somente a coordenacao pode criar casos.';
  END IF;
  IF p_source_type IS NULL OR btrim(p_source_type) = '' OR p_source_key IS NULL OR btrim(p_source_key) = '' THEN
    RAISE EXCEPTION 'Origem do caso e obrigatoria.';
  END IF;
  IF p_priority NOT IN ('critical', 'attention', 'info') THEN RAISE EXCEPTION 'Prioridade invalida.'; END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN RAISE EXCEPTION 'Titulo do caso e obrigatorio.'; END IF;

  INSERT INTO public.supervision_cases(source_type, source_id, source_key, priority, title, description, member_id, due_at)
  VALUES (p_source_type, p_source_id, p_source_key, p_priority, p_title, p_description, p_member_id, p_due_at)
  ON CONFLICT (source_type, source_key) DO UPDATE SET
    priority = EXCLUDED.priority, title = EXCLUDED.title, description = EXCLUDED.description,
    member_id = EXCLUDED.member_id, due_at = EXCLUDED.due_at, updated_at = now()
  RETURNING id, (xmax = 0) INTO v_id, v_is_new;
  IF v_is_new THEN
    INSERT INTO public.supervision_case_history(case_id, action, note, actor_id)
    VALUES (v_id, 'created', 'Caso criado pela Supervisao.', auth.uid());
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_supervision_daily_checkin()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_supervision_operator() THEN RAISE EXCEPTION 'Somente a coordenacao pode registrar revisoes.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('supervision_daily_checkin:' || auth.uid()::text || ':' || (now() AT TIME ZONE 'America/Sao_Paulo')::date::text));
  INSERT INTO public.supervision_timeline(event_type, title, actor_id, occurred_at)
  SELECT 'daily_checkin', 'Revisao diaria', auth.uid(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.supervision_timeline
    WHERE event_type = 'daily_checkin' AND actor_id = auth.uid()
      AND (occurred_at AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_supervision_source_item(
  p_source_type text, p_source_id uuid, p_source_status text, p_note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_case record; v_case_status text;
BEGIN
  IF NOT public.is_supervision_operator() THEN RAISE EXCEPTION 'Somente a coordenacao pode operar itens.'; END IF;
  IF p_source_type = 'reminder' AND p_source_status IN ('completed', 'dismissed') THEN
    UPDATE public.supervision_reminders
      SET status = p_source_status, action_by = auth.uid(), action_at = now(), updated_at = now()
      WHERE id = p_source_id;
    v_case_status := CASE WHEN p_source_status = 'completed' THEN 'resolved' ELSE 'dismissed' END;
  ELSIF p_source_type = 'alert' AND p_source_status = 'resolved' THEN
    UPDATE public.supervision_alerts
      SET status = 'resolved', resolved_at = now(), updated_at = now()
      WHERE id = p_source_id;
    v_case_status := 'resolved';
  ELSE
    RAISE EXCEPTION 'Transicao de item invalida.';
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item de origem nao encontrado.'; END IF;

  FOR v_case IN SELECT id FROM public.supervision_cases
    WHERE source_type = p_source_type AND source_id = p_source_id AND status IN ('open', 'in_progress')
    FOR UPDATE
  LOOP
    UPDATE public.supervision_cases SET status = v_case_status, resolution_note = coalesce(nullif(btrim(p_note), ''), 'Origem encerrada pela coordenacao.'),
      resolved_by = auth.uid(), resolved_at = now(), snoozed_until = NULL, updated_at = now()
      WHERE id = v_case.id;
    INSERT INTO public.supervision_case_history(case_id, action, note, actor_id)
      VALUES (v_case.id, v_case_status, coalesce(nullif(btrim(p_note), ''), 'Origem encerrada pela coordenacao.'), auth.uid());
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_health_snapshot(p_day date, p_health smallint, p_factors jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_supervision_operator() THEN RAISE EXCEPTION 'Somente a coordenacao pode registrar a saude.'; END IF;
  IF p_day IS NULL OR p_health NOT BETWEEN 0 AND 100 OR jsonb_typeof(p_factors) <> 'array' THEN
    RAISE EXCEPTION 'Snapshot de saude invalido.';
  END IF;
  INSERT INTO public.supervision_health_snapshots(day, health, factors, created_by)
  VALUES (p_day, p_health, p_factors, auth.uid())
  ON CONFLICT (day) DO UPDATE SET health = EXCLUDED.health, factors = EXCLUDED.factors,
    created_by = EXCLUDED.created_by, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_supervision_case_from_source()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_case_status text; v_case record;
BEGIN
  IF TG_TABLE_NAME = 'supervision_reminders' THEN
    IF NEW.status NOT IN ('completed', 'dismissed') OR OLD.status = NEW.status THEN RETURN NEW; END IF;
    v_case_status := CASE WHEN NEW.status = 'completed' THEN 'resolved' ELSE 'dismissed' END;
    FOR v_case IN UPDATE public.supervision_cases SET status = v_case_status,
      resolution_note = coalesce(resolution_note, 'Origem encerrada pela coordenacao.'),
      resolved_by = coalesce(NEW.action_by, auth.uid()), resolved_at = coalesce(NEW.action_at, now()),
      snoozed_until = NULL, updated_at = now()
      WHERE source_type = 'reminder' AND source_id = NEW.id AND status IN ('open', 'in_progress')
      RETURNING id
    LOOP
      INSERT INTO public.supervision_case_history(case_id, action, note, actor_id)
        VALUES (v_case.id, v_case_status, 'Origem encerrada pela coordenacao.', coalesce(NEW.action_by, auth.uid()));
    END LOOP;
  ELSIF TG_TABLE_NAME = 'supervision_alerts' THEN
    IF NEW.status NOT IN ('resolved', 'dismissed') OR OLD.status = NEW.status THEN RETURN NEW; END IF;
    v_case_status := CASE WHEN NEW.status = 'resolved' THEN 'resolved' ELSE 'dismissed' END;
    FOR v_case IN UPDATE public.supervision_cases SET status = v_case_status,
      resolution_note = coalesce(resolution_note, 'Origem encerrada pela coordenacao.'),
      resolved_by = auth.uid(), resolved_at = coalesce(NEW.resolved_at, now()), snoozed_until = NULL, updated_at = now()
      WHERE source_type = 'alert' AND source_id = NEW.id AND status IN ('open', 'in_progress')
      RETURNING id
    LOOP
      INSERT INTO public.supervision_case_history(case_id, action, note, actor_id)
        VALUES (v_case.id, v_case_status, 'Origem encerrada pela coordenacao.', auth.uid());
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_supervision_case_from_reminder ON public.supervision_reminders;
CREATE TRIGGER trg_sync_supervision_case_from_reminder AFTER UPDATE OF status ON public.supervision_reminders
  FOR EACH ROW EXECUTE FUNCTION public.sync_supervision_case_from_source();
DROP TRIGGER IF EXISTS trg_sync_supervision_case_from_alert ON public.supervision_alerts;
CREATE TRIGGER trg_sync_supervision_case_from_alert AFTER UPDATE OF status ON public.supervision_alerts
  FOR EACH ROW EXECUTE FUNCTION public.sync_supervision_case_from_source();

DROP POLICY IF EXISTS "Supervisao: cria lembretes" ON public.supervision_reminders;
DROP POLICY IF EXISTS "Supervisao: atua em lembretes" ON public.supervision_reminders;
CREATE POLICY "Supervisao: coordenacao cria lembretes" ON public.supervision_reminders FOR INSERT TO authenticated
  WITH CHECK (public.is_supervision_operator() AND origin = 'manual' AND created_by = auth.uid());
CREATE POLICY "Supervisao: coordenacao atua em lembretes" ON public.supervision_reminders FOR UPDATE TO authenticated
  USING (public.is_supervision_operator()) WITH CHECK (public.is_supervision_operator());

DROP POLICY IF EXISTS "Supervisao: cria observacoes" ON public.supervision_observations;
DROP POLICY IF EXISTS "Supervisao: arquiva observacoes" ON public.supervision_observations;
CREATE POLICY "Supervisao: coordenacao cria observacoes" ON public.supervision_observations FOR INSERT TO authenticated
  WITH CHECK (public.is_supervision_operator() AND origin = 'manual' AND created_by = auth.uid());
CREATE POLICY "Supervisao: coordenacao arquiva observacoes" ON public.supervision_observations FOR UPDATE TO authenticated
  USING (public.is_supervision_operator()) WITH CHECK (public.is_supervision_operator());

REVOKE ALL ON FUNCTION public.upsert_supervision_case(text, uuid, text, text, text, text, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_supervision_daily_checkin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_supervision_source_item(text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_health_snapshot(date, smallint, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_supervision_case_from_source() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_supervision_case(text, uuid, text, text, text, text, uuid, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_supervision_daily_checkin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_supervision_source_item(text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_health_snapshot(date, smallint, jsonb) TO authenticated;
