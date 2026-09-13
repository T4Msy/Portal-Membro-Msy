# Insígnias e Premiações

Toda insígnia concedida pela Masayoshi deve ter um registro correspondente em **Premiações & Reconhecimento**. Esse registro é a fonte oficial para explicar a conquista, exibir sua arte e preservar o histórico de membros reconhecidos.

## Registro obrigatório

Antes de conceder uma insígnia, cadastre em Premiações & Reconhecimento:

- título único e categoria (`Semanal`, `Mensal`, `Anual` ou `Especial`);
- descrição clara do motivo e do critério objetivo de concessão;
- ícone e, quando houver, a imagem oficial da insígnia;
- período ou evento a que ela se refere;
- membros contemplados e uma observação que comprove o critério.

Não conceda insígnias apenas por alterações no frontend ou no perfil: a concessão deve gerar um registro em `premiacoes` e em `premiacao_vencedores`. Toda insígnia deve aparecer em Premiações & Reconhecimento, no perfil do membro e no card do diretório de Membros.

## Aniversário da Masayoshi — 5 anos

- **Categoria:** Especial.
- **Motivo:** celebra a presença no evento Aniversário da Masayoshi e os cinco anos de história da Ordem.
- **Critério:** somente membros com presença real registrada (`attendance_status = presente` ou o status legado `confirmado`) no evento cujo título contenha `ANIVERSÁRIO DA MASAYOSHI`; emojis no título são aceitos.
- **Arte oficial:** `icons/badges/aniversario-masayoshi-5-anos.webp`.
- **Concessão:** a migration `supabase/migrations/20260913000000_aniversario_masayoshi_badge.sql` cria o registro e concede a insígnia sem duplicar vencedores.

## Pódio do Aniversário da Masayoshi — 5 anos

As insígnias do pódio são especiais e reconhecem o resultado final do evento. Elas não substituem a insígnia de participação: cada vencedor também mantém a insígnia geral do aniversário.

| Colocação | Membro | Insígnia | Motivo |
| --- | --- | --- | --- |
| 1º lugar | Hariany | Ícone de corvo MSY em ouro e rubi, com coroa | Campeã do evento de 5 anos. |
| 2º lugar | Pepeu | Ícone de corvo MSY em prata e ametista | Segundo lugar do evento de 5 anos. |
| 3º lugar | João | Ícone de corvo MSY em bronze e âmbar, mais simples | Terceiro lugar do evento de 5 anos. |

- **Artes oficiais:** `icons/badges/aniversario-masayoshi-5-anos-primeiro-lugar.svg`, `icons/badges/aniversario-masayoshi-5-anos-segundo-lugar.svg` e `icons/badges/aniversario-masayoshi-5-anos-terceiro-lugar.svg`.
- **Concessão:** a migration `supabase/migrations/20260913000001_aniversario_masayoshi_podio_badges.sql` cria as três premiações e registra os vencedores sem duplicação.
- **Correção de arte:** a migration `supabase/migrations/20260913000002_corrigir_urls_insignias_aniversario_masayoshi.sql` atualiza as URLs das artes já criadas, incluindo a troca dos ícones de pódio para SVG.

## Registro da mudança — 2026-09-13

**O que mudou:** foram criadas três insígnias SVG especiais de pódio para o evento Aniversário da Masayoshi — 5 anos.

**Por que mudou:** reconhecer formalmente Hariany, Pepeu e João pelas colocações de primeiro, segundo e terceiro lugar.

**Arquivos e serviços afetados:** as três artes em `icons/badges/`, a migration `20260913000001_aniversario_masayoshi_podio_badges.sql`, Premiações & Reconhecimento, perfis e cards do diretório de Membros.

**Como funciona:** a migration cria uma premiação especial por colocação e associa cada registro somente ao vencedor indicado; os ícones vetoriais são exibidos circularmente pelo sistema unificado de insígnias.

**Validação realizada:** artes inspecionadas visualmente; arquivos estáticos e sintaxe JavaScript do sistema de badges validados localmente.

**Pendências ou cuidados para deploy:** executar a migration no Supabase SQL Editor após confirmar que há exatamente um perfil para Hariany, Pepeu e João Pedro. Publicar as imagens junto do deploy estático.

## Correção de URLs das artes — 2026-09-13

**O que mudou:** foi adicionada uma migration de correção para gravar as URLs finais da arte de participação e dos três ícones de pódio em registros já existentes.

**Por que mudou:** as premiações de pódio criadas antes da versão SVG ainda podiam apontar para os PNGs substituídos, impedindo a imagem de aparecer.

**Arquivos e serviços afetados:** `supabase/migrations/20260913000002_corrigir_urls_insignias_aniversario_masayoshi.sql`, tabela `premiacoes` e as telas de Premiações, Perfil e Membros.

**Como funciona:** a migration atualiza somente `imagem_url` dos quatro títulos oficiais; não altera vencedores e não cria registros duplicados.

**Validação realizada:** as quatro URLs retornam os tipos de imagem corretos no servidor local.

**Pendências ou cuidados para deploy:** executar a nova migration no Supabase SQL Editor e publicar os arquivos de `icons/badges/` junto do site.

## Operação

1. Confirme a presença real dos participantes no evento antes da concessão.
2. Valide em staging que há somente um evento cujo título contenha `ANIVERSÁRIO DA MASAYOSHI`.
3. Aplique a migration pelo Supabase SQL Editor.
4. Abra `premiacoes.html` e confirme a descrição, a arte e os vencedores.
5. Confira um perfil contemplado para validar a exibição da imagem da insígnia.
