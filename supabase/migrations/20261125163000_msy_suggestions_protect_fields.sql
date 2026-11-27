-- Aplicada em producao em 25/11/2026: a policy de voto deixa qualquer membro dar UPDATE na sugestao.
-- Este trigger so deixa mudar status, nota e texto quem e diretoria ou tem gerenciar_sugestoes. Voto segue livre.
CREATE OR REPLACE FUNCTION public.prevent_suggestion_field_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_diretoria() OR public.has_permission('gerenciar_sugestoes') THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.admin_note IS DISTINCT FROM OLD.admin_note
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.content IS DISTINCT FROM OLD.content
     OR NEW.category IS DISTINCT FROM OLD.category
     OR NEW.author_id IS DISTINCT FROM OLD.author_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Só a diretoria ou quem tem permissão de gerenciar sugestões pode mudar status, nota ou texto de uma sugestão.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_msy_suggestions_protect ON public.msy_suggestions;
CREATE TRIGGER trg_msy_suggestions_protect BEFORE UPDATE ON public.msy_suggestions FOR EACH ROW EXECUTE FUNCTION public.prevent_suggestion_field_change();
