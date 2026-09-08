-- Run ONLY in an empty disposable PostgreSQL database, as its owner:
-- psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/commission-database.sql
-- This harness creates minimal Supabase contracts, not production profiles.
\set ON_ERROR_STOP on
DO $$ BEGIN
  IF to_regclass('public.profiles') IS NOT NULL OR to_regclass('public.commission_projects') IS NOT NULL THEN
    RAISE EXCEPTION 'Use an EMPTY disposable test database. Never run this harness in the Portal database.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
GRANT USAGE ON SCHEMA auth TO authenticated,anon;
CREATE TABLE public.profiles(id uuid PRIMARY KEY,name text,tier text,status text);
CREATE TABLE public.member_permissions(user_id uuid,permissions text[]);
CREATE TABLE public.tab_permissions(page_key text PRIMARY KEY,label text,visible boolean);
CREATE TABLE public.projects(id uuid PRIMARY KEY,name text);
CREATE TABLE public.project_role_options(name text);
CREATE FUNCTION public.is_diretoria() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND tier='diretoria'); $$;
CREATE FUNCTION public.has_permission(p text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT public.is_diretoria() OR EXISTS(SELECT 1 FROM public.member_permissions WHERE user_id=auth.uid() AND p=ANY(permissions)); $$;
CREATE FUNCTION public.can_access_tab(p text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT public.is_diretoria() OR coalesce((SELECT visible FROM public.tab_permissions WHERE page_key=p),true); $$;
CREATE FUNCTION public.is_project_member(p uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false; $$;
CREATE SCHEMA storage;
CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
\ir ../supabase/migrations/20260908000000_commission.sql

INSERT INTO public.profiles VALUES
 ('00000000-0000-4000-8000-000000000001','Admin','diretoria','ativo'),
 ('00000000-0000-4000-8000-000000000002','Executor A','membro','ativo'),
 ('00000000-0000-4000-8000-000000000003','Executor B','membro','ativo'),
 ('00000000-0000-4000-8000-000000000004','Indicação','membro','ativo'),
 ('00000000-0000-4000-8000-000000000005','Inativo','membro','inativo'),
 ('00000000-0000-4000-8000-000000000006','Criador','membro','ativo');
INSERT INTO public.member_permissions VALUES('00000000-0000-4000-8000-000000000006',ARRAY['commission.create','commission.edit']);
CREATE FUNCTION public.test_assert(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',message; END IF; END $$;
CREATE FUNCTION public.test_reject(statement text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rejected boolean:=false;
BEGIN BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'FAIL: statement should have been rejected: %',statement; END IF;
END; $$;
CREATE FUNCTION public.test_input() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object(
  'project_name','Financial test','client_name','Client','project_date',current_date::text,'gross_cents',120000,
  'costs','[]'::jsonb,'referral_source','Instagram','referral_user_id','00000000-0000-4000-8000-000000000004',
  'members','[{"user_id":"00000000-0000-4000-8000-000000000002","roles":["Backend"],"weight_bp":7000,"participation":100},{"user_id":"00000000-0000-4000-8000-000000000003","roles":["QA"],"weight_bp":3000,"participation":75}]'::jsonb); $$;

BEGIN;
-- Arithmetic fixtures and cent invariants, including many small bases.
DO $$ DECLARE d jsonb; r jsonb; n integer; BEGIN
  d:=public.test_input();r:=commission_private.calculate(d,true);
  PERFORM public.test_assert((r->>'company_total_cents')::bigint=35850,'company includes retained 5850');
  PERFORM public.test_assert((r->>'effective_execution_cents')::bigint=72150,'effective execution');
  PERFORM public.test_assert((r->'members'->1->>'final_cents')::bigint=17550,'reduced member');
  FOR n IN 1..10000 LOOP
    d:=jsonb_set(d,'{gross_cents}',to_jsonb(n));r:=commission_private.calculate(d,true);
    PERFORM public.test_assert((r->>'company_total_cents')::bigint+(r->>'referral_cents')::bigint+(r->>'effective_execution_cents')::bigint=n,'conservation in cents');
  END LOOP;
END $$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT public.commission_command('create','10000000-0000-4000-8000-000000000001',NULL,jsonb_build_object('input',public.test_input()));
-- Retry create returns same version, not another project/history event.
SELECT public.test_assert((public.commission_command('create','10000000-0000-4000-8000-000000000001',NULL,jsonb_build_object('input',public.test_input()))->>'version')::integer=1,'idempotent create');
SELECT public.test_reject($q$ SELECT public.commission_command('pay','10000000-0000-4000-8000-000000000001',1,'{}') $q$);
SELECT public.test_reject($q$ UPDATE public.commission_projects SET status='paid' $q$);
SELECT public.test_reject($q$ DELETE FROM public.commission_history $q$);
SELECT public.commission_command('review','10000000-0000-4000-8000-000000000001',1,'{}');
SELECT public.test_reject($q$ SELECT public.commission_command('approve','10000000-0000-4000-8000-000000000001',1,'{}') $q$);
SELECT public.commission_command('approve','10000000-0000-4000-8000-000000000001',2,'{}');
SELECT public.test_reject($q$ SELECT public.commission_command('pay','10000000-0000-4000-8000-000000000001',3,'{}') $q$);
-- Revision invalidates approval; old snapshot survives.
SELECT public.commission_command('save','10000000-0000-4000-8000-000000000001',3,jsonb_build_object('input',public.test_input()));
SELECT public.test_assert(public.commission_read('10000000-0000-4000-8000-000000000001')->'project'->>'status'='draft','revision becomes draft');
SELECT public.test_assert(jsonb_array_length(public.commission_read('10000000-0000-4000-8000-000000000001')->'revisions')=1,'old snapshot preserved');
SELECT public.commission_command('approve','10000000-0000-4000-8000-000000000001',4,'{}');
SELECT public.commission_command('settle','10000000-0000-4000-8000-000000000001',5,jsonb_build_object('date',(now() AT TIME ZONE 'America/Sao_Paulo')::date));
SELECT public.commission_command('pay','10000000-0000-4000-8000-000000000001',6,jsonb_build_object('date',(now() AT TIME ZONE 'America/Sao_Paulo')::date,'payment_type','execution','user_id','00000000-0000-4000-8000-000000000002','amount_cents',1));
SELECT public.test_assert((public.commission_read('10000000-0000-4000-8000-000000000001')->'payments'->0->>'amount_cents')::bigint=54600,'server ignores client payment amount');
SELECT public.test_reject($q$ SELECT public.commission_command('save','10000000-0000-4000-8000-000000000001',7,jsonb_build_object('input',public.test_input())) $q$);
SELECT public.test_reject($q$ SELECT public.commission_command('cancel','10000000-0000-4000-8000-000000000001',7,'{"reason":"no"}') $q$);
SELECT public.test_reject($q$ SELECT public.commission_command('pay','10000000-0000-4000-8000-000000000001',7,jsonb_build_object('date',current_date,'payment_type','execution','user_id','00000000-0000-4000-8000-000000000002')) $q$);

-- Member projection: no company/costs/other beneficiaries/admin history.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
SELECT public.test_assert(jsonb_array_length(public.commission_read(NULL,true)->'own')=1,'own approved project');
SELECT public.test_assert(NOT (public.commission_read(NULL,true)->'own'->0 ? 'result'),'own projection excludes project totals');
SELECT public.test_assert((public.commission_read(NULL,true)->'own'->0->'execution'->>'final_cents')::bigint=54600,'own amount');
SELECT public.test_reject($q$ SELECT public.commission_read('10000000-0000-4000-8000-000000000001',false) $q$);
SELECT public.test_reject($q$ SELECT * FROM public.commission_projects $q$);
SELECT public.test_reject($q$ SELECT * FROM public.commission_project_members $q$);
SELECT public.test_reject($q$ SELECT public.commission_command('approve','10000000-0000-4000-8000-000000000001',7,'{}') $q$);
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',false);
SELECT public.test_reject($q$ SELECT public.commission_read(NULL,true) $q$);
SELECT set_config('request.jwt.claim.sub','',false);
SELECT public.test_reject($q$ SELECT public.commission_read(NULL,true) $q$);
RESET ROLE;
SET ROLE anon;
SELECT public.test_reject($q$ SELECT public.commission_read(NULL,true) $q$);
RESET ROLE;

-- Final payments remain accessible only to leadership.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT public.commission_command('pay','10000000-0000-4000-8000-000000000001',7,jsonb_build_object('date',(now() AT TIME ZONE 'America/Sao_Paulo')::date,'payment_type','execution','user_id','00000000-0000-4000-8000-000000000003'));
SELECT public.commission_command('pay','10000000-0000-4000-8000-000000000001',8,jsonb_build_object('date',(now() AT TIME ZONE 'America/Sao_Paulo')::date,'payment_type','referral','user_id','00000000-0000-4000-8000-000000000004'));
SELECT public.test_assert(public.commission_read('10000000-0000-4000-8000-000000000001')->'project'->>'status'='paid','all obligations paid');
RESET ROLE;
-- Deactivation/deletion cannot erase historical payments and approved names.
DELETE FROM public.profiles WHERE id='00000000-0000-4000-8000-000000000002';
SELECT public.test_assert((SELECT count(*)=3 FROM public.commission_payments),'payments retained after profile deletion');
SELECT public.test_assert((SELECT name_snapshot='Executor A' FROM public.commission_payments WHERE beneficiary_key='00000000-0000-4000-8000-000000000002'),'historical name retained');
ROLLBACK;
\echo 'PASS: commission database scenarios'
