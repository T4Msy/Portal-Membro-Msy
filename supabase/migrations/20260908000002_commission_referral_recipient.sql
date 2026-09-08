-- Keeps the selected referral recipient explicit in saved results for installations
-- that already applied the previous commission migrations.
BEGIN;
CREATE OR REPLACE FUNCTION commission_private.stamp_referral_recipient()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  NEW.result := coalesce(NEW.result, '{}'::jsonb) || jsonb_build_object(
    'referral_user_id', nullif(NEW.input->>'referral_user_id','')
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_commission_stamp_referral_recipient ON public.commission_projects;
CREATE TRIGGER trg_commission_stamp_referral_recipient
  BEFORE INSERT OR UPDATE OF input, result ON public.commission_projects
  FOR EACH ROW EXECUTE FUNCTION commission_private.stamp_referral_recipient();
COMMIT;
