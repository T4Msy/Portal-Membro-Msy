-- ============================================================
-- MSY Portal - Jornal position hardening + tab visibility access
-- ============================================================

UPDATE public.jornal_media
SET position = 0
WHERE media_type = 'image'
  AND (
    position < 0
    OR position > 100000
  )
  AND COALESCE(alt_text, '') LIKE '%article_photo%';

UPDATE public.jornal_media
SET position = 10
WHERE media_type = 'image'
  AND (
    position < 0
    OR position > 100000
  )
  AND COALESCE(alt_text, '') NOT LIKE '%article_photo%';

ALTER TABLE public.jornal_media
  DROP CONSTRAINT IF EXISTS jornal_media_position_sane;

ALTER TABLE public.jornal_media
  ADD CONSTRAINT jornal_media_position_sane
  CHECK (position BETWEEN 0 AND 100000);

CREATE TABLE IF NOT EXISTS public.tab_permissions (
  page_key text PRIMARY KEY,
  label text NOT NULL,
  visible boolean NOT NULL DEFAULT true,
  allowed_tiers text[] NOT NULL DEFAULT '{}',
  allowed_roles text[] NOT NULL DEFAULT '{}',
  allowed_user_ids uuid[] NOT NULL DEFAULT '{}',
  required_permissions text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

INSERT INTO public.tab_permissions (page_key, label, visible)
VALUES
  ('dashboard','Dashboard',true),
  ('atividades','Atividades',true),
  ('comunicados','Comunicados',true),
  ('membros','Membros',true),
  ('eventos','Eventos',true),
  ('reunioes','Reuniões',true),
  ('ranking','Ranking',true),
  ('jornal','Jornal da Masayoshi',true),
  ('feed','Feed',true),
  ('sugestoes','Sugestões',true),
  ('biblioteca','Biblioteca',true),
  ('premiacoes','Premiações',true),
  ('ordem','Estrutura',true),
  ('tecnologias','Tecnologias',true),
  ('mensalidade','Mensalidade',true),
  ('icm','ICM',true),
  ('perfil','Meu Perfil',true),
  ('admin','Administração',true),
  ('permissoes','Permissões',true),
  ('desempenho','Desempenho',true)
ON CONFLICT (page_key) DO NOTHING;

ALTER TABLE public.tab_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros leem configuracao de abas" ON public.tab_permissions;
CREATE POLICY "Membros leem configuracao de abas"
  ON public.tab_permissions FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Diretoria gerencia abas" ON public.tab_permissions;
CREATE POLICY "Diretoria gerencia abas"
  ON public.tab_permissions FOR ALL
  USING (public.is_diretoria() OR public.has_permission('gerenciar_permissoes'))
  WITH CHECK (public.is_diretoria() OR public.has_permission('gerenciar_permissoes'));

CREATE OR REPLACE FUNCTION public.can_access_tab(p_page_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_rule public.tab_permissions%ROWTYPE;
  v_permissions text[] := '{}';
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND OR v_profile.status <> 'ativo' THEN
    RETURN false;
  END IF;

  IF v_profile.tier = 'diretoria' THEN
    RETURN true;
  END IF;

  SELECT * INTO v_rule FROM public.tab_permissions WHERE page_key = p_page_key;
  IF NOT FOUND THEN
    RETURN true;
  END IF;

  IF v_rule.visible IS FALSE THEN
    RETURN false;
  END IF;

  IF cardinality(v_rule.allowed_tiers) > 0
     OR cardinality(v_rule.allowed_roles) > 0
     OR cardinality(v_rule.allowed_user_ids) > 0 THEN
    IF NOT (
      v_profile.tier = ANY(v_rule.allowed_tiers)
      OR v_profile.role = ANY(v_rule.allowed_roles)
      OR v_profile.id = ANY(v_rule.allowed_user_ids)
    ) THEN
      RETURN false;
    END IF;
  END IF;

  IF cardinality(v_rule.required_permissions) > 0 THEN
    SELECT COALESCE(permissions, '{}') INTO v_permissions
    FROM public.member_permissions
    WHERE user_id = auth.uid();

    IF NOT v_permissions && v_rule.required_permissions THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$;

COMMENT ON TABLE public.tab_permissions IS
  'Configuração administrativa de visibilidade e autorização de abas/páginas do portal.';
