# Smoke Tests — Portal MSY

Execute este checklist manualmente **antes de qualquer deploy** para garantir que nenhuma funcionalidade crítica foi quebrada.

---

## Como usar

1. Faça o deploy
2. Abra o portal em uma aba **anônima** (para garantir sessão limpa)
3. Execute os testes abaixo em ordem
4. Se qualquer item falhar: **reverta o deploy** antes de investigar

---

## Checklist Mínimo (sempre)

### Autenticação
- [ ] Acessar `login.html` → página carrega sem erros de console
- [ ] Login com credenciais **inválidas** → mensagem de erro aparece (não tela em branco ou redirect)
- [ ] Login com credenciais **válidas** (membro ativo) → redireciona para `dashboard.html`
- [ ] Após login, abrir `login.html` diretamente → redireciona para dashboard (não permite re-login)
- [ ] Botão "Sair" no topbar → logout e redirect para `login.html`

### Dashboard
- [ ] Dashboard carrega dados (sem spinner infinito)
- [ ] Sidebar exibe o nome do usuário logado
- [ ] Sidebar exibe links de navegação corretos para o cargo
- [ ] Notificações no topbar carregam (ícone de sino com contador)

### Controle de Acesso
- [ ] Login como **membro comum** → acessar `admin.html` diretamente → acesso negado ou redirect para dashboard
- [ ] Login como **diretoria** → acessar `admin.html` → carrega normalmente

### Atividades
- [ ] Página `atividades.html` carrega lista de atividades
- [ ] Como diretoria: criar nova atividade → aparece na lista
- [ ] Como membro: submeter resposta a uma atividade aberta → mensagem de sucesso

### Presenças
- [ ] Página `presencas.html` carrega lista de eventos
- [ ] Marcar presença em evento → status atualiza sem reload da página

### Erros de Console
- [ ] Abrir DevTools → Console
- [ ] Navegar por 5 páginas → **zero erros vermelhos no console**
- [ ] `grep "catch(() => {})"` no código → deve retornar zero resultados

---

## Checklist Expandido (antes de releases maiores)

### Módulos Principais
- [ ] `biblioteca.html` → carrega conteúdos, filtros funcionam
- [ ] `ranking.html` → leaderboard carrega com dados
- [ ] `feed.html` → feed carrega posts
- [ ] `membros.html` → lista de membros com busca funcional
- [ ] `comunicados.html` → comunicados carregam
- [ ] `eventos.html` → lista de eventos carrega
- [ ] `perfil.html` → perfil do usuário carrega com dados corretos
- [ ] `mensalidade.html` → status de pagamento carrega

### Notificações
- [ ] Enviar notificação como diretoria → membro recebe badge no topbar
- [ ] Clicar na notificação → abre o link correto

### PWA / Mobile
- [ ] Abrir em celular Android (Chrome) → layout responsivo sem scroll horizontal
- [ ] Abrir em celular iOS (Safari) → layout responsivo sem scroll horizontal

### Segurança
- [ ] Acessar Supabase Studio → confirmar que tabela `profiles` tem RLS habilitado
- [ ] Tentar query direta como membro não-admin: não deve retornar dados de outros membros

---

## Critérios de Falha (deploy deve ser revertido)

- Loop de redirect infinito no login
- Tela em branco em qualquer página após autenticação
- Erro de JavaScript que impede navegação
- Usuário não-admin acessando conteúdo restrito
- Notificações parando de funcionar (verificar sw.js)

---

## Comandos Úteis

```bash
# Verificar se há catches silenciosos no código
grep -rn "catch(() => {})" js/

# Verificar títulos únicos em todas as páginas
grep -h "<title>" *.html | sort | uniq -d
# resultado esperado: nenhuma linha (zero duplicatas)
```
