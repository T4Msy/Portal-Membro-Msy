/* ============================================================
   MSY PORTAL — PAGES/BIBLIOTECA.JS
   Módulo ES — Biblioteca de Conhecimento.
   Depende de window.MSY (bridge populado por app.js).
   MSYPerms: const global de modules3.js, acessível pelo escopo global.
   ============================================================ */

const { db, Utils, renderSidebar, renderTopBar } = window.MSY;

async function initBiblioteca() {
  const profile = await renderSidebar('biblioteca');
  if (!profile) return;
  await renderTopBar('Biblioteca', profile);

  const content    = document.getElementById('pageContent');
  const isDiretoria = profile.tier === 'diretoria';
  const canGerenciarBib = isDiretoria || await MSYPerms.check(profile.id, profile.tier, 'gerenciar_biblioteca');

  let allConteudos   = [];
  let categoriaAtiva = 'Todas';

  const CATEGORIAS = ['Todas','Geral','Curso','PDF','Artigo','Vídeo','Ferramenta','Outro'];

  const CATEGORIA_ICONS = {
    'Geral':      'fa-solid fa-book-open',
    'Curso':      'fa-solid fa-graduation-cap',
    'PDF':        'fa-regular fa-file-pdf',
    'Artigo':     'fa-solid fa-newspaper',
    'Vídeo':      'fa-solid fa-play-circle',
    'Ferramenta': 'fa-solid fa-wrench',
    'Outro':      'fa-solid fa-box',
  };

  const CATEGORIA_COLORS = {
    'Geral':      'var(--gold)',
    'Curso':      '#3b82f6',
    'PDF':        '#ef4444',
    'Artigo':     '#10b981',
    'Vídeo':      '#8b5cf6',
    'Ferramenta': '#f59e0b',
    'Outro':      'var(--text-3)',
  };

  function isValidUrl(url) {
    try { new URL(url); return url.startsWith('http://') || url.startsWith('https://'); }
    catch { return false; }
  }

  function renderModal() {
    let modal = document.getElementById('bibModal');
    if (modal) { modal.classList.add('open'); return; }

    modal = document.createElement('div');
    modal.id = 'bibModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-box" style="max-width:520px">
        <div class="modal-header">
          <h3 class="font-cinzel"><i class="fa-solid fa-plus" style="color:var(--gold);margin-right:8px"></i>Adicionar Conteúdo</h3>
          <button class="modal-close" id="bibModalClose"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:16px;padding:24px">
          <div class="form-group">
            <label class="form-label">Título <span style="color:var(--red-bright)">*</span></label>
            <input type="text" class="form-input" id="bibTitulo" placeholder="Ex: Curso de Liderança Estratégica" maxlength="120">
          </div>
          <div class="form-group">
            <label class="form-label">Descrição <span style="color:var(--red-bright)">*</span></label>
            <textarea class="form-input" id="bibDescricao" rows="3" placeholder="Descreva brevemente o conteúdo..."></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Link Externo <span style="color:var(--red-bright)">*</span></label>
            <input type="url" class="form-input" id="bibLink" placeholder="https://...">
            <div id="bibLinkError" style="display:none;color:var(--red-bright);font-size:.78rem;margin-top:4px">
              <i class="fa-solid fa-triangle-exclamation"></i> URL inválida. Use https://...
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Categoria</label>
            <select class="form-input form-select" id="bibCategoria">
              ${['Geral','Curso','PDF','Artigo','Vídeo','Ferramenta','Outro'].map(c =>
                `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
          <button class="btn btn-gold" id="bibSaveBtn" style="margin-top:4px">
            <i class="fa-solid fa-floppy-disk"></i> Salvar Conteúdo
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('open'));

    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
    document.getElementById('bibModalClose').addEventListener('click', () => modal.classList.remove('open'));

    document.getElementById('bibSaveBtn').addEventListener('click', async () => {
      const titulo    = document.getElementById('bibTitulo').value.trim();
      const descricao = document.getElementById('bibDescricao').value.trim();
      const link      = document.getElementById('bibLink').value.trim();
      const categoria = document.getElementById('bibCategoria').value;
      const linkError = document.getElementById('bibLinkError');

      linkError.style.display = 'none';

      if (!titulo || !descricao || !link) { Utils.showToast('Preencha todos os campos obrigatórios.', 'error'); return; }
      if (!isValidUrl(link)) { linkError.style.display = 'block'; return; }

      const btn = document.getElementById('bibSaveBtn');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Salvando...';

      try {
        const { error } = await db.from('biblioteca_conteudos').insert({
          titulo, descricao, link, categoria, criado_por: profile.id
        });
        if (error) throw error;
      } catch (err) {
        console.error('[MSY][biblioteca] Erro ao salvar conteúdo:', err);
        Utils.showToast('Erro ao salvar conteúdo.', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar Conteúdo';
        return;
      }

      Utils.showToast('Conteúdo adicionado com sucesso!');
      modal.classList.remove('open');

      try {
        await db.rpc('notify_member', {
          p_user_id: null,
          p_message: `📚 Novo conteúdo na Biblioteca: "${titulo}"`,
          p_type:    'info',
          p_icon:    '📚',
          p_link:    'biblioteca.html'
        });
      } catch (err) {
        console.warn('[MSY][biblioteca] Falha ao notificar novo conteúdo:', err);
      }

      await carregarConteudos();
    });
  }

  function renderCards(lista) {
    const grid = document.getElementById('bibGrid');
    if (!lista || lista.length === 0) {
      grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-3)">
          <i class="fa-solid fa-book-open" style="font-size:2.5rem;margin-bottom:16px;display:block;opacity:0.3"></i>
          <p style="font-size:0.9rem">Nenhum conteúdo ${categoriaAtiva !== 'Todas' ? 'nesta categoria' : 'na biblioteca'} ainda.</p>
          ${canGerenciarBib ? `<button class="btn btn-gold" id="emptyAddBtn" style="margin-top:16px"><i class="fa-solid fa-plus"></i> Adicionar primeiro conteúdo</button>` : ''}
        </div>
      `;
      document.getElementById('emptyAddBtn')?.addEventListener('click', renderModal);
      return;
    }

    grid.innerHTML = lista.map(c => {
      const iconClass = CATEGORIA_ICONS[c.categoria] || 'fa-solid fa-file';
      const color     = CATEGORIA_COLORS[c.categoria] || 'var(--gold)';
      const domain    = (() => { try { return new URL(c.link).hostname; } catch { return ''; } })();

      return `
        <div class="bib-card" data-id="${c.id}">
          <div class="bib-card-icon" style="color:${color}">
            <i class="${iconClass}"></i>
          </div>
          <div class="bib-card-body">
            <div class="bib-card-cat" style="color:${color}">${c.categoria}</div>
            <div class="bib-card-title">${Utils.escapeHtml(c.titulo)}</div>
            <div class="bib-card-desc">${Utils.escapeHtml(c.descricao)}</div>
            <div class="bib-card-meta">
              <span><i class="fa-solid fa-link"></i> ${Utils.escapeHtml(domain)}</span>
              <span><i class="fa-solid fa-calendar"></i> ${Utils.formatDate(c.created_at)}</span>
            </div>
          </div>
          <div class="bib-card-actions">
            <a href="${Utils.escapeHtml(c.link)}" target="_blank" rel="noopener noreferrer"
               class="btn btn-primary btn-sm">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> Acessar
            </a>
            ${isDiretoria ? `
              <button class="btn btn-ghost btn-sm bib-edit-btn"
                data-id="${c.id}"
                data-titulo="${Utils.escapeHtml(c.titulo)}"
                data-descricao="${Utils.escapeHtml(c.descricao)}"
                data-link="${Utils.escapeHtml(c.link)}"
                data-categoria="${c.categoria}"
                title="Editar">
                <i class="fa-solid fa-pen" style="color:var(--gold)"></i>
              </button>
              ${canGerenciarBib ? `<button class="btn btn-ghost btn-sm bib-delete-btn" data-id="${c.id}" title="Remover">
                <i class="fa-solid fa-trash" style="color:var(--red-bright)"></i>
              </button>` : ''}` : ''}
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.bib-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Remover este conteúdo da biblioteca?')) return;
        const id = btn.dataset.id;
        try {
          const { error } = await db.from('biblioteca_conteudos').delete().eq('id', id);
          if (error) throw error;
          Utils.showToast('Conteúdo removido.');
          await carregarConteudos();
        } catch (err) {
          console.error('[MSY][biblioteca] Erro ao remover conteúdo:', err);
          Utils.showToast('Erro ao remover.', 'error');
        }
      });
    });

    grid.querySelectorAll('.bib-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        renderModalEditar({
          id:        btn.dataset.id,
          titulo:    btn.dataset.titulo,
          descricao: btn.dataset.descricao,
          link:      btn.dataset.link,
          categoria: btn.dataset.categoria,
        });
      });
    });
  }

  function renderModalEditar(item) {
    let modal = document.getElementById('bibEditModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'bibEditModal';
      modal.className = 'modal-overlay';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-box" style="max-width:520px">
        <div class="modal-header">
          <h3 class="font-cinzel"><i class="fa-solid fa-pen" style="color:var(--gold);margin-right:8px"></i>Editar Conteúdo</h3>
          <button class="modal-close" id="bibEditClose"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:16px;padding:24px">
          <div class="form-group">
            <label class="form-label">Título <span style="color:var(--red-bright)">*</span></label>
            <input type="text" class="form-input" id="bibEditTitulo" value="${Utils.escapeHtml(item.titulo)}" maxlength="120">
          </div>
          <div class="form-group">
            <label class="form-label">Descrição <span style="color:var(--red-bright)">*</span></label>
            <textarea class="form-input" id="bibEditDescricao" rows="3">${Utils.escapeHtml(item.descricao)}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Link Externo <span style="color:var(--red-bright)">*</span></label>
            <input type="url" class="form-input" id="bibEditLink" value="${Utils.escapeHtml(item.link)}">
          </div>
          <div class="form-group">
            <label class="form-label">Categoria</label>
            <select class="form-input form-select" id="bibEditCategoria">
              ${['Geral','Curso','PDF','Artigo','Vídeo','Ferramenta','Outro'].map(c =>
                `<option value="${c}" ${item.categoria===c?'selected':''}>${c}</option>`).join('')}
            </select>
          </div>
          <button class="btn btn-gold" id="bibEditSaveBtn" style="margin-top:4px">
            <i class="fa-solid fa-floppy-disk"></i> Salvar Alterações
          </button>
        </div>
      </div>`;

    requestAnimationFrame(() => modal.classList.add('open'));
    const close = () => modal.classList.remove('open');
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    document.getElementById('bibEditClose').addEventListener('click', close);

    document.getElementById('bibEditSaveBtn').addEventListener('click', async () => {
      const titulo    = document.getElementById('bibEditTitulo').value.trim();
      const descricao = document.getElementById('bibEditDescricao').value.trim();
      const link      = document.getElementById('bibEditLink').value.trim();
      const categoria = document.getElementById('bibEditCategoria').value;

      if (!titulo || !descricao || !link) { Utils.showToast('Preencha todos os campos.', 'error'); return; }
      if (!isValidUrl(link)) { Utils.showToast('URL inválida. Use https://...', 'error'); return; }

      const btn = document.getElementById('bibEditSaveBtn');
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Salvando...';

      try {
        const { error } = await db.from('biblioteca_conteudos')
          .update({ titulo, descricao, link, categoria, updated_at: new Date().toISOString() })
          .eq('id', item.id);
        if (error) throw error;
      } catch (err) {
        console.error('[MSY][biblioteca] Erro ao editar conteúdo:', err);
        Utils.showToast('Erro ao salvar alterações.', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar Alterações';
        return;
      }

      Utils.showToast('Conteúdo atualizado!');
      close();
      await carregarConteudos();
    });
  }

  function filtrar(cat) {
    categoriaAtiva = cat;
    document.querySelectorAll('.bib-filter-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.cat === cat);
    });
    const filtrados = cat === 'Todas' ? allConteudos : allConteudos.filter(c => c.categoria === cat);
    renderCards(filtrados);
  }

  async function carregarConteudos() {
    Utils.showLoading(document.getElementById('bibGrid'), 'Carregando biblioteca...');

    try {
      const { data, error } = await db
        .from('biblioteca_conteudos')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      allConteudos = data || [];
    } catch (err) {
      console.error('[MSY][biblioteca] Erro ao carregar conteúdos:', err);
      document.getElementById('bibGrid').innerHTML = `<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--text-3)">
        <i class="fa-solid fa-triangle-exclamation" style="color:var(--red-bright);font-size:1.5rem;margin-bottom:12px;display:block"></i>
        Erro ao carregar conteúdos.<br>
        <small style="color:var(--text-3);font-size:.75rem;margin-top:8px;display:block">${err.message || 'Verifique se o schema_modules.sql foi executado no Supabase.'}</small>
      </div>`;
      return;
    }

    document.getElementById('bibCount').textContent = `${allConteudos.length} conteúdo${allConteudos.length !== 1 ? 's' : ''}`;
    filtrar(categoriaAtiva);
  }

  content.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-header-title">Biblioteca de Conhecimento</div>
        <div class="page-header-sub">Materiais, cursos e recursos da Masayoshi Order</div>
      </div>
      ${canGerenciarBib ? `<button class="btn btn-gold" id="bibAddBtn">
        <i class="fa-solid fa-plus"></i> Adicionar Conteúdo
      </button>` : ''}
    </div>

    <div class="bib-filters">
      ${CATEGORIAS.map(cat => `
        <button class="bib-filter-btn${cat === 'Todas' ? ' active' : ''}" data-cat="${cat}">
          ${cat === 'Todas' ? '<i class="fa-solid fa-border-all"></i> ' : `<i class="${CATEGORIA_ICONS[cat] || 'fa-solid fa-file'}"></i> `}${cat}
        </button>
      `).join('')}
      <span id="bibCount" style="margin-left:auto;color:var(--text-3);font-size:0.8rem;align-self:center">...</span>
    </div>

    <div class="bib-grid" id="bibGrid">
      <div style="grid-column:1/-1;display:flex;align-items:center;justify-content:center;height:200px;color:var(--text-3)">
        <i class="fa-solid fa-circle-notch fa-spin" style="font-size:1.5rem;color:var(--gold);margin-right:12px"></i>
        Carregando...
      </div>
    </div>
  `;

  document.querySelectorAll('.bib-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => filtrar(btn.dataset.cat));
  });

  if (canGerenciarBib) document.getElementById('bibAddBtn')?.addEventListener('click', renderModal);

  await carregarConteudos();
}

initBiblioteca().catch(err => {
  console.error('[MSY][biblioteca] Erro ao inicializar página:', err);
  window.MSY.Utils.showToast?.('Erro ao carregar biblioteca.', 'error');
});
