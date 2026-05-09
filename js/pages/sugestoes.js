const { Utils, renderSidebar, renderTopBar } = window.MSY;

const STORAGE_KEY = 'msy_sugestoes_v1';
const CATEGORIES = [
  ['melhoria', 'Melhoria'],
  ['bug', 'Bug'],
  ['evento', 'Evento'],
  ['interface', 'Interface'],
  ['outro', 'Outro'],
];

const state = {
  profile: null,
  items: [],
  filter: 'todos',
};

function loadItems() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
}

function categoryLabel(key) {
  return CATEGORIES.find(([value]) => value === key)?.[1] || 'Outro';
}

function initSuggestionPage() {
  renderSidebar('sugestoes').then(async (profile) => {
    if (!profile) return;
    state.profile = profile;
    state.items = loadItems();
    await renderTopBar('Sugestões', profile);
    document.getElementById('pageContent').innerHTML = layout();
    bindEvents();
    renderItems();
  });
}

function layout() {
  return `
    <div class="suggestions-shell">
      <section class="suggestions-panel">
        <div class="page-header">
          <div>
            <div class="page-header-title">Sugestões</div>
            <div class="page-header-sub">Ideias, bugs, eventos e melhorias para evoluir o portal.</div>
          </div>
        </div>
        <form class="suggestion-composer" id="suggestionForm">
          <div class="suggestion-form-row">
            <select id="suggestionCategory" class="form-input form-select">
              ${CATEGORIES.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}
            </select>
            <button class="btn btn-primary" type="submit"><i class="fa-solid fa-paper-plane"></i> Enviar</button>
          </div>
          <textarea id="suggestionText" class="form-input form-textarea" maxlength="520" placeholder="Compartilhe uma sugestão, reporte um bug ou proponha um evento..."></textarea>
          <div class="suggestion-count"><span id="suggestionCount">0</span>/520</div>
        </form>
        <div class="filters-bar suggestions-filters">
          <button class="filter-btn active" data-suggestion-filter="todos">Todos</button>
          ${CATEGORIES.map(([value, label]) => `<button class="filter-btn" data-suggestion-filter="${value}">${label}</button>`).join('')}
          <button class="filter-btn" data-sort-relevance><i class="fa-solid fa-arrow-trend-up"></i> Relevância</button>
        </div>
        <div class="suggestions-list" id="suggestionsList"></div>
      </section>
    </div>`;
}

function bindEvents() {
  const text = document.getElementById('suggestionText');
  text.addEventListener('input', () => {
    document.getElementById('suggestionCount').textContent = String(text.value.length);
  });

  document.getElementById('suggestionForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const content = text.value.trim();
    if (!content) return Utils.showToast('Digite uma sugestão antes de enviar.', 'error');
    state.items.unshift({
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      category: document.getElementById('suggestionCategory').value,
      content,
      authorId: state.profile.id,
      authorName: state.profile.name,
      createdAt: new Date().toISOString(),
      votes: [],
    });
    saveItems();
    text.value = '';
    document.getElementById('suggestionCount').textContent = '0';
    renderItems();
    Utils.showToast('Sugestão enviada.');
  });

  document.querySelectorAll('[data-suggestion-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-suggestion-filter]').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      state.filter = button.dataset.suggestionFilter;
      renderItems();
    });
  });

  document.querySelector('[data-sort-relevance]').addEventListener('click', renderItems);
}

function renderItems() {
  const list = document.getElementById('suggestionsList');
  const filtered = state.items
    .filter((item) => state.filter === 'todos' || item.category === state.filter)
    .sort((a, b) => (b.votes?.length || 0) - (a.votes?.length || 0) || new Date(b.createdAt) - new Date(a.createdAt));

  if (!filtered.length) {
    list.innerHTML = `<div class="social-empty suggestions-empty"><i class="fa-regular fa-lightbulb"></i>Nenhuma sugestão nessa categoria.</div>`;
    return;
  }

  list.innerHTML = filtered.map((item) => {
    const voted = (item.votes || []).includes(state.profile.id);
    return `
      <article class="suggestion-card" data-suggestion-id="${item.id}">
        <div class="suggestion-card-main">
          <div class="suggestion-card-top">
            <span class="suggestion-tag">${categoryLabel(item.category)}</span>
            <span class="suggestion-meta">${Utils.escapeHtml(item.authorName)} · ${Utils.formatDateTime(item.createdAt)}</span>
          </div>
          <p>${Utils.escapeHtml(item.content)}</p>
        </div>
        <button class="suggestion-vote ${voted ? 'active' : ''}" data-vote-suggestion="${item.id}" title="Curtir sugestão">
          <i class="fa-${voted ? 'solid' : 'regular'} fa-heart"></i>
          <span>${item.votes?.length || 0}</span>
        </button>
      </article>`;
  }).join('');

  list.querySelectorAll('[data-vote-suggestion]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = state.items.find((entry) => entry.id === button.dataset.voteSuggestion);
      if (!item) return;
      item.votes ||= [];
      if (item.votes.includes(state.profile.id)) item.votes = item.votes.filter((id) => id !== state.profile.id);
      else item.votes.push(state.profile.id);
      saveItems();
      renderItems();
    });
  });
}

initSuggestionPage();
