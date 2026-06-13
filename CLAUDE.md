# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Portal de Membro MSY** — internal member management system for Masayoshi Order (MSY). Vanilla JS PWA with no build step, deployed statically on Vercel, backed by Supabase.

**Production:** [portalmsy.site](https://portalmsy.site)  
**Backend:** Supabase project `lldzgkxpoyqauxdcjyaw`

---

## Development

**Local dev:** Any static file server works.
```bash
python -m http.server 8000
# or: npx serve .
```

**Deploy:** Push to `main` → automatic Vercel deploy. No build step needed.
```bash
git push origin main
```

**Migrations:** Applied manually via Supabase SQL Editor — paste `.sql` file content and execute. SQL files live in `supabase/migrations/` (and backup copies in `js/migrations/`).

**Supabase CLI scripts:**
```bash
npm run supabase:login         # Authenticate with Supabase CLI
npm run supabase:fix-story-likes  # Apply specific RLS policy migration
```

**After every deploy:** Run the checklist in `SMOKE_TESTS.md`.

---

## Architecture

Static multi-page app: 22 `.html` files, each loading a chain of `<script>` tags. No bundler, no ES modules (yet — Phase 3 roadmap item).

### Script Loading Order (enforced)

Every page must load scripts in this exact order:
1. `js/config.js` — Supabase URL, anon key, MP public key
2. `js/app.js` — `db`, `Auth`, `Utils`, `ViewMode`, `Sidebar`, `TopBar`
3. `js/modules3.js` — `MSYPerms`, `MSYTabAccess`
4. Page-specific modules

Never reference a symbol from a module loaded later in the chain.

### Global Objects (window namespace)

| Object | Source | Purpose |
|---|---|---|
| `db` | `app.js` | Supabase client — all DB/auth calls go through this |
| `Auth` | `app.js` | Session, login/logout, profile caching |
| `Utils` | `app.js` | Formatters, `showToast()`, `showLoading()`, `escapeHtml()` |
| `ViewMode` | `app.js` | Admin "view as member" simulation |
| `MSYPerms` | `modules3.js` | Granular permission checks (60+ permissions) |
| `MSYTabAccess` | `modules3.js` | Page-level access control |
| `MSYSessionCache` | `core/cache.js` | Session-scoped TTL cache |
| `Features` | `features.js` | Feature flags per `profiles.tier` |

### Page Init Pattern

Every page module follows this structure:
```javascript
async function initPageName() {
  const profile = await renderSidebar('pagename');
  if (!profile) return; // not authenticated — redirected
  await renderTopBar('Page Title', profile);

  const content = document.getElementById('pageContent');
  content.innerHTML = '<div class="loading-container"><i class="fa-solid fa-circle-notch fa-spin"></i> Carregando...</div>';

  try {
    const { data, error } = await db.from('tabela').select('*');
    if (error) throw error;
    content.innerHTML = renderDados(data);
  } catch (err) {
    console.error('[MSY][pagename]', err);
    content.innerHTML = '<div class="empty-state">Erro ao carregar. Tente recarregar a página.</div>';
  }
}
```

### Permission System

Two tiers in `profiles.tier`: `diretoria` (admin) or `membro`.  
Granular permissions stored in `member_permissions.permissions` (JSON array). Checked via `MSYPerms`.

### Key JS Files

| File | Contents |
|---|---|
| `js/app.js` | ~8800 lines: Auth, Utils, ViewMode, Sidebar, TopBar, all page init functions |
| `js/modules.js` | Biblioteca, Premiações, Ordem |
| `js/modules2.js` | Feed, Ranking, Busca, Presenças, Desempenho, Onboarding |
| `js/modules3.js` | MSYPerms, MSYTabAccess, System Alerts |
| `js/modules4.js` | Admin Dashboard |
| `js/icm_script.js` | **FROZEN** — ICM³ evaluation engine (1705 lines) |
| `js/icm_perfil.js` | **FROZEN** — ICM profile display |
| `js/core/` | Lightweight global helpers: cache, realtime, a11y, theme, confirm dialogs |

### Edge Functions (Deno/TypeScript)

Located in `supabase/functions/`. Both are JWT-protected and `diretoria`-only:
- `send-email/` — Email via Resend API
- `send-push/` — Web Push via VAPID

---

## Mandatory Code Standards

Full details in `JS_STANDARDS.md`. Key rules:

**Error handling** — every `db.*` or external fetch must be in try/catch:
```javascript
try {
  const { data, error } = await db.from('tabela').select('*');
  if (error) throw error;
} catch (err) {
  console.error('[MSY][contexto]', err);  // [MSY][context] prefix required
  Utils.showToast('Erro ao carregar dados. Tente novamente.', 'error');
}
```

**HTML escaping** — all dynamic content via `innerHTML` must use `Utils.escapeHtml()`:
```javascript
el.innerHTML = `<span>${Utils.escapeHtml(user.name)}</span>`; // ✅
el.innerHTML = `<span>${user.name}</span>`;                   // ❌ XSS risk
```

**Use existing Utils** — never redefine locally: `Utils.escapeHtml()`, `Utils.getInitials()`, `Utils.formatDate()`, `Utils.formatDateTime()`, `Utils.showToast()`, `Utils.showLoading()`.

**No inline CSS via JS** — no `document.createElement('style')`. All CSS goes in `/css/` files linked in `<head>`.

**No new `window.*` globals** — existing ones are legacy being phased out in Phase 3.

---

## Configuration

`js/config.js` (gitignored) — copy from `js/config.example.js`. Contains only public values:
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `MP_PUBLIC_KEY`, N8N webhook URLs

Backend secrets (never in frontend): `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `MERCADO_PAGO_ACCESS_TOKEN`, VAPID keys — stored in Supabase Secrets.

**Supabase Auth Redirect URLs** must include both `.html` suffixes and all domains (portalmsy.site, *.vercel.app, localhost:8765) — see README.md for full list.

---

## Frozen Files

**Do not refactor or restructure these files** — only touch for direct bug fixes:
- `js/icm_script.js` — complex ICM³ psychometric evaluation engine
- `js/icm_perfil.js` — ICM profile rendering
