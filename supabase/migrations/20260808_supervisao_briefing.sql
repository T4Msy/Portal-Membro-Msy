-- Reestruturacao do briefing diario da Supervisao: historico de saude,
-- snooze de casos e envio de push so quando um caso realmente critico
-- e criado (nada de resumo diario agendado).
-- Execute depois de 20260726_supervisao_premium.sql.

-- ── Novas colunas em supervision_cases ─────────────────────
ALTER TABLE public.supervision_cases
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz,
  ADD COLUMN IF NOT EXISTS critical_push_sent_at timestamptz;

-- ── update_supervision_case: limpa snooze/push ao reabrir ──
CREATE OR REPLACE FUNCTION public.update_supervision_case(
  p_case_id uuid, p_status text DEFAULT NULL, p_assigned_to uuid DEFAULT NULL,
  p_due_at timestamptz DEFAULT NULL, p_next_step text DEFAULT NULL, p_note text DEFAULT NULL
) RETURNS public.supervision_cases LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_case public.supervision_cases; v_actor uuid := auth.uid(); v_reopening boolean;
BEGIN
  IF NOT public.is_supervision_operator() THEN RAISE EXCEPTION 'Somente a coordenacao pode operar casos.'; END IF;
  SELECT * INTO v_case FROM public.supervision_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Caso nao encontrado.'; END IF;
  IF p_status IN ('resolved', 'dismissed') AND nullif(btrim(coalesce(p_note, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Registre como o caso foi resolvido ou dispensado.';
  END IF;
  v_reopening := v_case.status IN ('resolved', 'dismissed') AND p_status IN ('open', 'in_progress');
  UPDATE public.supervision_cases SET
    status = coalesce(p_status, status), assigned_to = coalesce(p_assigned_to, assigned_to),
    due_at = coalesce(p_due_at, due_at), next_step = coalesce(p_next_step, next_step),
    resolution_note = CASE WHEN p_status IN ('resolved','dismissed') THEN p_note ELSE resolution_note END,
    resolved_by = CASE WHEN p_status IN ('resolved','dismissed') THEN v_actor ELSE resolved_by END,
    resolved_at = CASE WHEN p_status IN ('resolved','dismissed') THEN now() ELSE resolved_at END,
    snoozed_until = CASE WHEN p_status IN ('open','in_progress') THEN NULL ELSE snoozed_until END,
    critical_push_sent_at = CASE WHEN v_reopening THEN NULL ELSE critical_push_sent_at END,
    updated_at = now()
  WHERE id = p_case_id RETURNING * INTO v_case;
  INSERT INTO public.supervision_case_history(case_id, action, note, metadata, actor_id)
  VALUES (p_case_id, coalesce(p_status, 'updated'), p_note,
    jsonb_build_object('assigned_to', p_assigned_to, 'due_at', p_due_at, 'next_step', p_next_step), v_actor);
  RETURN v_case;
END;
$$;

-- ── snooze_supervision_case: adiar um caso p/ mais tarde ───
CREATE OR REPLACE FUNCTION public.snooze_supervision_case(p_case_id uuid, p_snoozed_until timestamptz)
RETURNS public.supervision_cases LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_case public.supervision_cases;
BEGIN
  IF NOT public.is_supervision_operator() THEN RAISE EXCEPTION 'Somente a coordenacao pode operar casos.'; END IF;
  UPDATE public.supervision_cases SET snoozed_until = p_snoozed_until, updated_at = now()
  WHERE id = p_case_id RETURNING * INTO v_case;
  IF NOT FOUND THEN RAISE EXCEPTION 'Caso nao encontrado.'; END IF;
  INSERT INTO public.supervision_case_history(case_id, action, note, metadata, actor_id)
  VALUES (p_case_id, 'snoozed', NULL, jsonb_build_object('snoozed_until', p_snoozed_until), auth.uid());
  RETURN v_case;
END;
$$;

GRANT EXECUTE ON FUNCTION public.snooze_supervision_case(uuid, timestamptz) TO authenticated;

-- ── Historico diario do indice de saude (Huginn) ───────────
CREATE TABLE IF NOT EXISTS public.supervision_health_snapshots (
  day date PRIMARY KEY,
  health smallint NOT NULL,
  factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.supervision_health_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Supervisao: le snapshots de saude" ON public.supervision_health_snapshots;
CREATE POLICY "Supervisao: le snapshots de saude"
  ON public.supervision_health_snapshots FOR SELECT TO authenticated
  USING (public.can_access_supervision());

CREATE OR REPLACE FUNCTION public.record_health_snapshot(p_day date, p_health smallint, p_factors jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_access_supervision() THEN RAISE EXCEPTION 'Sem acesso a Supervisao.'; END IF;
  INSERT INTO public.supervision_health_snapshots(day, health, factors, created_by)
  VALUES (p_day, p_health, p_factors, auth.uid())
  ON CONFLICT (day) DO UPDATE SET health = EXCLUDED.health, factors = EXCLUDED.factors, updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_health_snapshot(date, smallint, jsonb) TO authenticated;
