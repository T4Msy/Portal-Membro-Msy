# Projeto da Coordenacao MSY

## Objetivo

A Area de Supervisao e o centro operacional da Masayoshi dentro do Portal de Membros. Ela usa o mesmo login, banco de dados e permissoes do Portal, mas possui identidade visual e navegacao proprias.

O objetivo e reunir informacoes da organizacao em um lugar que ajude a coordenacao a identificar prioridades, acompanhar membros e tomar decisoes sem depender de controles manuais.

## Stack e arquitetura

- Frontend: HTML, CSS e JavaScript Vanilla. Nao ha React, Vue ou outro framework de interface.
- Banco e autenticacao: Supabase.
- Automacoes e Analytics: n8n, exposto por Cloudflare Tunnel.
- Hospedagem: Portal estatico em Vercel.
- Pagina principal do modulo: `supervisao.html`.
- Logica do modulo: `js/pages/supervisao.js`.
- Estilos do modulo: `css/supervisao.css`.
- Migrations: `supabase/migrations/`.

O modulo deve continuar modular e usar os objetos ja existentes no Portal (`window.MSY`, `db`, `Auth` e `Utils`). Nao criar um segundo sistema de autenticacao ou uma segunda base de membros.

## Identidade visual

- Tema proprio, diferente do restante do Portal.
- Base vinho, vermelho, preto e tons claros de contraste.
- Referencias: MSY Analytics original, Linear, Vercel, Stripe Dashboard e ferramentas de operacao.
- Simbolos Masayoshi: taca de vinho como simbolo principal e corvo como simbolo secundario.
- O MSY Analytics deve manter a aparencia do projeto original.
- Vermelho e usado como destaque. Verde de mensalidade paga e estados positivos deve permanecer verde.

## Acesso e permissoes

- A nova permissao e `Acesso a Supervisao`.
- Diretoria possui acesso por padrao, mas pode perder o acesso individualmente.
- Outros membros podem receber acesso pela tela de permissoes.
- Sem permissao, a secao nao aparece na sidebar do Portal e as rotas continuam protegidas.
- A sidebar do Portal pode ser recolhida; a preferencia fica em `profiles.sidebar_collapsed`.

## Navegacao da Supervisao

- Resumo: saude organizacional Huginn, indicadores e graficos de visao geral.
- Huginn: diagnostico da saude da Masayoshi e fatores de calculo.
- Central Operacional: fila unica de casos que precisam de acao.
- Desempenho: ranking e painel individual de cada membro.
- Projetos, Eventos, Financeiro e Timeline: visoes de monitoramento.
- Analytics: tela visual do MSY Analytics para importar e analisar historicos do WhatsApp.

O Resumo deve permanecer uma leitura executiva. Itens de acao devem ficar concentrados na Central Operacional, e nao duplicados em varios cards do inicio.

## Central Operacional

Une pendencias, alertas e lembretes em uma unica fila de trabalho. Cada caso deve apresentar contexto, prioridade, prazo, responsavel e proximo passo sugerido.

Funcoes atuais:

- Filtros de todos, criticos, hoje, aprovacao e sem responsavel.
- Criacao de acompanhamento com responsavel, prazo e orientacao.
- Conclusao ou dispensa de lembretes.
- Resolucao de alertas inteligentes.
- Financeiro aparece depois de atividades, eventos e projetos, por ser menos urgente na ordem operacional.

## Desempenho dos membros

Cada membro possui modal individual com foto, cargo, nota, componentes, atividades, mensalidade e eventos.

Regras acordadas:

- Mensagens sao avaliadas por semana:
  - menos de 100: abaixo do minimo;
  - 100 ou mais: OK;
  - 200 ou mais: Bom;
  - 400 ou mais: Muito bom;
  - 800 ou mais: Excelente.
- Em empates do ranking, a quantidade semanal de mensagens define quem fica acima.
- Atividades pendentes nao reduzem a nota.
- Apenas atividade entregue fora do prazo reduz desempenho.
- Atividade em andamento ja foi enviada e nao deve ser tratada como atrasada.
- Tarefas concluidas em Gestao de Projetos contam como atividade feita.
- Eventos:
  - participou: conta uma presenca;
  - justificou e participou: ainda conta apenas uma presenca;
  - justificativa aceita sem participacao: nao reduz desempenho e nao gera presenca;
  - ausencia sem justificativa: reduz o componente de eventos.

## Automacoes e observacoes

A varredura da Supervisao deve encontrar automaticamente:

- membros ha mais de 10 dias sem atividade relevante;
- atividades proximas do vencimento e atrasadas;
- projetos sem movimentacao ou fora do prazo;
- eventos proximos e baixa participacao;
- mensalidades pendentes;
- lembretes de cobranca e comunicacao;
- observacoes inteligentes, como horarios com maior participacao, eventos com mais presenca, setores que entregam mais tarde e melhora de membros apos acompanhamento.

Lembretes e observacoes sao compartilhados entre todos que possuem acesso a Supervisao. Eles nao sao notificacoes para todos os membros do Portal.

## Operacao premium e alertas

- A Central Operacional trabalha com casos persistentes: cada caso possui origem, prioridade, responsavel, prazo, estado e historico.
- Encerrar ou dispensar um caso exige um registro curto da decisao.
- A Diretoria cadastra a Equipe de Supervisao e define quem opera casos ou apenas observa.
- Apenas integrantes dessa equipe recebem alertas de prioridade critica ou de atencao: card central ao abrir o Portal, inbox e push quando o dispositivo estiver inscrito.
- A varredura automatica somente identifica e cria sinais; ela nunca comunica membros ou encerra casos automaticamente.

## MSY Analytics

Referencia original: `supervisao/MSY-ANALYTICS/`.

Fluxo correto do projeto original:

1. O navegador le localmente o arquivo `.txt` do WhatsApp por `FileReader`.
2. A analise semanal envia `chat`, `inicio` e `fim` ao webhook n8n semanal, com datas `AAAA-MM-DD`.
3. A analise mensal envia os mesmos campos ao webhook mensal, com datas `DD/MM/AAAA`.
4. O n8n processa o chat e devolve `{ html }` com a tabela de desempenho.
5. A Supervisao renderiza essa tabela abaixo do formulario.

Endpoints atuais do n8n:

```text
weekly:  https://warm-polls-treasury-gay.trycloudflare.com/webhook/analisar-chat
monthly: https://warm-polls-treasury-gay.trycloudflare.com/webhook/relatorio-mensal
```

Decisao importante: a analise de chat nao deve enviar o arquivo para Supabase. Ela deve manter o fluxo direto Browser -> n8n Tunnel -> Browser, igual ao MSY Analytics original.

Se a analise falhar com erro de requisicao bloqueada, investigar primeiro CORS no n8n/tunel para o dominio do Portal. Nao substituir esse fluxo por Edge Function do Supabase sem alinhamento explicito.

## Banco e migrations relevantes

- `20260717_supervisao.sql`: acesso, configuracoes, alertas, timeline, imports e metricas.
- `20260717_supervisao_reminders.sql`: lembretes e observacoes.
- `20260717_supervision_approval_states.sql`: estados de aprovacao de acoes.
- `20260717_supervision_reminder_access_fix.sql`: acesso compartilhado aos lembretes.

As migrations precisam ser aplicadas no SQL Editor do Supabase. O codigo pode existir no repositorio antes de a tabela ou coluna existir no banco real.

## Cuidados de manutencao

- Antes de alterar calculos, validar os dados reais do Portal e as regras desta documentacao.
- Nao usar dados de Gestao de Projetos como se fossem atividades pendentes erradas; tarefas concluidas contam apenas como atividade feita.
- Nao trocar cores positivas existentes apenas para deixar tudo vermelho.
- Manter animacoes suaves e responsividade em desktop e celular.
- Atualizar a versao de cache dos arquivos CSS/JS em `supervisao.html` quando alterar arquivos carregados diretamente.
- Atualizar este documento quando houver decisao de produto ou mudanca de integracao relevante.
