-- ============================================================
-- MSY PORTAL — Migration: Desempenho v2 + Eventos Aprimorados
-- Execute no Supabase Dashboard > SQL Editor
-- ============================================================

-- ── 1. Novos campos na tabela events ────────────────────────
-- Quem ajudou na criação do evento (co-criador)
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS helper_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Flag de evento privado (apenas diretoria)
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;

-- Peso do evento no desempenho (padrão = 1)
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS performance_weight integer NOT NULL DEFAULT 1;

-- Índices
CREATE INDEX IF NOT EXISTS idx_events_helper_id  ON public.events(helper_id);
CREATE INDEX IF NOT EXISTS idx_events_is_private ON public.events(is_private);

-- ── 2. RLS para eventos privados ───────────────────────────
-- Eventos privados só são visíveis para diretoria
DROP POLICY IF EXISTS "public_events_select"  ON public.events;
DROP POLICY IF EXISTS "private_events_select" ON public.events;

-- Política unificada de leitura
CREATE POLICY "events_select_policy"
ON public.events FOR SELECT
USING (
  is_private = false
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND tier = 'diretoria')
);

-- ── 3. Tabela de snapshot de desempenho mensal ──────────────
-- Armazena snapshots calculados para evitar recálculo constante
CREATE TABLE IF NOT EXISTS public.performance_snapshots (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  month       text NOT NULL,           -- formato 'YYYY-MM'
  user_id     uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  score       numeric(5,2) DEFAULT 0,  -- 0-100
  acts_total  integer DEFAULT 0,
  acts_done   integer DEFAULT 0,
  acts_rate   numeric(5,2) DEFAULT 0,
  events_part integer DEFAULT 0,
  events_total integer DEFAULT 0,
  events_rate numeric(5,2) DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(month, user_id)
);

ALTER TABLE public.performance_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "diretoria_read_snapshots"
ON public.performance_snapshots FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND tier = 'diretoria')
);

CREATE POLICY "diretoria_write_snapshots"
ON public.performance_snapshots FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND tier = 'diretoria')
);

CREATE INDEX IF NOT EXISTS idx_perf_snapshots_month   ON public.performance_snapshots(month);
CREATE INDEX IF NOT EXISTS idx_perf_snapshots_user_id ON public.performance_snapshots(user_id);

-- ── 4. Garantir que member_permissions existe ───────────────
CREATE TABLE IF NOT EXISTS public.member_permissions (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  permissions text[] DEFAULT '{}',
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.member_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "diretoria_select_perms" ON public.member_permissions;
DROP POLICY IF EXISTS "diretoria_insert_perms" ON public.member_permissions;
DROP POLICY IF EXISTS "diretoria_update_perms" ON public.member_permissions;
DROP POLICY IF EXISTS "diretoria_delete_perms" ON public.member_permissions;

CREATE POLICY "diretoria_select_perms" ON public.member_permissions FOR SELECT
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND tier = 'diretoria') OR user_id = auth.uid());

CREATE POLICY "diretoria_insert_perms" ON public.member_permissions FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND tier = 'diretoria'));

CREATE POLICY "diretoria_update_perms" ON public.member_permissions FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND tier = 'diretoria'));

CREATE POLICY "diretoria_delete_perms" ON public.member_permissions FOR DELETE
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND tier = 'diretoria'));

CREATE INDEX IF NOT EXISTS idx_member_permissions_user_id ON public.member_permissions(user_id);

COMMENT ON TABLE public.performance_snapshots IS 'Snapshots mensais de desempenho por membro. Calculados sob demanda e cacheados.';
COMMENT ON COLUMN public.events.helper_id IS 'Co-criador do evento — também recebe crédito de desempenho.';
COMMENT ON COLUMN public.events.is_private IS 'Evento privado da diretoria — invisível para membros comuns.';
