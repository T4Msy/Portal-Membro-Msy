-- ============================================================
-- MSY Space: tempo real por Broadcast (gatilhos no banco) em vez de postgres_changes
--
-- Por quê: qualquer assinatura postgres_changes faz o Realtime ler o log do banco
-- (WAL) duas vezes por segundo, o dia inteiro. Na máquina Nano do plano Free isso
-- pesa na memória e no disco (o portal caiu em 02/11 e em 06/11 por falta de memória).
-- Broadcast vindo do banco não faz essa leitura contínua: o gatilho grava em
-- realtime.messages e o Realtime entrega na hora.
--
-- Tópicos (privados, mesma autorização de antes: space_realtime_topic_allowed):
--   space:chat:<canal>  eventos INSERT / UPDATE / DELETE com { record, old_record }
--   space:workspace     evento 'changed' quando canais, categorias ou membros de sala mudam
--
-- As tabelas continuam na publicação supabase_realtime só para o app Android antigo
-- (até todos atualizarem o APK). Depois disso, rodar o bloco "Limpeza futura" no fim.
-- Aplicado no SQL Editor em 07/11/2026.
-- ============================================================

-- Mensagens: uma entrega por linha, no tópico do próprio canal.
create or replace function public.space_broadcast_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.broadcast_changes(
    'space:chat:' || coalesce(new.channel_id, old.channel_id)::text,
    tg_op, tg_op, tg_table_name, tg_table_schema, new, old
  );
  return null;
end;
$$;

drop trigger if exists space_messages_broadcast on public.space_messages;
create trigger space_messages_broadcast
  after insert or update or delete on public.space_messages
  for each row execute function public.space_broadcast_message();

-- Estrutura: um aviso por comando (apagar várias salas de uma vez = 1 aviso).
-- O site e o app recarregam a lista de canais ao receber.
create or replace function public.space_broadcast_workspace()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(jsonb_build_object('table', tg_table_name), 'changed', 'space:workspace', true);
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['space_channels', 'space_categories', 'space_channel_members'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_broadcast', t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each statement execute function public.space_broadcast_workspace()',
      t || '_broadcast', t
    );
  end loop;
end $$;

revoke execute on function public.space_broadcast_message(), public.space_broadcast_workspace() from anon, authenticated, public;

-- ------------------------------------------------------------
-- Limpeza futura (NÃO rodar ainda): quando ninguém mais usar o APK antigo,
-- tirar as tabelas do Space da publicação do Realtime.
-- alter publication supabase_realtime drop table
--   public.space_messages, public.space_channels, public.space_categories, public.space_channel_members;
-- ------------------------------------------------------------
