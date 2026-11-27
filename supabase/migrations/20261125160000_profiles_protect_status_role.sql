-- Aplicada em producao em 25/11/2026: ninguem muda o proprio status ou cargo; mudar o de outro pede diretoria
-- ou permissao de gerir membros. Service role (auth.uid() nulo) passa.
CREATE OR REPLACE FUNCTION public.prevent_status_role_self_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF (NEW.status IS DISTINCT FROM OLD.status OR NEW.role IS DISTINCT FROM OLD.role) AND auth.uid() IS NOT NULL AND NOT public.is_diretoria() THEN
    IF OLD.id = auth.uid() THEN RAISE EXCEPTION 'Só a diretoria pode mudar o status ou o cargo da própria conta.' USING ERRCODE='42501'; END IF;
    IF NOT (public.has_permission('aprovar_membros') OR public.has_permission('editar_membros') OR public.has_permission('remover_membros')) THEN
      RAISE EXCEPTION 'Só a diretoria ou quem tem permissão de gerir membros pode mudar status ou cargo.' USING ERRCODE='42501'; END IF;
  END IF; RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_profiles_protect_status_role ON public.profiles;
CREATE TRIGGER trg_profiles_protect_status_role BEFORE UPDATE OF status, role ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.prevent_status_role_self_change();
