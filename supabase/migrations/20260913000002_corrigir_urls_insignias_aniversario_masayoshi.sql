-- Corrige as URLs das artes de insignias do Aniversario da Masayoshi.
-- Necessaria para registros criados antes da troca das artes do podio para SVG.
-- Pode ser executada mais de uma vez sem criar premiacoes ou vencedores duplicados.

UPDATE public.premiacoes
SET imagem_url = CASE titulo
  WHEN 'Aniversário da Masayoshi — 5 anos' THEN '/icons/badges/aniversario-masayoshi-5-anos.webp'
  WHEN 'Aniversário da Masayoshi — 5 anos — 1º Lugar' THEN '/icons/badges/aniversario-masayoshi-5-anos-primeiro-lugar.svg'
  WHEN 'Aniversário da Masayoshi — 5 anos — 2º Lugar' THEN '/icons/badges/aniversario-masayoshi-5-anos-segundo-lugar.svg'
  WHEN 'Aniversário da Masayoshi — 5 anos — 3º Lugar' THEN '/icons/badges/aniversario-masayoshi-5-anos-terceiro-lugar.svg'
END
WHERE titulo IN (
  'Aniversário da Masayoshi — 5 anos',
  'Aniversário da Masayoshi — 5 anos — 1º Lugar',
  'Aniversário da Masayoshi — 5 anos — 2º Lugar',
  'Aniversário da Masayoshi — 5 anos — 3º Lugar'
);
