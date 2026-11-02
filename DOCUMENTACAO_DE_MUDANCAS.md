# Documentação de Mudanças do Portal

Toda alteração no Portal MSY deve ser documentada no mesmo trabalho em que é criada. Esta regra vale para pessoas e para qualquer IA que leia, altere ou crie arquivos no projeto.

O objetivo é permitir que a próxima pessoa ou IA entenda rapidamente o que existe, por que existe, onde foi alterado e como validar a mudança, sem depender do histórico da conversa.

## Regra obrigatória

Ao modificar o portal, registre a mudança em uma documentação adequada ao domínio ou crie um documento específico quando ela introduzir uma funcionalidade nova. Não considere uma alteração concluída sem esse registro.

O registro deve informar, no mínimo:

1. **O que mudou:** funcionalidade, correção, regra, tela ou comportamento criado/alterado.
2. **Por que mudou:** necessidade de negócio, problema resolvido ou critério da decisão.
3. **Onde mudou:** arquivos, tabelas, migrations, Edge Functions e páginas afetadas.
4. **Como funciona agora:** fluxo esperado, permissões e critérios de uso.
5. **Como validar:** testes executados e verificações manuais necessárias.
6. **Impactos e pendências:** migrations a aplicar, dependências externas, compatibilidade ou riscos conhecidos.

## Reenvio de justificativa recusada - 2026-09-19

**O que mudou:** o membro agora recebe um aviso de que a justificativa anterior foi recusada e pode enviar uma nova justificativa no cartao ou nos detalhes do evento.

**Por que mudou:** permitir que o membro corrija ou complemente a justificativa sem precisar marcar presenca.

**Arquivos e servicos afetados:** `js/app.js` e `eventos.html`.

**Como funciona:** o novo envio atualiza a justificativa existente, define o status como `pendente` e notifica a Diretoria. A justificativa entra na aba Justificativas com as acoes de aprovar ou recusar. Em bases que ainda nao possuem `response_status`, o salvamento compativel tambem redefine `justificativa_status` como `pendente`.

**Validacao realizada:** sintaxe de `js/app.js` verificada com `node --check` e diff validado com `git diff --check`.

**Pendencias ou cuidados para deploy:** publicar `js/app.js` e `eventos.html`; a nova versao no URL do script evita que o navegador reutilize o JavaScript anterior.

## Onde documentar

| Tipo de mudança | Local de documentação |
| --- | --- |
| Insígnias e premiações | `INSIGNIAS.md` |
| Comissionamento | `COMISSIONAMENTO.md` |
| Checklist de release ou teste manual | `SMOKE_TESTS.md` |
| Arquitetura, configuração ou operação geral | `README.md` |
| Arquivos, uploads, Storage, Cloudflare R2, Worker `msy-media`, limpeza de órfãos | `INFRAESTRUTURA.md` |
| Funcionalidade nova sem documento próprio | Novo arquivo `.md` na raiz, com nome descritivo |
| Banco de dados | Comentários na migration e referência no documento do domínio |

## Modelo para novas entradas

Use este modelo ao registrar uma alteração em um documento existente ou novo:

```md
## [Nome da mudança] — AAAA-MM-DD

**O que mudou:**

**Por que mudou:**

**Arquivos e serviços afetados:**

**Como funciona:**

**Validação realizada:**

**Pendências ou cuidados para deploy:**
```

## Procedimento para IAs

Antes de alterar qualquer parte do portal, a IA deve:

1. Ler a documentação do domínio afetado e as instruções do repositório.
2. Identificar os arquivos e o impacto da alteração antes de editar.
3. Implementar somente o escopo solicitado e preservar mudanças existentes de outras pessoas.
4. Atualizar a documentação aplicável com o modelo acima.
5. Informar claramente o que foi alterado, o que foi validado e o que ainda exige ação manual.

Se a alteração criar uma nova tabela, migration, integração, regra de permissão, tela, insígnia ou fluxo operacional, a documentação deve explicar o propósito, a origem dos dados, quem pode usar e como reverter ou desativar com segurança.

## Aplicação atual

Esta política passa a valer para todas as mudanças futuras. A documentação da insígnia **Aniversário da Masayoshi — 5 anos** está em `INSIGNIAS.md` e é o exemplo de registro de uma funcionalidade nova com arte, critério, migration, local de exibição e validação.

## Descrição das atividades com formatação (negrito, listas, parágrafos) — 2026-11-02

**O que mudou:** ao abrir uma atividade, a descrição passa a respeitar a formatação que a Diretoria escreve: parágrafos e linhas em branco, quebras de linha, listas com `- ` (ou `* `, `• `) e numeradas (`1. `), títulos com `#`, **negrito** com `**texto**`/`__texto__` e itálico com `*texto*`/`_texto_`. Emojis continuam como estão.

**Por que mudou:** a descrição era mostrada como texto puro sem `white-space`, então as quebras de linha sumiam e os `**` apareciam crus, deixando atividades longas ilegíveis.

**Arquivos e serviços afetados:** `js/app.js` (novo `Utils.formatRichText()` logo após `Utils.escapeHtml()`; modal da atividade usa `<div class="modal-description rich-text">`), `css/style.css` (`.rich-text` e `overflow-wrap` em `.modal-description`), `?v=` de `js/app.js` trocado para `20261102-desc-formatada` em todas as páginas e de `css/style.css` em `atividades.html` e `bot.html`. Sem migration: o texto continua salvo igual no banco (só `trim()`).

**Como funciona:** `Utils.formatRichText(texto)` escapa o texto inteiro com `Utils.escapeHtml()` primeiro e só depois converte o markdown mínimo nas tags fixas `p`, `br`, `ul`/`ol`/`li`, `strong` e `em` — nenhum atributo é gerado, então não há risco de XSS. Itálico com `_` exige limite de palavra (`snake_case` não vira itálico). Pode ser reaproveitado em outras descrições (eventos, reuniões) adicionando a classe `rich-text` ao container.

**Validação realizada:** página local temporária com o texto real da atividade "Pesquisa de tirinhas" comparando antes/depois (títulos em negrito, parágrafos separados, lista com marcadores dourados, sem `**` visível) e teste com `<img onerror>`/`<script>` saindo escapados.

**Pendências ou cuidados para deploy:** abrir uma atividade real após o deploy (Ctrl+F5 se o navegador estiver com o `app.js` antigo).

## Importar ranking de imagem (OCR do print da tabela) — 2026-11-02

**O que mudou:** o modal "Novo Ranking" (semanal e mensal) ganhou o botão **Importar de imagem**. A Diretoria anexa ou cola (Ctrl+V) o print da tabela de pontuação (Membro | Semana 1..N | TOTAL | MÉDIA | "TOTAL DO GRUPO") e o portal preenche as linhas com o membro e o TOTAL de cada um. Nada é salvo sozinho: a Diretoria confere, ajusta e clica em Salvar como antes.

**Por que mudou:** evitar digitar à mão nome e total de cada membro a cada ranking.

**Arquivos e serviços afetados:** `js/core/ranking-import.js` (novo: OCR, leitura das linhas, casamento com `profiles`), `js/pages/ranking.js` (botão, colar, avisos por linha, lembrar apelidos ao salvar), `css/style.css` (`.rank-import*`, `.rank-entry-lido`, `.rank-entry-row--pendente/--conferir`), `ranking.html` (`?v=20261102-ocr`). Sem migration; continua gravando em `weekly_rankings` com o mesmo formato.

**Como funciona:**
- **Leitura:** OCR no próprio navegador com Tesseract.js 5.1.1 (jsDelivr, carregado só ao clicar). Custo zero, sem chave/segredo e a imagem não sai do aparelho. Uma Edge Function com IA de visão seria mais "esperta", mas exigiria chave paga no backend; para uma tabela de layout fixo o OCR local basta. Primeira leitura baixa ~2 MB (modelo `eng`), depois fica no cache do navegador; leva ~3 s.
- **Zero cortado:** a fonte dos números tem Ø, que o OCR às vezes lê como 8/9/6. A imagem é lida em 3 escalas e, por linha, vale a leitura em que as semanas somam o TOTAL e TOTAL ÷ semanas ≈ MÉDIA (trocando 8/9/6 por 0 quando é isso que fecha a conta). Se nenhuma leitura fecha, usa o TOTAL mais repetido e marca a linha "confira o total" (borda vermelha). Funciona com qualquer nº de semanas (lido do cabeçalho).
- **Nomes:** ignora cabeçalho, "TOTAL DO GRUPO" e o emoji depois do nome. Casa com `profiles` sem acento/maiúscula: apelido já confirmado → nome completo → começo do nome → primeiro nome → palavra do nome → iniciais (ex.: "Ph" → PH) → 1 letra errada do OCR ("Jodo" → João). Só aceita quando sobra um único membro; senão a linha fica "escolha o membro".
- **Apelidos:** ao salvar, cada "nome lido no print → membro escolhido" fica guardado no `localStorage` (`msy_rank_ocr_alias`) desse navegador, então "Pepeu", "Jotinha" etc. casam sozinhos nas próximas importações. É conveniência por aparelho, não é compartilhado.

**Validação realizada:** com o print de exemplo (11 membros) os 11 totais saíram certos (4030, 3149, 2147, 1930, 1757, 1150, 550, 333, 72, 71, 32), inclusive os com zero; nomes casados exceto apelidos que não existem no nome cadastrado. Testado o modal semanal (arquivo) e mensal (colar), o payload enviado ao salvar e o reaproveitamento dos apelidos, em desktop e 375 px, numa página local com dados simulados. `node --check` em `js/core/ranking-import.js`.

**Pendências ou cuidados para deploy:** depois do deploy, testar uma importação real em `ranking.html` logado como Diretoria. O `sw.js` já deixa `cdn.jsdelivr.net` só na rede (sem cache do SW). Prints com layout bem diferente (outra ordem de colunas) não são suportados.

## Jornal: versão leve das imagens para quem está nos dados móveis — 2026-11-02

**O que mudou:** toda imagem enviada ao Jornal passa a ter uma cópia leve (`foto.sm.webp`, 800 px) ao lado da original (até 2200 px). Nos dados móveis, em conexão lenta ou com "Economia de dados", o Jornal e a capa do dashboard mostram a leve; no Wi-Fi, a original. A tela cheia usa sempre a original.

**Por que mudou:** economizar o pacote de dados do celular dos membros sem perder qualidade para quem está no Wi-Fi (o download no R2 já é grátis para a MSY).

**Arquivos e serviços afetados:** `js/core/media-store.js`, `js/pages/jornal.js`, `js/app.js` (capa do Jornal no dashboard), `cloudflare/media-worker/worker.js` (limpeza trata `.sm` como parte da original), `?v=` das páginas.

**Como funciona:** ver `INFRAESTRUTURA.md` §5. Sem mudança no banco: a versão leve é achada pelo nome. Posts antigos não têm a leve e continuam mostrando a original (volta automática).

**Validação realizada:** regras de escolha testadas (celular/3G/Economia de dados → leve; Wi-Fi/sem API → original); no portal real: upload das duas versões (2200×1467 236 KB e 800×533 77 KB), volta automática para a original quando a leve não existe, exclusão das duas; `node --check`.

**Pendências ou cuidados para deploy:** publicar o Worker com a regra nova da limpeza **antes** de 7 dias, senão as versões leves seriam apagadas como órfãs. iPhone e Brave não informam o tipo de conexão e recebem sempre a original.

## Backup semanal do banco (plano B do Supabase) — 2026-11-01

**O que mudou:** rotina do GitHub Actions (`.github/workflows/db-backup.yml`) que todo domingo faz o dump completo do banco (incluindo os logins de `auth.users`), criptografa com AES-256 e guarda no bucket privado `msy-backups` do Cloudflare R2 (regra apaga após 90 dias).

**Por que mudou:** ter como subir o portal em outro projeto se o Supabase restringir (cota), cair por muito tempo ou o projeto se perder; o plano Free não oferece backup para baixar.

**Arquivos e serviços afetados:** `.github/workflows/db-backup.yml`, `BACKUP.md` (guia), bucket R2 `msy-backups` com regra de ciclo de vida.

**Como funciona:** ver `BACKUP.md` (secrets, onde fica, como baixar, abrir e restaurar).

**Validação realizada:** YAML validado; bucket e regra de 90 dias criados e conferidos no painel. O primeiro backup depende dos 4 secrets.

**Pendências ou cuidados para deploy:** o Xitter precisa cadastrar `SUPABASE_DB_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` e `BACKUP_PASSPHRASE` no GitHub e guardar a passphrase num gerenciador de senhas; repositório público desativa cron após 60 dias sem commits.

## Arquivos no Cloudflare R2 e redução de egress do Supabase — 2026-11-01

**O que mudou:** os arquivos públicos do portal (anexos e respostas de atividades, avatares, feed, direct, Jornal, perfil do MSY Space) passaram do Supabase Storage para o **Cloudflare R2** (conta do Xitter), servidos pelo Worker `msy-media`. O Supabase continua com login, banco, realtime e Edge Functions. No mesmo dia: limpeza diária de arquivos órfãos (Supabase e R2), limite de 20 MB (vídeo) / 10 MB (demais) nos anexos de atividade, avatar comprimido para 384 px WebP, prévias de vídeo que não baixam o arquivo à toa e 5 avatares antigos recomprimidos.

**Por que mudou:** o plano Free do Supabase estourou a cota de Cached Egress (16,26 GB de 5 GB no ciclo 18/10–18/11/2026) por causa de downloads de arquivos grandes; o Supabase avisou restrição a partir de 23/11/2026. No R2 o egress é grátis.

**Arquivos e serviços afetados:** `cloudflare/media-worker/` (novo), `js/core/media-store.js` (novo), `js/app.js`, `js/modules2.js`, `js/social/social_media.js`, `js/pages/feed.js`, `js/pages/jornal.js`, `js/space/ui/profile.js`, `js/space/workspace.js`, `sw.js`, `?v=` em todas as páginas, `supabase/functions/storage-cleanup/` (novo) e as migrations `20261101_*`. Fora do Git: bucket R2 `msy-portal-media`, Worker `msy-media`, cron `storage-orphan-cleanup`, `pg_net`, limite do bucket `activity-files`.

**Como funciona:** ver `INFRAESTRUTURA.md` (arquitetura, rotas do Worker, regras de dono dos caminhos, limites, limpeza, como publicar o Worker e como adicionar upload novo).

**Validação realizada:** Worker testado ao vivo (upload próprio 200, caminho de outro membro 403, sem login 401, tipo proibido 415, duplicado 409, Range 206, delete, import); adaptador testado no portal com nome com espaço/acento/`&`; 210 de 210 arquivos copiados e conferidos por HEAD; nenhuma URL do Supabase restante nos 4 buckets; Feed, Perfil, Atividades e Jornal sem imagem quebrada; simulação da limpeza do R2 (0 a apagar, todos com menos de 7 dias); `node --check` nos scripts.

**Pendências ou cuidados para deploy:** apagar as cópias antigas no Supabase Storage (~310 MB) depois de conferir que não houve upload novo lá; 34 registros já apontavam para arquivos inexistentes antes da migração; investigar a exclusão de anexo que pode deixar link pendurado; se o domínio do Worker mudar, refazer a troca de URLs e atualizar `media-store.js` e `sw.js`.

## Ordem de Contribuição Especial — 2026-09-13

**O que mudou:** `Contribuição Especial` passou a ser exibida antes das demais premiações da categoria Especial.

**Por que mudou:** manter o reconhecimento de contribuição em posição de destaque na lista de Premiações & Reconhecimento.

**Arquivos e serviços afetados:** `js/modules.js` e a tela `premiacoes.html`.

**Como funciona:** somente o título exato `Contribuição Especial` recebe prioridade; as outras premiações especiais continuam em ordem alfabética.

**Validação realizada:** ordenação verificada no código de agrupamento da lista.

**Pendências ou cuidados para deploy:** publicar o arquivo JavaScript atualizado e recarregar o portal sem cache.

## Remoção dos Alertas do Sistema — 2026-09-13

**O que mudou:** a seção `Alertas do Sistema` deixou de ser inserida na tela de Administração.

**Por que mudou:** a seção não deve mais fazer parte do painel administrativo.

**Arquivos e serviços afetados:** `js/modules3.js`, `README.md`, `CLAUDE.md` e `admin.html` durante a inicialização.

**Como funciona:** a Administração mantém seus demais cards e permissões, mas não executa a rotina que criava o card de alertas.

**Validação realizada:** a inicialização administrativa dos alertas foi bloqueada no roteador do módulo.

**Pendências ou cuidados para deploy:** publicar `js/modules3.js` e atualizar a página sem cache.

## Reformulação da Administração — 2026-09-13

**O que mudou:** a Administração foi reorganizada em uma central visual premium e minimalista, com pendências de aprovação em destaque, atalhos compactos e configurações separadas da atividade recente.

**Por que mudou:** reduzir a competição visual entre cards e tornar as decisões administrativas mais rápidas de identificar.

**Arquivos e serviços afetados:** `js/app.js`, `css/style.css` e a tela `admin.html`.

**Como funciona:** aprovações pendentes aparecem como prioridade; na ausência delas, a tela mostra o estado positivo da operação. As ações continuam com os mesmos destinos e comportamentos, enquanto o controle de abas fica na área secundária.

**Validação realizada:** sintaxe de `js/app.js` validada com `node --check`; responsividade configurada para desktop, tablet e celular.

**Pendências ou cuidados para deploy:** publicar os arquivos atualizados e recarregar a Administração sem cache para receber os novos estilos.

## Reconstrução visual da Administração — 2026-09-13

**O que mudou:** o painel administrativo foi recriado sem cards individuais de métricas ou atalhos em quadrados. A nova composição usa cabeçalho de comando, resumo em linha, fila de aprovações, operações em lista e áreas de configuração e cadastros recentes.

**Por que mudou:** a versão anterior ainda parecia fragmentada e visualmente carregada, mesmo após a reorganização inicial.

**Arquivos e serviços afetados:** `js/app.js`, `css/style.css` e a tela `admin.html`.

**Como funciona:** as mesmas ações administrativas e consultas ao banco permanecem disponíveis, mas são apresentadas em uma hierarquia contínua com menos caixas e mais espaço visual.

**Validação realizada:** sintaxe de `js/app.js` validada com `node --check` e verificação de whitespace com `git diff --check`.

**Pendências ou cuidados para deploy:** publicar `js/app.js` e `css/style.css`; atualizar a página sem cache para garantir o carregamento da nova versão.

## Ajuste de paleta da Administração — 2026-09-13

**O que mudou:** a superfície da Administração passou a usar grafite quente, vinho discreto e detalhes dourados em vez de um fundo predominantemente preto.

**Por que mudou:** dar profundidade e conforto visual ao novo painel sem reintroduzir os cards isolados.

**Arquivos e serviços afetados:** `css/style.css` e a tela `admin.html`.

**Como funciona:** o painel mantém a composição contínua, mas agora possui camadas de cor, contraste entre seções e estados de hover mais visíveis.

**Validação realizada:** regras responsivas e integridade do diff verificadas localmente.

**Pendências ou cuidados para deploy:** publicar o CSS atualizado e atualizar a página sem cache.

## Redesign da tela de Permissões — 2026-09-13

**O que mudou:** a tela de Permissões foi alinhada ao visual da Administração, usando a mesma base grafite da barra lateral e seções contínuas para acesso individual e visibilidade de abas.

**Por que mudou:** reduzir fundos dourados/vinho e cards isolados, tornando a gestão de acessos mais limpa e consistente com o portal.

**Arquivos e serviços afetados:** `css/modules3.css`, `js/modules3.js` e a tela `permissoes.html`.

**Como funciona:** todas as regras, filtros, seletores e botões existentes são preservados; a alteração é exclusivamente de composição visual e responsividade.

**Validação realizada:** sintaxe de `js/modules3.js` e integridade do diff verificadas localmente.

**Pendências ou cuidados para deploy:** publicar `css/modules3.css` e atualizar a página sem cache.

## Fluxo de seleção em Permissões — 2026-09-13

**O que mudou:** o gerenciador de permissões passou a ter duas etapas: escolher um membro e, somente então, configurar suas permissões.

**Por que mudou:** evitar que a lista de membros e todas as permissões concorram pela atenção na mesma tela, deixando a gestão mais objetiva.

**Arquivos e serviços afetados:** `js/modules3.js`, `css/modules3.css`, tabelas `profiles`, `member_permissions` e `supervision_access`.

**Como funciona:** a primeira etapa permite buscar e selecionar um membro; a segunda exibe as permissões dele em largura total e oferece o botão `Escolher membro` para retornar. O fluxo de salvar, limpar e atualizar contagens permanece o mesmo.

**Validação realizada:** sintaxe JavaScript e integridade do diff verificadas localmente.

**Pendências ou cuidados para deploy:** publicar `js/modules3.js` e `css/modules3.css`; testar seleção, retorno, alteração e salvamento de permissões no portal.

## Configuração expansível de abas — 2026-09-13

**O que mudou:** a área de Visibilidade de abas passou a listar somente os nomes e status das abas. Ao clicar em uma aba, abre-se um painel com a opção de exibir ou ocultar, cargos/funções e membros autorizados.

**Por que mudou:** reduzir a quantidade de controles visíveis ao mesmo tempo e facilitar a configuração de uma aba por vez.

**Arquivos e serviços afetados:** `js/modules3.js`, `css/modules3.css` e a tabela `tab_permissions`.

**Como funciona:** apenas uma aba fica expandida por vez. Alterações atualizam o status da aba na lista e continuam sendo gravadas pelo botão `Salvar alterações`.

**Validação realizada:** sintaxe de `js/modules3.js` e integridade do diff verificadas localmente.

**Pendências ou cuidados para deploy:** publicar os arquivos atualizados; testar exibição, restrição por cargo, restrição por membro e salvamento no portal.

## Foco ao configurar permissões de membro — 2026-09-13

**O que mudou:** a seção `Visibilidade de abas` fica oculta enquanto um membro está selecionado para configuração de permissões.

**Por que mudou:** impedir que configurações globais de abas disputem atenção com a edição individual do membro.

**Arquivos e serviços afetados:** `js/modules3.js` e a tela `permissoes.html`.

**Como funciona:** ao escolher um membro, a seção é ocultada; ao usar `Escolher membro` para retornar à lista, ela volta a ser exibida.

**Validação realizada:** fluxo de eventos e sintaxe JavaScript verificados localmente.

**Pendências ou cuidados para deploy:** publicar `js/modules3.js` e testar a transição entre seleção, edição e retorno no portal.

## Correção de abas ocultas — 2026-09-13

**O que mudou:** uma aba marcada como oculta, incluindo `Jornal da Masayoshi`, agora é bloqueada antes de qualquer verificação alternativa de permissão. O teaser do Jornal no dashboard também respeita essa regra.

**Por que mudou:** a verificação RPC podia autorizar uma página antes da regra local de visibilidade ser aplicada, fazendo uma aba oculta aparecer para membros.

**Arquivos e serviços afetados:** `js/app.js`, `tab_permissions`, navegação lateral, proteção de páginas e teaser do dashboard.

**Como funciona:** as regras de abas são carregadas do banco a cada nova página; se `visible` estiver como `false`, o menu, o teaser e o acesso pela página são negados para membros.

**Validação realizada:** ordem das regras revisada e sintaxe JavaScript verificada localmente.

**Pendências ou cuidados para deploy:** publicar `js/app.js`, atualizar o portal sem cache e testar com uma conta de membro após ocultar o Jornal.

## Guia de níveis em Premiações — 2026-09-13

**O que mudou:** foi incluído um guia em `Premiações & Reconhecimento` para explicar os níveis Comum, Raro, Épico e Lendário, suas cores e os totais de insígnias necessários.

**Por que mudou:** tornar claro para todos os membros como as conquistas refletem no nível visual do perfil.

**Arquivos e serviços afetados:** `js/modules.js`, `css/style.css` e a tela `premiacoes.html`.

**Como funciona:** o guia mostra a progressão 0–9, 10+, 50+ e 100+ insígnias e explica a regra de contagem usada no perfil.

**Validação realizada:** sintaxe JavaScript e integridade do diff verificadas localmente.

**Pendências ou cuidados para deploy:** publicar `js/modules.js` e `css/style.css`; conferir o guia em desktop e celular.

## Total de insígnias no perfil — 2026-09-13

**O que mudou:** o cabeçalho `Insígnias Conquistadas` do perfil do membro passou a exibir o total de insígnias ao lado do título.

**Por que mudou:** deixar visível a contagem que define o nível Comum, Raro, Épico ou Lendário do membro.

**Arquivos e serviços afetados:** `js/app.js`, `css/style.css` e o modal de perfil em `membros.html`.

**Como funciona:** o total exibido usa o mesmo cálculo ponderado do nível visual, sem uma nova consulta ou contador paralelo.

**Validação realizada:** sintaxe JavaScript e integridade do diff verificadas localmente.

**Pendências ou cuidados para deploy:** publicar `js/app.js` e `css/style.css`; abrir um perfil com insígnias para conferir a contagem.

## Responsividade de Permissões — 2026-09-13

**O que mudou:** foram adicionados ajustes específicos para celular ao seletor de membros, à configuração individual e ao editor expansível de abas.

**Por que mudou:** impedir que nomes, ações e campos de restrição comprimam ou transbordem em telas estreitas.

**Arquivos e serviços afetados:** `css/modules3.css` e a tela `permissoes.html`.

**Como funciona:** em telas menores, o seletor passa para uma coluna, os controles da pessoa selecionada ocupam toda a largura e o editor de abas reduz espaçamentos sem perder os controles.

**Validação realizada:** breakpoints revisados para os novos componentes e integridade do diff verificada localmente.

**Pendências ou cuidados para deploy:** testar manualmente em uma largura de 360 px e em um celular real após publicar.

## Base visual unificada da Administração — 2026-09-13

**O que mudou:** o fundo do painel administrativo passou a usar o mesmo gradiente grafite da barra lateral.

**Por que mudou:** remover a aparência de bloco separado e manter a identidade visual escura uniforme do portal.

**Arquivos e serviços afetados:** `css/style.css` e a tela `admin.html`.

**Como funciona:** vinho e dourado permanecem somente em bordas, ícones e estados de interação; a superfície principal acompanha a barra lateral.

**Validação realizada:** integridade do diff verificada localmente.

**Pendências ou cuidados para deploy:** publicar o CSS atualizado e atualizar a página sem cache.

## Equilíbrio de contraste da Administração — 2026-09-13

**O que mudou:** os tons claros introduzidos na Administração foram reduzidos para uma paleta escura intermediária.

**Por que mudou:** preservar a identidade dark do portal sem deixar as seções indistinguíveis.

**Arquivos e serviços afetados:** `css/style.css` e a tela `admin.html`.

**Como funciona:** grafite continua como cor predominante; vinho e dourado aparecem apenas em transparências e detalhes de profundidade.

**Validação realizada:** integridade do diff verificada localmente.

**Pendências ou cuidados para deploy:** publicar o CSS atualizado e atualizar a página sem cache.
