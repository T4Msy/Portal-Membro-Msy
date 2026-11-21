-- ============================================================
-- Mensagens por membro por dia no grupo da Masayoshi (aba "Mensagens"
-- do Ranking). O bot Corvus conta as mensagens localmente e, todo dia
-- à 1h, envia o dia anterior num único upsert com a chave secreta
-- (src/lib/msgdaily.js, repo corvus-botv). Inclui linhas com 0 para os
-- membros do portal que estão no grupo e não falaram, para o portal
-- saber quem estava no grupo.
-- Todos os membros logados leem; ninguém escreve pelo portal.
-- Aplicar no Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.group_message_daily (
  group_id  text NOT NULL CHECK (group_id ~ '@g\.us$'),
  day       date NOT NULL,
  user_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  messages  integer NOT NULL DEFAULT 0 CHECK (messages >= 0),
  PRIMARY KEY (group_id, day, user_id)
);

ALTER TABLE public.group_message_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "group_message_daily_select" ON public.group_message_daily;

CREATE POLICY "group_message_daily_select" ON public.group_message_daily FOR SELECT
TO authenticated
USING (true);
