-- ============================================================
-- MSY PORTAL — MIGRATION MENSALIDADE
-- Sistema de mensalidades da Masayoshi Order
-- Execute no SQL Editor do Supabase
-- ============================================================

-- Tabela principal de mensalidades
CREATE TABLE IF NOT EXISTS public.mensalidades (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'pendente'
                  CHECK (status IN ('pago', 'pendente', 'atrasado')),
  data_pagamento  timestamptz,
  mes_referencia  text NOT NULL,           -- formato: 'AAAA-MM'
  mp_payment_id   text,                    -- ID do pagamento no Mercado Pago
  mp_preference_id text,                   -- ID da preferência de pagamento
  valor           numeric(10,2) DEFAULT 10.00,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_mensalidades_user_id    ON public.mensalidades(user_id);
CREATE INDEX IF NOT EXISTS idx_mensalidades_mes_ref    ON public.mensalidades(mes_referencia);
CREATE INDEX IF NOT EXISTS idx_mensalidades_status     ON public.mensalidades(status);

-- RLS
ALTER TABLE public.mensalidades ENABLE ROW LEVEL SECURITY;

-- Cada membro vê apenas as próprias mensalidades
DROP POLICY IF EXISTS "Membro vê próprias mensalidades" ON public.mensalidades;
CREATE POLICY "Membro vê próprias mensalidades"
  ON public.mensalidades FOR SELECT
  USING (auth.uid() = user_id);

-- Diretoria vê todas
DROP POLICY IF EXISTS "Diretoria vê todas mensalidades" ON public.mensalidades;
CREATE POLICY "Diretoria vê todas mensalidades"
  ON public.mensalidades FOR SELECT
  USING (public.is_diretoria());

-- Qualquer membro autenticado pode inserir a própria
DROP POLICY IF EXISTS "Membro insere própria mensalidade" ON public.mensalidades;
CREATE POLICY "Membro insere própria mensalidade"
  ON public.mensalidades FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Membro pode atualizar a própria (ex: cancelar preferência)
DROP POLICY IF EXISTS "Membro atualiza própria mensalidade" ON public.mensalidades;
CREATE POLICY "Membro atualiza própria mensalidade"
  ON public.mensalidades FOR UPDATE
  USING (auth.uid() = user_id);

-- Diretoria pode atualizar qualquer
DROP POLICY IF EXISTS "Diretoria atualiza mensalidades" ON public.mensalidades;
CREATE POLICY "Diretoria atualiza mensalidades"
  ON public.mensalidades FOR UPDATE
  USING (public.is_diretoria());

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mensalidades_updated_at ON public.mensalidades;
CREATE TRIGGER trg_mensalidades_updated_at
  BEFORE UPDATE ON public.mensalidades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- View utilitária: status atual por membro (mês corrente)
CREATE OR REPLACE VIEW public.v_mensalidade_atual AS
SELECT
  p.id          AS user_id,
  p.name,
  p.role,
  p.tier,
  to_char(now(), 'YYYY-MM') AS mes_atual,
  COALESCE(m.status, 'pendente') AS status_mensalidade,
  m.data_pagamento,
  m.mp_payment_id
FROM public.profiles p
LEFT JOIN public.mensalidades m
  ON m.user_id = p.id
  AND m.mes_referencia = to_char(now(), 'YYYY-MM')
WHERE p.status = 'ativo';

-- Permissão na view para a diretoria
GRANT SELECT ON public.v_mensalidade_atual TO authenticated;
