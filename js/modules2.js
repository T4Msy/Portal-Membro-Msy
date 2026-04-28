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
  const canPublicarFeed = isDiretoria || await MSYPerms.check(profile.id, profile.tier, 'publicar_feed');
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
          ${canPublicarFeed&&!buscaFeed?`<button class="btn btn-gold" id="feedEmptyBtn" style="margin-top:16px"><i class="fa-solid fa-plus"></i> Publicar agora</button>`:''}
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
            const canEdit = isDiretoria || (item.autor_id === profile.id);
            const canDelete = isDiretoria || (item.autor_id === profile.id);
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
                      ${canEdit?`<button class="feed-action-btn feed-edit-btn" data-id="${item.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>`:''}
                      ${canDelete?`<button class="feed-action-btn feed-del-btn" data-id="${item.id}" title="Excluir"><i class="fa-solid fa-trash"></i></button>`:''}
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
      ${canPublicarFeed?`<button class="btn btn-gold" id="feedPublicarBtn"><i class="fa-solid fa-plus"></i> <span class="btn-label">Publicar</span></button>`:''}
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

  if (canPublicarFeed) document.getElementById('feedPublicarBtn')?.addEventListener('click', () => abrirModal());
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
  /* Delega ao sistema unificado MSYBadges quando disponível */
  if (typeof MSYBadges !== 'undefined') {
    return MSYBadges.render(userId, containerId, { compact: true });
  }

  /* Fallback legado — só executa se badges_unificado.js não estiver carregado */
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `<div style="padding:10px 0;color:var(--text-3);font-size:.8rem;display:flex;align-items:center;gap:8px">
    <i class="fa-solid fa-circle-notch fa-spin" style="color:var(--gold)"></i> Carregando...
  </div>`;

  const [badgesRes, insigniasRecordes] = await Promise.all([
    db.rpc('get_member_badges', { p_user_id: userId }),
    typeof calcInsigniasRecordes === 'function'
      ? calcInsigniasRecordes(userId)
      : Promise.resolve([]),
  ]);

  const badges      = badgesRes.data || [];
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
      // Não injeta se o novo sistema (mpb-section) já renderizou as insígnias
      if (!body || body.querySelector('#memberBadgesSection') || body.querySelector('.mpb-section')) return;

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
        const {data:mine}=await db.from('event_presencas').select('event_id,status').eq('user_id',profile.id).in('event_id',eIds);
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
  if (!profile) { window.location.href = 'dashboard.html'; return; }
  const isDiretoria = profile.tier === 'diretoria';
  const canVerDesempenho = isDiretoria || await MSYPerms.check(profile.id, profile.tier, 'ver_desempenho');
  if (!canVerDesempenho) { window.location.href = 'dashboard.html'; return; }
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
   TRONO DOS RECORDES — Engine de cálculo e Jornal MSY
   ============================================================ */

/**
 * Normaliza um nome para comparação, removendo acentos e caixa.
 * Usado para agrupar variações como "Naira" e "Naíra".
 */
function _tronNormalize(name) {
  return (name||'').toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,' ');
}

/**
 * Calcula o Top 3 histórico de SEMANAL e MENSAL varrendo todos os
 * relatórios da weekly_rankings. Retorna { semanal: [...], mensal: [...] }
 * Cada item: { nome, mensagens, periodo, data_ref }
 */
function _tronCalcTop3FromRankings(todos) {
  // Acumula candidatos por tipo
  const candidatos = { semanal: [], mensal: [] };

  for (const r of todos) {
    const tipo = (!r.tipo || r.tipo === 'semanal') ? 'semanal' : 'mensal';
    for (const e of (r.entries || [])) {
      const msgs = parseInt(e.messages) || 0;
      if (!msgs || !e.name) continue;
      const periodoStr = r.week_start && r.week_end
        ? `${r.week_start.split('-').reverse().join('/')} a ${r.week_end.split('-').reverse().join('/')}`
        : '';
      candidatos[tipo].push({
        nome: e.name,
        mensagens: msgs,
        periodo: periodoStr,
        data_ref: r.week_start || null,
      });
    }
  }

  function top3(lista) {
    // Deduplicar: manter apenas o melhor registro de cada membro
    const melhorPorMembro = new Map();
    for (const item of lista) {
      const nomeKey = _tronNormalize(item.nome);
      const atual = melhorPorMembro.get(nomeKey);
      if (!atual || item.mensagens > atual.mensagens ||
          (item.mensagens === atual.mensagens && item.data_ref && atual.data_ref && item.data_ref < atual.data_ref)) {
        melhorPorMembro.set(nomeKey, item);
      }
    }
    const dedup = Array.from(melhorPorMembro.values());
    // Ordena: mais mensagens primeiro. Empate: quem atingiu primeiro (data menor)
    const sorted = dedup.slice().sort((a, b) => {
      if (b.mensagens !== a.mensagens) return b.mensagens - a.mensagens;
      // empate: menor data = mais antigo = foi primeiro
      if (a.data_ref && b.data_ref) return a.data_ref.localeCompare(b.data_ref);
      return 0;
    });
    // Manter apenas Top 3
    return sorted.slice(0, 3).map((item, i) => ({ ...item, posicao: i + 1 }));
  }

  return {
    semanal: top3(candidatos.semanal),
    mensal:  top3(candidatos.mensal),
  };
}

/**
 * Lê o Top 3 atual da tabela msy_recordes_top3 do banco.
 * Retorna { semanal: [...3], mensal: [...3], diario: [...3] }
 */
async function _tronLerTop3Banco() {
  const { data, error } = await db.from('msy_recordes_top3').select('*').order('tipo').order('posicao');
  if (error || !data) return { semanal: [], mensal: [], diario: [] };
  const result = { semanal: [], mensal: [], diario: [] };
  for (const row of data) {
    if (result[row.tipo]) result[row.tipo].push(row);
  }
  return result;
}

/**
 * Persiste o Top 3 calculado no banco via upsert.
 * Só grava tipos que foram recalculados (semanal e/ou mensal).
 */
async function _tronGravarTop3(novoTop3, tiposAtualizar, profileId) {
  for (const tipo of tiposAtualizar) {
    const lista = novoTop3[tipo] || [];
    for (const item of lista) {
      await db.from('msy_recordes_top3').upsert({
        tipo,
        posicao:    item.posicao,
        nome:       item.nome,
        mensagens:  item.mensagens,
        periodo:    item.periodo || null,
        data_ref:   item.data_ref || null,
        updated_by: profileId,
      }, { onConflict: 'tipo,posicao' });
    }
    // Se há menos de 3 entradas, limpar posições excedentes
    if (lista.length < 3) {
      for (let pos = lista.length + 1; pos <= 3; pos++) {
        await db.from('msy_recordes_top3').delete().eq('tipo', tipo).eq('posicao', pos);
      }
    }
  }
}

/**
 * Detecta quais eventos de recorde ocorreram comparando top3 anterior x novo.
 * Retorna array de eventos ordenados por prioridade (maior primeiro).
 *
 * Tipos de evento:
 *   'novo_top1'         prioridade 6
 *   'auto_recorde_top1' prioridade 5
 *   'auto_recorde_top2' prioridade 4
 *   'subida_top2'       prioridade 3
 *   'auto_recorde_top3' prioridade 2
 *   'entrada_top3'      prioridade 1
 */
function _tronDetectarEventos(anterior, novo, categoriaTipo) {
  const eventos = [];

  const CATEGORIA_LABEL = {
    semanal: 'Soberania Semanal ⚡',
    mensal:  'Domínio Mensal 🩸',
    diario:  'Marca Perpétua Diária 🔱',
  };
  const label = CATEGORIA_LABEL[categoriaTipo] || categoriaTipo;

  const antMap = {}; // nome_normalizado → { posicao, mensagens }
  for (const item of (anterior || [])) {
    antMap[_tronNormalize(item.nome)] = { posicao: item.posicao, mensagens: item.mensagens };
  }

  for (const item of (novo || [])) {
    const normNome = _tronNormalize(item.nome);
    const ant = antMap[normNome];

    if (!ant) {
      // Não estava no top3 antes
      if (item.posicao === 1) {
        eventos.push({ tipo: 'novo_top1', prioridade: 6, nome: item.nome, mensagens: item.mensagens, categoria: label, categoriaTipo });
      } else if (item.posicao === 2) {
        eventos.push({ tipo: 'subida_top2', prioridade: 3, nome: item.nome, mensagens: item.mensagens, categoria: label, categoriaTipo });
      } else if (item.posicao === 3) {
        eventos.push({ tipo: 'entrada_top3', prioridade: 1, nome: item.nome, mensagens: item.mensagens, categoria: label, categoriaTipo });
      }
    } else {
      // Já estava no top3 — verificar auto-recorde ou subida
      const subiu = item.posicao < ant.posicao;
      const autoRecorde = item.mensagens > ant.mensagens;

      if (item.posicao === 1 && ant.posicao !== 1) {
        // Subiu para Top 1 — isso é "novo_top1" independente de auto-recorde
        eventos.push({ tipo: 'novo_top1', prioridade: 6, nome: item.nome, mensagens: item.mensagens, categoria: label, categoriaTipo });
      } else if (item.posicao === 1 && autoRecorde) {
        eventos.push({ tipo: 'auto_recorde_top1', prioridade: 5, nome: item.nome, mensagens: item.mensagens, categoria: label, categoriaTipo });
      } else if (item.posicao === 2 && ant.posicao !== 2 && ant.posicao > 2) {
        eventos.push({ tipo: 'subida_top2', prioridade: 3, nome: item.nome, mensagens: item.mensagens, categoria: label, categoriaTipo });
      } else if (item.posicao === 2 && autoRecorde) {
        eventos.push({ tipo: 'auto_recorde_top2', prioridade: 4, nome: item.nome, mensagens: item.mensagens, categoria: label, categoriaTipo });
      } else if (item.posicao === 3 && autoRecorde) {
        eventos.push({ tipo: 'auto_recorde_top3', prioridade: 2, nome: item.nome, mensagens: item.mensagens, categoria: label, categoriaTipo });
      }
    }
  }

  // Ordenar por prioridade decrescente
  eventos.sort((a, b) => b.prioridade - a.prioridade);
  return eventos;
}

/**
 * Gera a mensagem do Jornal MSY para um evento de recorde.
 * Aplica concordância gramatical correta por categoria.
 */
function _tronMensagemEvento(evento) {
  const { tipo, nome, mensagens, categoria, categoriaTipo } = evento;

  // Preposição correta por categoria
  // semanal (Soberania Semanal) → feminino → "na" / "da"
  // mensal  (Domínio Mensal)    → masculino → "no" / "do"
  // diario  (Marca Perpétua)    → feminino → "na" / "da"
  const prep = (categoriaTipo === 'mensal') ? { em: 'no', de: 'do' } : { em: 'na', de: 'da' };

  switch (tipo) {
    case 'entrada_top3':
      return `${nome} entrou para o Trono dos Recordes ao alcançar a 3ª posição ${prep.em} ${categoria} com ${mensagens} mensagens`;
    case 'subida_top2':
      return `${nome} superou um antigo recorde e avançou para a 2ª posição ${prep.em} ${categoria} com ${mensagens} mensagens`;
    case 'novo_top1':
      return `${nome} conquistou o topo ${prep.de} ${categoria} e estabeleceu um novo recorde histórico com ${mensagens} mensagens`;
    case 'auto_recorde_top1':
    case 'auto_recorde_top2':
    case 'auto_recorde_top3':
      return `${nome} superou o próprio recorde ${prep.em} ${categoria} e ampliou ainda mais seu domínio com ${mensagens} mensagens`;
    default:
      return `${nome} marcou ${mensagens} mensagens ${prep.em} ${categoria}`;
  }
}

/**
 * Publica avisos de recorde no Jornal MSY.
 * Deduplica: verifica se já existe aviso recente (últimas 24h) com a mesma mensagem.
 * Respeita prioridade visual: Top 1 = prioridade 2, demais = 1 ou 0.
 */
async function _tronPublicarJornal(eventos, profileId) {
  if (!eventos || !eventos.length) return;

  // Buscar avisos do Jornal dos últimos 2 dias para deduplicar
  const cutoff = new Date(Date.now() - 2 * 86400000).toISOString();
  const { data: recentes } = await db.from('jornal_avisos')
    .select('mensagem')
    .eq('ativo', true)
    .gte('created_at', cutoff);

  const mensagensExistentes = new Set((recentes || []).map(a => a.mensagem));

  for (const evento of eventos) {
    const mensagem = _tronMensagemEvento(evento);
    if (mensagensExistentes.has(mensagem)) continue; // já existe, pular

    // Prioridade visual: Top 1 e auto-recorde Top 1 = 2 (urgente/destaque máx)
    // Auto-recorde Top 2 e subida Top 2 = 1 (alta)
    // Demais = 0 (normal)
    let prioridade = 0;
    if (evento.tipo === 'novo_top1' || evento.tipo === 'auto_recorde_top1') prioridade = 2;
    else if (evento.tipo === 'auto_recorde_top2' || evento.tipo === 'subida_top2') prioridade = 1;

    // Ícone por tipo
    const icones = {
      novo_top1:         '🏆',
      auto_recorde_top1: '🔥',
      auto_recorde_top2: '🔥',
      subida_top2:       '🥈',
      auto_recorde_top3: '🔥',
      entrada_top3:      '🥉',
    };

    await db.from('jornal_avisos').insert({
      mensagem,
      icone:      icones[evento.tipo] || '🏆',
      prioridade,
      ativo:      true,
      autor_id:   profileId,
      autor_nome: 'Sistema — Trono dos Recordes',
      expira_em:  null,
    });
  }
}

/**
 * Função principal: recalcula o Top 3 de semanal e mensal,
 * detecta mudanças em relação ao estado salvo no banco,
 * persiste o novo estado e publica avisos no Jornal MSY.
 * Chamada ao salvar um novo ranking.
 */
async function _tronAtualizarTop3(todos, profileId) {
  try {
    // 1. Calcular novo top3 a partir de todos os rankings
    const novoCalc = _tronCalcTop3FromRankings(todos);

    // 2. Ler estado atual do banco
    const bancAtual = await _tronLerTop3Banco();

    // 3. Detectar eventos para semanal e mensal
    const eventosSem = _tronDetectarEventos(bancAtual.semanal, novoCalc.semanal, 'semanal');
    const eventosMen = _tronDetectarEventos(bancAtual.mensal,  novoCalc.mensal,  'mensal');

    // Juntar, re-ordenar por prioridade
    const todosEventos = [...eventosSem, ...eventosMen].sort((a, b) => b.prioridade - a.prioridade);

    // 4. Persistir novo top3
    await _tronGravarTop3(
      { semanal: novoCalc.semanal, mensal: novoCalc.mensal },
      ['semanal', 'mensal'],
      profileId
    );

    // Invalidar cache de insignias
    window._msyRecordesCache   = null;
    window._msyRecordesCacheTs = 0;

    // 5. Publicar no Jornal MSY
    if (todosEventos.length > 0) {
      await _tronPublicarJornal(todosEventos, profileId);
    }

    return { novoCalc, eventos: todosEventos };
  } catch (err) {
    console.warn('[Trono] Erro ao atualizar Top 3:', err);
    return { novoCalc: null, eventos: [] };
  }
}

/* ============================================================
   PAGE: RANKING — Trono dos Recordes + Semanal + Mensal
   ============================================================ */
async function initRanking() {
  const profile = await renderSidebar('ranking');
  if (!profile) return;
  await renderTopBar('Ranking', profile);
  const content     = document.getElementById('pageContent');
  const isDiretoria = profile.tier === 'diretoria';
  const canGerenciarRanking = isDiretoria || await MSYPerms.check(profile.id, profile.tier, 'gerenciar_ranking');
  const PER_PAGE    = 5;

  // Estado de navegação
  let abaAtiva  = 'trono';   // 'trono' | 'semanal' | 'mensal'
  let pageSem   = 1, pageMen = 1;
  let semanais  = [], mensais = [];
  let tronoBanco = { semanal: [], mensal: [], diario: [] };

  // CSS exclusivo do Trono dos Recordes (injetado uma vez)
  if (!document.getElementById('msy-trono-css')) {
    const s = document.createElement('style');
    s.id = 'msy-trono-css';
    s.textContent = `
      /* ── Trono dos Recordes — Pódio Premium ── */
      .trono-wrap { display: flex; flex-direction: column; gap: 40px; }

      .trono-categoria {
        border-radius: 24px; overflow: visible;
        border: 1px solid rgba(255,255,255,.07);
        background: linear-gradient(170deg, #0f0d15 0%, #09070e 100%);
        position: relative;
      }
      .trono-categoria::before {
        content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
        border-radius: 24px 24px 0 0;
        background: linear-gradient(90deg, transparent 0%, var(--trono-color, #c9a84c) 30%, #fffc 50%, var(--trono-color, #c9a84c) 70%, transparent 100%);
      }
      .trono-categoria::after {
        content: ''; position: absolute; inset: 0; border-radius: 24px;
        box-shadow: 0 0 80px var(--trono-shadow, rgba(201,168,76,.07)), 0 32px 64px rgba(0,0,0,.6);
        pointer-events: none;
      }

      .trono-cat-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 26px 36px 22px;
        border-bottom: 1px solid rgba(255,255,255,.04);
      }
      .trono-cat-title {
        font-family: 'Cinzel', serif; font-size: 1.05rem; font-weight: 700;
        color: var(--trono-color, #c9a84c); letter-spacing: .12em; text-transform: uppercase;
        display: flex; align-items: center; gap: 12px;
      }
      .trono-cat-badge {
        font-size: .54rem; padding: 3px 10px; border-radius: 20px;
        background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1);
        color: rgba(255,255,255,.4); letter-spacing: .08em; font-weight: 700;
        text-transform: uppercase;
      }
      .trono-cat-label {
        font-size: .66rem; color: rgba(255,255,255,.25); text-transform: uppercase;
        letter-spacing: .1em; margin-top: 5px;
      }

      /* ── PÓDIO CENTRAL ── */
      .trono-podio {
        display: flex; align-items: flex-end; justify-content: center;
        gap: 16px; padding: 56px 32px 44px;
        position: relative;
      }

      /* Linha de base luminosa */
      .trono-podio::before {
        content: ''; position: absolute; bottom: 44px; left: 8%; right: 8%; height: 1px;
        background: linear-gradient(90deg, transparent, var(--trono-color, #c9a84c) 15%, var(--trono-color, #c9a84c) 85%, transparent);
        opacity: .15;
      }
      /* Reflexo difuso abaixo */
      .trono-podio::after {
        content: ''; position: absolute; bottom: 20px; left: 20%; right: 20%; height: 30px;
        background: radial-gradient(ellipse, var(--trono-color, #c9a84c) 0%, transparent 70%);
        opacity: .06; filter: blur(8px);
      }

      .trono-podio-item {
        display: flex; flex-direction: column; align-items: center;
        text-align: center; position: relative;
        transition: transform .35s cubic-bezier(.34,1.56,.64,1);
      }
      .trono-podio-item:hover { transform: translateY(-8px); }

      /* Card de cada membro */
      .trono-card {
        display: flex; flex-direction: column; align-items: center;
        padding: 24px 20px 20px; border-radius: 18px;
        position: relative; width: 100%;
        transition: box-shadow .3s;
      }

      /* Degrau do pódio */
      .trono-degrau {
        width: 100%; border-radius: 0 0 12px 12px;
        display: flex; align-items: center; justify-content: center;
        font-family: 'Cinzel', serif; font-weight: 900;
        letter-spacing: .1em; color: rgba(255,255,255,.3);
        font-size: .66rem; text-transform: uppercase;
      }

      /* ── 1º Lugar — Centro, dominante ── */
      .trono-pos1 {
        order: 2; flex: 0 0 260px; z-index: 2;
      }
      .trono-pos1 .trono-card {
        background: linear-gradient(150deg, rgba(201,168,76,.2) 0%, rgba(201,168,76,.07) 55%, transparent 100%);
        border: 1px solid rgba(201,168,76,.5);
        box-shadow:
          0 0 0 1px rgba(201,168,76,.1),
          0 0 50px rgba(201,168,76,.15),
          0 20px 60px rgba(0,0,0,.5),
          inset 0 1px 0 rgba(201,168,76,.3);
        padding: 36px 28px 28px;
      }
      .trono-pos1 .trono-card:hover {
        box-shadow:
          0 0 0 1px rgba(201,168,76,.2),
          0 0 80px rgba(201,168,76,.25),
          0 20px 60px rgba(0,0,0,.5),
          inset 0 1px 0 rgba(201,168,76,.4);
      }
      .trono-pos1 .trono-degrau {
        height: 62px; margin-top: 12px;
        background: linear-gradient(180deg, rgba(201,168,76,.24) 0%, rgba(201,168,76,.07) 100%);
        border: 1px solid rgba(201,168,76,.32); border-top: none;
        color: rgba(201,168,76,.75); font-size: .76rem;
      }

      /* ── 2º Lugar — Esquerda ── */
      .trono-pos2 {
        order: 1; flex: 0 0 218px; z-index: 1;
      }
      .trono-pos2 .trono-card {
        background: linear-gradient(155deg, rgba(148,163,184,.12) 0%, rgba(100,116,139,.04) 100%);
        border: 1px solid rgba(148,163,184,.25);
        box-shadow: 0 0 40px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.07);
        padding: 24px 20px 20px;
      }
      .trono-pos2 .trono-degrau {
        height: 46px; margin-top: 10px;
        background: linear-gradient(180deg, rgba(148,163,184,.14) 0%, rgba(100,116,139,.04) 100%);
        border: 1px solid rgba(148,163,184,.2); border-top: none;
        color: rgba(148,163,184,.6); font-size: .66rem;
      }

      /* ── 3º Lugar — Direita ── */
      .trono-pos3 {
        order: 3; flex: 0 0 218px; z-index: 1;
      }
      .trono-pos3 .trono-card {
        background: linear-gradient(155deg, rgba(180,110,60,.12) 0%, rgba(120,60,20,.04) 100%);
        border: 1px solid rgba(180,110,60,.25);
        box-shadow: 0 0 40px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.05);
        padding: 24px 20px 20px;
      }
      .trono-pos3 .trono-degrau {
        height: 46px; margin-top: 10px;
        background: linear-gradient(180deg, rgba(180,110,60,.14) 0%, rgba(120,60,20,.04) 100%);
        border: 1px solid rgba(180,110,60,.2); border-top: none;
        color: rgba(200,130,70,.6); font-size: .66rem;
      }

      /* ── Medalha ── */
      .trono-medal {
        font-size: 2.8rem; line-height: 1; margin-bottom: 12px;
        filter: drop-shadow(0 4px 14px rgba(0,0,0,.7));
        animation: medal-appear .65s cubic-bezier(.34,1.56,.64,1) both;
      }
      .trono-pos1 .trono-medal {
        font-size: 3.8rem;
        filter: drop-shadow(0 8px 24px rgba(201,168,76,.4));
      }
      @keyframes medal-appear {
        from { transform: scale(0) rotate(-20deg); opacity: 0; }
        to   { transform: scale(1) rotate(0deg);   opacity: 1; }
      }

      /* ── Coroa animada ── */
      .trono-coroa {
        position: absolute; top: -28px; left: 50%; transform: translateX(-50%);
        font-size: 1.8rem; animation: coroa-float 3.2s ease-in-out infinite;
        filter: drop-shadow(0 4px 16px rgba(201,168,76,.6));
      }
      @keyframes coroa-float {
        0%,100% { transform: translateX(-50%) translateY(0) rotate(-6deg); }
        50%      { transform: translateX(-50%) translateY(-8px) rotate(6deg); }
      }

      /* ── Avatar ── */
      .trono-avatar {
        width: 58px; height: 58px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-family: 'Cinzel', serif; font-weight: 700; font-size: 1.15rem;
        margin-bottom: 12px; position: relative; flex-shrink: 0;
      }
      .trono-pos1 .trono-avatar {
        width: 82px; height: 82px; font-size: 1.7rem;
        background: radial-gradient(135deg, rgba(201,168,76,.32) 0%, rgba(201,168,76,.08) 100%);
        border: 2px solid rgba(201,168,76,.65);
        box-shadow: 0 0 32px rgba(201,168,76,.3), 0 0 0 5px rgba(201,168,76,.08);
        color: #c9a84c;
      }
      .trono-pos2 .trono-avatar {
        background: radial-gradient(135deg, rgba(148,163,184,.2) 0%, rgba(100,116,139,.06) 100%);
        border: 2px solid rgba(148,163,184,.4); color: #94a3b8;
      }
      .trono-pos3 .trono-avatar {
        background: radial-gradient(135deg, rgba(180,110,60,.2) 0%, rgba(120,60,20,.06) 100%);
        border: 2px solid rgba(180,110,60,.4); color: #cd7f32;
      }

      /* Anel pulsante top1 */
      .trono-pos1 .trono-avatar::after {
        content: ''; position: absolute; inset: -8px; border-radius: 50%;
        border: 1px solid rgba(201,168,76,.22);
        animation: avatar-pulse 2.8s ease-in-out infinite;
      }
      @keyframes avatar-pulse {
        0%,100% { opacity: .6; transform: scale(1); }
        50%      { opacity: 0; transform: scale(1.2); }
      }

      /* ── Nome ── */
      .trono-nome {
        font-family: 'Cinzel', serif; font-weight: 700; font-size: .84rem;
        color: rgba(255,255,255,.72); line-height: 1.25;
        margin-bottom: 6px; word-break: break-word; letter-spacing: .04em;
      }
      .trono-pos1 .trono-nome {
        font-size: 1.08rem; color: #fff; margin-bottom: 8px;
        text-shadow: 0 0 24px rgba(201,168,76,.45), 0 2px 10px rgba(0,0,0,.7);
      }

      /* ── Msgs ── */
      .trono-msgs {
        font-size: .75rem; font-weight: 800; letter-spacing: .07em; color: rgba(255,255,255,.28);
      }
      .trono-pos1 .trono-msgs {
        font-size: 1rem; color: #c9a84c; letter-spacing: .05em;
        text-shadow: 0 0 16px rgba(201,168,76,.45);
      }
      .trono-pos2 .trono-msgs { color: rgba(148,163,184,.68); font-size: .8rem; }
      .trono-pos3 .trono-msgs { color: rgba(180,110,60,.78); font-size: .8rem; }

      /* ── Período ── */
      .trono-periodo {
        font-size: .6rem; color: rgba(255,255,255,.2); margin-top: 5px;
        letter-spacing: .05em;
      }
      .trono-pos1 .trono-periodo { color: rgba(201,168,76,.5); }

      /* ── Vazio ── */
      .trono-vazio {
        padding: 50px; text-align: center; color: rgba(255,255,255,.18);
        font-size: .84rem; font-style: italic;
      }

      /* ── Botão diário ── */
      .trono-diario-btn {
        display: block; margin: 0 28px 24px; padding: 10px 16px;
        border-radius: 10px; border: 1px dashed rgba(201,168,76,.2);
        background: rgba(201,168,76,.03); color: rgba(201,168,76,.55); font-size: .73rem;
        font-weight: 600; letter-spacing: .06em; text-align: center;
        cursor: pointer; transition: all .2s; width: calc(100% - 56px);
      }
      .trono-diario-btn:hover { background: rgba(201,168,76,.08); border-color: rgba(201,168,76,.38); color: var(--gold); }
      /* ── Tabs do Ranking ── */
      .rank-main-tabs {
        display: flex; gap: 0; border-radius: 12px; overflow: hidden;
        background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.07);
        margin-bottom: 24px;
      }
      .rank-main-tab {
        flex: 1; padding: 11px 14px; background: none; border: none;
        color: var(--text-3); font-size: .78rem; font-weight: 600;
        letter-spacing: .05em; cursor: pointer; transition: all .2s;
        display: flex; align-items: center; justify-content: center; gap: 7px;
        text-transform: uppercase; font-family: 'Cinzel', serif;
        border-right: 1px solid rgba(255,255,255,.06);
        position: relative;
      }
      .rank-main-tab:last-child { border-right: none; }
      .rank-main-tab.active {
        color: var(--gold);
        background: linear-gradient(180deg, rgba(201,168,76,.12) 0%, rgba(201,168,76,.04) 100%);
      }
      .rank-main-tab.active::after {
        content: ''; position: absolute; bottom: 0; left: 10%; right: 10%; height: 2px;
        background: var(--gold); border-radius: 2px 2px 0 0;
      }
      .rank-tab-count {
        background: rgba(201,168,76,.2); color: var(--gold);
        font-size: .6rem; padding: 1px 6px; border-radius: 20px;
        font-family: sans-serif;
      }
      /* ── Modal Diário ── */
      .trono-diario-lista {
        display: flex; flex-direction: column; gap: 6px; margin-top: 4px;
      }
      .trono-diario-row {
        display: flex; align-items: center; gap: 10px; padding: 10px 14px;
        border-radius: 8px; background: rgba(255,255,255,.03);
        border: 1px solid rgba(255,255,255,.06);
      }
      .trono-diario-pos { font-size: 1.1rem; flex-shrink: 0; }
      .trono-diario-nome { flex: 1; font-weight: 600; font-size: .88rem; color: var(--text-1); }
      .trono-diario-msgs { font-size: .8rem; color: var(--gold); font-weight: 700; }

      /* ══ RESPONSIVIDADE MOBILE ══ */
      @media (max-width: 640px) {
        /* Cabeçalho da categoria */
        .trono-cat-header {
          padding: 18px 18px 14px;
          flex-direction: column;
          align-items: flex-start;
          gap: 10px;
        }
        .trono-cat-title {
          font-size: .85rem;
          letter-spacing: .08em;
        }
        .trono-cat-label {
          font-size: .6rem;
        }

        /* Pódio: horizontal → vertical (1º, 2º, 3º de cima para baixo) */
        .trono-podio {
          flex-direction: column;
          align-items: stretch;
          gap: 14px;
          padding: 22px 16px 20px;
        }
        /* Remover decorações do pódio horizontal no mobile */
        .trono-podio::before, .trono-podio::after { display: none; }

        /* Reordenar: 1º no topo, 2º no meio, 3º no final */
        .trono-pos1 { order: 1; flex: none; width: 100%; }
        .trono-pos2 { order: 2; flex: none; width: 100%; }
        .trono-pos3 { order: 3; flex: none; width: 100%; }

        /* Items em linha horizontal dentro de cada card mobile */
        .trono-podio-item {
          flex-direction: row;
          align-items: center;
          text-align: left;
          gap: 0;
        }
        .trono-podio-item:hover { transform: none; }

        /* Card mobile: layout horizontal */
        .trono-card {
          flex-direction: row;
          align-items: center;
          padding: 14px 16px !important;
          border-radius: 14px !important;
          gap: 14px;
          width: 100%;
          text-align: left;
        }

        /* Coroa no mobile: acima do avatar */
        .trono-coroa {
          position: static;
          transform: none;
          font-size: 1.2rem;
          animation: none;
          align-self: flex-start;
          margin-right: -8px;
          margin-top: -4px;
        }

        /* Avatar menor no mobile */
        .trono-pos1 .trono-avatar {
          width: 54px !important;
          height: 54px !important;
          font-size: 1.1rem !important;
          flex-shrink: 0;
          box-shadow: 0 0 18px rgba(201,168,76,.25), 0 0 0 3px rgba(201,168,76,.08);
        }
        .trono-avatar {
          width: 46px !important;
          height: 46px !important;
          font-size: .95rem !important;
          flex-shrink: 0;
          margin-bottom: 0 !important;
        }
        /* Remover anel pulsante no mobile (performance) */
        .trono-pos1 .trono-avatar::after { display: none; }

        /* Info à direita do avatar */
        .trono-medal {
          font-size: 1.6rem !important;
          margin-bottom: 0 !important;
          flex-shrink: 0;
          filter: none;
          animation: none;
        }
        .trono-pos1 .trono-medal { font-size: 2rem !important; }

        /* Agrupar nome/msgs/período */
        .trono-nome {
          font-size: .82rem !important;
          margin-bottom: 2px !important;
          color: rgba(255,255,255,.85) !important;
          text-shadow: none !important;
        }
        .trono-pos1 .trono-nome {
          font-size: .92rem !important;
          text-shadow: none !important;
        }
        .trono-msgs {
          font-size: .72rem !important;
          font-weight: 700;
        }
        .trono-pos1 .trono-msgs { font-size: .82rem !important; }
        .trono-periodo {
          font-size: .6rem;
          display: block;
          margin-top: 3px !important;
        }

        /* Degrau: esconder no mobile (não faz sentido vertical) */
        .trono-degrau { display: none; }

        /* Container do conteúdo textual */
        .trono-card > *:not(.trono-medal):not(.trono-avatar) {
          /* não aplicar flex individual — deixar flow normal */
        }

        /* Agrupar avatar + medalha como bloco à esquerda */
        .trono-card {
          display: flex !important;
          flex-direction: row !important;
          flex-wrap: nowrap !important;
        }

        /* Categoria: reduzir gap entre categorias */
        .trono-wrap { gap: 18px; }

        /* Padding menor na categoria */
        .trono-categoria { border-radius: 16px; }
      }

      /* ══ TABLET ══ */
      @media (min-width: 641px) and (max-width: 900px) {
        .trono-pos1 { flex: 0 0 200px; }
        .trono-pos2, .trono-pos3 { flex: 0 0 168px; }
        .trono-podio { padding: 40px 20px 34px; gap: 12px; }
        .trono-cat-header { padding: 20px 24px 16px; }
        .trono-pos1 .trono-avatar { width: 68px; height: 68px; font-size: 1.4rem; }
        .trono-pos1 .trono-nome { font-size: .94rem; }
        .trono-pos1 .trono-card { padding: 28px 22px 22px; }
      }
    `;
    document.head.appendChild(s);
  }

  // ── Carregar dados ──────────────────────────────────────────
  Utils.showLoading(content, 'Carregando rankings...');

  const [rankRes, tronoDB] = await Promise.all([
    db.from('weekly_rankings')
      .select('*, creator:created_by(name,initials)')
      .order('week_start', { ascending: false }),
    _tronLerTop3Banco(),
  ]);

  if (rankRes.error) {
    content.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-3)">Erro: ${rankRes.error.message}</div>`;
    return;
  }

  const todos = rankRes.data || [];
  semanais = todos.filter(r => !r.tipo || r.tipo === 'semanal');
  mensais  = todos.filter(r => r.tipo === 'mensal');
  tronoBanco = tronoDB;

  //── População inicial automática ───────────────────────────
  // Se a tabela msy_recordes_top3 está vazia mas existem rankings,
  // calcula e persiste o Top 3 imediatamente (migração silenciosa).
  const tronoBancoVazio = !tronoBanco.semanal.length && !tronoBanco.mensal.length;
  if (tronoBancoVazio && todos.length > 0) {
    const novoCalc = _tronCalcTop3FromRankings(todos);
    // Grava sem detectar eventos (primeira carga, não gera spam no Jornal)
    await _tronGravarTop3(
      { semanal: novoCalc.semanal, mensal: novoCalc.mensal },
      ['semanal', 'mensal'],
      profile.id
    );
    tronoBanco.semanal = novoCalc.semanal;
    tronoBanco.mensal  = novoCalc.mensal;
    // Invalida cache de insígnias para refletir o novo estado
    window._msyRecordesCache   = null;
    window._msyRecordesCacheTs = 0;
  }

  const medals = ['🥇', '🥈', '🥉'];

  // ── Render: Trono dos Recordes ─────────────────────────────
  function renderTrono() {
    const el = document.getElementById('rankContent');
    if (!el) return;

    const CATS = [
      {
        tipo:   'mensal',
        emoji:  '🩸',
        titulo: 'Domínio Mensal',
        label:  'Maior número de mensagens em um único mês da história',
        color:  '#9f1239',
        shadow: 'rgba(159,18,57,.15)',
      },
      {
        tipo:   'semanal',
        emoji:  '⚡',
        titulo: 'Soberania Semanal',
        label:  'Maior número de mensagens em uma única semana da história',
        color:  '#b45309',
        shadow: 'rgba(180,83,9,.15)',
      },
      {
        tipo:   'diario',
        emoji:  '🔱',
        titulo: 'Marca Perpétua Diária',
        label:  'Maior número de mensagens em um único dia da história',
        color:  '#4c1d95',
        shadow: 'rgba(76,29,149,.15)',
      },
    ];

    const tronoPosEmojis = ['🥇', '🥈', '🥉'];
    const tronoPosLabels = ['1º Lugar', '2º Lugar', '3º Lugar'];

    // Função para obter iniciais do nome
    function getInitials(nome) {
      return nome.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
    }

    el.innerHTML = `<div class="trono-wrap">
      ${CATS.map(cat => {
        const top3 = tronoBanco[cat.tipo] || [];
        // Ordem de renderização: pos2, pos1, pos3 (esquerda, centro, direita)
        const ordered = top3.length > 0
          ? [top3[1], top3[0], top3[2]].filter(Boolean)
          : [];
        const posClasses = top3.length > 0
          ? [top3[1] ? 'trono-pos2' : null, 'trono-pos1', top3[2] ? 'trono-pos3' : null].filter(Boolean)
          : [];
        const posIdxs = top3.length > 0
          ? [top3[1] ? 1 : null, 0, top3[2] ? 2 : null].filter(v => v !== null)
          : [];

        return `
          <div class="trono-categoria" style="--trono-color:${cat.color};--trono-shadow:${cat.shadow}">
            <div class="trono-cat-header">
              <div>
                <div class="trono-cat-title">
                  ${cat.emoji} ${cat.titulo}
                  <span class="trono-cat-badge">Top 3 Histórico</span>
                </div>
                <div class="trono-cat-label">${cat.label}</div>
              </div>
              ${canGerenciarRanking && cat.tipo === 'diario'
                ? `<button class="btn btn-ghost btn-sm trono-diario-add-btn" style="font-size:.72rem;color:${cat.color};border-color:${cat.color}44">
                    <i class="fa-solid fa-plus"></i> Adicionar
                  </button>`
                : ''}
            </div>
            ${top3.length === 0
              ? `<div class="trono-vazio"><i class="fa-solid fa-hourglass" style="opacity:.3;font-size:1.5rem;display:block;margin-bottom:8px"></i>Nenhum recorde registrado ainda.</div>`
              : `<div class="trono-podio">
                  ${ordered.map((item, renderIdx) => {
                    const origIdx = posIdxs[renderIdx];
                    const posClass = posClasses[renderIdx];
                    const isFirst = origIdx === 0;
                    return `
                    <div class="trono-podio-item ${posClass}">
                      <div class="trono-card">
                        ${isFirst ? '<span class="trono-coroa">👑</span>' : ''}
                        <div class="trono-medal">${tronoPosEmojis[origIdx]}</div>
                        <div class="trono-avatar">${getInitials(item.nome)}</div>
                        <div class="trono-nome">${Utils.escapeHtml(item.nome)}</div>
                        <div class="trono-msgs">${Number(item.mensagens).toLocaleString('pt-BR')} msgs</div>
                        ${item.periodo ? `<div class="trono-periodo">${Utils.escapeHtml(item.periodo)}</div>` : ''}
                      </div>
                      <div class="trono-degrau">${tronoPosLabels[origIdx]}</div>
                    </div>`;
                  }).join('')}
                </div>`}
          </div>`;
      }).join('')}
    </div>`;

    // Bind botão diário
    el.querySelectorAll('.trono-diario-add-btn').forEach(btn => {
      btn.addEventListener('click', () => abrirModalDiario());
    });
  }

  // ── Render: Rankings Semanal / Mensal ─────────────────────
  function rankCard(r, idx, offset) {
    const entries  = r.entries || [];
    const top3C    = entries.slice(0, 3);
    const rest     = entries.slice(3);
    const isRecente = offset === 0 && idx === 0;
    return `
      <div class="ranking-card card${isRecente ? ' ranking-card-destaque' : ''}">
        ${isRecente ? '<div class="ranking-card-tag">🔥 Mais Recente</div>' : ''}
        <div class="ranking-card-header">
          <div>
            <div class="ranking-card-periodo">${Utils.formatDate(r.week_start)} — ${Utils.formatDate(r.week_end)}</div>
            ${r.creator ? `<div style="font-size:.7rem;color:var(--text-3);margin-top:2px">por ${Utils.escapeHtml(r.creator.name)}</div>` : ''}
          </div>
          ${canGerenciarRanking ? `<button class="btn btn-ghost btn-sm ranking-del-btn" data-id="${r.id}" title="Excluir"><i class="fa-solid fa-trash" style="color:var(--red-bright);font-size:.75rem"></i></button>` : ''}
        </div>
        ${!entries.length
          ? `<div style="color:var(--text-3);text-align:center;padding:20px;font-size:.82rem">Nenhuma entrada.</div>`
          : `<div class="ranking-podio">
              ${top3C.map((e, i) => `
                <div class="ranking-podio-item${i === 0 ? ' destaque' : ''}">
                  <div class="ranking-podio-medal">${medals[i]}</div>
                  <div class="ranking-podio-nome">${Utils.escapeHtml(e.name)}</div>
                  <div class="ranking-podio-msgs">${e.messages}<span style="font-size:.6rem;opacity:.7"> msgs</span></div>
                </div>`).join('')}
            </div>
            ${rest.length ? `<div class="ranking-lista">${rest.map((e, i) => `
              <div class="ranking-lista-row">
                <span class="ranking-lista-pos">${i + 4}°</span>
                <span class="ranking-lista-nome">${Utils.escapeHtml(e.name)}</span>
                <span class="ranking-lista-msgs">${e.messages}</span>
              </div>`).join('')}</div>` : ''}`}
      </div>`;
  }

  function renderListaRanking() {
    const lista = abaAtiva === 'semanal' ? semanais : mensais;
    const page  = abaAtiva === 'semanal' ? pageSem  : pageMen;
    const paginated = Paginator.slice(lista, page, PER_PAGE);
    const offset    = (page - 1) * PER_PAGE;

    const el = document.getElementById('rankContent');
    if (!el) return;

    el.innerHTML = paginated.length
      ? paginated.map((r, i) => rankCard(r, i, offset)).join('') + '<div id="rankPaginator"></div>'
      : `<div style="text-align:center;padding:60px;color:var(--text-3)">
          <i class="fa-solid fa-ranking-star" style="font-size:2.5rem;opacity:.3;margin-bottom:14px;display:block"></i>
          Nenhum ranking cadastrado.
        </div><div id="rankPaginator"></div>`;

    Paginator.render('rankPaginator', lista.length, page, PER_PAGE, p => {
      if (abaAtiva === 'semanal') pageSem = p; else pageMen = p;
      renderListaRanking();
    });

    el.querySelectorAll('.ranking-del-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Excluir este ranking?')) return;
        const { error } = await db.from('weekly_rankings').delete().eq('id', btn.dataset.id);
        if (!error) {
          if (abaAtiva === 'semanal') semanais = semanais.filter(r => r.id !== btn.dataset.id);
          else mensais = mensais.filter(r => r.id !== btn.dataset.id);
          Utils.showToast('Ranking removido.');
          renderListaRanking();
        } else {
          Utils.showToast('Erro.', 'error');
        }
      });
    });
  }

  // ── Troca de aba ─────────────────────────────────────────
  function ativarAba(tipo) {
    abaAtiva = tipo;
    document.querySelectorAll('.rank-main-tab').forEach(b => b.classList.toggle('active', b.dataset.aba === tipo));
    if (tipo === 'trono') renderTrono();
    else renderListaRanking();
  }

  // ── Modal: Novo Ranking (Semanal / Mensal) ────────────────
  function abrirModal(tipo) {
    let modal = document.getElementById('rankModal');
    if (!modal) { modal = document.createElement('div'); modal.id = 'rankModal'; modal.className = 'modal-overlay'; document.body.appendChild(modal); }

    modal.innerHTML = `
      <div class="modal-box" style="max-width:520px">
        <div class="modal-header">
          <h3 class="font-cinzel"><i class="fa-solid fa-plus" style="color:var(--gold);margin-right:8px"></i>Novo Ranking ${tipo === 'semanal' ? 'Semanal' : 'Mensal'}</h3>
          <button class="modal-close" id="rankModalClose"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body" style="padding:24px;display:flex;flex-direction:column;gap:14px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="form-group"><label class="form-label">Início</label><input type="date" class="form-input" id="rankStart"></div>
            <div class="form-group"><label class="form-label">Fim</label><input type="date" class="form-input" id="rankEnd"></div>
          </div>
          <div>
            <label class="form-label" style="margin-bottom:6px;display:block">Participantes</label>
            <div id="rankEntries" style="display:flex;flex-direction:column;gap:6px"></div>
            <button class="btn btn-ghost btn-sm" id="rankAddRow" style="margin-top:8px"><i class="fa-solid fa-plus"></i> Linha</button>
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end">
            <button class="btn btn-ghost" id="rankCancelBtn">Cancelar</button>
            <button class="btn btn-gold" id="rankSaveBtn"><i class="fa-solid fa-floppy-disk"></i> Salvar</button>
          </div>
        </div>
      </div>`;

    requestAnimationFrame(() => modal.classList.add('open'));
    const close = () => modal.classList.remove('open');
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    document.getElementById('rankModalClose').addEventListener('click', close);
    document.getElementById('rankCancelBtn').addEventListener('click', close);

    const addRow = (n = '', m = '') => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;align-items:center';
      row.innerHTML = `<input type="text" class="form-input rank-name" placeholder="Nome" value="${Utils.escapeHtml(n)}" style="flex:2;padding:8px 10px;font-size:.85rem">
        <input type="number" class="form-input rank-msgs" placeholder="Msgs" value="${m}" min="0" style="flex:1;padding:8px 10px;font-size:.85rem">
        <button class="btn btn-ghost btn-sm" style="padding:8px;flex-shrink:0"><i class="fa-solid fa-times" style="color:var(--red-bright)"></i></button>`;
      row.querySelector('button').addEventListener('click', () => row.remove());
      document.getElementById('rankEntries').appendChild(row);
    };
    for (let i = 0; i < 5; i++) addRow();
    document.getElementById('rankAddRow').addEventListener('click', () => addRow());

    document.getElementById('rankSaveBtn').addEventListener('click', async () => {
      const start = document.getElementById('rankStart').value;
      const end   = document.getElementById('rankEnd').value;
      if (!start || !end) { Utils.showToast('Informe as datas.', 'error'); return; }

      const entries = [...document.querySelectorAll('#rankEntries > div')]
        .map(r => ({ name: r.querySelector('.rank-name').value.trim(), messages: parseInt(r.querySelector('.rank-msgs').value) || 0 }))
        .filter(e => e.name)
        .sort((a, b) => b.messages - a.messages);

      if (!entries.length) { Utils.showToast('Adicione participantes.', 'error'); return; }

      const btn = document.getElementById('rankSaveBtn');
      btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Salvando...';

      const { error } = await db.from('weekly_rankings').insert({
        week_start: start, week_end: end, entries, tipo, created_by: profile.id
      });

      if (error) {
        Utils.showToast('Erro ao salvar.', 'error');
        btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar';
        return;
      }

      Utils.showToast('Ranking salvo!');
      close();

      // Recarregar todos os rankings e atualizar Trono
      const { data: fresh } = await db.from('weekly_rankings')
        .select('*, creator:created_by(name,initials)')
        .order('week_start', { ascending: false });

      const t = fresh || [];
      semanais = t.filter(r => !r.tipo || r.tipo === 'semanal');
      mensais  = t.filter(r => r.tipo === 'mensal');

      // Atualizar Top 3 e Jornal MSY
      const { novoCalc, eventos } = await _tronAtualizarTop3(t, profile.id);
      if (novoCalc) {
        tronoBanco.semanal = novoCalc.semanal;
        tronoBanco.mensal  = novoCalc.mensal;
      }
      if (eventos.length > 0) {
        Utils.showToast(`🏆 Trono dos Recordes atualizado!`);
      }

      // Atualizar contadores nas tabs
      document.querySelector('.rank-main-tab[data-aba="semanal"] .rank-tab-count')?.setAttribute('data-n', semanais.length);
      document.querySelectorAll('.rank-main-tab').forEach(t2 => {
        const cnt = t2.querySelector('.rank-tab-count');
        if (!cnt) return;
        if (t2.dataset.aba === 'semanal') cnt.textContent = semanais.length;
        if (t2.dataset.aba === 'mensal')  cnt.textContent = mensais.length;
      });

      abaAtiva = tipo;
      if (tipo === 'semanal') pageSem = 1; else pageMen = 1;
      ativarAba(tipo);
    });
  }

  // ── Modal: Registro Diário (manual) ──────────────────────
  function abrirModalDiario() {
    let modal = document.getElementById('tronoDiarioModal');
    if (!modal) { modal = document.createElement('div'); modal.id = 'tronoDiarioModal'; modal.className = 'modal-overlay'; document.body.appendChild(modal); }

    const top3Atual = (tronoBanco.diario || []).slice().sort((a, b) => a.posicao - b.posicao);

    modal.innerHTML = `
      <div class="modal-box" style="max-width:500px">
        <div class="modal-header">
          <h3 class="font-cinzel" style="display:flex;align-items:center;gap:8px">
            <span style="color:#7c3aed">🔱</span> Marca Perpétua Diária
          </h3>
          <button class="modal-close" id="tronoDiarioClose"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body" style="padding:20px;display:flex;flex-direction:column;gap:16px">
          ${top3Atual.length ? `
            <div>
              <div style="font-size:.68rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Recordes Atuais</div>
              <div class="trono-diario-lista">
                ${top3Atual.map(r => `
                  <div class="trono-diario-row">
                    <div class="trono-diario-pos">${['🥇','🥈','🥉'][r.posicao - 1]}</div>
                    <div class="trono-diario-nome">${Utils.escapeHtml(r.nome)}</div>
                    <div class="trono-diario-msgs">${Number(r.mensagens).toLocaleString('pt-BR')} msgs</div>
                    ${canGerenciarRanking ? `<button class="btn btn-ghost btn-sm trono-del-diario" data-pos="${r.posicao}" style="padding:4px 8px;color:var(--red-bright)"><i class="fa-solid fa-trash" style="font-size:.65rem"></i></button>` : ''}
                  </div>`).join('')}
              </div>
            </div>` : ''}
          <div style="border-top:1px solid var(--border-faint);padding-top:14px">
            <div style="font-size:.68rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">Adicionar Registro</div>
            <div style="display:flex;flex-direction:column;gap:10px">
              <div class="form-group">
                <label class="form-label">Nome do Membro *</label>
                <input type="text" class="form-input" id="tronoDiarioNome" placeholder="Nome exato do membro">
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div class="form-group">
                  <label class="form-label">Mensagens *</label>
                  <input type="number" class="form-input" id="tronoDiarioMsgs" placeholder="Ex: 850" min="1">
                </div>
                <div class="form-group">
                  <label class="form-label">Data</label>
                  <input type="date" class="form-input" id="tronoDiarioData" value="${new Date().toISOString().split('T')[0]}">
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Observação <span style="color:var(--text-3);font-weight:400">(opcional)</span></label>
                <input type="text" class="form-input" id="tronoDiarioObs" placeholder="Ex: Dia de maratona de mensagens">
              </div>
            </div>
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end">
            <button class="btn btn-ghost" id="tronoDiarioCancelar">Cancelar</button>
            <button class="btn btn-gold" id="tronoDiarioSalvar"><i class="fa-solid fa-floppy-disk"></i> Salvar</button>
          </div>
        </div>
      </div>`;

    requestAnimationFrame(() => modal.classList.add('open'));
    const close = () => modal.classList.remove('open');
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    document.getElementById('tronoDiarioClose').addEventListener('click', close);
    document.getElementById('tronoDiarioCancelar').addEventListener('click', close);

    // Deletar registro diário
    modal.querySelectorAll('.trono-del-diario').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pos = parseInt(btn.dataset.pos);
        if (!confirm(`Remover o ${pos}º lugar do Trono Diário?`)) return;
        const { error } = await db.from('msy_recordes_top3').delete().eq('tipo', 'diario').eq('posicao', pos);
        if (!error) {
          tronoBanco.diario = tronoBanco.diario.filter(r => r.posicao !== pos);
          // Reindexar posições
          tronoBanco.diario.forEach((r, i) => r.posicao = i + 1);
          Utils.showToast('Registro removido.');
          close();
          renderTrono();
          abrirModalDiario();
        } else {
          Utils.showToast('Erro ao remover.', 'error');
        }
      });
    });

    document.getElementById('tronoDiarioSalvar').addEventListener('click', async () => {
      const nome   = document.getElementById('tronoDiarioNome').value.trim();
      const msgs   = parseInt(document.getElementById('tronoDiarioMsgs').value) || 0;
      const dataV  = document.getElementById('tronoDiarioData').value;
      const obs    = document.getElementById('tronoDiarioObs').value.trim() || null;

      if (!nome) { Utils.showToast('Informe o nome do membro.', 'error'); return; }
      if (!msgs) { Utils.showToast('Informe a quantidade de mensagens.', 'error'); return; }

      // Construir novo top3 diário
      const novoEntry = { nome, mensagens: msgs, periodo: dataV || null, data_ref: dataV || null, observacao: obs };
      const listaAtual = (tronoBanco.diario || []).slice();

      // Verificar se o membro já está no top3
      const normNome = _tronNormalize(nome);
      const idxExistente = listaAtual.findIndex(r => _tronNormalize(r.nome) === normNome);
      if (idxExistente >= 0) {
        if (msgs <= listaAtual[idxExistente].mensagens) {
          Utils.showToast('Este membro já possui um recorde maior ou igual.', 'error');
          return;
        }
        listaAtual.splice(idxExistente, 1);
      }

      listaAtual.push(novoEntry);
      // Ordenar por mensagens desc, empate por data_ref asc
      listaAtual.sort((a, b) => {
        if (b.mensagens !== a.mensagens) return b.mensagens - a.mensagens;
        if (a.data_ref && b.data_ref) return a.data_ref.localeCompare(b.data_ref);
        return 0;
      });
      const novoTop3 = listaAtual.slice(0, 3).map((item, i) => ({ ...item, posicao: i + 1 }));

      const btn = document.getElementById('tronoDiarioSalvar');
      btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';

      // Detectar eventos antes de salvar
      const eventosAntes = _tronDetectarEventos(tronoBanco.diario, novoTop3, 'diario');

      // Gravar no banco
      await _tronGravarTop3({ diario: novoTop3 }, ['diario'], profile.id);

      // Publicar no Jornal MSY
      if (eventosAntes.length > 0) {
        await _tronPublicarJornal(eventosAntes, profile.id);
        Utils.showToast('🏆 Recorde registrado e Jornal atualizado!');
      } else {
        Utils.showToast('Registro adicionado ao Trono!');
      }

      // Invalidar cache
      window._msyRecordesCache = null;
      window._msyRecordesCacheTs = 0;

      tronoBanco.diario = novoTop3;
      close();
      renderTrono();
    });
  }

  // ── Layout principal ──────────────────────────────────────
  content.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-header-title">Ranking de Mensagens</div>
        <div class="page-header-sub">Histórico e Trono dos Recordes da Masayoshi Order</div>
      </div>
      ${canGerenciarRanking ? `<div class="ranking-add-btns">
        <button class="btn btn-ghost btn-sm" id="newRankMenBtn"><i class="fa-solid fa-plus"></i> Mensal</button>
        <button class="btn btn-gold btn-sm" id="newRankSemBtn"><i class="fa-solid fa-plus"></i> Semanal</button>
      </div>` : ''}
    </div>

    <div class="rank-main-tabs">
      <button class="rank-main-tab active" data-aba="trono">
        🏆 Trono dos Recordes
      </button>
      <button class="rank-main-tab" data-aba="mensal">
        <i class="fa-solid fa-calendar-days"></i> Mensal
        <span class="rank-tab-count">${mensais.length}</span>
      </button>
      <button class="rank-main-tab" data-aba="semanal">
        <i class="fa-solid fa-calendar-week"></i> Semanal
        <span class="rank-tab-count">${semanais.length}</span>
      </button>
    </div>

    <div id="rankContent"></div>`;

  document.querySelectorAll('.rank-main-tab').forEach(btn => {
    btn.addEventListener('click', () => ativarAba(btn.dataset.aba));
  });
  document.getElementById('newRankSemBtn')?.addEventListener('click', () => abrirModal('semanal'));
  document.getElementById('newRankMenBtn')?.addEventListener('click', () => abrirModal('mensal'));

  // Inicia sempre no Trono dos Recordes
  ativarAba('trono');
}

/* ============================================================
   ROUTER — Módulos v4.1
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  const routes = {
    busca:      initBusca,
    feed:       initFeed,
    // presencas: removida — presença centralizada em Eventos
    // desempenho: gerenciado por modules4.js
    onboarding: initOnboarding,
    ranking:    initRanking,
    mensalidade: typeof initMensalidade !== 'undefined' ? initMensalidade : undefined,
  };
  routes[page]?.();
  // Patch de badges no modal de membros (sempre que membros.html for carregado)
  patchMemberModal();
});
