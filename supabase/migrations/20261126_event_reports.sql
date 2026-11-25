-- Agente MSY Fase 1 (Eventos): briefing e retrospectiva de cada evento, para o histórico da Ordem.
-- Uma linha por evento. Lê quem é membro; escreve quem cuida de eventos (mesmas permissões do portal) ou quem criou o evento.

CREATE TABLE IF NOT EXISTS public.event_reports (
  event_id      uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  briefing      text CHECK (char_length(briefing) <= 8000),
  retrospectiva text CHECK (char_length(retrospectiva) <= 8000),
  funcionou     text CHECK (char_length(funcionou) <= 8000),
  nao_funcionou text CHECK (char_length(nao_funcionou) <= 8000),
  licoes        text CHECK (char_length(licoes) <= 8000),
  numeros       jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(numeros) = 'object' AND pg_column_size(numeros) <= 4000),
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.event_reports ENABLE ROW LEVEL SECURITY;

-- Quem pode escrever o relatório de um evento.
CREATE OR REPLACE FUNCTION public.can_write_event_report(p_event_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_diretoria()
    OR public.has_permission('criar_eventos') OR public.has_permission('editar_eventos')
    OR public.has_permission('gerenciar_eventos') OR public.has_permission('concluir_eventos')
    OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = p_event_id AND (e.created_by = auth.uid() OR e.helper_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.event_co_creators c WHERE c.event_id = p_event_id AND c.helper_id = auth.uid())
  );
$$;
REVOKE ALL ON FUNCTION public.can_write_event_report(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_event_report(uuid) TO authenticated;

DROP POLICY IF EXISTS event_reports_select ON public.event_reports;
CREATE POLICY event_reports_select ON public.event_reports FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_reports.event_id));

DROP POLICY IF EXISTS event_reports_insert ON public.event_reports;
CREATE POLICY event_reports_insert ON public.event_reports FOR INSERT TO authenticated
WITH CHECK (public.can_write_event_report(event_id) AND created_by = auth.uid());

DROP POLICY IF EXISTS event_reports_update ON public.event_reports;
CREATE POLICY event_reports_update ON public.event_reports FOR UPDATE TO authenticated
USING (public.can_write_event_report(event_id))
WITH CHECK (public.can_write_event_report(event_id) AND updated_by = auth.uid());

DROP POLICY IF EXISTS event_reports_delete ON public.event_reports;
CREATE POLICY event_reports_delete ON public.event_reports FOR DELETE TO authenticated
USING (public.is_diretoria());

REVOKE ALL ON public.event_reports FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_reports TO authenticated;
