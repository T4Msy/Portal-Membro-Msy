-- MSY PORTAL — Revisão segura de justificativas de ausência.
-- Permite aprovar ou recusar sem depender da policy ampla de atualização
-- de presenças, inclusive para quem possui apenas a permissão de revisão.

CREATE OR REPLACE FUNCTION public.review_event_justification(
  p_presence_id uuid,
  p_accepted boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_presence public.event_presencas%ROWTYPE;
BEGIN
  IF NOT (public.is_diretoria() OR public.has_permission('revisar_justificativas_eventos') OR public.has_permission('gerenciar_eventos')) THEN
    RAISE EXCEPTION 'Sem permissão para revisar justificativas de evento.';
  END IF;

  SELECT * INTO v_presence
  FROM public.event_presencas
  WHERE id = p_presence_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Justificativa não encontrada.';
  END IF;
  IF NULLIF(btrim(v_presence.justificativa), '') IS NULL THEN
    RAISE EXCEPTION 'Este registro não possui justificativa para revisar.';
  END IF;
  IF v_presence.justificativa_status IN ('aceita', 'recusada') THEN
    RAISE EXCEPTION 'Esta justificativa já foi revisada.';
  END IF;

  UPDATE public.event_presencas
     SET justificativa_status = CASE WHEN p_accepted THEN 'aceita' ELSE 'recusada' END,
         justificativa_reviewed_by = auth.uid(),
         justificativa_reviewed_at = now(),
         status = CASE WHEN p_accepted THEN 'justificado' ELSE 'nao_participar' END,
         response_status = 'nao_participar'
   WHERE id = p_presence_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_event_justification(uuid, boolean) TO authenticated;
