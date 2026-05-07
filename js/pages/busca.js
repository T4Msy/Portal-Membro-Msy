/* ============================================================
   MSY PORTAL — PAGES/BUSCA.JS
   Módulo ES — Busca Global.
   Depende de window.MSY (bridge populado por app.js).
   ============================================================ */

const { db, Utils, renderSidebar, renderTopBar } = window.MSY;

async function initBusca() {
  const profile = await renderSidebar('busca');
  if (!profile) return;
  await renderTopBar('Busca Global', profile);
  const content = document.getElementById('pageContent');
  const urlQ = new URLSearchParams(window.location.search).get('q') || '';

  content.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-header-title">Busca Global</div>
        <div class="page-header-sub">Pesquise em comunicados, membros, atividades, biblioteca e eventos</div>
      </div>
    </div>
    <div class="busca-bar-wrap">
      <div class="busca-bar">
        <i class="fa-solid fa-magnifying-glass busca-icon"></i>
        <input type="text" id="buscaInput" class="busca-input" placeholder="O que você está buscando?" value="${Utils.escapeHtml(urlQ)}" autofocus>
        <button class="btn btn-primary busca-btn" id="buscaBtn">Buscar</button>
      </div>
      <div class="busca-filters" id="buscaFilters" style="display:none">
        ${['Tudo','Membros','Comunicados','Atividades','Biblioteca','Eventos'].map((f,i) =>
          `<button class="bib-filter-btn${i===0?' active':''}" data-filter="${f}">${f}</button>`
        ).join('')}
      </div>
    </div>
    <div id="buscaResults">
      ${urlQ ? '' : `
        <div class="busca-empty-state">
          <i class="fa-solid fa-magnifying-glass"></i>
          <p>Digite acima para buscar em todo o portal</p>
          <div class="busca-hints">
            <span class="busca-hint">Membros</span>
            <span class="busca-hint">Comunicados</span>
            <span class="busca-hint">Atividades</span>
            <span class="busca-hint">Biblioteca</span>
          </div>
        </div>`}
    </div>`;

  const input = document.getElementById('buscaInput');
  let activeFilter = 'Tudo', lastResults = {};

  async function doSearch(q) {
    if (!q || q.trim().length < 2) return;
    q = q.trim();
    const results = document.getElementById('buscaResults');
    window.history.replaceState({}, '', `busca.html?q=${encodeURIComponent(q)}`);
    results.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:120px;color:var(--text-3);gap:12px">
        <i class="fa-solid fa-circle-notch fa-spin" style="color:var(--gold)"></i> Buscando...
      </div>`;
    try {
      const likeQ = `%${q}%`;
      const [memRes, comRes, actRes, bibRes, evRes] = await Promise.all([
        db.from('profiles').select('id,name,role,initials,color,avatar_url,tier').or(`name.ilike.${likeQ},role.ilike.${likeQ}`).limit(20),
        db.from('comunicados').select('id,title,content,category,created_at').or(`title.ilike.${likeQ},content.ilike.${likeQ}`).limit(20),
        db.from('activities').select('id,title,description,status,deadline').or(`title.ilike.${likeQ},description.ilike.${likeQ}`).limit(20),
        db.from('biblioteca_conteudos').select('id,titulo,descricao,categoria,link,created_at').or(`titulo.ilike.${likeQ},descricao.ilike.${likeQ}`).limit(20),
        db.from('events').select('id,title,description,event_date,type').or(`title.ilike.${likeQ},description.ilike.${likeQ}`).limit(20),
      ]);
      const erroBusca = [memRes, comRes, actRes, bibRes, evRes].find(res => res.error)?.error;
      if (erroBusca) throw erroBusca;
      lastResults = {
        membros: memRes.data || [], comunicados: comRes.data || [],
        atividades: actRes.data || [], biblioteca: bibRes.data || [], eventos: evRes.data || []
      };
      const total = Object.values(lastResults).reduce((s,a) => s+a.length, 0);
      document.getElementById('buscaFilters').style.display = total > 0 ? 'flex' : 'none';
      renderResults(q);
    } catch (err) {
      console.error('[MSY][busca] Erro ao executar busca global:', err);
      Utils.showToast('Erro ao buscar. Tente novamente.', 'error');
      results.innerHTML = `<div class="busca-empty-state">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <p>Erro ao buscar. Tente novamente.</p>
      </div>`;
    }
  }

  function renderResults(q) {
    const results = document.getElementById('buscaResults');
    const filtered = activeFilter === 'Tudo' ? lastResults : {
      membros:     activeFilter === 'Membros'     ? lastResults.membros     : [],
      comunicados: activeFilter === 'Comunicados' ? lastResults.comunicados : [],
      atividades:  activeFilter === 'Atividades'  ? lastResults.atividades  : [],
      biblioteca:  activeFilter === 'Biblioteca'  ? lastResults.biblioteca  : [],
      eventos:     activeFilter === 'Eventos'     ? lastResults.eventos     : [],
    };
    const total = Object.values(filtered).reduce((s,a) => s+a.length, 0);
    if (!total) {
      results.innerHTML = `<div class="busca-empty-state">
        <i class="fa-solid fa-circle-xmark" style="opacity:.3"></i>
        <p>Nenhum resultado para <strong>"${Utils.escapeHtml(q)}"</strong></p>
      </div>`;
      return;
    }
    const hl = (text, q) => {
      if (!text) return '';
      const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
      return Utils.escapeHtml(String(text)).replace(re, '<mark class="busca-hl">$1</mark>');
    };
    const sections = [
      { key:'membros', label:'Membros', icon:'fa-users', render: m => `
        <a href="membros.html" class="busca-result-item">
          <div class="avatar" style="background:linear-gradient(135deg,${m.color||'#7f1d1d'},#1a1a1a);flex-shrink:0;width:38px;height:38px">
            ${m.avatar_url?`<img src="${m.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:(m.initials||'MS')}
          </div>
          <div style="flex:1;min-width:0">
            <div class="busca-result-title">${hl(m.name,q)}</div>
            <div class="busca-result-sub">${hl(m.role,q)}</div>
          </div>
        </a>`},
      { key:'comunicados', label:'Comunicados', icon:'fa-bullhorn', render: c => `
        <a href="comunicados.html" class="busca-result-item">
          <div class="busca-result-icon"><i class="fa-solid fa-bullhorn"></i></div>
          <div style="flex:1;min-width:0">
            <div class="busca-result-title">${hl(c.title,q)}</div>
            <div class="busca-result-sub">${hl((c.content||'').substring(0,80),q)}… · ${Utils.formatDate(c.created_at)}</div>
          </div>
        </a>`},
      { key:'atividades', label:'Atividades', icon:'fa-list-check', render: a => `
        <a href="atividades.html" class="busca-result-item">
          <div class="busca-result-icon"><i class="fa-solid fa-list-check"></i></div>
          <div style="flex:1;min-width:0">
            <div class="busca-result-title">${hl(a.title,q)}</div>
            <div class="busca-result-sub">${Utils.statusBadge(a.status)} · Prazo: ${Utils.formatDate(a.deadline)}</div>
          </div>
        </a>`},
      { key:'biblioteca', label:'Biblioteca', icon:'fa-book-open', render: b => `
        <a href="${b.link}" target="_blank" rel="noopener" class="busca-result-item">
          <div class="busca-result-icon"><i class="fa-solid fa-book-open"></i></div>
          <div style="flex:1;min-width:0">
            <div class="busca-result-title">${hl(b.titulo,q)}</div>
            <div class="busca-result-sub">${hl(b.descricao,q)}</div>
          </div>
          <i class="fa-solid fa-arrow-up-right-from-square" style="color:var(--text-3);flex-shrink:0;font-size:.7rem"></i>
        </a>`},
      { key:'eventos', label:'Eventos', icon:'fa-calendar-days', render: e => `
        <a href="eventos.html" class="busca-result-item">
          <div class="busca-result-icon"><i class="fa-solid fa-calendar-days"></i></div>
          <div style="flex:1;min-width:0">
            <div class="busca-result-title">${hl(e.title,q)}</div>
            <div class="busca-result-sub">${e.type} · ${Utils.formatDate(e.event_date)}</div>
          </div>
        </a>`},
    ];
    let html = `<div class="busca-total">${total} resultado${total!==1?'s':''} para "<strong>${Utils.escapeHtml(q)}</strong>"</div>`;
    sections.forEach(({ key, label, icon, render }) => {
      const items = filtered[key] || [];
      if (!items.length) return;
      html += `<div class="busca-section">
        <div class="busca-section-label"><i class="fa-solid ${icon}"></i> ${label} <span>(${items.length})</span></div>
        <div class="busca-results-list">${items.map(render).join('')}</div>
      </div>`;
    });
    results.innerHTML = html;
  }

  document.getElementById('buscaBtn').addEventListener('click', () => doSearch(input.value));
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(input.value); });
  document.querySelectorAll('.busca-filters .bib-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter;
      document.querySelectorAll('.busca-filters .bib-filter-btn').forEach(b => b.classList.toggle('active', b === btn));
      renderResults(input.value);
    });
  });
  if (urlQ) doSearch(urlQ);
}

initBusca().catch(err => {
  console.error('[MSY][busca] Erro ao inicializar página:', err);
  window.MSY.Utils.showToast?.('Erro ao carregar busca.', 'error');
});
