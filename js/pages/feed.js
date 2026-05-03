/* ============================================================
   MSY PORTAL — PAGES/FEED.JS
   Módulo ES — Feed da Ordem.
   Depende de window.MSY (bridge populado por app.js).
   MSYPerms: const global de modules3.js, acessível pelo escopo global.
   ============================================================ */

const { db, Utils, renderSidebar, renderTopBar } = window.MSY;

/* Paginator copiado inline para tornar o módulo auto-contido. */
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
      try {
        let error;
        if (isEdit) {
          ({ error } = await db.from('feed_atividade')
            .update({ titulo, descricao, link, tipo, icone, updated_at: new Date().toISOString() })
            .eq('id', itemEdit.id));
        } else {
          ({ error } = await db.from('feed_atividade')
            .insert({ titulo, descricao, link, tipo, icone, autor_id: profile.id }));
        }
        if (error) throw error;
        Utils.showToast(isEdit?'Publicação atualizada!':'Publicado no feed!');
        close(); page=1; await carregarFeed();
      } catch (err) {
        console.error('[MSY][feed] Erro ao salvar publicação:', err);
        Utils.showToast('Erro ao salvar.','error');
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-${isEdit?'floppy-disk':'paper-plane'}"></i> ${isEdit?'Salvar':'Publicar'}`;
      }
    });
  }

  async function carregarFeed() {
    const feedList = document.getElementById('feedList');
    if (feedList) feedList.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:160px;color:var(--text-3);gap:12px">
        <i class="fa-solid fa-circle-notch fa-spin" style="color:var(--gold)"></i> Carregando...
      </div>`;
    try {
      const { data, error } = await db.from('feed_atividade')
        .select('*, autor:autor_id(name,initials,color,avatar_url)')
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      allFeed = data||[];
      const countEl = document.getElementById('feedTotalCount');
      if (countEl) countEl.textContent = allFeed.length;
      renderFeed();
    } catch (err) {
      console.error('[MSY][feed] Erro ao carregar feed:', err);
      if (feedList) feedList.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-3)">Erro ao carregar feed.</div>`;
      Utils.showToast('Erro ao carregar feed.', 'error');
    }
  }

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
        if (!error) {
          Utils.showToast('Removido.');
          allFeed = allFeed.filter(f => f.id !== btn.dataset.id);
          const c = document.getElementById('feedTotalCount');
          if (c) c.textContent = allFeed.length;
          renderFeed();
        } else {
          Utils.showToast('Erro ao remover.','error');
        }
      });
    });
  }

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

initFeed().catch(err => {
  console.error('[MSY][feed] Erro ao inicializar página:', err);
  window.MSY.Utils.showToast?.('Erro ao carregar feed.', 'error');
});
