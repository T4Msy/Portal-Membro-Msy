# Portal de Membro MSY

Sistema de gestão interna para membros da Masayoshi Order.

**Domínio:** [portalmsy.site](https://portalmsy.site)  
**Hosting:** Vercel (deploy estático, branch `main`)<br>
**Backend:** Supabase — [Dashboard](https://supabase.com/dashboard/project/lldzgkxpoyqauxdcjyaw)

---

## Stack

- HTML + CSS + JavaScript puro (sem framework, sem build step obrigatório, sem npm)
- Supabase (PostgreSQL + Auth + Edge Functions em Deno/TypeScript)
- Web Push VAPID + Email via Resend API
- Mercado Pago (integração de pagamentos — ainda em fase de teste)
- Service Worker (`sw.js`) — apenas para Web Push
- Vercel para deploy estático e Preview Deployments

---

## Estrutura de Arquivos

```
/
├── *.html              22 páginas HTML
├── css/
│   ├── style.css       Stylesheet principal (tema dark gold/red)
│   ├── icm_style.css   Estilos do sistema ICM
│   └── mensalidade.css Estilos de pagamentos
├── js/
│   ├── config.js       Configuração pública do frontend
│   ├── config.example.js Template de configuração pública
│   ├── app.js          Core: auth, utils, sidebar, topbar, init de todas as páginas
│   ├── modules.js      Biblioteca, Premiações, Ordem
│   ├── modules2.js     Feed, Ranking, Busca, Presenças, Desempenho, Onboarding
│   ├── modules3.js     Permissões (MSYPerms), Alertas do Sistema
│   ├── modules4.js     Dashboard de Desempenho (admin)
│   ├── badges_unificado.js  Sistema unificado de badges
│   ├── icm_script.js   Motor de avaliação ICM³ (NÃO TOCAR — complexo e isolado)
│   ├── icm_perfil.js   Exibição do perfil ICM (NÃO TOCAR)
│   ├── reunioes.js     Gerenciamento de reuniões
│   ├── mensalidade.js  UI de mensalidades
│   ├── payments.js     Integração Mercado Pago
│   ├── push.js         Notificações Web Push + Email
│   └── features.js     Feature flags por cargo
├── supabase/
│   └── functions/
│       ├── send-email/ Edge Function: emails via Resend
│       └── send-push/  Edge Function: Web Push VAPID
├── sw.js               Service Worker (push notifications)
├── vercel.json         Configuração do deploy estático na Vercel
└── CNAME               portalmsy.site (mantido enquanto houver rollback GitHub Pages)
```

---

## Páginas

| Arquivo | Título | Descrição |
|---|---|---|
| `index.html` | Início | Redireciona para login |
| `login.html` | Acesso | Autenticação (email + senha) |
| `dashboard.html` | Dashboard | Painel principal do membro |
| `admin.html` | Administração | Painel administrativo (diretoria only) |
| `atividades.html` | Atividades | Tarefas e missões dos membros |
| `reunioes.html` | Reuniões | Agendamento e atas de reuniões |
| `presencas.html` | Presenças | Registro de presença em eventos |
| `eventos.html` | Eventos | CRUD de eventos da ordem |
| `feed.html` | Feed | Mural de atividade da ordem |
| `membros.html` | Membros | Diretório de membros |
| `ranking.html` | Ranking | Leaderboards semanal e mensal |
| `desempenho.html` | Desempenho | Métricas de performance (diretoria) |
| `premiacoes.html` | Premiações | Sistema de badges e conquistas |
| `comunicados.html` | Comunicados | Mural de anúncios internos |
| `biblioteca.html` | Biblioteca | Repositório de conteúdos |
| `busca.html` | Busca | Busca global cross-módulo |
| `perfil.html` | Meu Perfil | Configurações e perfil do usuário |
| `mensalidade.html` | Mensalidade | Status e pagamento de mensalidades |
| `ordem.html` | Estrutura da Ordem | Organograma da MSY |
| `onboarding.html` | Integração | Onboarding de novos membros |
| `tecnologias.html` | Tecnologias | Catálogo de tecnologias |
| `icm.html` | ICM³ | Sistema de avaliação psicométrica |

---

## Como Fazer Deploy na Vercel

O portal é estático — nenhum build é necessário. A Vercel deve ser configurada como projeto estático:

- Framework Preset: `Other`
- Build Command: vazio
- Output Directory: raiz do repositório

Fluxo recomendado:

```bash
git add .
git commit -m "descrição da mudança"
git push origin main
```

Cada push na branch `main` gera deploy de produção na Vercel. Pull requests/branches geram Preview Deployments para validação antes de apontar ou promover produção.

**Após o deploy, sempre execute o checklist em `SMOKE_TESTS.md`.**

---

## Configuração

Toda configuração pública do frontend fica em `js/config.js`. Para ambientes novos, copie `js/config.example.js` e preencha somente valores públicos:

```javascript
const MSY_CONFIG = {
  SUPABASE_URL:      'https://SEU-PROJETO.supabase.co',
  SUPABASE_ANON_KEY: 'sua-anon-key',
  // ...
};
```

Pode ficar no frontend:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `MP_PUBLIC_KEY`

**Variáveis de ambiente das Edge Functions/backend** (nunca no frontend):
- `SUPABASE_SERVICE_ROLE_KEY` — chave de serviço (Supabase Secrets)
- `RESEND_API_KEY` — chave da API do Resend para emails
- `MERCADO_PAGO_ACCESS_TOKEN` — token privado do Mercado Pago
- Credenciais VAPID — em `send-push/index.ts`

Na Vercel, segredos devem ser cadastrados em Environment Variables apenas quando houver backend/Edge Functions consumindo esses valores. O site estático atual não injeta env vars no frontend.

## Supabase Auth Redirect URLs

Antes de trocar DNS ou promover produção, confirme no Supabase:

- `https://portalmsy.site/login.html`
- `https://portalmsy.site/dashboard.html`
- `https://*.vercel.app/login.html`
- `https://*.vercel.app/dashboard.html`
- `http://localhost:8765/login.html`
- `http://localhost:8765/dashboard.html`

Preserve URLs `.html` nesta fase para não quebrar redirects existentes.

---

## Banco de Dados (Supabase)

26 tabelas principais. As migrações estão em `*.sql` na raiz. Para aplicar uma migração:
1. Abra o SQL Editor no Supabase Dashboard
2. Cole o conteúdo do arquivo `.sql`
3. Execute

**Tabelas críticas:** `profiles`, `activities`, `events`, `event_presencas`, `member_permissions`, `mensalidades`

---

## Permissões

Dois níveis:
1. **Tier** (`profiles.tier`): `diretoria` ou `membro`
2. **Granular** (`member_permissions.permissions`): array JSON de permissões específicas

Gerenciado via `MSYPerms` em `js/modules3.js`.

---

## Arquivos Congelados (NÃO REFATORAR)

- `js/icm_script.js` — motor de avaliação ICM³ (1.705 linhas, complexo, funcionando)
- `js/icm_perfil.js` — exibição do perfil ICM

Estes arquivos só devem ser alterados para corrigir bugs diretos do sistema ICM.

---

## Roadmap de Evolução

Ver plano completo de 6 fases em `.claude/plans/`.

**Fase 1** (concluída): Documentação e quick wins  
**Fase 2** (concluída): Padronização de JS/CSS (error handling, duplicatas, CSS inline)<br>
**Fase 3**: Modularização ES6 (quebrar app.js em módulos)  
**Fase 4**: Hardening Supabase (RLS, Mercado Pago, cache, realtime)  
**Fase 5**: UI/UX, PWA, responsividade  
**Fase 6**: Vite + CI/CD + TypeScript  
