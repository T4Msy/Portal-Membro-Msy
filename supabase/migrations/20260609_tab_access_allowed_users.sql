-- ============================================================
-- MSY Portal - Tab visibility by selected members
-- ============================================================

ALTER TABLE public.tab_permissions
  ADD COLUMN IF NOT EXISTS allowed_user_ids uuid[] NOT NULL DEFAULT '{}';

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
  v_has_audience boolean := false;
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

  v_has_audience :=
    cardinality(v_rule.allowed_tiers) > 0
    OR cardinality(v_rule.allowed_roles) > 0
    OR cardinality(v_rule.allowed_user_ids) > 0;

  IF v_has_audience
     AND NOT (
       v_profile.tier = ANY(v_rule.allowed_tiers)
       OR v_profile.role = ANY(v_rule.allowed_roles)
       OR v_profile.id = ANY(v_rule.allowed_user_ids)
     ) THEN
    RETURN false;
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

