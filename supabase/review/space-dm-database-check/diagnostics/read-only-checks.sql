-- Somente leitura: execute no SQL Editor do projeto lldzgkxpoyqauxdcjyaw.
-- Nenhuma instrução abaixo apaga ou altera dados.

-- 1. Tamanho lógico do banco e WAL. Compare o tamanho lógico com o relatório de uso do Dashboard.
select current_database() as database_name,
       pg_size_pretty(pg_database_size(current_database())) as database_size;
select pg_size_pretty(coalesce(sum(size), 0)) as wal_size from pg_ls_waldir();

-- 2. Maiores relações (tabelas + índices) no banco.
select n.nspname as schema_name, c.relname as relation_name,
       pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
       pg_total_relation_size(c.oid) as total_bytes
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r','m')
  and n.nspname not in ('pg_catalog','information_schema')
order by pg_total_relation_size(c.oid) desc
limit 30;

-- 3. Tamanho estimado dos objetos no Supabase Storage (se Storage estiver habilitado).
select count(*) as object_count,
       pg_size_pretty(coalesce(sum(case
         when metadata->>'size' ~ '^[0-9]+$' then (metadata->>'size')::bigint
         else 0 end), 0)) as estimated_object_bytes
from storage.objects;

-- 4. Verifica existência, assinatura, nomes de parâmetros, SECURITY DEFINER e EXECUTE das RPCs.
select p.proname,
       p.oid::regprocedure as signature,
       pg_get_function_identity_arguments(p.oid) as identity_arguments,
       p.proargnames as argument_and_output_names,
       p.prosecdef as security_definer,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_catalog.pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('space_save_channel','space_dm_start','space_dm_list_conversations')
order by p.proname, p.oid::regprocedure::text;

-- 5. Confere tabelas DM, estado de RLS, policies e publicação Realtime.
select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_catalog.pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('space_dm_conversations','space_dm_participants','space_dm_messages')
order by c.relname;
select tablename, policyname, roles, cmd, qual, with_check
from pg_catalog.pg_policies
where schemaname = 'public' and tablename in ('space_dm_conversations','space_dm_participants','space_dm_messages')
order by tablename, policyname;
select schemaname, tablename
from pg_catalog.pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in ('space_dm_messages','space_channels','space_categories');

-- 6. Indica se há tabela de histórico do Supabase CLI. A ausência não prova que SQL manual não rodou.
select to_regclass('supabase_migrations.schema_migrations') as cli_migration_history_table;
