-- Lembretes e observacoes operacionais da Supervisao.

CREATE TABLE IF NOT EXISTS public.supervision_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text UNIQUE,
  title text NOT NULL,
  description text,
  category text NOT NULL CHECK (category IN ('task','activity','event_message','finance')),
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','automatic')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed','dismissed')),
  due_at timestamptz,
  source_type text,
  source_id uuid,
  whatsapp_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.supervision_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text UNIQUE,
  title text NOT NULL,
  body text NOT NULL,
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','automatic')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  archived_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supervision_reminders_open ON public.supervision_reminders(status, due_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supervision_observations_active ON public.supervision_observations(status, created_at DESC);

ALTER TABLE public.supervision_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervision_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Supervisao: le lembretes" ON public.supervision_reminders FOR SELECT TO authenticated USING (public.can_access_supervision());
CREATE POLICY "Supervisao: cria lembretes" ON public.supervision_reminders FOR INSERT TO authenticated WITH CHECK (public.can_access_supervision() AND origin = 'manual' AND created_by = auth.uid());
CREATE POLICY "Supervisao: atua em lembretes" ON public.supervision_reminders FOR UPDATE TO authenticated USING (public.can_access_supervision()) WITH CHECK (public.can_access_supervision());
CREATE POLICY "Supervisao: le observacoes" ON public.supervision_observations FOR SELECT TO authenticated USING (public.can_access_supervision());
CREATE POLICY "Supervisao: cria observacoes" ON public.supervision_observations FOR INSERT TO authenticated WITH CHECK (public.can_access_supervision() AND origin = 'manual' AND created_by = auth.uid());
CREATE POLICY "Supervisao: arquiva observacoes" ON public.supervision_observations FOR UPDATE TO authenticated USING (public.can_access_supervision()) WITH CHECK (public.can_access_supervision());
