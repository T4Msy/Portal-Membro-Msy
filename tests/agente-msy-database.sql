-- Teste da migration 20261125_agente_msy_e_acesso_anonimo.sql num Postgres local que imita o Supabase.
-- Rodar: psql -v ON_ERROR_STOP=1 -f tests/agente-msy-database.sql  (num banco vazio, de dentro de tests/)
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
CREATE TABLE public.profiles(id uuid PRIMARY KEY, name text, tier text DEFAULT 'membro');
CREATE TABLE public.member_permissions(user_id uuid, permissions text[]);
CREATE TABLE public.notifications(id uuid DEFAULT gen_random_uuid(), user_id uuid, actor_id uuid, message text, type text, icon text, link text, target_type text, target_id uuid, target_url text, metadata jsonb);
CREATE FUNCTION public.is_diretoria() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND tier='diretoria') $$;
CREATE FUNCTION public.has_permission(p text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.is_diretoria() OR EXISTS(SELECT 1 FROM public.member_permissions WHERE user_id=auth.uid() AND p=ANY(permissions)) $$;
-- Tabelas que estavam abertas, com uma policy permissiva como a de produção.
CREATE TABLE public.events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text, is_private boolean DEFAULT false, status text);
CREATE TABLE public.meetings(id int); CREATE TABLE public.scheduled_meetings(id int); CREATE TABLE public.meeting_requests(id int);
CREATE TABLE public.event_presencas(id int); CREATE TABLE public.event_cancel_requests(id int);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY events_select_policy ON public.events FOR SELECT USING (is_private = false);
ALTER TABLE public.event_presencas ENABLE ROW LEVEL SECURITY;
CREATE POLICY aberta ON public.event_presencas FOR SELECT USING (true);
-- Como em produção: policy aberta a todos para tudo.
CREATE POLICY ep_all ON public.event_presencas FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE public.scheduled_meetings ENABLE ROW LEVEL SECURITY;
CREATE POLICY sched_all ON public.scheduled_meetings FOR ALL USING (true) WITH CHECK (true);
INSERT INTO public.scheduled_meetings VALUES (1);
INSERT INTO public.events(title) VALUES ('Call semanal'); INSERT INTO public.event_presencas VALUES (1);

\ir ../supabase/migrations/20260615_gestao_projetos.sql
\ir ../supabase/migrations/20260616_projetos_v2.sql
\ir ../supabase/migrations/20260718_allow_manager_self_approval.sql
-- Supabase concede tudo às roles da API; quem restringe é a RLS.
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

INSERT INTO public.profiles VALUES
 ('00000000-0000-4000-8000-00000000000a','Gestora','membro'),
 ('00000000-0000-4000-8000-00000000000b','Responsavel','membro'),
 ('00000000-0000-4000-8000-00000000000c','Outro','membro');
INSERT INTO public.projects(id,name,created_by) VALUES ('10000000-0000-4000-8000-000000000001','Projeto','00000000-0000-4000-8000-00000000000a');
INSERT INTO public.project_participants(project_id,user_id,is_manager) VALUES
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-00000000000a',true),
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-00000000000b',false);
INSERT INTO public.project_tasks(id,project_id,title,assigned_to,prazo) VALUES
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Tela de login','00000000-0000-4000-8000-00000000000b','2026-12-01');

CREATE FUNCTION public.test_assert(ok boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FALHOU: %', msg; END IF; END $$;
CREATE FUNCTION public.test_reject(stmt text, msg text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rejected boolean := false; BEGIN BEGIN EXECUTE stmt; EXCEPTION WHEN OTHERS THEN rejected := true; END;
IF NOT rejected THEN RAISE EXCEPTION 'FALHOU (deveria recusar): %', msg; END IF; END $$;
GRANT EXECUTE ON FUNCTION public.test_assert(boolean,text), public.test_reject(text,text) TO anon, authenticated;

-- Antes da migration: anon lê (reproduz o problema).
SET ROLE anon;
SELECT public.test_assert((SELECT count(*) FROM public.events) = 1, 'antes: anon lia events');
RESET ROLE;
-- Antes da migration: responsável muda o prazo direto (reproduz o problema).
SET ROLE authenticated; SET request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000b';
UPDATE public.project_tasks SET prazo = '2027-01-01' WHERE id = '20000000-0000-4000-8000-000000000001';
SELECT public.test_assert((SELECT prazo FROM public.project_tasks WHERE id='20000000-0000-4000-8000-000000000001') = '2027-01-01', 'antes: responsável mudava prazo');
RESET ROLE; UPDATE public.project_tasks SET prazo = '2026-12-01';

\ir ../supabase/migrations/20261125_agente_msy_e_acesso_anonimo.sql
\ir ../supabase/migrations/20261125_agente_msy_e_acesso_anonimo.sql

-- 1. Anon não lê mais nenhuma das 6 tabelas.
SET ROLE anon;
SELECT public.test_reject('SELECT 1 FROM public.events', 'anon events');
SELECT public.test_reject('SELECT 1 FROM public.event_presencas', 'anon event_presencas');
SELECT public.test_reject('SELECT 1 FROM public.meetings', 'anon meetings');
SELECT public.test_reject('SELECT 1 FROM public.scheduled_meetings', 'anon scheduled_meetings');
SELECT public.test_reject('SELECT 1 FROM public.meeting_requests', 'anon meeting_requests');
SELECT public.test_reject('SELECT 1 FROM public.event_cancel_requests', 'anon event_cancel_requests');
RESET ROLE;
-- Membro comum logado não apaga mais reunião agendada nem presença (antes: sched_all / ep_all).
SET ROLE authenticated; SET request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000c';
DELETE FROM public.scheduled_meetings; DELETE FROM public.event_presencas;
RESET ROLE;
SELECT public.test_assert((SELECT count(*) FROM public.scheduled_meetings) = 1, 'membro não apaga reunião agendada');
SELECT public.test_assert((SELECT count(*) FROM public.event_presencas) = 1, 'membro não apaga presença');
-- Revisor com cancelar_eventos (sem diretoria) grava presença ao aprovar cancelamento, mas não apaga.
INSERT INTO public.member_permissions VALUES ('00000000-0000-4000-8000-00000000000c', ARRAY['cancelar_eventos']);
SET ROLE authenticated; SET request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000c';
INSERT INTO public.event_presencas VALUES (2);
UPDATE public.event_presencas SET id = 3 WHERE id = 2;
DELETE FROM public.event_presencas;
RESET ROLE;
SELECT public.test_assert((SELECT count(*) FROM public.event_presencas) = 2, 'revisor grava presença e não apaga');
DELETE FROM public.member_permissions;
-- Logado continua lendo evento público.
SET ROLE authenticated; SET request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000c';
SELECT public.test_assert((SELECT count(*) FROM public.events) = 1, 'logado lê events');

-- 2. Responsável: nota de execução sim; prazo, título, status e responsável não.
SET request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000b';
UPDATE public.project_tasks SET exec_note = 'feito', updated_at = now() WHERE id = '20000000-0000-4000-8000-000000000001';
SELECT public.test_assert((SELECT exec_note FROM public.project_tasks WHERE id='20000000-0000-4000-8000-000000000001') = 'feito', 'responsável grava exec_note');
SELECT public.test_reject($$UPDATE public.project_tasks SET prazo='2027-01-01' WHERE id='20000000-0000-4000-8000-000000000001'$$, 'responsável muda prazo');
SELECT public.test_reject($$UPDATE public.project_tasks SET title='x' WHERE id='20000000-0000-4000-8000-000000000001'$$, 'responsável muda título');
SELECT public.test_reject($$UPDATE public.project_tasks SET assigned_to='00000000-0000-4000-8000-00000000000c' WHERE id='20000000-0000-4000-8000-000000000001'$$, 'responsável repassa tarefa');
SELECT public.test_reject($$UPDATE public.project_tasks SET status='em_revisao' WHERE id='20000000-0000-4000-8000-000000000001'$$, 'responsável muda status direto');
-- ...mas as funções do ciclo continuam funcionando para ele.
SELECT public.task_start('20000000-0000-4000-8000-000000000001');
SELECT public.test_assert((SELECT status FROM public.project_tasks WHERE id='20000000-0000-4000-8000-000000000001') = 'em_andamento', 'task_start funciona');
SELECT public.task_request_review('20000000-0000-4000-8000-000000000001');
SELECT public.test_assert((SELECT status FROM public.project_tasks WHERE id='20000000-0000-4000-8000-000000000001') = 'em_revisao', 'task_request_review funciona');
-- Responsável que não é gestor continua sem poder aprovar a si mesmo (gestor pode, desde 20260718).
SELECT public.test_reject($$SELECT public.task_approve('20000000-0000-4000-8000-000000000001')$$, 'autoaprovação');
-- Histórico com marca do agente (como o agente MSY grava).
INSERT INTO public.project_history(project_id,actor_id,action,target_type,target_id,metadata)
VALUES ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-00000000000b','agente_nota_execucao','task','20000000-0000-4000-8000-000000000001','{"via":"msy-agente"}');

-- 3. Gestora edita tudo e aprova.
SET request.jwt.claim.sub = '00000000-0000-4000-8000-00000000000a';
UPDATE public.project_tasks SET prazo = '2027-02-01', title = 'Tela de login v2' WHERE id = '20000000-0000-4000-8000-000000000001';
SELECT public.test_assert((SELECT prazo FROM public.project_tasks WHERE id='20000000-0000-4000-8000-000000000001') = '2027-02-01', 'gestora muda prazo');
SELECT public.task_approve('20000000-0000-4000-8000-000000000001');
SELECT public.test_assert((SELECT status FROM public.project_tasks WHERE id='20000000-0000-4000-8000-000000000001') = 'concluida', 'gestora aprova');
RESET ROLE;
SELECT 'OK: todos os testes da migration passaram' AS resultado;
