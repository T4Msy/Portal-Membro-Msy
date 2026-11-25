# Agente MSY e o portal

O **Agente MSY** é o plugin da Masayoshi para Claude Code e Codex (repositório `msy-agente`). Ele conversa com este
portal **com a conta do próprio membro**: usa a chave `anon` pública e o login do membro, então só vê e faz o que o
membro vê e faz aqui. Não existe chave de agente com privilégio.

## O que o portal oferece ao agente

| Peça | Arquivo |
|---|---|
| Página de confirmação da conexão | `conectar-agente.html`, `js/pages/conectar-agente.js`, `css/conectar-agente.css` |
| Regras do ciclo da tarefa (já existiam) | `task_start`, `task_request_review`, `enforce_task_status_rules` em `supabase/migrations/20260616_projetos_v2.sql` e `20260718_*` |
| Trava de colunas do responsável | `enforce_task_assignee_columns` em `supabase/migrations/20261125_agente_msy_e_acesso_anonimo.sql` |
| Rótulos "via Agente MSY" no histórico | `HISTORY_META` em `js/pages/projetos.js` (`agente_*`) |

## Como a conexão funciona

1. No computador do membro, `msy login` sobe um servidor em `127.0.0.1:<porta>` e abre
   `conectar-agente.html?porta=…&estado=…&computador=…`.
2. O membro confirma a senha nesta página. Ela cria uma sessão **nova** num cliente separado
   (`persistSession: false`), sem tocar na sessão do navegador.
3. A página redireciona para `http://127.0.0.1:<porta>/callback#estado=…&token=…`. O destino é sempre o 127.0.0.1 com
   a porta validada (nunca uma URL vinda do link). O token vai no fragmento `#`, que não é enviado em requisição.
4. O agente confere o estado, troca o token na hora (o que passou pelo navegador deixa de valer) e guarda a sessão
   em `~/.msy/credenciais.json` (permissão 600). `msy logout` encerra a sessão.

## Regras para quem mexer aqui

- Não crie endpoint, função ou chave "para o agente" com mais poder que o membro. Se o agente precisa de algo, a regra
  vale para o membro também e mora no banco (RLS/função).
- Ação nova que o agente vai usar: prefira função `SECURITY DEFINER` que confere `auth.uid()` (como `task_start`) a
  liberar UPDATE amplo na tabela.
- Depois de mexer em policies: `bash scripts/auditar-acesso-anonimo.sh`.
- Teste das regras: `tests/agente-msy-database.sql` (Postgres local; instruções no topo do arquivo).
