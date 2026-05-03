# Padrões de Código JS — MSY Portal

Este documento define os padrões obrigatórios para todo código JavaScript novo ou modificado no portal.

---

## 1. Tratamento de Erros em Funções Async

**Todo `await` que chame `db.*` ou fetch externo deve estar envolvido em try/catch.**

### Padrão obrigatório

```javascript
async function minhaFuncao() {
  try {
    const { data, error } = await db.from('tabela').select('*');
    if (error) throw error;
    // caminho de sucesso
  } catch (err) {
    console.error('[MSY][contexto]', err);
    Utils.showToast('Erro ao carregar dados. Tente novamente.', 'error');
  }
}
```

### Regras

- **Nunca** use `catch` vazio sem logar o erro
- Sempre inclua `[MSY][contexto]` no `console.error` para rastreabilidade
- Sempre mostre feedback ao usuário via `Utils.showToast(..., 'error')`
- Em funções que retornam valores, retorne `null` ou `[]` no bloco catch (não lance exceção para cima a não ser que o chamador precise saber)

### Anti-padrões proibidos

```javascript
// ❌ PROIBIDO — erro silencioso
await db.from('tabela').select().catch(/* vazio: proibido */);

// ❌ PROIBIDO — sem feedback para o usuário
catch (err) { console.error(err); }

// ❌ PROIBIDO — sem log
catch (err) { Utils.showToast('Erro', 'error'); }
```

---

## 2. Funções Utilitárias — Use Sempre as do Utils

**Nunca defina localmente funções que já existem em `Utils` (app.js).**

| Função | Uso correto |
|---|---|
| escape de HTML | `Utils.escapeHtml(str)` |
| iniciais do nome | `Utils.getInitials(name)` |
| formatar data | `Utils.formatDate(dateStr)` |
| formatar data+hora | `Utils.formatDateTime(dateStr)` |
| toast de feedback | `Utils.showToast(msg, type)` |
| spinner de loading | `Utils.showLoading(el, msg)` |

---

## 3. Loading States

Toda função `initPage()` que busca dados deve mostrar um estado de carregamento antes da primeira query:

```javascript
async function initMinhaPage() {
  const profile = await renderSidebar('minhapage');
  if (!profile) return;
  await renderTopBar('Título', profile);

  const content = document.getElementById('pageContent');
  // ✅ Mostra loading antes de qualquer fetch
  content.innerHTML = '<div class="loading-container"><i class="fa-solid fa-circle-notch fa-spin"></i> Carregando...</div>';

  try {
    const { data, error } = await db.from('tabela').select('*');
    if (error) throw error;
    content.innerHTML = renderDados(data);
  } catch (err) {
    console.error('[MSY][minhapage]', err);
    content.innerHTML = '<div class="empty-state">Erro ao carregar. Tente recarregar a página.</div>';
  }
}
```

---

## 4. CSS — Nunca Inline via JavaScript

**Proibido injetar `<style>` via `document.createElement('style')` em arquivos JS.**

CSS deve ficar em arquivos `.css` na pasta `/css/`, linkados no `<head>` das páginas HTML que precisam deles.

```html
<!-- ✅ Correto -->
<link rel="stylesheet" href="css/desempenho.css">

<!-- ❌ Proibido -->
<script>
  const s = document.createElement('style');
  s.textContent = `...centenas de linhas de CSS...`;
  document.head.appendChild(s);
</script>
```

---

## 5. Globais `window.*`

**Nunca crie novos globais `window.*`** sem documentar com JSDoc `@global` e sem aprovação explícita.

Os globais existentes são legado — serão removidos na Fase 3 (ES Modules). Não adicionar novos.

---

## 6. Dependência de Ordem de Scripts

Todos os módulos JS dependem de serem carregados nesta ordem:

1. `config.js` — credenciais
2. `app.js` — `db`, `Auth`, `Utils`, `ViewMode`
3. `modules3.js` — `MSYPerms`
4. Demais módulos

Nunca referencie uma função de um módulo carregado depois do módulo atual.

---

## 7. Escape de HTML

**Todo conteúdo dinâmico inserido via `innerHTML` deve passar por `Utils.escapeHtml()`.**

```javascript
// ✅ Correto
el.innerHTML = `<span>${Utils.escapeHtml(user.name)}</span>`;

// ❌ Vulnerável a XSS
el.innerHTML = `<span>${user.name}</span>`;
```

Exceção: strings de template que constroem HTML estrutural (tags, classes) não precisam de escape — apenas os *valores* inseridos.
