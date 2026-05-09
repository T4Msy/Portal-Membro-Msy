const { db, Utils, renderSidebar, renderTopBar } = window.MSY;

const STORAGE_KEY = 'msy_sugestoes_v1';

const CATEGORIES = [
  { key: 'melhoria', label: 'Melhoria', icon: 'fa-wand-magic-sparkles', desc: 'Processos, organização e evolução interna.' },
  { key: 'bug', label: 'Bug', icon: 'fa-triangle-exclamation', desc: 'Problemas técnicos ou falhas no portal.' },
  { key: 'evento', label: 'Evento', icon: 'fa-calendar-days', desc: 'Ideias para encontros, calls e ações da Ordem.' },
  { key: 'interface', label: 'Interface', icon: 'fa-layer-group', desc: 'Experiência visual, usabilidade e navegação.' },
  { key: 'outro', label: 'Outro', icon: 'fa-lightbulb', desc: 'Qualquer ideia que não se encaixe nas categorias.' },
];

const STATUSES = [
  { key: 'nova', label: 'Nova', icon: 'fa-star' },
  { key: 'analise', label: 'Em análise', icon: 'fa-magnifying-glass' },
  { key: 'planejada', label: 'Planejada', icon: 'fa-route' },
  { key: 'concluida', label: 'Concluída', icon: 'fa-circle-check' },
  { key: 'recusada', label: 'Recusada', icon: 'fa-circle-xmark' },
];

const state = {
  profile: null,
  items: [],
  hasDatabase: true,
  isDiretoria: false,
  view: 'minhas',
  filters: {
    category: 'todos',
    status: 'todos',
    member: 'todos',
    date: 'todos',
    search: '',
  },
};

function categoryMeta(key) {
  return CATEGORIES.find((item) => item.key === key) || CATEGORIES[CATEGORIES.length - 1];
}

function statusMeta(key) {
  return STATUSES.find((item) => item.key === key) || STATUSES[0];
}

function normalizeText(value) {
  return (value || '').toString().trim().toLowerCase();
}

function formatDate(value) {
  return value ? Utils.formatDateTime(value) : '-';
}

function loadLocalItems() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveLocalItems(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function normalizeItem(item) {
  const author = item.author || null;
  return {
    id: item.id,
    title: item.title || categoryMeta(item.category).label,
    category: item.category || 'outro',
    content: item.content || item.body || item.descricao || '',
    status: item.status || 'nova',
    admin_note: item.admin_note || '',
    author_id: item.author_id || item.authorId,
    author_name: author?.name || item.author_name || item.authorName || 'Membro',
    author_role: author?.role || item.author_role || 'Membro',
    author_tier: author?.tier || item.author_tier || 'membro',
    author_initials: author?.initials || item.author_initials || Utils.getInitials(author?.name || item.authorName || 'MS'),
    author_color: author?.color || item.author_color || '#7f1d1d',
    created_at: item.created_at || item.createdAt || new Date().toISOString(),
    updated_at: item.updated_at || item.updatedAt || item.created_at || item.createdAt || new Date().toISOString(),
    votes: item.votes || [],
    source: item.source || 'db',
  };
}

async function loadSuggestions() {
  try {
    const select = state.isDiretoria
      ? '*, author:author_id(id,name,role,tier,initials,color,avatar_url)'
      : '*, author:author_id(id,name,role,tier,initials,color,avatar_url)';
    let query = db.from('msy_suggestions').select(select).order('created_at', { ascending: false });
    if (!state.isDiretoria) query = query.eq('author_id', state.profile.id);
    const { data, error } = await query;
    if (error) throw error;
    state.hasDatabase = true;
    state.items = (data || []).map(normalizeItem);
  } catch (err) {
    console.warn('[MSY][sugestoes] Usando fallback local:', err);
    state.hasDatabase = false;
    state.items = loadLocalItems().map((item) => normalizeItem({ ...item, source: 'local' }));
  }
}

async function createSuggestion(payload) {
  if (!state.hasDatabase) {
    return normalizeItem({
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      ...payload,
      authorId: state.profile.id,
      authorName: state.profile.name,
      status: 'analise',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: 'local',
    });
  }

  const { data, error } = await db
    .from('msy_suggestions')
    .insert({
      author_id: state.profile.id,
      title: payload.title,
      category: payload.category,
      content: payload.content,
      body: payload.content,
      status: 'analise',
    })
    .select('*, author:author_id(id,name,role,tier,initials,color,avatar_url)')
    .single();
  if (error) throw error;
  return normalizeItem(data);
}

async function updateSuggestionStatus(id, status) {
  if (!state.isDiretoria) return;
  if (!state.hasDatabase) {
    const item = state.items.find((entry) => entry.id === id);
    if (item) {
      item.status = status;
      item.updated_at = new Date().toISOString();
      saveLocalItems(state.items);
    }
    return;
  }

  const { error } = await db
    .from('msy_suggestions')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

async function deleteSuggestion(id) {
  if (!state.isDiretoria) return;
  if (!state.hasDatabase) {
    state.items = state.items.filter((entry) => entry.id !== id);
    saveLocalItems(state.items);
    return;
  }

  const { error } = await db
    .from('msy_suggestions')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

async function initSuggestionPage() {
  const profile = await renderSidebar('sugestoes');
  if (!profile) return;
  state.profile = profile;
  state.isDiretoria = profile.tier === 'diretoria';
  state.view = state.isDiretoria ? 'admin' : 'minhas';
  await renderTopBar('Sugestões', profile);
  Utils.showLoading(document.getElementById('pageContent'));
  await loadSuggestions();
  document.getElementById('pageContent').innerHTML = layout();
  bindEvents();
  renderAll();
}

function layout() {
  return `
    <div class="suggestions-shell">
      <section class="suggestions-hero">
        <div class="suggestions-hero-copy">
          <div class="suggestions-eyebrow"><i class="fa-solid fa-lightbulb"></i> Centro de Ideias MSY</div>
          <h1>Transforme observações em evolução real da Ordem.</h1>
          <p>Cada sugestão enviada vira um registro organizado para análise, priorização e acompanhamento pela Diretoria.</p>
        </div>
        <div class="suggestions-hero-metrics">
          ${metricCard('Ideias registradas', state.items.length, 'fa-inbox')}
          ${metricCard('Em análise', countByStatus('analise'), 'fa-magnifying-glass')}
          ${metricCard('Concluídas', countByStatus('concluida'), 'fa-circle-check')}
        </div>
      </section>

      <section class="suggestions-grid">
        <form class="suggestion-composer" id="suggestionForm">
          <div class="suggestion-composer-head">
            <div>
              <div class="suggestion-section-kicker">Nova contribuição</div>
              <div class="suggestion-section-title">Enviar sugestão</div>
            </div>
            <span class="suggestion-privacy"><i class="fa-solid fa-shield-halved"></i> Diretoria acompanha</span>
          </div>

          <label class="suggestion-field">
            <span>Título da ideia</span>
            <input id="suggestionTitle" class="form-input" maxlength="90" placeholder="Ex: Melhorar organização dos eventos">
          </label>

          <label class="suggestion-field">
            <span>Categoria</span>
            <div class="suggestion-category-grid">
              ${CATEGORIES.map((cat, index) => `
                <button class="suggestion-category-option ${index === 0 ? 'active' : ''}" type="button" data-category-choice="${cat.key}">
                  <i class="fa-solid ${cat.icon}"></i>
                  <strong>${cat.label}</strong>
                  <small>${cat.desc}</small>
                </button>`).join('')}
            </div>
            <input id="suggestionCategory" type="hidden" value="${CATEGORIES[0].key}">
          </label>

          <label class="suggestion-field">
            <span>Descrição</span>
            <textarea id="suggestionText" class="form-input form-textarea" maxlength="900" placeholder="Explique a ideia, o problema que ela resolve e qualquer detalhe importante para a Diretoria avaliar."></textarea>
          </label>

          <div class="suggestion-compose-footer">
            <div class="suggestion-count"><span id="suggestionCount">0</span>/900</div>
            <button class="btn btn-primary" id="suggestionSubmit" type="submit"><i class="fa-solid fa-paper-plane"></i> Enviar ideia</button>
          </div>
        </form>

        <aside class="suggestions-aside">
          <div class="suggestion-guide-card">
            <div class="suggestion-section-kicker">Como escrever melhor</div>
            <div class="suggestion-guide-list">
              <span><i class="fa-solid fa-check"></i> Diga qual problema existe.</span>
              <span><i class="fa-solid fa-check"></i> Explique o impacto para os membros.</span>
              <span><i class="fa-solid fa-check"></i> Sugira uma solução prática.</span>
            </div>
          </div>
          ${!state.hasDatabase ? `
            <div class="suggestion-warning-card">
              <i class="fa-solid fa-database"></i>
              <span>Modo local ativo. Aplique <strong>js/migration_sugestoes.sql</strong> no Supabase para liberar o painel real da Diretoria.</span>
            </div>` : ''}
        </aside>
      </section>

      <section class="suggestions-board">
        <div class="suggestions-board-head">
          <div>
            <div class="suggestion-section-kicker">${state.isDiretoria ? 'Gestão da Diretoria' : 'Acompanhamento'}</div>
            <div class="suggestion-section-title">${state.isDiretoria ? 'Painel de sugestões' : 'Minhas sugestões'}</div>
          </div>
          ${state.isDiretoria ? `
            <div class="suggestion-tabs">
              <button class="suggestion-tab active" data-suggestion-view="admin">Todas</button>
              <button class="suggestion-tab" data-suggestion-view="minhas">Minhas</button>
            </div>` : ''}
        </div>

        ${state.isDiretoria ? adminFilters() : memberFilters()}
        <div class="suggestions-list" id="suggestionsList"></div>
      </section>
    </div>`;
}

function metricCard(label, value, icon) {
  return `
    <div class="suggestion-metric">
      <i class="fa-solid ${icon}"></i>
      <strong>${value}</strong>
      <span>${label}</span>
    </div>`;
}

function adminFilters() {
  const members = uniqueMembers();
  return `
    <div class="suggestion-admin-filters">
      <div class="suggestion-search">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input id="suggestionSearch" placeholder="Buscar por texto, membro ou categoria">
      </div>
      <select id="filterMember" class="form-input form-select">
        <option value="todos">Todos os membros</option>
        ${members.map((member) => `<option value="${member.id}">${Utils.escapeHtml(member.name)}</option>`).join('')}
      </select>
      ${selectFilter('filterCategory', 'Todas categorias', CATEGORIES.map((cat) => [cat.key, cat.label]))}
      ${selectFilter('filterStatus', 'Todos status', STATUSES.map((status) => [status.key, status.label]))}
      <select id="filterDate" class="form-input form-select">
        <option value="todos">Qualquer data</option>
        <option value="hoje">Hoje</option>
        <option value="7d">Últimos 7 dias</option>
        <option value="30d">Últimos 30 dias</option>
      </select>
    </div>`;
}

function memberFilters() {
  return `
    <div class="filters-bar suggestions-filters">
      <button class="filter-btn active" data-status-filter="todos">Todas</button>
      ${STATUSES.map((status) => `<button class="filter-btn" data-status-filter="${status.key}">${status.label}</button>`).join('')}
    </div>`;
}

function selectFilter(id, allLabel, options) {
  return `
    <select id="${id}" class="form-input form-select">
      <option value="todos">${allLabel}</option>
      ${options.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}
    </select>`;
}

function bindEvents() {
  const text = document.getElementById('suggestionText');
  text.addEventListener('input', () => {
    document.getElementById('suggestionCount').textContent = String(text.value.length);
  });

  document.querySelectorAll('[data-category-choice]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-category-choice]').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      document.getElementById('suggestionCategory').value = button.dataset.categoryChoice;
    });
  });

  document.getElementById('suggestionForm').addEventListener('submit', submitSuggestion);

  document.querySelectorAll('[data-suggestion-view]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-suggestion-view]').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      state.view = button.dataset.suggestionView;
      if (state.view === 'minhas') state.filters.member = 'todos';
      renderSuggestions();
    });
  });

  ['filterMember', 'filterCategory', 'filterStatus', 'filterDate'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', (event) => {
      const key = id.replace('filter', '').toLowerCase();
      state.filters[key === 'category' ? 'category' : key] = event.target.value;
      renderSuggestions();
    });
  });

  document.getElementById('suggestionSearch')?.addEventListener('input', (event) => {
    state.filters.search = normalizeText(event.target.value);
    renderSuggestions();
  });

  document.querySelectorAll('[data-status-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-status-filter]').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      state.filters.status = button.dataset.statusFilter;
      renderSuggestions();
    });
  });
}

async function submitSuggestion(event) {
  event.preventDefault();
  const title = document.getElementById('suggestionTitle').value.trim();
  const content = document.getElementById('suggestionText').value.trim();
  const category = document.getElementById('suggestionCategory').value;
  if (!title) return Utils.showToast('Dê um título para a sugestão.', 'error');
  if (!content) return Utils.showToast('Descreva a sugestão antes de enviar.', 'error');

  const button = document.getElementById('suggestionSubmit');
  button.disabled = true;
  button.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Enviando...';
  try {
    const item = await createSuggestion({ title, content, category });
    state.items.unshift(item);
    if (!state.hasDatabase) saveLocalItems(state.items);
    document.getElementById('suggestionTitle').value = '';
    document.getElementById('suggestionText').value = '';
    document.getElementById('suggestionCount').textContent = '0';
    renderAll();
    Utils.showToast('Sugestão enviada para análise.');
  } catch (err) {
    console.error('[MSY][sugestoes] Erro ao enviar:', err);
    Utils.showToast(err.message || 'Erro ao enviar sugestão.', 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Enviar ideia';
  }
}

function renderAll() {
  renderSuggestions();
}

function renderSuggestions() {
  const list = document.getElementById('suggestionsList');
  if (!list) return;
  const items = filteredItems();

  if (!items.length) {
    list.innerHTML = `
      <div class="suggestions-empty">
        <i class="fa-regular fa-lightbulb"></i>
        <strong>Nenhuma sugestão encontrada.</strong>
        <span>Ajuste os filtros ou registre uma nova ideia para a Diretoria avaliar.</span>
      </div>`;
    return;
  }

  list.innerHTML = items.map(renderSuggestionCard).join('');
  list.querySelectorAll('[data-status-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        const nextStatus = button.dataset.statusAction;
        await updateSuggestionStatus(button.dataset.suggestionId, nextStatus);
        const item = state.items.find((entry) => entry.id === button.dataset.suggestionId);
        if (item) item.status = nextStatus;
        renderSuggestions();
        Utils.showToast('Status atualizado.');
      } catch (err) {
        Utils.showToast(err.message || 'Erro ao atualizar status.', 'error');
      }
    });
  });

  list.querySelectorAll('[data-delete-suggestion]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.deleteSuggestion;
      if (!await MSYConfirm.show('Excluir esta sugestão permanentemente?', {
        title: 'Excluir sugestão',
        type: 'danger',
        confirmText: 'Excluir',
      })) return;
      try {
        await deleteSuggestion(id);
        state.items = state.items.filter((entry) => entry.id !== id);
        renderSuggestions();
        Utils.showToast('Sugestão excluída.');
      } catch (err) {
        Utils.showToast(err.message || 'Erro ao excluir sugestão.', 'error');
      }
    });
  });
}

function renderSuggestionCard(item) {
  const cat = categoryMeta(item.category);
  const status = statusMeta(item.status);
  return `
    <article class="suggestion-card" data-suggestion-id="${item.id}">
      <div class="suggestion-card-accent"><i class="fa-solid ${cat.icon}"></i></div>
      <div class="suggestion-card-main">
        <div class="suggestion-card-top">
          <span class="suggestion-tag"><i class="fa-solid ${cat.icon}"></i> ${cat.label}</span>
          <span class="suggestion-status status-${item.status}"><i class="fa-solid ${status.icon}"></i> ${status.label}</span>
          <span class="suggestion-meta">${formatDate(item.created_at)}</span>
        </div>
        <div class="suggestion-card-info">
          <span><strong>Categoria:</strong> ${cat.label}</span>
          <span><strong>Status:</strong> ${status.label}</span>
        </div>
        <h3>${Utils.escapeHtml(item.title)}</h3>
        <p>${Utils.escapeHtml(item.content)}</p>
        <div class="suggestion-author">
          <span class="suggestion-author-avatar" style="background:linear-gradient(135deg,${item.author_color},#111)">${Utils.escapeHtml(item.author_initials || Utils.getInitials(item.author_name))}</span>
          <span><strong>${Utils.escapeHtml(item.author_name)}</strong><small>${Utils.escapeHtml(item.author_role || 'Membro')}</small></span>
        </div>
      </div>
      ${state.isDiretoria && state.view === 'admin' ? `
        <div class="suggestion-admin-actions">
          <label>Ações da Diretoria</label>
          <div class="suggestion-action-stack">
            <button class="suggestion-action-btn accept" data-suggestion-id="${item.id}" data-status-action="planejada"><i class="fa-solid fa-check"></i> Aceitar</button>
            <button class="suggestion-action-btn review" data-suggestion-id="${item.id}" data-status-action="analise"><i class="fa-solid fa-magnifying-glass"></i> Em análise</button>
            <button class="suggestion-action-btn done" data-suggestion-id="${item.id}" data-status-action="concluida"><i class="fa-solid fa-circle-check"></i> Concluir</button>
            <button class="suggestion-action-btn reject" data-suggestion-id="${item.id}" data-status-action="recusada"><i class="fa-solid fa-xmark"></i> Recusar</button>
            <button class="suggestion-action-btn delete" data-delete-suggestion="${item.id}"><i class="fa-solid fa-trash"></i> Excluir</button>
          </div>
        </div>` : ''}
    </article>`;
}

function filteredItems() {
  const now = Date.now();
  return state.items
    .filter((item) => state.view === 'admin' || item.author_id === state.profile.id)
    .filter((item) => state.filters.category === 'todos' || item.category === state.filters.category)
    .filter((item) => state.filters.status === 'todos' || item.status === state.filters.status)
    .filter((item) => state.filters.member === 'todos' || item.author_id === state.filters.member)
    .filter((item) => {
      if (state.filters.date === 'todos') return true;
      const created = new Date(item.created_at).getTime();
      if (state.filters.date === 'hoje') return new Date(item.created_at).toDateString() === new Date().toDateString();
      if (state.filters.date === '7d') return now - created <= 7 * 86400000;
      if (state.filters.date === '30d') return now - created <= 30 * 86400000;
      return true;
    })
    .filter((item) => {
      if (!state.filters.search) return true;
      const haystack = normalizeText(`${item.title} ${item.content} ${item.author_name} ${categoryMeta(item.category).label} ${statusMeta(item.status).label}`);
      return haystack.includes(state.filters.search);
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function uniqueMembers() {
  const map = new Map();
  state.items.forEach((item) => {
    if (item.author_id && !map.has(item.author_id)) map.set(item.author_id, { id: item.author_id, name: item.author_name });
  });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function countByStatus(status) {
  return state.items.filter((item) => item.status === status).length;
}

initSuggestionPage().catch((err) => {
  console.error('[MSY][sugestoes] Erro ao inicializar:', err);
  window.MSY.Utils.showToast?.('Erro ao carregar sugestões.', 'error');
});
