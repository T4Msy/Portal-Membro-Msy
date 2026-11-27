-- Aplicada em produção em 25/11/2026 pelo Agente MSY (migration marketing_comercial). A tabela de preços é preenchida pela diretoria, fora daqui.
-- Marketing e Comercial (Agente MSY, Fase 4 sem integrações externas):
-- calendário de conteúdo (content_posts), leads (crm_leads + crm_lead_notes) e catálogo de preços (crm_catalog).
-- Quem pode: permissão 'agente_marketing_comercial' (tela de permissões) ou diretoria (has_permission já inclui).
-- Apagar lead é só da diretoria (pedido de exclusão de dados); preços só a diretoria muda.

CREATE OR REPLACE FUNCTION public.can_marketing()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND public.has_permission('agente_marketing_comercial');
$$;
REVOKE ALL ON FUNCTION public.can_marketing() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_marketing() TO authenticated;

-- Mantém autor e criação; carimba atualização.
CREATE OR REPLACE FUNCTION public.mkt_keep_authorship()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.mkt_keep_authorship() FROM PUBLIC, anon, authenticated;

-- Calendário de conteúdo
CREATE TABLE IF NOT EXISTS public.content_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publish_at timestamptz,
  channel text NOT NULL CHECK (channel IN ('instagram','tiktok','linkedin','facebook','youtube','site','whatsapp')),
  format text NOT NULL DEFAULT 'post' CHECK (format IN ('post','carrossel','reels','stories','video','artigo','texto')),
  pillar text CHECK (pillar IS NULL OR char_length(pillar) <= 60),
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 160),
  caption text CHECK (caption IS NULL OR char_length(caption) <= 5000),
  script text CHECK (script IS NULL OR char_length(script) <= 10000),
  art_url text CHECK (art_url IS NULL OR art_url ~* '^https?://'),
  status text NOT NULL DEFAULT 'ideia' CHECK (status IN ('ideia','rascunho','aprovado','agendado','publicado','cancelado')),
  published_url text CHECK (published_url IS NULL OR published_url ~* '^https?://'),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metrics) = 'object'),
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_posts_publish_at_idx ON public.content_posts (publish_at);
CREATE INDEX IF NOT EXISTS content_posts_status_idx ON public.content_posts (status);
DROP TRIGGER IF EXISTS trg_content_posts_authorship ON public.content_posts;
CREATE TRIGGER trg_content_posts_authorship BEFORE UPDATE ON public.content_posts
  FOR EACH ROW EXECUTE FUNCTION public.mkt_keep_authorship();

-- Leads
CREATE TABLE IF NOT EXISTS public.crm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  phone text CHECK (phone IS NULL OR phone ~ '^[0-9]{12,13}$'),
  instagram text CHECK (instagram IS NULL OR instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  email text CHECK (email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  company text CHECK (company IS NULL OR char_length(company) <= 120),
  source text CHECK (source IS NULL OR char_length(source) <= 120),
  interest text NOT NULL DEFAULT 'outro' CHECK (interest IN ('curso_ia','site','automacao','bot_whatsapp','sistema','portal','integracao','outro')),
  stage text NOT NULL DEFAULT 'novo' CHECK (stage IN ('novo','contatado','conversando','proposta','fechado','perdido')),
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  next_followup_at timestamptz,
  last_contact_at timestamptz,
  estimated_value_cents integer CHECK (estimated_value_cents IS NULL OR estimated_value_cents >= 0),
  lost_reason text CHECK (lost_reason IS NULL OR char_length(lost_reason) <= 500),
  summary text CHECK (summary IS NULL OR char_length(summary) <= 4000),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (phone IS NOT NULL OR instagram IS NOT NULL OR email IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS crm_leads_phone_uniq ON public.crm_leads (phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crm_leads_instagram_uniq ON public.crm_leads (lower(instagram)) WHERE instagram IS NOT NULL;
CREATE INDEX IF NOT EXISTS crm_leads_followup_idx ON public.crm_leads (next_followup_at) WHERE stage NOT IN ('fechado','perdido');
DROP TRIGGER IF EXISTS trg_crm_leads_authorship ON public.crm_leads;
CREATE TRIGGER trg_crm_leads_authorship BEFORE UPDATE ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.mkt_keep_authorship();

CREATE TABLE IF NOT EXISTS public.crm_lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  author_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'nota' CHECK (kind IN ('nota','mensagem','ligacao','reuniao','proposta')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 8000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_lead_notes_lead_idx ON public.crm_lead_notes (lead_id, created_at DESC);

-- Catálogo de preços (preenchido pela diretoria)
CREATE TABLE IF NOT EXISTS public.crm_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('curso','site','servico')),
  name text NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 2 AND 80),
  description text CHECK (description IS NULL OR char_length(description) <= 1000),
  price_cents integer CHECK (price_cents IS NULL OR price_cents >= 0),
  installments integer CHECK (installments IS NULL OR installments BETWEEN 1 AND 24),
  installment_cents integer CHECK (installment_cents IS NULL OR installment_cents >= 0),
  bundle_min integer CHECK (bundle_min IS NULL OR bundle_min >= 2),
  bundle_pct numeric(5,2) CHECK (bundle_pct IS NULL OR (bundle_pct > 0 AND bundle_pct < 100)),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 1000),
  active boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.content_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_lead_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_posts_select ON public.content_posts;
DROP POLICY IF EXISTS content_posts_insert ON public.content_posts;
DROP POLICY IF EXISTS content_posts_update ON public.content_posts;
DROP POLICY IF EXISTS content_posts_delete ON public.content_posts;
CREATE POLICY content_posts_select ON public.content_posts FOR SELECT TO authenticated USING (public.can_marketing());
CREATE POLICY content_posts_insert ON public.content_posts FOR INSERT TO authenticated WITH CHECK (public.can_marketing() AND created_by = auth.uid());
CREATE POLICY content_posts_update ON public.content_posts FOR UPDATE TO authenticated USING (public.can_marketing()) WITH CHECK (public.can_marketing());
CREATE POLICY content_posts_delete ON public.content_posts FOR DELETE TO authenticated USING (public.can_marketing() AND (created_by = auth.uid() OR public.is_diretoria()));

DROP POLICY IF EXISTS crm_leads_select ON public.crm_leads;
DROP POLICY IF EXISTS crm_leads_insert ON public.crm_leads;
DROP POLICY IF EXISTS crm_leads_update ON public.crm_leads;
DROP POLICY IF EXISTS crm_leads_delete ON public.crm_leads;
CREATE POLICY crm_leads_select ON public.crm_leads FOR SELECT TO authenticated USING (public.can_marketing());
CREATE POLICY crm_leads_insert ON public.crm_leads FOR INSERT TO authenticated WITH CHECK (public.can_marketing() AND created_by = auth.uid());
CREATE POLICY crm_leads_update ON public.crm_leads FOR UPDATE TO authenticated USING (public.can_marketing()) WITH CHECK (public.can_marketing());
CREATE POLICY crm_leads_delete ON public.crm_leads FOR DELETE TO authenticated USING (public.is_diretoria());

DROP POLICY IF EXISTS crm_lead_notes_select ON public.crm_lead_notes;
DROP POLICY IF EXISTS crm_lead_notes_insert ON public.crm_lead_notes;
DROP POLICY IF EXISTS crm_lead_notes_delete ON public.crm_lead_notes;
CREATE POLICY crm_lead_notes_select ON public.crm_lead_notes FOR SELECT TO authenticated USING (public.can_marketing());
CREATE POLICY crm_lead_notes_insert ON public.crm_lead_notes FOR INSERT TO authenticated WITH CHECK (public.can_marketing() AND author_id = auth.uid());
CREATE POLICY crm_lead_notes_delete ON public.crm_lead_notes FOR DELETE TO authenticated USING (public.is_diretoria() OR (public.can_marketing() AND author_id = auth.uid()));

DROP POLICY IF EXISTS crm_catalog_select ON public.crm_catalog;
DROP POLICY IF EXISTS crm_catalog_write ON public.crm_catalog;
CREATE POLICY crm_catalog_select ON public.crm_catalog FOR SELECT TO authenticated USING (public.can_marketing());
CREATE POLICY crm_catalog_write ON public.crm_catalog FOR ALL TO authenticated USING (public.is_diretoria()) WITH CHECK (public.is_diretoria());

REVOKE ALL ON public.content_posts, public.crm_leads, public.crm_lead_notes, public.crm_catalog FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_posts, public.crm_leads, public.crm_lead_notes, public.crm_catalog TO authenticated;
