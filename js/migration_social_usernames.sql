-- ============================================================
-- MSY PORTAL — MIGRATION SOCIAL USERNAMES
-- Hardening de usernames sociais e perfil social editável
-- Execute no Supabase Dashboard > SQL Editor.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS social_avatar_url text;

CREATE OR REPLACE FUNCTION public.normalize_social_username(raw_username text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_username text;
BEGIN
  v_username := lower(btrim(COALESCE(raw_username, '')));
  v_username := regexp_replace(v_username, '^@+', '');
  v_username := regexp_replace(v_username, '\s+', '', 'g');

  IF v_username = '' THEN
    RETURN NULL;
  END IF;

  RETURN v_username;
END;
$$;

CREATE OR REPLACE FUNCTION public.social_username_is_reserved(candidate text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(candidate, '') = ANY (ARRAY[
    'admin',
    'administracao',
    'atendimento',
    'auth',
    'claude',
    'contato',
    'dashboard',
    'diretoria',
    'feed',
    'login',
    'masayoshi',
    'membro',
    'members',
    'moderacao',
    'msy',
    'notifications',
    'perfil',
    'portal',
    'root',
    'settings',
    'suporte',
    'system'
  ]);
$$;

CREATE OR REPLACE FUNCTION public.social_username_is_valid(candidate text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (
    candidate IS NULL
    OR (
      candidate = public.normalize_social_username(candidate)
      AND char_length(candidate) BETWEEN 3 AND 24
      AND candidate ~ '^[a-z0-9](?:[a-z0-9._]{1,22}[a-z0-9])?$'
      AND candidate !~ '\.\.'
      AND NOT public.social_username_is_reserved(candidate)
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.set_social_username_defaults()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.username := public.normalize_social_username(NEW.username);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_normalize_social_username ON public.profiles;
CREATE TRIGGER trg_profiles_normalize_social_username
  BEFORE INSERT OR UPDATE OF username
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_social_username_defaults();

UPDATE public.profiles p
SET username = normalized.username_normalized
FROM (
  SELECT
    id,
    public.normalize_social_username(username) AS username_normalized
  FROM public.profiles
  WHERE username IS NOT NULL
) normalized
WHERE p.id = normalized.id
  AND normalized.username_normalized IS DISTINCT FROM p.username
  AND NOT EXISTS (
    SELECT 1
    FROM public.profiles other
    WHERE other.id <> p.id
      AND lower(other.username) = lower(normalized.username_normalized)
  );

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS chk_profiles_social_username_valid;

ALTER TABLE public.profiles
  ADD CONSTRAINT chk_profiles_social_username_valid
  CHECK (public.social_username_is_valid(username))
  NOT VALID;

CREATE OR REPLACE FUNCTION public.update_social_profile(
  p_username text DEFAULT NULL,
  p_social_bio text DEFAULT NULL,
  p_banner_url text DEFAULT NULL,
  p_social_avatar_url text DEFAULT NULL,
  p_social_links jsonb DEFAULT NULL,
  p_profile_highlights jsonb DEFAULT NULL
) RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  UPDATE public.profiles
  SET username = COALESCE(p_username, username),
      social_bio = COALESCE(p_social_bio, social_bio),
      banner_url = COALESCE(p_banner_url, banner_url),
      social_avatar_url = COALESCE(p_social_avatar_url, social_avatar_url),
      social_links = COALESCE(p_social_links, social_links),
      profile_highlights = COALESCE(p_profile_highlights, profile_highlights)
  WHERE id = v_user_id
  RETURNING * INTO v_profile;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil não encontrado para o usuário autenticado.';
  END IF;

  RETURN v_profile;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Este username já está em uso.';
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_social_profile(text, text, text, text, jsonb, jsonb) TO authenticated;
