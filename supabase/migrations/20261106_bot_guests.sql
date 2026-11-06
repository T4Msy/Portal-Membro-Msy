-- ============================================================
-- Pessoas de fora da Masayoshi liberadas no Bot Corvus (card em bot.html)
-- O bot lê com a chave secreta (src/lib/access.js, repo corvus-botv).
-- Quem é do grupo da Masayoshi não precisa estar aqui.
-- Aplicar no Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bot_guests (
  phone      text PRIMARY KEY CHECK (phone ~ '^[0-9]{12,13}$'),
  name       text NOT NULL CHECK (length(trim(name)) > 0),
  added_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bot_guests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bot_guests_select" ON public.bot_guests;
DROP POLICY IF EXISTS "bot_guests_insert" ON public.bot_guests;
DROP POLICY IF EXISTS "bot_guests_delete" ON public.bot_guests;

-- Só quem está liberado na Central do Bot vê e mexe na lista.
CREATE POLICY "bot_guests_select" ON public.bot_guests FOR SELECT
USING (public.is_bot_sender());

CREATE POLICY "bot_guests_insert" ON public.bot_guests FOR INSERT
WITH CHECK (public.is_bot_sender() AND added_by = auth.uid());

CREATE POLICY "bot_guests_delete" ON public.bot_guests FOR DELETE
USING (public.is_bot_sender());
