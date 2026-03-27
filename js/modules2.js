/* ============================================================
   MSY PORTAL — MODULES2.JS v4.1
   Feed Premium · Ranking Semanal/Mensal · Presenças
   Desempenho · Onboarding · Busca Global · Paginação
   Badges no Modal de Membros · Responsividade Total
   ============================================================ */

'use strict';

/* ============================================================
   PAGINAÇÃO — Helper reutilizável
   ============================================================ */
const Paginator = {
  render(containerId, total, page, perPage, onPage) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const totalPages = Math.ceil(total / perPage);
    if (totalPages <= 1) { container.innerHTML = ''; return; }
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) pages.push(i);
      else if (pages[pages.length - 1] !== '...') pages.push('...');
    }
    container.innerHTML = `
      <div class="paginator">
        <button class="pag-btn${page===1?' disabled':''}" data-page="${page-1}" ${page===1?'disabled':''}>
          <i class="fa-solid fa-chevron-left"></i>
        </button>
        ${pages.map(p => p==='...'
          ? `<span class="pag-ellipsis">…</span>`
          : `<button class="pag-btn${p===page?' active':''}" data-page="${p}">${p}</button>`
        ).join('')}
        <button class="pag-btn${page===totalPages?' disabled':''}" data-page="${page+1}" ${page===totalPages?'disabled':''}>
          <i class="fa-solid fa-chevron-right"></i>
        </button>
        <span class="pag-info">${((page-1)*perPage)+1}–${Math.min(page*perPage,total)} de ${total}</span>
      </div>`;
    container.querySelectorAll('.pag-btn:not(.disabled)').forEach(btn => {
      btn.addEventListener('click', () => onPage(parseInt(btn.dataset.page)));
    });
  },
  slice(arr, page, perPage) {
    return arr.slice((page-1)*perPage, page*perPage);
  }
};

/* ============================================================
   BUSCA GLOBAL
   ============================================================ */
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
    window.history.replaceState({}, '', `busca.html?q=${encodeURIComponent(q)}`);
    document.getElementById('buscaResults').innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:120px;color:var(--text-3);gap:12px">
        <i class="fa-solid fa-circle-notch fa-spin" style="color:var(--gold)"></i> Buscando...
      </div>`;
    const likeQ = `%${q}%`;
    const [memRes, comRes, actRes, bibRes, evRes] = await Promise.all([
      db.from('profiles').select('id,name,role,initials,color,avatar_url,tier').or(`name.ilike.${likeQ},role.ilike.${likeQ}`).limit(20),
      db.from('comunicados').select('id,title,content,category,created_at').or(`title.ilike.${likeQ},content.ilike.${likeQ}`).limit(20),
      db.from('activities').select('id,title,description,status,deadline').or(`title.ilike.${likeQ},description.ilike.${likeQ}`).limit(20),
      db.from('biblioteca_conteudos').select('id,titulo,descricao,categoria,link,created_at').or(`titulo.ilike.${likeQ},descricao.ilike.${likeQ}`).limit(20),
      db.from('events').select('id,title,description,event_date,type').or(`title.ilike.${likeQ},description.ilike.${likeQ}`).limit(20),
    ]);
    lastResults = {
      membros:membros=memRes.data||[], comunicados:comRes.data||[],
      atividades:actRes.data||[], biblioteca:bibRes.data||[], eventos:evRes.data||[]
    };
    const total = Object.values(lastResults).reduce((s,a) => s+a.length,0);
    document.getElementById('buscaFilters').style.display = total>0 ? 'flex' : 'none';
    renderResults(q);
  }

  function renderResults(q) {
    const results = document.getElementById('buscaResults');
    const filtered = activeFilter==='Tudo' ? lastResults : {
      membros:     activeFilter==='Membros'     ? lastResults.membros     : [],
      comunicados: activeFilter==='Comunicados' ? lastResults.comunicados : [],
      atividades:  activeFilter==='Atividades'  ? lastResults.atividades  : [],
      biblioteca:  activeFilter==='Biblioteca'  ? lastResults.biblioteca  : [],
      eventos:     activeFilter==='Eventos'     ? lastResults.eventos     : [],
    };
    const total = Object.values(filtered).reduce((s,a)=>s+a.length,0);
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
      { key:'membros',label:'Membros',icon:'fa-users', render:m=>`
        <a href="membros.html" class="busca-result-item">
          <div class="avatar" style="background:linear-gradient(135deg,${m.color||'#7f1d1d'},#1a1a1a);flex-shrink:0;width:38px;height:38px">
            ${m.avatar_url?`<img src="${m.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:(m.initials||'MS')}
          </div>
          <div style="flex:1;min-width:0">
            <div class="busca-result-title">${hl(m.name,q)}</div>
            <div class="busca-result-sub">${hl(m.role,q)}</div>
          </div>
        </a>`},
      { key:'comunicados',label:'Comunicados',icon:'fa-bullhorn', render:c=>`
        <a href="comunicados.html" class="busca-result-item">
          <div class="busca-result-icon"><i class="fa-solid fa-bullhorn"></i></div>
          <div style="flex:1;min-width:0">
            <div class="busca-result-title">${hl(c.title,q)}</div>
            <div class="busca-result-sub">${hl((c.content||'').substring(0,80),q)}… · ${Utils.formatDate(c.created_at)}</div>
          </div>
        </a>`},
      { key:'atividades',label:'Atividades',icon:'fa-list-check', render:a=>`
        <a href="atividades.html" class="busca-result-item">
          <div class="busca-result-icon"><i class="fa-solid fa-list-check"></i></div>
          <div style="flex:1;min-width:0">
            <div class="busca-result-title">${hl(a.title,q)}</div>
            <div class="busca-result-sub">${Utils.statusBadge(a.status)} · Prazo: ${Utils.formatDate(a.deadline)}</div>
          </div>
        </a>`},
      { key:'biblioteca',label:'Biblioteca',icon:'fa-book-open', render:b=>`
        <a href="${b.link}" target="_blank" rel="noopener" class="busca-result-item">
          <div class="busca-result-icon"><i class="fa-solid fa-book-open"></i></div>
          <div style="flex:1;min-width:0">
            <div class="busca-result-title">${hl(b.titulo,q)}</div>
            <div class="busca-result-sub">${hl(b.descricao,q)}</div>
          </div>
          <i class="fa-solid fa-arrow-up-right-from-square" style="color:var(--text-3);flex-shrink:0;font-size:.7rem"></i>
        </a>`},
      { key:'eventos',label:'Eventos',icon:'fa-calendar-days', render:e=>`
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
      const items = filtered[key]||[];
      if (!items.length) return;
      html += `<div class="busca-section">
        <div class="busca-section-label"><i class="fa-solid ${icon}"></i> ${label} <span>(${items.length})</span></div>
        <div class="busca-results-list">${items.map(render).join('')}</div>
      </div>`;
    });
    results.innerHTML = html;
  }

  document.getElementById('buscaBtn').addEventListener('click', () => doSearch(input.value));
  input.addEventListener('keydown', e => { if (e.key==='Enter') doSearch(input.value); });
  document.querySelectorAll('.busca-filters .bib-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter;
      document.querySelectorAll('.busca-filters .bib-filter-btn').forEach(b => b.classList.toggle('active', b===btn));
      renderResults(input.value);
    });
  });
  if (urlQ) doSearch(urlQ);
}

/* ============================================================
   PAGE: FEED DE ATIVIDADE GLOBAL — UI Premium v2
   ============================================================ */
async function initFeed() {
  const profile = await renderSidebar('feed');
  if (!profile) return;
  await renderTopBar('Feed da Ordem', profile);

  const content     = document.getElementById('pageContent');
  const isDiretoria = profile.tier === 'diretoria';
  const PER_PAGE    = 15;
  let page          = 1;
  let allFeed       = [];
  let filtroTipo    = 'todos';
  let buscaFeed     = '';

  const TIPO_META = {
    atividade:  { icon:'fa-list-check',    color:'#e8c060', label:'Atividade'  },
    comunicado: { icon:'fa-bullhorn',       color:'#3b82f6', label:'Comunicado' },
    evento:     { icon:'fa-calendar-days',  color:'#10b981', label:'Evento'     },
    premiacao:  { icon:'fa-trophy',         color:'#dc2626', label:'Premiação'  },
    membro:     { icon:'fa-user-plus',      color:'#8b5cf6', label:'Membro'     },
    biblioteca: { icon:'fa-book-open',      color:'#f59e0b', label:'Biblioteca' },
    custom:     { icon:'fa-star',           color:'#ececec', label:'Anúncio'    },
  };

  /* ---- MODAL CRIAR / EDITAR ---- */
  function abrirModal(itemEdit = null) {
    const isEdit = !!itemEdit;
    let modal = document.getElementById('feedModal');
    if (!modal) { modal = document.createElement('div'); modal.id = 'feedModal'; modal.className = 'modal-overlay'; document.body.appendChild(modal); }

    modal.innerHTML = `
      <div class="modal-box feed-modal-box">
        <div class="modal-header">
          <div style="display:flex;align-items:center;gap:10px">
            <div class="feed-modal-icon-wrap"><i class="fa-solid fa-${isEdit?'pen':'rss'}" style="color:var(--gold)"></i></div>
            <h3 class="font-cinzel" style="font-size:1rem">${isEdit?'Editar Publicação':'Nova Publicação'}</h3>
          </div>
          <button class="modal-close" id="feedModalClose"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body" style="padding:24px;display:flex;flex-direction:column;gap:16px">
          <div style="display:grid;grid-template-columns:1fr auto;gap:12px;align-items:end">
            <div class="form-group" style="margin:0">
              <label class="form-label">Tipo</label>
              <select class="form-input form-select" id="feedTipo">
                ${Object.entries(TIPO_META).map(([k,v])=>
                  `<option value="${k}" ${itemEdit?.tipo===k?'selected':''}>${v.label}</option>`
                ).join('')}
              </select>
            </div>
            <div class="form-group" style="margin:0">
              <label class="form-label">Ícone</label>
              <input type="text" class="form-input" id="feedIcone" value="${itemEdit?.icone||'📌'}" maxlength="4"
                style="width:56px;font-size:1.3rem;text-align:center;padding:8px 0">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Título <span style="color:var(--red-bright)">*</span></label>
            <input type="text" class="form-input" id="feedTitulo" placeholder="Título da publicação" maxlength="120"
              value="${Utils.escapeHtml(itemEdit?.titulo||'')}">
          </div>
          <div class="form-group">
            <label class="form-label">Descrição <span style="color:var(--text-3);font-weight:400">(opcional)</span></label>
            <textarea class="form-input" id="feedDesc" rows="4" placeholder="Detalhes adicionais..." style="resize:vertical">${Utils.escapeHtml(itemEdit?.descricao||'')}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Link <span style="color:var(--text-3);font-weight:400">(opcional)</span></label>
            <input type="url" class="form-input" id="feedLink" placeholder="https://..." value="${Utils.escapeHtml(itemEdit?.link||'')}">
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end">
            <button class="btn btn-ghost" id="feedCancelBtn">Cancelar</button>
            <button class="btn btn-gold" id="feedSaveBtn">
              <i class="fa-solid fa-${isEdit?'floppy-disk':'paper-plane'}"></i> ${isEdit?'Salvar':'Publicar'}
            </button>
          </div>
        </div>
      </div>`;

    requestAnimationFrame(() => modal.classList.add('open'));
    const close = () => modal.classList.remove('open');
    modal.addEventListener('click', e => { if(e.target===modal) close(); });
    document.getElementById('feedModalClose').addEventListener('click', close);
    document.getElementById('feedCancelBtn').addEventListener('click', close);

    document.getElementById('feedSaveBtn').addEventListener('click', async () => {
      const titulo    = document.getElementById('feedTitulo').value.trim();
      const descricao = document.getElementById('feedDesc').value.trim()||null;
      const link      = document.getElementById('feedLink').value.trim()||null;
      const tipo      = document.getElementById('feedTipo').value;
      const icone     = document.getElementById('feedIcone').value.trim()||'📌';
      if (!titulo) { Utils.showToast('Título obrigatório.','error'); return; }
      const btn = document.getElementById('feedSaveBtn');
      btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
      let error;
      if (isEdit) {
        ({ error } = await db.from('feed_atividade')
          .update({ titulo, descricao, link, tipo, icone, updated_at: new Date().toISOString() })
          .eq('id', itemEdit.id));
      } else {
        ({ error } = await db.from('feed_atividade')
          .insert({ titulo, descricao, link, tipo, icone, autor_id: profile.id }));
      }
      if (error) {
        Utils.showToast('Erro ao salvar.','error');
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-${isEdit?'floppy-disk':'paper-plane'}"></i> ${isEdit?'Salvar':'Publicar'}`;
        return;
      }
      Utils.showToast(isEdit?'Publicação atualizada!':'Publicado no feed!');
      close(); page=1; await carregarFeed();
    });
  }

  /* ---- CARREGAR ---- */
  async function carregarFeed() {
    const feedList = document.getElementById('feedList');
    if (feedList) feedList.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:160px;color:var(--text-3);gap:12px">
        <i class="fa-solid fa-circle-notch fa-spin" style="color:var(--gold)"></i> Carregando...
      </div>`;
    const { data, error } = await db.from('feed_atividade')
      .select('*, autor:autor_id(name,initials,color,avatar_url)')
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) {
      if (feedList) feedList.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-3)">Erro: ${error.message}</div>`;
      return;
    }
    allFeed = data||[];
    const countEl = document.getElementById('feedTotalCount');
    if (countEl) countEl.textContent = allFeed.length;
    renderFeed();
  }

  /* ---- RENDER ---- */
  function renderFeed() {
    const feedList = document.getElementById('feedList');
    if (!feedList) return;

    let filtrados = allFeed;
    if (filtroTipo !== 'todos') filtrados = filtrados.filter(f => f.tipo===filtroTipo);
    if (buscaFeed) filtrados = filtrados.filter(f =>
      f.titulo.toLowerCase().includes(buscaFeed) || (f.descricao||'').toLowerCase().includes(buscaFeed)
    );

    document.querySelectorAll('.feed-chip[data-tipo]').forEach(b =>
      b.classList.toggle('active', b.dataset.tipo===filtroTipo)
    );

    if (!filtrados.length) {
      feedList.innerHTML = `
        <div class="feed-empty">
          <div class="feed-empty-icon">📭</div>
          <div class="feed-empty-title">Nenhuma publicação encontrada</div>
          <div class="feed-empty-sub">${buscaFeed?'Tente outros termos.':'Seja o primeiro a publicar!'}</div>
          ${isDiretoria&&!buscaFeed?`<button class="btn btn-gold" id="feedEmptyBtn" style="margin-top:16px"><i class="fa-solid fa-plus"></i> Publicar agora</button>`:''}
        </div>`;
      document.getElementById('feedEmptyBtn')?.addEventListener('click', () => abrirModal());
      return;
    }

    const paginated = Paginator.slice(filtrados, page, PER_PAGE);
    const grupos = {};
    paginated.forEach(item => {
      const key = new Date(item.created_at).toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
      if (!grupos[key]) grupos[key]=[];
      grupos[key].push(item);
    });

    feedList.innerHTML = Object.entries(grupos).map(([data,items]) => `
      <div class="feed-day-group">
        <div class="feed-day-label">
          <span class="feed-day-line"></span>
          <span class="feed-day-text">${data}</span>
          <span class="feed-day-line"></span>
        </div>
        <div class="feed-items-col">
          ${items.map(item => {
            const meta    = TIPO_META[item.tipo]||TIPO_META.custom;
            const autor   = item.autor;
            const canEdit = isDiretoria||(item.autor_id===profile.id);
            return `
              <div class="feed-card" data-id="${item.id}">
                <div class="feed-card-accent" style="background:${meta.color}"></div>
                <div class="feed-card-main">
                  <div class="feed-card-top">
                    <div class="feed-card-badge" style="background:${meta.color}18;border-color:${meta.color}33;color:${meta.color}">
                      <i class="fa-solid ${meta.icon}" style="font-size:.6rem"></i> ${meta.label}
                    </div>
                    <div class="feed-card-time">${Utils.formatDateTime(item.created_at)}${item.updated_at?` <span class="feed-edited-tag">editado</span>`:''}</div>
                  </div>
                  <div class="feed-card-icone">${item.icone||'📌'}</div>
                  <div class="feed-card-titulo">${Utils.escapeHtml(item.titulo)}</div>
                  ${item.descricao?`<div class="feed-card-desc">${Utils.escapeHtml(item.descricao)}</div>`:''}
                  <div class="feed-card-footer">
                    ${autor?`
                      <div class="feed-card-autor">
                        <div class="avatar" style="width:22px;height:22px;font-size:.5rem;flex-shrink:0;background:linear-gradient(135deg,${autor.color||'#7f1d1d'},#1a1a1a)">
                          ${autor.avatar_url?`<img src="${autor.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:(autor.initials||'')}
                        </div>
                        <span>${Utils.escapeHtml(autor.name)}</span>
                      </div>`:'<div></div>'}
                    <div class="feed-card-actions">
                      ${item.link?`<a href="${Utils.escapeHtml(item.link)}" target="_blank" rel="noopener" class="feed-card-link-btn"><i class="fa-solid fa-arrow-up-right-from-square"></i> Ver</a>`:''}
                      ${canEdit?`
                        <button class="feed-action-btn feed-edit-btn" data-id="${item.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
                        <button class="feed-action-btn feed-del-btn" data-id="${item.id}" title="Excluir"><i class="fa-solid fa-trash"></i></button>`:''}
                    </div>
                  </div>
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`).join('') + `<div id="feedPaginator"></div>`;

    Paginator.render('feedPaginator', filtrados.length, page, PER_PAGE, p => {
      page=p; renderFeed(); document.getElementById('feedList')?.scrollIntoView({behavior:'smooth',block:'start'});
    });

    feedList.querySelectorAll('.feed-edit-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const item = allFeed.find(f => f.id===btn.dataset.id);
        if (item) abrirModal(item);
      });
    });
    feedList.querySelectorAll('.feed-del-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm('Excluir esta publicação?')) return;
        const { error } = await db.from('feed_atividade').delete().eq('id', btn.dataset.id);
        if (!error) { Utils.showToast('Removido.'); allFeed=allFeed.filter(f=>f.id!==btn.dataset.id); const c=document.getElementById('feedTotalCount'); if(c)c.textContent=allFeed.length; renderFeed(); }
        else Utils.showToast('Erro ao remover.','error');
      });
    });
  }

  /* ---- LAYOUT ---- */
  content.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-header-title">Feed da Ordem</div>
        <div class="page-header-sub"><span id="feedTotalCount" style="color:var(--gold);font-weight:700">…</span> publicações · atividade recente</div>
      </div>
      ${isDiretoria?`<button class="btn btn-gold" id="feedPublicarBtn"><i class="fa-solid fa-plus"></i> <span class="btn-label">Publicar</span></button>`:''}
    </div>
    <div class="feed-toolbar">
      <div class="feed-chips" id="feedChips">
        <button class="feed-chip active" data-tipo="todos"><i class="fa-solid fa-border-all"></i> <span class="chip-label">Todos</span></button>
        ${Object.entries(TIPO_META).map(([k,v])=>`
          <button class="feed-chip" data-tipo="${k}" style="--chip-color:${v.color}">
            <i class="fa-solid ${v.icon}"></i> <span class="chip-label">${v.label}</span>
          </button>`).join('')}
      </div>
      <div class="feed-search-wrap">
        <i class="fa-solid fa-magnifying-glass feed-search-icon"></i>
        <input type="text" id="feedBusca" class="feed-search-input" placeholder="Filtrar...">
      </div>
    </div>
    <div id="feedList"></div>`;

  document.getElementById('feedPublicarBtn')?.addEventListener('click', () => abrirModal());
  document.querySelectorAll('.feed-chip[data-tipo]').forEach(btn => {
    btn.addEventListener('click', () => { filtroTipo=btn.dataset.tipo; page=1; renderFeed(); });
  });
  let buscaTimer;
  document.getElementById('feedBusca').addEventListener('input', e => {
    clearTimeout(buscaTimer);
    buscaTimer = setTimeout(() => { buscaFeed=e.target.value.toLowerCase().trim(); page=1; renderFeed(); }, 250);
  });
  await carregarFeed();
}

/* ============================================================
   BADGES VISÍVEIS NO MODAL DE OUTRO MEMBRO
   ============================================================ */
async function renderBadgesMembro(userId, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `<div style="padding:10px 0;color:var(--text-3);font-size:.8rem;display:flex;align-items:center;gap:8px">
    <i class="fa-solid fa-circle-notch fa-spin" style="color:var(--gold)"></i> Carregando...
  </div>`;

  // Busca insígnias de premiações e de recordes em paralelo
  const [badgesRes, insigniasRecordes] = await Promise.all([
    db.rpc('get_member_badges', { p_user_id: userId }),
    typeof calcInsigniasRecordes === 'function'
      ? calcInsigniasRecordes(userId)
      : Promise.resolve([]),
  ]);

  const badges = badgesRes.data || [];
  const temQualquer = badges.length > 0 || insigniasRecordes.length > 0;

  if (!temQualquer) {
    container.innerHTML = `<div style="padding:8px 0;color:var(--text-3);font-size:.8rem;font-style:italic">Nenhuma insígnia ainda.</div>`;
    return;
  }

  const COLORS = { 'Semanal':'#3b82f6','Mensal':'var(--gold)','Anual':'var(--red-bright)','Especial':'#8b5cf6' };

  const recordesHtml = insigniasRecordes.map(ins => `
    <div class="badge-item" title="${Utils.escapeHtml(ins.tooltip)}" style="--badge-color:${ins.cor}">
      <div class="badge-icon" style="filter:drop-shadow(0 0 6px ${ins.cor}88)">${ins.emoji}</div>
      <div class="badge-info">
        <div class="badge-titulo">${Utils.escapeHtml(ins.titulo)}</div>
        <div class="badge-qtd" style="color:${ins.cor};font-size:.68rem;text-transform:uppercase;letter-spacing:.04em">Recorde</div>
      </div>
    </div>`).join('');

  const badgesHtml = badges.map(b => {
    const color = COLORS[b.importancia] || 'var(--gold)';
    return `<div class="badge-item" title="${Utils.escapeHtml((b.periodos||[]).slice(0,5).join(' · '))}" style="--badge-color:${color}">
      <div class="badge-icon">${b.icone||'🏆'}</div>
      <div class="badge-info">
        <div class="badge-titulo">${Utils.escapeHtml(b.titulo)}</div>
        <div class="badge-qtd" style="color:${color}">${b.quantidade}×</div>
      </div>
    </div>`;
  }).join('');

  container.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:8px;padding:4px 0">
    ${recordesHtml}${badgesHtml}
  </div>`;
}

/* ============================================================
   PATCH: Injetar badges no modal de membro (membros.html)
   Usa MutationObserver para detectar quando o modal abre
   e injeta seção de badges automaticamente
   ============================================================ */
function patchMemberModal() {
  if (document.body.dataset.page !== 'membros') return;

  const waitForModal = setInterval(() => {
    const modal = document.getElementById('memberProfileModal');
    if (!modal) return;
    clearInterval(waitForModal);

    const observer = new MutationObserver(() => {
      if (!modal.classList.contains('open')) return;
      const body = document.getElementById('memberProfileBody');
      if (!body || body.querySelector('#memberBadgesSection')) return;

      // Ler membro_id injetado pelo patch do app.js
      const memberId = body.dataset.memberId;
      if (!memberId) return;

      const section = document.createElement('div');
      section.id = 'memberBadgesSection';
      section.innerHTML = `
        <div style="border-top:1px solid var(--border-faint);margin-top:12px;padding-top:14px">
          <div style="font-size:.7rem;color:var(--gold);text-transform:uppercase;letter-spacing:.08em;font-weight:700;margin-bottom:8px">
            <i class="fa-solid fa-medal" style="margin-right:5px"></i>Insígnias conquistadas
          </div>
          <div id="memberBadgesContainer"></div>
        </div>`;
      body.appendChild(section);
      renderBadgesMembro(memberId, 'memberBadgesContainer');
    });

    observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
  }, 300);
}

/* ============================================================
   PAGE: PRESENÇAS EM EVENTOS
   ============================================================ */
async function initPresencas() {
  const profile = await renderSidebar('presencas');
  if (!profile) return;
  await renderTopBar('Presenças', profile);
  const content     = document.getElementById('pageContent');
  const isDiretoria = profile.tier === 'diretoria';

  async function renderLista() {
    Utils.showLoading(content);
    const { data: eventos, error } = await db.from('events').select('*').order('event_date',{ascending:false}).limit(60);
    if (error) { content.innerHTML=`<div style="padding:40px;text-align:center;color:var(--text-3)">Erro: ${error.message}</div>`; return; }

    let presencaMap = {};
    if (eventos?.length) {
      const eIds = eventos.map(e=>e.id);
      if (isDiretoria) {
        const {data:counts} = await db.from('event_presencas').select('event_id,status').in('event_id',eIds);
        (counts||[]).forEach(c=>{
          if(!presencaMap[c.event_id])presencaMap[c.event_id]={confirmado:0,ausente:0,justificado:0};
          presencaMap[c.event_id][c.status]=(presencaMap[c.event_id][c.status]||0)+1;
        });
      } else {
        const {data:mine}=await db.from('event_presencas').select('event_id,status').eq('membro_id',profile.id).in('event_id',eIds);
        (mine||[]).forEach(p=>{presencaMap[p.event_id]=p.status;});
      }
    }

    const today   = new Date().toISOString().split('T')[0];
    const futuros = (eventos||[]).filter(e=>e.event_date>=today);
    const pasados = (eventos||[]).filter(e=>e.event_date<today);

    function card(ev) {
      const counts   = isDiretoria?(presencaMap[ev.id]||{}):null;
      const myStatus = !isDiretoria?presencaMap[ev.id]:null;
      return `
        <div class="presenca-card${ev.event_date<today?' past':''}">
          <div class="presenca-card-left">
            <div class="presenca-card-date">${Utils.formatDate(ev.event_date)}</div>
            <div class="presenca-card-title">${Utils.escapeHtml(ev.title)}</div>
            <div class="presenca-card-meta">
              <span><i class="fa-solid fa-tag"></i> ${Utils.escapeHtml(ev.type)}</span>
              ${ev.mandatory?`<span style="color:var(--red-bright)"><i class="fa-solid fa-circle-exclamation"></i> Obrigatório</span>`:''}
            </div>
          </div>
          <div class="presenca-card-right">
            ${isDiretoria?`
              <div class="presenca-badges">
                <span class="presenca-stat confirmed"><i class="fa-solid fa-check"></i> ${counts.confirmado||0}</span>
                <span class="presenca-stat absent"><i class="fa-solid fa-xmark"></i> ${counts.ausente||0}</span>
                <span class="presenca-stat justified"><i class="fa-solid fa-comment"></i> ${counts.justificado||0}</span>
              </div>
              <button class="btn btn-gold btn-sm presenca-manage-btn" data-id="${ev.id}">
                <i class="fa-solid fa-clipboard-list"></i> Gerenciar
              </button>`:`
              <span class="badge ${myStatus==='confirmado'?'badge-done':myStatus==='ausente'?'badge-red':myStatus==='justificado'?'badge-pending':'badge-gold'}">
                ${myStatus==='confirmado'?'✓ Presente':myStatus==='ausente'?'✗ Ausente':myStatus==='justificado'?'~ Justificado':'—'}
              </span>`}
          </div>
        </div>`;
    }

    content.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-header-title">Controle de Presenças</div>
          <div class="page-header-sub">${isDiretoria?'Gerencie a presença nos eventos':'Seu histórico de presenças'}</div>
        </div>
      </div>
      ${futuros.length?`<div class="presenca-section-label">Próximos Eventos</div>${futuros.map(card).join('')}`:''}
      ${pasados.length?`<div class="presenca-section-label" style="margin-top:24px">Eventos Passados</div>${pasados.map(card).join('')}`:`
        <div style="text-align:center;padding:60px;color:var(--text-3)">
          <i class="fa-solid fa-calendar-xmark" style="font-size:2.5rem;opacity:.3;margin-bottom:14px;display:block"></i>
          Nenhum evento encontrado.
        </div>`}`;

    content.querySelectorAll('.presenca-manage-btn').forEach(btn => {
      const ev = eventos.find(e=>e.id===btn.dataset.id);
      btn.addEventListener('click', ()=>renderDetalhe(btn.dataset.id, ev));
    });
  }

  async function renderDetalhe(eventId, evento) {
    Utils.showLoading(content);
    const [memRes,presRes] = await Promise.all([
      db.from('profiles').select('id,name,role,initials,color,avatar_url').eq('status','ativo').order('name'),
      db.from('event_presencas').select('*').eq('event_id',eventId)
    ]);
    const membros   = memRes.data||[];
    const presencas = presRes.data||[];
    const presMap   = {};
    presencas.forEach(p=>{presMap[p.membro_id]=p;});

    const conf  = presencas.filter(p=>p.status==='confirmado').length;
    const aus   = presencas.filter(p=>p.status==='ausente').length;
    const just  = presencas.filter(p=>p.status==='justificado').length;
    const semReg = membros.length - Object.keys(presMap).length;

    async function setPresenca(membroId, status) {
      const ex = presMap[membroId];
      let error;
      if (ex) {
        ({error}=await db.from('event_presencas').update({status,marcado_por:profile.id}).eq('id',ex.id));
        if (!error) presMap[membroId].status=status;
      } else {
        const {data,error:e}=await db.from('event_presencas').insert({event_id:eventId,membro_id:membroId,status,marcado_por:profile.id}).select().single();
        error=e; if(!error) presMap[membroId]=data;
      }
      if (error) { Utils.showToast('Erro ao registrar.','error'); return; }
      const row = content.querySelector(`.presenca-membro-row[data-id="${membroId}"]`);
      if (row) row.querySelectorAll('.presenca-btn-status').forEach(b=>{
        b.classList.remove('active-confirmed','active-absent','active-justified');
        if(b.dataset.status===status) b.classList.add(`active-${status==='confirmado'?'confirmed':status==='ausente'?'absent':'justified'}`);
      });
    }

    content.innerHTML = `
      <div class="page-header">
        <div>
          <button class="btn btn-ghost btn-sm" id="presBackBtn" style="margin-bottom:10px"><i class="fa-solid fa-arrow-left"></i> Voltar</button>
          <div class="page-header-title">${evento?Utils.escapeHtml(evento.title):'Evento'}</div>
          <div class="page-header-sub">${Utils.formatDate(evento?.event_date)}</div>
        </div>
        ${isDiretoria?`<button class="btn btn-gold" id="presMarcarTodosBtn"><i class="fa-solid fa-check-double"></i> <span class="btn-label">Todos presentes</span></button>`:''}
      </div>
      <div class="presenca-resumo-grid">
        ${[{label:'Presentes',val:conf,color:'#10b981',icon:'fa-check-circle'},{label:'Ausentes',val:aus,color:'var(--red-bright)',icon:'fa-times-circle'},{label:'Justificados',val:just,color:'var(--gold)',icon:'fa-comment-dots'},{label:'Sem reg.',val:semReg,color:'var(--text-3)',icon:'fa-question-circle'}]
          .map(s=>`<div class="presenca-resumo-card"><i class="fa-solid ${s.icon}" style="color:${s.color};font-size:1.2rem"></i><div><div class="font-cinzel" style="font-size:1.4rem;color:${s.color};line-height:1">${s.val}</div><div style="font-size:.7rem;color:var(--text-3);margin-top:2px">${s.label}</div></div></div>`).join('')}
      </div>
      <div class="card">
        <div style="padding:16px 24px;border-bottom:1px solid var(--border-faint)">
          <h3 class="font-cinzel" style="font-size:.9rem"><i class="fa-solid fa-users" style="color:var(--gold);margin-right:8px"></i>${membros.length} Membros</h3>
        </div>
        <div style="padding:16px 24px;display:flex;flex-direction:column;gap:8px">
          ${membros.map(m=>{
            const p=presMap[m.id]; const status=p?.status||null;
            const ac=m.avatar_url?`<img src="${m.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:(m.initials||Utils.getInitials(m.name));
            return `<div class="presenca-membro-row" data-id="${m.id}">
              <div class="avatar" style="background:linear-gradient(135deg,${m.color||'#7f1d1d'},#1a1a1a);flex-shrink:0">${ac}</div>
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${Utils.escapeHtml(m.name)}</div>
                <div style="font-size:.75rem;color:var(--text-3)">${Utils.escapeHtml(m.role)}</div>
              </div>
              ${isDiretoria?`<div class="presenca-btns">
                <button class="presenca-btn-status${status==='confirmado'?' active-confirmed':''}" data-membro="${m.id}" data-status="confirmado" title="Presente"><i class="fa-solid fa-check"></i></button>
                <button class="presenca-btn-status${status==='ausente'?' active-absent':''}" data-membro="${m.id}" data-status="ausente" title="Ausente"><i class="fa-solid fa-xmark"></i></button>
                <button class="presenca-btn-status${status==='justificado'?' active-justified':''}" data-membro="${m.id}" data-status="justificado" title="Justificado"><i class="fa-solid fa-comment"></i></button>
              </div>`:`<span class="badge ${status==='confirmado'?'badge-done':status==='ausente'?'badge-red':status==='justificado'?'badge-pending':'badge-gold'}" style="font-size:.78rem;flex-shrink:0">
                ${status==='confirmado'?'Presente':status==='ausente'?'Ausente':status==='justificado'?'Justificado':'—'}
              </span>`}
            </div>`;
          }).join('')}
        </div>
      </div>`;

    document.getElementById('presBackBtn').addEventListener('click', renderLista);
    content.querySelectorAll('.presenca-btn-status').forEach(btn=>{
      btn.addEventListener('click',()=>setPresenca(btn.dataset.membro,btn.dataset.status));
    });
    document.getElementById('presMarcarTodosBtn')?.addEventListener('click',async()=>{
      if(!confirm(`Marcar todos os ${membros.length} membros como presentes?`))return;
      for(const m of membros) await setPresenca(m.id,'confirmado');
      Utils.showToast('Todos marcados!');
    });
  }

  await renderLista();
}

/* ============================================================
   PAGE: PAINEL DE DESEMPENHO
   ============================================================ */
async function initDesempenho() {
  // Implementação movida para modules4.js
  // Este stub é mantido para compatibilidade do router
  const profile = await Auth.requireAuth();
  if (!profile || profile.tier !== 'diretoria') { window.location.href = 'dashboard.html'; return; }
  await renderSidebar('desempenho');
  await renderTopBar('Desempenho', profile);
  const content = document.getElementById('pageContent');
  content.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:200px;color:var(--text-3);gap:12px"><i class="fa-solid fa-circle-notch fa-spin" style="color:var(--gold)"></i> Carregando...</div>';
}


async function initOnboarding() {
  const session = await Auth.getSession();
  if (!session) { window.location.href='login.html'; return; }
  const profile = await Auth.getProfile();
  if (!profile) { window.location.href='login.html'; return; }
  await renderSidebar('onboarding');
  await renderTopBar('Integração', profile);
  const content = document.getElementById('pageContent');
  await db.rpc('init_onboarding', { p_membro_id: profile.id });
  const {data:steps} = await db.from('onboarding_steps').select('*').eq('membro_id',profile.id);
  const stepsMap={};
  (steps||[]).forEach(s=>{stepsMap[s.step]=s;});
  const STEPS=[
    {key:'completar_perfil',  icon:'👤',titulo:'Complete seu perfil',          desc:'Adicione foto, bio e personalize suas iniciais.',          link:'perfil.html',    linkLabel:'Ir ao Perfil'},
    {key:'ler_estrutura',     icon:'📖',titulo:'Leia a Estrutura da Ordem',     desc:'Conheça a hierarquia, valores e código de conduta.',       link:'ordem.html',     linkLabel:'Ver Estrutura'},
    {key:'primeira_atividade',icon:'✅',titulo:'Conclua sua primeira atividade',desc:'Acesse suas atividades e conclua a primeira.',              link:'atividades.html',linkLabel:'Ver Atividades'},
    {key:'acessar_biblioteca',icon:'📚',titulo:'Explore a Biblioteca',          desc:'Acesse materiais e recursos de conhecimento da Ordem.',     link:'biblioteca.html',linkLabel:'Abrir Biblioteca'},
    {key:'participar_evento', icon:'🗓️',titulo:'Participe de um Evento',       desc:'Marque presença no próximo evento ou reunião.',             link:'eventos.html',   linkLabel:'Ver Eventos'},
  ];
  async function toggle(key, val) {
    const ex=stepsMap[key];
    if(ex) await db.from('onboarding_steps').update({concluido:val}).eq('id',ex.id);
    else await db.from('onboarding_steps').insert({membro_id:profile.id,step:key,concluido:val});
    stepsMap[key]={...(stepsMap[key]||{}),concluido:val};
    renderAll();
  }
  function renderAll() {
    const done=STEPS.filter(s=>stepsMap[s.key]?.concluido).length;
    const pct=Math.round((done/STEPS.length)*100);
    const bar=document.getElementById('onboardingBar');
    if(bar)bar.style.width=`${pct}%`;
    const pctEl=document.getElementById('onboardingPct');
    if(pctEl)pctEl.textContent=`${pct}%`;
    const doneEl=document.getElementById('onboardingDone');
    if(doneEl)doneEl.textContent=`${done}/${STEPS.length} concluídos`;
    const compEl=document.getElementById('onboardingCompleto');
    if(compEl)compEl.style.display=pct===100?'block':'none';
    const list=document.getElementById('onboardingList');
    if(!list)return;
    list.innerHTML=STEPS.map(s=>{
      const isDone=stepsMap[s.key]?.concluido||false;
      return `<div class="onboard-step${isDone?' done':''}">
        <div class="onboard-step-check${isDone?' done':''}"><i class="fa-solid fa-${isDone?'check-circle':'circle'}" style="color:${isDone?'var(--gold)':'var(--text-3)'}"></i></div>
        <div class="onboard-step-icon">${s.icon}</div>
        <div class="onboard-step-body">
          <div class="onboard-step-titulo${isDone?' done':''}">${s.titulo}</div>
          <div class="onboard-step-desc">${s.desc}</div>
          <div class="onboard-step-btns">
            <a href="${s.link}" class="btn btn-ghost btn-sm">${s.linkLabel} <i class="fa-solid fa-arrow-right" style="font-size:.7rem"></i></a>
            <button class="btn btn-sm ${isDone?'btn-outline':'btn-gold'} onboard-toggle" data-key="${s.key}" data-done="${isDone}">
              ${isDone?'<i class="fa-solid fa-rotate-left"></i> Desfazer':'<i class="fa-solid fa-check"></i> Concluído'}
            </button>
          </div>
        </div>
      </div>`;
    }).join('');
    list.querySelectorAll('.onboard-toggle').forEach(btn=>{
      btn.addEventListener('click',()=>toggle(btn.dataset.key,btn.dataset.done!=='true'));
    });
  }
  const initDone=STEPS.filter(s=>stepsMap[s.key]?.concluido).length;
  const initPct=Math.round((initDone/STEPS.length)*100);
  content.innerHTML=`
    <div class="page-header">
      <div><div class="page-header-title">Bem-vindo, ${Utils.escapeHtml(profile.name.split(' ')[0])}!</div>
      <div class="page-header-sub">Complete os passos abaixo para se integrar à Ordem</div></div>
    </div>
    <div class="card" style="margin-bottom:24px;padding:24px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <div><div class="font-cinzel" style="font-size:1rem;margin-bottom:4px">Progresso de Integração</div>
        <div id="onboardingDone" style="font-size:.8rem;color:var(--text-3)">${initDone}/${STEPS.length} concluídos</div></div>
        <div id="onboardingPct" class="font-cinzel" style="font-size:2.2rem;color:var(--gold)">${initPct}%</div>
      </div>
      <div style="height:10px;background:var(--black-5);border-radius:99px;overflow:hidden">
        <div id="onboardingBar" style="height:100%;background:linear-gradient(90deg,var(--red),var(--gold));border-radius:99px;transition:width .5s;width:${initPct}%"></div>
      </div>
      <div id="onboardingCompleto" style="display:${initPct===100?'block':'none'};margin-top:14px;text-align:center;padding:10px;background:var(--gold-subtle);border-radius:var(--radius);border:1px solid var(--border-gold)">
        🎉 <strong style="color:var(--gold)">Integração completa!</strong> Você está pronto para a Ordem.
      </div>
    </div>
    <div id="onboardingList" style="display:flex;flex-direction:column;gap:12px"></div>
    <div style="margin-top:24px;text-align:center">
      <a href="dashboard.html" class="btn btn-ghost"><i class="fa-solid fa-gauge"></i> Ir ao Dashboard</a>
    </div>`;
  renderAll();
}

/* ============================================================
   PAGE: RANKING SEMANAL / MENSAL
   ============================================================ */
async function initRanking() {
  const profile = await renderSidebar('ranking');
  if (!profile) return;
  await renderTopBar('Ranking', profile);
  const content     = document.getElementById('pageContent');
  const isDiretoria = profile.tier === 'diretoria';
  const PER_PAGE    = 5;
  let pageSem=1, pageMen=1, tipoAtivo='semanal';
  let semanais=[], mensais=[];

  Utils.showLoading(content, 'Carregando rankings...');

  const {data,error} = await db.from('weekly_rankings')
    .select('*, creator:created_by(name,initials)')
    .order('week_start',{ascending:false});

  if (error) { content.innerHTML=`<div style="padding:40px;text-align:center;color:var(--text-3)">Erro: ${error.message}</div>`; return; }
  const todos=data||[];
  semanais=todos.filter(r=>!r.tipo||r.tipo==='semanal');
  mensais=todos.filter(r=>r.tipo==='mensal');

  const medals=['🥇','🥈','🥉'];

  function rankCard(r, idx, offset) {
    const entries=r.entries||[];
    const top3=entries.slice(0,3);
    const rest=entries.slice(3);
    const isRecente=offset===0&&idx===0;
    return `
      <div class="ranking-card card${isRecente?' ranking-card-destaque':''}">
        ${isRecente?'<div class="ranking-card-tag">🔥 Mais Recente</div>':''}
        <div class="ranking-card-header">
          <div>
            <div class="ranking-card-periodo">${Utils.formatDate(r.week_start)} — ${Utils.formatDate(r.week_end)}</div>
            ${r.creator?`<div style="font-size:.7rem;color:var(--text-3);margin-top:2px">por ${Utils.escapeHtml(r.creator.name)}</div>`:''}
          </div>
          ${isDiretoria?`<button class="btn btn-ghost btn-sm ranking-del-btn" data-id="${r.id}" title="Excluir"><i class="fa-solid fa-trash" style="color:var(--red-bright);font-size:.75rem"></i></button>`:''}
        </div>
        ${!entries.length?`<div style="color:var(--text-3);text-align:center;padding:20px;font-size:.82rem">Nenhuma entrada.</div>`:`
          <div class="ranking-podio">
            ${top3.map((e,i)=>`
              <div class="ranking-podio-item${i===0?' destaque':''}">
                <div class="ranking-podio-medal">${medals[i]}</div>
                <div class="ranking-podio-nome">${Utils.escapeHtml(e.name)}</div>
                <div class="ranking-podio-msgs">${e.messages}<span style="font-size:.6rem;opacity:.7"> msgs</span></div>
              </div>`).join('')}
          </div>
          ${rest.length?`<div class="ranking-lista">${rest.map((e,i)=>`
            <div class="ranking-lista-row">
              <span class="ranking-lista-pos">${i+4}°</span>
              <span class="ranking-lista-nome">${Utils.escapeHtml(e.name)}</span>
              <span class="ranking-lista-msgs">${e.messages}</span>
            </div>`).join('')}</div>`:''}`}
      </div>`;
  }

  function renderAtivo() {
    const lista=tipoAtivo==='semanal'?semanais:mensais;
    const page=tipoAtivo==='semanal'?pageSem:pageMen;
    document.querySelectorAll('.ranking-tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.tipo===tipoAtivo));
    const paginated=Paginator.slice(lista,page,PER_PAGE);
    const offset=(page-1)*PER_PAGE;
    document.getElementById('rankContent').innerHTML=paginated.length
      ? paginated.map((r,i)=>rankCard(r,i,offset)).join('')
      : `<div style="text-align:center;padding:60px;color:var(--text-3)"><i class="fa-solid fa-ranking-star" style="font-size:2.5rem;opacity:.3;margin-bottom:14px;display:block"></i>Nenhum ranking cadastrado.</div>`;
    Paginator.render('rankPaginator',lista.length,page,PER_PAGE,p=>{
      if(tipoAtivo==='semanal')pageSem=p; else pageMen=p; renderAtivo();
    });
    document.querySelectorAll('.ranking-del-btn').forEach(btn=>{
      btn.addEventListener('click',async()=>{
        if(!confirm('Excluir este ranking?'))return;
        const {error}=await db.from('weekly_rankings').delete().eq('id',btn.dataset.id);
        if(!error){
          if(tipoAtivo==='semanal')semanais=semanais.filter(r=>r.id!==btn.dataset.id);
          else mensais=mensais.filter(r=>r.id!==btn.dataset.id);
          Utils.showToast('Ranking removido.'); renderAtivo();
        } else Utils.showToast('Erro.','error');
      });
    });
  }

  function abrirModal(tipo) {
    let modal=document.getElementById('rankModal');
    if(!modal){modal=document.createElement('div');modal.id='rankModal';modal.className='modal-overlay';document.body.appendChild(modal);}
    modal.innerHTML=`
      <div class="modal-box" style="max-width:520px">
        <div class="modal-header">
          <h3 class="font-cinzel"><i class="fa-solid fa-plus" style="color:var(--gold);margin-right:8px"></i>Novo Ranking ${tipo==='semanal'?'Semanal':'Mensal'}</h3>
          <button class="modal-close" id="rankModalClose"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body" style="padding:24px;display:flex;flex-direction:column;gap:14px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="form-group"><label class="form-label">Início</label><input type="date" class="form-input" id="rankStart"></div>
            <div class="form-group"><label class="form-label">Fim</label><input type="date" class="form-input" id="rankEnd"></div>
          </div>
          <div><label class="form-label" style="margin-bottom:6px;display:block">Participantes</label>
          <div id="rankEntries" style="display:flex;flex-direction:column;gap:6px"></div>
          <button class="btn btn-ghost btn-sm" id="rankAddRow" style="margin-top:8px"><i class="fa-solid fa-plus"></i> Linha</button></div>
          <div style="display:flex;gap:10px;justify-content:flex-end">
            <button class="btn btn-ghost" id="rankCancelBtn">Cancelar</button>
            <button class="btn btn-gold" id="rankSaveBtn"><i class="fa-solid fa-floppy-disk"></i> Salvar</button>
          </div>
        </div>
      </div>`;
    requestAnimationFrame(()=>modal.classList.add('open'));
    const close=()=>modal.classList.remove('open');
    modal.addEventListener('click',e=>{if(e.target===modal)close();});
    document.getElementById('rankModalClose').addEventListener('click',close);
    document.getElementById('rankCancelBtn').addEventListener('click',close);
    const addRow=(n='',m='')=>{
      const row=document.createElement('div');
      row.style.cssText='display:flex;gap:8px;align-items:center';
      row.innerHTML=`<input type="text" class="form-input rank-name" placeholder="Nome" value="${Utils.escapeHtml(n)}" style="flex:2;padding:8px 10px;font-size:.85rem">
        <input type="number" class="form-input rank-msgs" placeholder="Msgs" value="${m}" min="0" style="flex:1;padding:8px 10px;font-size:.85rem">
        <button class="btn btn-ghost btn-sm" style="padding:8px;flex-shrink:0"><i class="fa-solid fa-times" style="color:var(--red-bright)"></i></button>`;
      row.querySelector('button').addEventListener('click',()=>row.remove());
      document.getElementById('rankEntries').appendChild(row);
    };
    for(let i=0;i<5;i++)addRow();
    document.getElementById('rankAddRow').addEventListener('click',()=>addRow());
    document.getElementById('rankSaveBtn').addEventListener('click',async()=>{
      const start=document.getElementById('rankStart').value;
      const end=document.getElementById('rankEnd').value;
      if(!start||!end){Utils.showToast('Informe as datas.','error');return;}
      const entries=[...document.querySelectorAll('#rankEntries > div')]
        .map(r=>({name:r.querySelector('.rank-name').value.trim(),messages:parseInt(r.querySelector('.rank-msgs').value)||0}))
        .filter(e=>e.name).sort((a,b)=>b.messages-a.messages);
      if(!entries.length){Utils.showToast('Adicione participantes.','error');return;}
      const {error}=await db.from('weekly_rankings').insert({week_start:start,week_end:end,entries,tipo,created_by:profile.id});
      if(error){Utils.showToast('Erro ao salvar.','error');return;}
      Utils.showToast('Ranking salvo!'); close();
      const {data:fresh}=await db.from('weekly_rankings').select('*, creator:created_by(name,initials)').order('week_start',{ascending:false});
      const t=fresh||[];
      semanais=t.filter(r=>!r.tipo||r.tipo==='semanal');
      mensais=t.filter(r=>r.tipo==='mensal');
      tipoAtivo=tipo;
      if(tipo==='semanal')pageSem=1; else pageMen=1;
      renderAtivo();
    });
  }

  content.innerHTML=`
    <div class="page-header">
      <div><div class="page-header-title">Ranking de Mensagens</div>
      <div class="page-header-sub">Histórico semanal e mensal de participação da Ordem</div></div>
      ${isDiretoria?`<div class="ranking-add-btns">
        <button class="btn btn-ghost btn-sm" id="newRankMenBtn"><i class="fa-solid fa-plus"></i> Mensal</button>
        <button class="btn btn-gold btn-sm" id="newRankSemBtn"><i class="fa-solid fa-plus"></i> Semanal</button>
      </div>`:''}
    </div>
    <div class="ranking-tabs">
      <button class="ranking-tab-btn active" data-tipo="semanal">
        <i class="fa-solid fa-calendar-week"></i> Semanal
        <span class="ranking-tab-count">${semanais.length}</span>
      </button>
      <button class="ranking-tab-btn" data-tipo="mensal">
        <i class="fa-solid fa-calendar-days"></i> Mensal
        <span class="ranking-tab-count">${mensais.length}</span>
      </button>
    </div>
    <div id="rankContent"></div>
    <div id="rankPaginator"></div>`;

  document.querySelectorAll('.ranking-tab-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{tipoAtivo=btn.dataset.tipo;renderAtivo();});
  });
  document.getElementById('newRankSemBtn')?.addEventListener('click',()=>abrirModal('semanal'));
  document.getElementById('newRankMenBtn')?.addEventListener('click',()=>abrirModal('mensal'));
  renderAtivo();
}

/* ============================================================
   ROUTER — Módulos v4.1
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  const routes = {
    busca:      initBusca,
    feed:       initFeed,
    presencas:  initPresencas,
    // desempenho: gerenciado por modules4.js
    onboarding: initOnboarding,
    ranking:    initRanking,
    mensalidade: typeof initMensalidade !== 'undefined' ? initMensalidade : undefined,
  };
  routes[page]?.();
  // Patch de badges no modal de membros (sempre que membros.html for carregado)
  patchMemberModal();
});
