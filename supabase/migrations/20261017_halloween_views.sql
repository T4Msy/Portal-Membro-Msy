-- Halloween Masayoshi 2026: quem abriu o convite (halloween.html) e até onde foi.
-- A diretoria acompanha em halloween-painel.html.
--
-- Etapas do convite (reached_stage):
--   0 aviso · 1 fita · 2 convite · 3 cronograma · 4 aceitar (= viu tudo)
-- O membro nunca escreve direto na tabela: tudo passa por halloween_track(),
-- que só avança o progresso (não dá para "desver" nem pular etapas por update).

CREATE TABLE IF NOT EXISTS public.halloween_views (
  user_id         uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  first_opened_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  visits          integer     NOT NULL DEFAULT 1,
  reached_stage   smallint    NOT NULL DEFAULT 0 CHECK (reached_stage BETWEEN 0 AND 4),
  days_seen       smallint[]  NOT NULL DEFAULT '{}',
  completed_at    timestamptz,
  signed_at       timestamptz,
  secrets_found   smallint    NOT NULL DEFAULT 0 CHECK (secrets_found BETWEEN 0 AND 8)
);

ALTER TABLE public.halloween_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Halloween: membro ve o proprio, diretoria ve todos" ON public.halloween_views;
CREATE POLICY "Halloween: membro ve o proprio, diretoria ve todos"
  ON public.halloween_views FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_diretoria());

CREATE OR REPLACE FUNCTION public.halloween_track(p_event text, p_value text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_stage smallint;
  v_num   smallint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sem sessão';
  END IF;

  INSERT INTO public.halloween_views (user_id, visits)
  VALUES (v_uid, CASE WHEN p_event = 'open' THEN 1 ELSE 0 END)
  ON CONFLICT (user_id) DO UPDATE
    SET last_seen_at = now(),
        visits = halloween_views.visits + CASE WHEN p_event = 'open' THEN 1 ELSE 0 END;

  IF p_event = 'scene' THEN
    v_stage := CASE p_value
      WHEN 'gate' THEN 0 WHEN 'intro' THEN 1 WHEN 'invite' THEN 2
      WHEN 'program' THEN 3 WHEN 'accept' THEN 4 ELSE NULL END;
    IF v_stage IS NOT NULL THEN
      UPDATE public.halloween_views
        SET reached_stage = GREATEST(reached_stage, v_stage),
            completed_at = CASE WHEN v_stage = 4 THEN COALESCE(completed_at, now()) ELSE completed_at END
        WHERE user_id = v_uid;
    END IF;
  ELSIF p_event = 'day' THEN
    v_num := NULLIF(p_value, '')::smallint;
    IF v_num BETWEEN 0 AND 8 THEN
      UPDATE public.halloween_views
        SET days_seen = (SELECT array_agg(DISTINCT d ORDER BY d) FROM unnest(days_seen || v_num) AS d),
            reached_stage = GREATEST(reached_stage, 3)
        WHERE user_id = v_uid;
    END IF;
  ELSIF p_event = 'signed' THEN
    UPDATE public.halloween_views
      SET signed_at = COALESCE(signed_at, now()),
          reached_stage = 4,
          completed_at = COALESCE(completed_at, now())
      WHERE user_id = v_uid;
  ELSIF p_event = 'secrets' THEN
    v_num := NULLIF(p_value, '')::smallint;
    IF v_num BETWEEN 0 AND 8 THEN
      UPDATE public.halloween_views
        SET secrets_found = GREATEST(secrets_found, v_num)
        WHERE user_id = v_uid;
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.halloween_track(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.halloween_track(text, text) TO authenticated;
