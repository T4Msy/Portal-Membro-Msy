-- Último acesso ao portal (profiles.last_portal_activity_at).
-- A coluna foi criada em 20260717_supervisao.sql, mas nada gravava nela: o agente e a Supervisão
-- mostravam "nunca acessou" para quase todo mundo. A fonte confiável é a sessão do Supabase Auth,
-- renovada a cada uso do portal (web, PWA, Android, Electron). Sessões do Agente MSY (user-agent
-- "node") não contam como acesso ao portal.

-- 1) Mexer só no último acesso não muda profiles.updated_at.
CREATE OR REPLACE FUNCTION public.profiles_handle_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'last_portal_activity_at' - 'updated_at') = (to_jsonb(OLD) - 'last_portal_activity_at' - 'updated_at') THEN
    NEW.updated_at = OLD.updated_at;
  ELSE
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_handle_updated_at();

-- 2) Sincroniza a partir das sessões (e do último login).
CREATE OR REPLACE FUNCTION public.sync_portal_activity()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE n integer;
BEGIN
  WITH visto AS (
    SELECT u.id,
           GREATEST(
             u.last_sign_in_at,
             (SELECT max(GREATEST(s.updated_at, s.refreshed_at AT TIME ZONE 'UTC'))
                FROM auth.sessions s
               WHERE s.user_id = u.id
                 AND COALESCE(s.user_agent, '') !~* '^(node|undici|deno|curl)')
           ) AS ultimo
      FROM auth.users u
  )
  UPDATE public.profiles p
     SET last_portal_activity_at = v.ultimo
    FROM visto v
   WHERE p.id = v.id
     AND v.ultimo IS NOT NULL
     AND (p.last_portal_activity_at IS NULL OR v.ultimo > p.last_portal_activity_at);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_portal_activity() FROM PUBLIC, anon, authenticated;

-- 3) A cada 10 minutos.
SELECT cron.unschedule('sync-portal-activity') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-portal-activity');
SELECT cron.schedule('sync-portal-activity', '*/10 * * * *', 'select public.sync_portal_activity()');

-- 4) Preenche agora.
SELECT public.sync_portal_activity();
