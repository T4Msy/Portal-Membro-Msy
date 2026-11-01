-- Reparação segura do cache PostgREST e dos privilégios das RPCs sociais.
-- Executar somente depois de 20261031_msy_space_channels_dm.sql.
-- Não cria tabelas/canais/conversas nem altera o conteúdo do banco.
do $$
declare
  v_oid oid;
  v_args text[];
  v_security_definer boolean;
begin
  select p.oid, p.proargnames, p.prosecdef
    into v_oid, v_args, v_security_definer
  from pg_catalog.pg_proc p
  where p.oid = pg_catalog.to_regprocedure('public.space_save_channel(uuid,text,text,uuid,boolean,uuid[])');
  if v_oid is null then
    raise exception 'RPC ausente: public.space_save_channel(uuid,text,text,uuid,boolean,uuid[]). Aplique primeiro 20261031_msy_space_channels_dm.sql.';
  end if;
  if v_args[1:6] is distinct from array['p_channel','p_name','p_kind','p_category','p_private','p_members']::text[] then
    raise exception 'Assinatura incompatível em public.space_save_channel: argumentos encontrados %.', v_args;
  end if;
  if not v_security_definer then raise exception 'space_save_channel precisa ser SECURITY DEFINER.'; end if;

  select p.oid, p.prosecdef into v_oid, v_security_definer
  from pg_catalog.pg_proc p
  where p.oid = pg_catalog.to_regprocedure('public.space_dm_list_conversations()');
  if v_oid is null then
    raise exception 'RPC ausente: public.space_dm_list_conversations(). Aplique primeiro 20261031_msy_space_channels_dm.sql.';
  end if;
  if not v_security_definer then raise exception 'space_dm_list_conversations precisa ser SECURITY DEFINER.'; end if;

  select p.oid, p.proargnames, p.prosecdef
    into v_oid, v_args, v_security_definer
  from pg_catalog.pg_proc p
  where p.oid = pg_catalog.to_regprocedure('public.space_dm_start(uuid)');
  if v_oid is null then
    raise exception 'RPC ausente: public.space_dm_start(uuid). Aplique primeiro 20261031_msy_space_channels_dm.sql.';
  end if;
  if v_args[1:1] is distinct from array['p_peer']::text[] then
    raise exception 'Assinatura incompatível em public.space_dm_start: argumentos encontrados %.', v_args;
  end if;
  if not v_security_definer then raise exception 'space_dm_start precisa ser SECURITY DEFINER.'; end if;
end;
$$;

revoke execute on function public.space_save_channel(uuid,text,text,uuid,boolean,uuid[]),
  public.space_dm_list_conversations(), public.space_dm_start(uuid)
  from public, anon;
grant execute on function public.space_save_channel(uuid,text,text,uuid,boolean,uuid[]),
  public.space_dm_list_conversations(), public.space_dm_start(uuid)
  to authenticated;

-- PostgREST resolve RPCs usando seu cache de esquema; NOTIFY é processado no commit.
notify pgrst, 'reload schema';
