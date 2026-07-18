-- MSY Supervisao: acesso, operacao, analytics e auditoria.
-- Execute no Supabase SQL Editor antes de publicar supervisao.html.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sidebar_collapsed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_portal_activity_at timestamptz;

CREATE TABLE IF NOT EXISTS public.supervision_access (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  allowed boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE OR REPLACE FUNCTION public.can_access_supervision()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    LEFT JOIN public.supervision_access a ON a.user_id = p.id
    WHERE p.id = auth.uid() AND p.status = 'ativo'
      AND ((p.tier = 'diretoria' AND COALESCE(a.allowed, true))
        OR (p.tier <> 'diretoria' AND a.allowed IS TRUE))
  );
$$;
REVOKE ALL ON FUNCTION public.can_access_supervision() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_supervision() TO authenticated;

ALTER TABLE public.supervision_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Supervisao: usuario consulta proprio acesso" ON public.supervision_access FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_diretoria());
CREATE POLICY "Supervisao: diretoria gerencia acessos" ON public.supervision_access FOR ALL TO authenticated
  USING (public.is_diretoria()) WITH CHECK (public.is_diretoria());

CREATE TABLE IF NOT EXISTS public.supervision_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
INSERT INTO public.supervision_settings(key, value) VALUES
  ('health_weights', '{"activities":20,"projects":15,"events":15,"participation":15,"access":10,"finance":10,"members":5,"growth":5,"evolution":5}'::jsonb),
  ('thresholds', '{"inactive_days":10,"activity_due_days":3,"project_stale_days":14}'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.supervision_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL UNIQUE,
  severity text NOT NULL CHECK (severity IN ('critical','attention','info')),
  title text NOT NULL,
  description text,
  source_type text NOT NULL,
  source_id uuid,
  member_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.supervision_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  title text NOT NULL,
  description text,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  subject_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  source_type text,
  source_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.supervision_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.supervision_analytics_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  mode text NOT NULL CHECK (mode IN ('weekly','monthly')),
  file_name text,
  checksum text NOT NULL UNIQUE,
  unmatched_names jsonb NOT NULL DEFAULT '[]'::jsonb,
  imported_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  imported_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.supervision_message_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.supervision_analytics_imports(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  member_name text NOT NULL,
  metric_date date NOT NULL,
  message_count integer NOT NULL CHECK (message_count >= 0),
  UNIQUE (import_id, member_name, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_supervision_alerts_status ON public.supervision_alerts(status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supervision_timeline_date ON public.supervision_timeline(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_supervision_metrics_member_date ON public.supervision_message_metrics(member_id, metric_date DESC);

ALTER TABLE public.supervision_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervision_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervision_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervision_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervision_analytics_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervision_message_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Supervisao: le dados operacionais" ON public.supervision_alerts FOR SELECT TO authenticated USING (public.can_access_supervision());
CREATE POLICY "Supervisao: atualiza alertas" ON public.supervision_alerts FOR UPDATE TO authenticated USING (public.can_access_supervision()) WITH CHECK (public.can_access_supervision());
CREATE POLICY "Supervisao: le timeline" ON public.supervision_timeline FOR SELECT TO authenticated USING (public.can_access_supervision());
CREATE POLICY "Supervisao: le importacoes" ON public.supervision_analytics_imports FOR SELECT TO authenticated USING (public.can_access_supervision());
CREATE POLICY "Supervisao: le metricas" ON public.supervision_message_metrics FOR SELECT TO authenticated USING (public.can_access_supervision());
CREATE POLICY "Supervisao: le configuracoes" ON public.supervision_settings FOR SELECT TO authenticated USING (public.can_access_supervision());
CREATE POLICY "Supervisao: diretoria gerencia configuracoes" ON public.supervision_settings FOR ALL TO authenticated USING (public.is_diretoria()) WITH CHECK (public.is_diretoria());
CREATE POLICY "Supervisao: le avisos" ON public.supervision_notices FOR SELECT TO authenticated USING (public.can_access_supervision());
CREATE POLICY "Supervisao: diretoria gerencia avisos" ON public.supervision_notices FOR ALL TO authenticated USING (public.is_diretoria()) WITH CHECK (public.is_diretoria());

-- Leitura operacional: necessaria para que um membro autorizado (nao diretor)
-- veja os mesmos indicadores agregados que a coordenacao ve, sem conceder escrita.
CREATE POLICY "Supervisao: le perfis operacionais" ON public.profiles FOR SELECT TO authenticated USING (public.can_access_supervision());
CREATE POLICY "Supervisao: le atividades operacionais" ON public.activities FOR SELECT TO authenticated USING (public.can_access_supervision());
CREATE POLICY "Supervisao: le eventos operacionais" ON public.events FOR SELECT TO authenticated USING (public.can_access_supervision());
CREATE POLICY "Supervisao: le presencas operacionais" ON public.event_presencas FOR SELECT TO authenticated USING (public.can_access_supervision());
CREATE POLICY "Supervisao: le mensalidades operacionais" ON public.mensalidades FOR SELECT TO authenticated USING (public.can_access_supervision());
CREATE POLICY "Supervisao: le projetos operacionais" ON public.projects FOR SELECT TO authenticated USING (public.can_access_supervision());
CREATE POLICY "Supervisao: le tarefas de projeto operacionais" ON public.project_tasks FOR SELECT TO authenticated USING (public.can_access_supervision());

CREATE OR REPLACE FUNCTION public.supervision_timeline_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.supervision_timeline(event_type, title, actor_id, subject_id, source_type, source_id, metadata)
  VALUES (
    CASE WHEN TG_OP = 'INSERT' THEN 'atividade_criada' WHEN NEW.status = 'Concluída' THEN 'atividade_concluida' ELSE 'atividade_atualizada' END,
    CASE WHEN TG_OP = 'INSERT' THEN 'Nova atividade: ' || NEW.title WHEN NEW.status = 'Concluída' THEN 'Atividade concluida: ' || NEW.title ELSE 'Atividade atualizada: ' || NEW.title END,
    COALESCE(NEW.assigned_by, auth.uid()), NEW.assigned_to, 'activity', NEW.id,
    jsonb_build_object('status', NEW.status)
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.supervision_timeline_activity() FROM PUBLIC;
CREATE TRIGGER trg_supervision_timeline_activity AFTER INSERT OR UPDATE OF status ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.supervision_timeline_activity();
