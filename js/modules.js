/* ============================================================
   MSY PORTAL — MODULES.JS v1.0
   Módulos: Biblioteca, Premiações, Insígnias, Estrutura da Ordem
   Supabase Integration | Vanilla JS
   ============================================================ */

'use strict';

/* ============================================================
   PAGE: BIBLIOTECA DE CONHECIMENTO
   ============================================================ */
async function initBiblioteca() {
  const profile = await renderSidebar('biblioteca');
  if (!profile) return;
  await renderTopBar('Biblioteca', profile);

  const content    = document.getElementById('pageContent');
  const isDiretoria = profile.tier === 'diretoria';
  const canGerenciarBib = isDiretoria || await MSYPerms.check(profile.id, profile.tier, 'gerenciar_biblioteca');

  // Estado local
  let allConteudos  = [];
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

  // Valida URL
  function isValidUrl(url) {
    try { new URL(url); return url.startsWith('http://') || url.startsWith('https://'); }
    catch { return false; }
  }

  // Render do modal de adicionar conteúdo
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

      // Notificar todos os membros
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

  // Render dos cards
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

    // Delete handlers
    grid.querySelectorAll('.bib-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!(await MSYConfirm.show('Remover este conteúdo da biblioteca?', { title: 'Remover conteúdo' }))) return;
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

    // Edit handlers (apenas diretoria)
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

  // Modal de edicao de conteudo (apenas diretoria)
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

  // Filtrar e renderizar
  function filtrar(cat) {
    categoriaAtiva = cat;
    document.querySelectorAll('.bib-filter-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.cat === cat);
    });
    const filtrados = cat === 'Todas' ? allConteudos : allConteudos.filter(c => c.categoria === cat);
    renderCards(filtrados);
  }

  // Carregar do banco
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

    // Atualizar contador
    document.getElementById('bibCount').textContent = `${allConteudos.length} conteúdo${allConteudos.length !== 1 ? 's' : ''}`;

    filtrar(categoriaAtiva);
  }

  // Renderizar layout principal
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

    <!-- Filtros de categoria -->
    <div class="bib-filters">
      ${CATEGORIAS.map(cat => `
        <button class="bib-filter-btn${cat === 'Todas' ? ' active' : ''}" data-cat="${cat}">
          ${cat === 'Todas' ? '<i class="fa-solid fa-border-all"></i> ' : `<i class="${CATEGORIA_ICONS[cat] || 'fa-solid fa-file'}"></i> `}${cat}
        </button>
      `).join('')}
      <span id="bibCount" style="margin-left:auto;color:var(--text-3);font-size:0.8rem;align-self:center">...</span>
    </div>

    <!-- Grid de conteúdos -->
    <div class="bib-grid" id="bibGrid">
      <div style="grid-column:1/-1;display:flex;align-items:center;justify-content:center;height:200px;color:var(--text-3)">
        <i class="fa-solid fa-circle-notch fa-spin" style="font-size:1.5rem;color:var(--gold);margin-right:12px"></i>
        Carregando...
      </div>
    </div>
  `;

  // Bind filtros
  document.querySelectorAll('.bib-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => filtrar(btn.dataset.cat));
  });

  // Bind botão adicionar
  if (canGerenciarBib) document.getElementById('bibAddBtn')?.addEventListener('click', renderModal);

  await carregarConteudos();
}

/* ============================================================
   PAGE: PREMIAÇÕES E RECONHECIMENTO
   ============================================================ */
async function initPremiacoes() {
  const profile = await renderSidebar('premiacoes');
  if (!profile) return;
  await renderTopBar('Premiações', profile);

  const content     = document.getElementById('pageContent');
  const isDiretoria = profile.tier === 'diretoria';

  // Estado: null = lista geral | uuid = detalhe de premiação
  let viewState = null; // { mode: 'list' } | { mode: 'detail', id: uuid }

  // Verifica se há ?id= na URL
  const urlParams = new URLSearchParams(window.location.search);
  const urlId     = urlParams.get('id');
  if (urlId) viewState = { mode: 'detail', id: urlId };
  else       viewState = { mode: 'list' };

  const IMPORTANCIA_COLORS = {
    'Semanal':  '#3b82f6',
    'Mensal':   'var(--gold)',
    'Anual':    'var(--red-bright)',
    'Especial': '#8b5cf6',
  };

  // -------- MODAL: Criar/Editar Premiação --------
  function renderModalPremiacao(premiacao = null) {
    const isEdit = !!premiacao;
    let modal = document.getElementById('premModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'premModal';
      modal.className = 'modal-overlay';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-box" style="max-width:500px">
        <div class="modal-header">
          <h3 class="font-cinzel">
            <i class="fa-solid fa-${isEdit ? 'pen' : 'plus'}" style="color:var(--gold);margin-right:8px"></i>
            ${isEdit ? 'Editar Premiação' : 'Nova Premiação'}
          </h3>
          <button class="modal-close" id="premModalClose"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:16px;padding:24px">
          <div class="form-group">
            <label class="form-label">Ícone (emoji)</label>
            <input type="text" class="form-input" id="premIcone" placeholder="🏆" maxlength="4"
              value="${premiacao?.icone || '🏆'}" style="font-size:1.4rem;text-align:center;width:80px">
          </div>
          <div class="form-group">
            <label class="form-label">Título <span style="color:var(--red-bright)">*</span></label>
            <input type="text" class="form-input" id="premTitulo" placeholder="Ex: Destaque do Mês"
              maxlength="80" value="${Utils.escapeHtml(premiacao?.titulo || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">Descrição <span style="color:var(--red-bright)">*</span></label>
            <textarea class="form-input" id="premDescricao" rows="3"
              placeholder="Descreva os critérios desta premiação...">${Utils.escapeHtml(premiacao?.descricao || '')}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Importância / Periodicidade</label>
            <select class="form-input form-select" id="premImportancia">
              ${['Semanal','Mensal','Anual','Especial'].map(i =>
                `<option value="${i}" ${premiacao?.importancia === i ? 'selected' : ''}>${i}</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">URL da Imagem (opcional)</label>
            <input type="url" class="form-input" id="premImagem" placeholder="https://..."
              value="${Utils.escapeHtml(premiacao?.imagem_url || '')}">
          </div>
          <button class="btn btn-gold" id="premSaveBtn">
            <i class="fa-solid fa-floppy-disk"></i> ${isEdit ? 'Atualizar' : 'Criar Premiação'}
          </button>
        </div>
      </div>
    `;

    requestAnimationFrame(() => modal.classList.add('open'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
    document.getElementById('premModalClose').addEventListener('click', () => modal.classList.remove('open'));

    document.getElementById('premSaveBtn').addEventListener('click', async () => {
      const titulo      = document.getElementById('premTitulo').value.trim();
      const descricao   = document.getElementById('premDescricao').value.trim();
      const importancia = document.getElementById('premImportancia').value;
      const icone       = document.getElementById('premIcone').value.trim() || '🏆';
      const imagem_url  = document.getElementById('premImagem').value.trim() || null;

      if (!titulo || !descricao) { Utils.showToast('Preencha título e descrição.', 'error'); return; }

      const btn = document.getElementById('premSaveBtn');
      btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Salvando...';

      const payload = { titulo, descricao, importancia, icone, imagem_url };

      try {
        let error;
        if (isEdit) {
          ({ error } = await db.from('premiacoes').update(payload).eq('id', premiacao.id));
        } else {
          ({ error } = await db.from('premiacoes').insert({ ...payload, criado_por: profile.id }));
        }
        if (error) throw error;
      } catch (err) {
        console.error('[MSY][premiacoes] Erro ao salvar premiação:', err);
        Utils.showToast('Erro ao salvar premiação.', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> ' + (isEdit ? 'Atualizar' : 'Criar Premiação');
        return;
      }

      Utils.showToast(isEdit ? 'Premiação atualizada!' : 'Premiação criada!');
      modal.classList.remove('open');

      if (viewState.mode === 'detail') renderDetalhe(viewState.id);
      else renderLista();
    });
  }

  // -------- MODAL: Adicionar Vencedor --------
  async function renderModalVencedor(premiacaoId) {
    // Buscar membros ativos
    const { data: membros, error: membrosError } = await db.from('profiles')
      .select('id, name, role')
      .eq('status', 'ativo')
      .order('name');
    if (membrosError) {
      console.error('[MSY][premiacoes] Erro ao carregar membros para vencedor:', membrosError);
      Utils.showToast('Erro ao carregar membros.', 'error');
      return;
    }

    let modal = document.getElementById('vencModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'vencModal';
      modal.className = 'modal-overlay';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-box" style="max-width:480px">
        <div class="modal-header">
          <h3 class="font-cinzel"><i class="fa-solid fa-trophy" style="color:var(--gold);margin-right:8px"></i>Adicionar Vencedor</h3>
          <button class="modal-close" id="vencModalClose"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:16px;padding:24px">
          <div class="form-group">
            <label class="form-label">Membro <span style="color:var(--red-bright)">*</span></label>
            <select class="form-input form-select" id="vencMembro">
              <option value="">Selecionar membro...</option>
              ${(membros || []).map(m =>
                `<option value="${m.id}">${Utils.escapeHtml(m.name)} — ${Utils.escapeHtml(m.role)}</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Período <span style="color:var(--red-bright)">*</span></label>
            <input type="text" class="form-input" id="vencPeriodo"
              placeholder="Ex: Março 2025 / Semana 12 / 2024">
          </div>
          <div class="form-group">
            <label class="form-label">Observação (opcional)</label>
            <textarea class="form-input" id="vencObs" rows="2" placeholder="Justificativa ou nota adicional..."></textarea>
          </div>
          <button class="btn btn-gold" id="vencSaveBtn">
            <i class="fa-solid fa-plus"></i> Registrar Vencedor
          </button>
        </div>
      </div>
    `;

    requestAnimationFrame(() => modal.classList.add('open'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
    document.getElementById('vencModalClose').addEventListener('click', () => modal.classList.remove('open'));

    document.getElementById('vencSaveBtn').addEventListener('click', async () => {
      const membroId  = document.getElementById('vencMembro').value;
      const periodo   = document.getElementById('vencPeriodo').value.trim();
      const observacao = document.getElementById('vencObs').value.trim() || null;

      if (!membroId || !periodo) { Utils.showToast('Selecione o membro e informe o período.', 'error'); return; }

      const btn = document.getElementById('vencSaveBtn');
      btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Salvando...';

      try {
        const { error } = await db.from('premiacao_vencedores').insert({
          premiacao_id:  premiacaoId,
          membro_id:     membroId,
          periodo,
          observacao,
          concedido_por: profile.id
        });
        if (error) throw error;
      } catch (err) {
        console.error('[MSY][premiacoes] Erro ao registrar vencedor:', err);
        Utils.showToast('Erro ao registrar vencedor.', 'error');
        btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-plus"></i> Registrar Vencedor';
        return;
      }

      // Notificar o membro premiado
      try {
        await db.rpc('notify_member', {
          p_user_id: membroId,
          p_message: `🏆 Você recebeu uma premiação! Verifique suas conquistas.`,
          p_type:    'approval',
          p_icon:    '🏆',
          p_link:    `premiacoes.html?id=${premiacaoId}`
        });
      } catch (err) {
        console.warn('[MSY][premiacoes] Falha ao notificar vencedor:', err);
      }

      Utils.showToast('Vencedor registrado com sucesso!');
      modal.classList.remove('open');
      renderDetalhe(premiacaoId);
    });
  }

  // -------- RENDER: Lista de premiações --------
  async function renderLista() {
    viewState = { mode: 'list' };
    window.history.replaceState({}, '', 'premiacoes.html');
    Utils.showLoading(content);

    let premiacoes = [];
    try {
      const { data, error } = await db
        .from('premiacoes')
        .select('*')
        .eq('ativo', true)
        .order('importancia')
        .order('titulo');
      if (error) throw error;
      premiacoes = data || [];
    } catch (err) {
      console.error('[MSY][premiacoes] Erro ao carregar lista:', err);
      content.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-3)">
        <i class="fa-solid fa-triangle-exclamation" style="color:var(--red-bright);font-size:1.5rem;margin-bottom:12px;display:block"></i>
        Erro ao carregar premiações.<br>
        <small style="color:var(--text-3);font-size:.75rem;margin-top:8px;display:block">${err.message || 'Verifique se o schema_modules.sql foi executado no Supabase.'}</small>
      </div>`;
      return;
    }

    // Agrupar por importância
    const grupos = {};
    ['Anual','Mensal','Semanal','Especial'].forEach(i => { grupos[i] = []; });
    (premiacoes || []).forEach(p => { (grupos[p.importancia] || (grupos['Outro'] = [])).push(p); });

    const gruposHtml = Object.entries(grupos)
      .filter(([, items]) => items.length > 0)
      .map(([grupo, items]) => `
        <div style="margin-bottom:32px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
            <span style="height:2px;flex:0 0 24px;background:${IMPORTANCIA_COLORS[grupo]}"></span>
            <h2 class="font-cinzel" style="font-size:1rem;color:${IMPORTANCIA_COLORS[grupo]};letter-spacing:.1em;text-transform:uppercase">${grupo}</h2>
            <span style="height:1px;flex:1;background:var(--border-faint)"></span>
          </div>
          <div class="prem-list-grid">
            ${items.map(p => `
              <div class="prem-card" data-id="${p.id}">
                <div class="prem-card-icon">${p.icone || '🏆'}</div>
                <div class="prem-card-body">
                  <div class="prem-card-imp" style="color:${IMPORTANCIA_COLORS[p.importancia]}">${p.importancia}</div>
                  <div class="prem-card-title">${Utils.escapeHtml(p.titulo)}</div>
                  <div class="prem-card-desc">${Utils.escapeHtml(p.descricao)}</div>
                </div>
                <button class="btn btn-ghost btn-sm prem-detail-btn" data-id="${p.id}" style="margin-top:auto;align-self:flex-start">
                  <i class="fa-solid fa-arrow-right"></i> Ver detalhes
                </button>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('');

    content.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-header-title">Premiações & Reconhecimento</div>
          <div class="page-header-sub">Histórico de conquistas e premiações da Masayoshi Order</div>
        </div>
        ${isDiretoria ? `
          <button class="btn btn-gold" id="premAddBtn" style="display:none">
            <i class="fa-solid fa-plus"></i> Nova Premiação
          </button>
        ` : ''}
      </div>
      <div class="filters-bar" style="margin-bottom:20px" id="premSubTabs">
        <button class="filter-btn active" data-subtab="premiacoes"><i class="fa-solid fa-trophy"></i> Premiações</button>
        <button class="filter-btn" data-subtab="recordes"><i class="fa-solid fa-crown"></i> Recordes</button>
      </div>
      <div id="premSubContent"></div>
    `;

    // Sub-tab: renderiza premiações
    function renderSubPremiacoes() {
      const sub = document.getElementById('premSubContent');
      if (isDiretoria) document.getElementById('premAddBtn').style.display = '';
      sub.innerHTML = `
        ${(!premiacoes || premiacoes.length === 0) ? `
          <div style="text-align:center;padding:80px 20px;color:var(--text-3)">
            <div style="font-size:3rem;margin-bottom:16px">🏆</div>
            <p>Nenhuma premiação cadastrada ainda.</p>
            ${isDiretoria ? `<button class="btn btn-gold" id="premAddBtnEmpty" style="margin-top:16px"><i class="fa-solid fa-plus"></i> Criar primeira premiação</button>` : ''}
          </div>
        ` : gruposHtml}
      `;
      document.getElementById('premAddBtnEmpty')?.addEventListener('click', () => renderModalPremiacao());
      sub.querySelectorAll('.prem-detail-btn').forEach(btn => {
        btn.addEventListener('click', () => renderDetalhe(btn.dataset.id));
      });
      sub.querySelectorAll('.prem-card').forEach(card => {
        card.style.cursor = 'pointer';
        card.addEventListener('click', (e) => {
          if (e.target.closest('.prem-detail-btn')) return;
          renderDetalhe(card.dataset.id);
        });
      });
    }

    renderSubPremiacoes();

    // Sub-tab switcher
    document.querySelectorAll('#premSubTabs .filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#premSubTabs .filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (btn.dataset.subtab === 'recordes') {
          if (isDiretoria) document.getElementById('premAddBtn').style.display = 'none';
          renderRecordes();
        } else {
          renderSubPremiacoes();
        }
      });
    });

  }

  // -------- RENDER: Detalhe de premiação --------
  async function renderDetalhe(id) {
    viewState = { mode: 'detail', id };
    window.history.replaceState({}, '', `premiacoes.html?id=${id}`);
    Utils.showLoading(content);

    const [premRes, vencRes] = await Promise.all([
      db.from('premiacoes').select('*').eq('id', id).single(),
      db.from('premiacao_vencedores')
        .select('*')
        .eq('premiacao_id', id)
        .order('created_at', { ascending: false })
    ]);

    if (premRes.error) {
      console.error('[MSY] Erro premiacao detalhe:', premRes.error);
      content.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-3)">Premiação não encontrada.</div>`;
      return;
    }

    // Buscar perfis dos vencedores separadamente (evita ambiguidade de FK no PostgREST)
    const vencRaw = vencRes.data || [];
    let profilesMap = {};
    if (vencRaw.length > 0) {
      const ids = [...new Set(vencRaw.map(v => v.membro_id))];
      const { data: profs } = await db.from('profiles')
        .select('id, name, role, initials, color, avatar_url')
        .in('id', ids);
      (profs || []).forEach(p => { profilesMap[p.id] = p; });
    }

    // Montar vencedores com dados de perfil
    const venc = vencRaw.map(v => ({
      ...v,
      membro: profilesMap[v.membro_id] || { id: v.membro_id, name: 'Membro', role: '', initials: 'MS', color: '#7f1d1d', avatar_url: null }
    }));

    const prem     = premRes.data;
    const impColor = IMPORTANCIA_COLORS[prem.importancia] || 'var(--gold)';

    // Contar vencedores únicos
    const uniqueWinners = new Set(venc.map(v => v.membro_id)).size;

    content.innerHTML = `
      <div class="page-header">
        <div>
          <button class="btn btn-ghost btn-sm" id="backBtn" style="margin-bottom:10px">
            <i class="fa-solid fa-arrow-left"></i> Voltar às Premiações
          </button>
          <div class="page-header-title">${prem.icone} ${Utils.escapeHtml(prem.titulo)}</div>
          <div class="page-header-sub">${Utils.escapeHtml(prem.descricao)}</div>
        </div>
        ${isDiretoria ? `
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" id="premEditBtn">
              <i class="fa-solid fa-pen"></i> Editar
            </button>
            <button class="btn btn-gold" id="addVencedorBtn">
              <i class="fa-solid fa-trophy"></i> Adicionar Vencedor
            </button>
          </div>
        ` : ''}
      </div>

      <!-- Info card -->
      <div class="card" style="display:flex;gap:24px;align-items:center;flex-wrap:wrap;margin-bottom:28px;padding:24px">
        <div style="font-size:4rem;line-height:1">${prem.icone || '🏆'}</div>
        ${prem.imagem_url ? `<img src="${Utils.escapeHtml(prem.imagem_url)}" alt="${Utils.escapeHtml(prem.titulo)}"
          style="height:80px;width:80px;object-fit:cover;border-radius:var(--radius);border:1px solid var(--border-gold)">` : ''}
        <div style="flex:1">
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
            <span class="badge" style="background:${impColor}22;color:${impColor};border:1px solid ${impColor}44">
              ${prem.importancia}
            </span>
          </div>
          <div style="color:var(--text-2);font-size:.88rem;line-height:1.6">${Utils.escapeHtml(prem.descricao)}</div>
        </div>
        <div style="display:flex;gap:20px">
          <div style="text-align:center">
            <div class="font-cinzel" style="font-size:2rem;color:var(--gold)">${venc.length}</div>
            <div style="font-size:.75rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em">Prêmios</div>
          </div>
          <div style="text-align:center">
            <div class="font-cinzel" style="font-size:2rem;color:var(--gold)">${uniqueWinners}</div>
            <div style="font-size:.75rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em">Membros</div>
          </div>
        </div>
      </div>

      <!-- Histórico de vencedores -->
      <div class="card">
        <div style="padding:20px 24px;border-bottom:1px solid var(--border-faint);display:flex;align-items:center;justify-content:space-between">
          <h3 class="font-cinzel" style="font-size:1rem">
            <i class="fa-solid fa-trophy" style="color:var(--gold);margin-right:8px"></i>Histórico de Vencedores
          </h3>
          <span style="color:var(--text-3);font-size:.8rem">${venc.length} registro${venc.length !== 1 ? 's' : ''}</span>
        </div>
        <div style="padding:20px 24px">
          ${venc.length === 0 ? `
            <div style="text-align:center;padding:40px;color:var(--text-3)">
              <i class="fa-solid fa-medal" style="font-size:2rem;opacity:.3;margin-bottom:12px;display:block"></i>
              Nenhum vencedor registrado ainda.
            </div>
          ` : `
            <div style="display:flex;flex-direction:column;gap:12px">
              ${venc.map(v => {
                const membro = v.membro;
                const avatarStyle = `background:linear-gradient(135deg,${membro.color||'#7f1d1d'},#1a1a1a)`;
                const avatarContent = membro.avatar_url
                  ? `<img src="${Utils.escapeHtml(membro.avatar_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
                  : (membro.initials || Utils.getInitials(membro.name));
                return `
                  <div style="display:flex;align-items:center;gap:14px;padding:12px 16px;background:var(--black-3);border-radius:var(--radius);border:1px solid var(--border-faint);transition:border-color .2s" class="venc-row">
                    <a href="perfil.html?id=${membro.id}" style="flex-shrink:0">
                      <div class="avatar" style="${avatarStyle}">${avatarContent}</div>
                    </a>
                    <div style="flex:1">
                      <a href="perfil.html?id=${membro.id}" style="font-weight:600;color:var(--text-1);transition:color .2s" class="venc-name">
                        ${Utils.escapeHtml(membro.name)}
                      </a>
                      <div style="font-size:.78rem;color:var(--text-3)">${Utils.escapeHtml(membro.role)}</div>
                      ${v.observacao ? `<div style="font-size:.78rem;color:var(--text-2);margin-top:4px;font-style:italic">${Utils.escapeHtml(v.observacao)}</div>` : ''}
                    </div>
                    <div style="text-align:right;flex-shrink:0">
                      <div style="font-size:.9rem;color:var(--gold);font-weight:600">${Utils.escapeHtml(v.periodo)}</div>
                      <div style="font-size:.72rem;color:var(--text-3)">${Utils.formatDate(v.created_at)}</div>
                    </div>
                    ${isDiretoria ? `
                      <button class="btn btn-ghost btn-sm venc-del-btn" data-id="${v.id}" title="Remover" style="flex-shrink:0">
                        <i class="fa-solid fa-trash" style="color:var(--red-bright);font-size:.75rem"></i>
                      </button>
                    ` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>
      </div>
    `;

    document.getElementById('backBtn').addEventListener('click', renderLista);
    document.getElementById('premEditBtn')?.addEventListener('click', () => renderModalPremiacao(prem));
    document.getElementById('addVencedorBtn')?.addEventListener('click', () => renderModalVencedor(id));

    // Delete vencedor
    document.querySelectorAll('.venc-del-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!(await MSYConfirm.show('Remover este vencedor do histórico?', { title: 'Remover vencedor' }))) return;
        try {
          const { error } = await db.from('premiacao_vencedores').delete().eq('id', btn.dataset.id);
          if (error) throw error;
          Utils.showToast('Removido.');
          renderDetalhe(id);
        } catch (err) {
          console.error('[MSY][premiacoes] Erro ao remover vencedor:', err);
          Utils.showToast('Erro ao remover.', 'error');
        }
      });
    });
  }

  // Roteamento inicial
  // ──────── RECORDES HISTÓRICOS ────────

  async function renderRecordes() {
    const sub = document.getElementById('premSubContent');
    if (!sub) return;
    sub.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:120px;color:var(--text-3)">
      <i class="fa-solid fa-circle-notch fa-spin" style="color:var(--gold);margin-right:8px"></i> Carregando recordes...
    </div>`;

    let recordes = [], semRes = { data: [] }, mesRes = { data: [] };
    try {
      // Busca recordes manuais do banco
      const recordesRes = await db.from('msy_recordes').select('*').order('tipo');
      if (recordesRes.error) throw recordesRes.error;
      recordes = recordesRes.data || [];

      // Busca rankings — uma query só para semanal, uma para mensal
      ([semRes, mesRes] = await Promise.all([
        db.from('weekly_rankings').select('entries, week_start, week_end').eq('tipo', 'semanal').order('week_start', { ascending: false }),
        db.from('weekly_rankings').select('entries, week_start, week_end').eq('tipo', 'mensal').order('week_start', { ascending: false }),
      ]));
      const rankingsError = [semRes, mesRes].find(res => res.error)?.error;
      if (rankingsError) throw rankingsError;
    } catch (err) {
      console.error('[MSY][recordes] Erro ao carregar recordes:', err);
      sub.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-3)">Erro ao carregar recordes.</div>`;
      Utils.showToast('Erro ao carregar recordes.', 'error');
      return;
    }
    const semRankings = semRes.data || [];
    const mesRankings = mesRes.data || [];

    // Calcula melhor semanal histórico
    let recSemanal = null;
    for (const r of semRankings) {
      for (const e of (r.entries || [])) {
        if (!recSemanal || e.messages > recSemanal.messages) {
          recSemanal = { ...e, periodo: `${Utils.formatDate(r.week_start)} → ${Utils.formatDate(r.week_end)}` };
        }
      }
    }

    // Calcula melhor mensal histórico
    let recMensal = null;
    for (const r of mesRankings) {
      for (const e of (r.entries || [])) {
        if (!recMensal || e.messages > recMensal.messages) {
          recMensal = { ...e, periodo: Utils.formatDate(r.week_start).slice(3) };
        }
      }
    }

    // Recorde diário (manual, do banco)
    const recDiario = (recordes || []).find(r => r.tipo === 'diario') || null;

    // ── Helper: card de recorde ──
    function recordeCard({ simbolo, titulo, subtitulo, nome, mensagens, periodo, tipo, cor, descricao, manual }) {
      const temDado = nome && mensagens;
      return `
        <div style="background:var(--black-3);border:1px solid ${cor}33;border-top:3px solid ${cor};border-radius:var(--radius-lg);padding:22px;display:flex;flex-direction:column;gap:14px;position:relative;overflow:hidden">
          <div style="position:absolute;top:0;right:0;width:90px;height:90px;background:radial-gradient(circle at top right,${cor}14,transparent 70%);pointer-events:none"></div>
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
            <div style="display:flex;align-items:center;gap:12px">
              <div style="font-size:2.2rem;line-height:1;filter:drop-shadow(0 0 7px ${cor}77)">${simbolo}</div>
              <div>
                <div class="font-cinzel" style="color:${cor};font-size:.95rem;letter-spacing:.06em">${titulo}</div>
                <div style="font-size:.68rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.09em;margin-top:3px">${subtitulo}</div>
              </div>
            </div>
            ${manual && isDiretoria ? `<button class="btn btn-ghost btn-sm edit-recorde-btn" data-tipo="${tipo}" style="flex-shrink:0;font-size:.7rem;padding:4px 8px" title="Editar"><i class="fa-solid fa-pen"></i></button>` : ''}
          </div>
          ${temDado ? `
            <div style="display:flex;align-items:center;gap:10px;background:var(--black-4);border:1px solid var(--border-faint);border-radius:var(--radius);padding:11px 14px">
              <div style="flex:1">
                <div style="font-weight:700;color:var(--text-1);font-size:.9rem">${Utils.escapeHtml(nome)}</div>
                ${periodo ? `<div style="font-size:.7rem;color:var(--text-3);margin-top:2px"><i class="fa-regular fa-calendar"></i> ${Utils.escapeHtml(periodo)}</div>` : ''}
              </div>
              <div style="text-align:right;flex-shrink:0">
                <div style="font-size:1.5rem;font-weight:800;color:${cor};font-family:'Cinzel',serif;line-height:1">${Number(mensagens).toLocaleString('pt-BR')}</div>
                <div style="font-size:.58rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em">mensagens</div>
              </div>
            </div>
          ` : `
            <div style="display:flex;align-items:center;justify-content:center;padding:18px;background:var(--black-4);border:1px dashed var(--border-faint);border-radius:var(--radius)">
              <div style="text-align:center;color:var(--text-3);font-size:.8rem">
                <i class="fa-solid fa-minus" style="display:block;font-size:1.2rem;margin-bottom:6px;opacity:.3"></i>
                ${manual && isDiretoria
                  ? `Não registrado. <button class="btn btn-ghost btn-sm edit-recorde-btn" data-tipo="${tipo}" style="margin-left:4px;font-size:.72rem"><i class="fa-solid fa-pen"></i> Inserir</button>`
                  : 'Sem dados suficientes.'}
              </div>
            </div>
          `}
          <div style="font-size:.73rem;color:var(--text-3);line-height:1.5">${descricao}</div>
          <div style="font-size:.65rem;color:var(--text-3);border-top:1px solid var(--border-faint);padding-top:7px;display:flex;align-items:center;gap:5px">
            <i class="fa-solid fa-${manual ? 'hand' : 'rotate'}" style="opacity:.5"></i>
            ${manual ? 'Atualização manual' : 'Calculado automaticamente'}
          </div>
        </div>
      `;
    }

    sub.innerHTML = `
      <div style="margin-bottom:24px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <span style="height:2px;flex:0 0 24px;background:var(--gold)"></span>
          <h2 class="font-cinzel" style="font-size:1rem;color:var(--gold);letter-spacing:.1em;text-transform:uppercase">Recordes Históricos</h2>
          <span style="height:1px;flex:1;background:var(--border-faint)"></span>
        </div>
        <p style="font-size:.78rem;color:var(--text-3);margin-bottom:20px">Os maiores feitos individuais na história da Masayoshi Order. Gravados para a eternidade.</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px">
          ${recordeCard({
            simbolo:  '⚡',
            titulo:   'Soberania Semanal',
            subtitulo:'Recorde Semanal Histórico',
            nome:      recSemanal?.name   || null,
            mensagens: recSemanal?.messages || null,
            periodo:   recSemanal?.periodo  || null,
            tipo: 'semanal', cor: '#f59e0b', manual: false,
            descricao: 'O maior volume de mensagens registrado em uma única semana na história da Masayoshi Order.',
          })}
          ${recordeCard({
            simbolo:  '🩸',
            titulo:   'Domínio Mensal',
            subtitulo:'Recorde Mensal Histórico',
            nome:      recMensal?.name    || null,
            mensagens: recMensal?.messages || null,
            periodo:   recMensal?.periodo  || null,
            tipo: 'mensal', cor: 'var(--red-bright)', manual: false,
            descricao: 'O maior volume de mensagens registrado em um único mês na história da Masayoshi Order.',
          })}
          ${recordeCard({
            simbolo:  '🔱',
            titulo:   'Marca Perpétua',
            subtitulo:'Recorde Diário — Manual',
            nome:      recDiario?.nome      || null,
            mensagens: recDiario?.mensagens  || null,
            periodo:   recDiario?.periodo    || null,
            tipo: 'diario', cor: '#8b5cf6', manual: true,
            descricao: 'O maior volume de mensagens registrado em um único dia. Valor inserido manualmente pela Diretoria.',
          })}

        </div>
      </div>
      ${isDiretoria ? `
        <div style="padding:11px 15px;background:var(--black-3);border:1px solid var(--border-faint);border-radius:var(--radius);font-size:.74rem;color:var(--text-3);display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span><i class="fa-solid fa-circle-info" style="color:var(--gold)"></i> Recordes semanal e mensal são calculados automaticamente. O diário é manual.</span>
          <button class="btn btn-ghost btn-sm" id="btnCorrecaoRecordes" style="font-size:.7rem"><i class="fa-solid fa-wrench"></i> Editar Recorde Diário</button>
        </div>
      ` : ''}
    `;

    sub.querySelectorAll('.edit-recorde-btn').forEach(btn => {
      btn.addEventListener('click', () => renderModalRecorde(btn.dataset.tipo, recordes));
    });
    document.getElementById('btnCorrecaoRecordes')?.addEventListener('click', () => {
      renderModalRecorde('diario', recordes);
    });
  }

  // ──────── MODAL: Editar Recorde Manual ────────

  async function renderModalRecorde(tipo, recordesAtuais) {
    // Sempre busca dado fresco do banco para garantir rec.id correto
    const { data: recFresh } = await db.from('msy_recordes')
      .select('id, nome, mensagens, periodo').eq('tipo', tipo).limit(1);
    const rec = (recFresh && recFresh.length > 0) ? recFresh[0] : null;
    const { data: membros } = await db.from('profiles').select('id, name').eq('status', 'ativo').order('name');

    let modal = document.getElementById('recModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'recModal';
      modal.className = 'modal-overlay';
      document.body.appendChild(modal);
    }

    const labelTipo = tipo === 'diario' ? 'Diário' : tipo === 'semanal' ? 'Semanal' : 'Mensal';

    modal.innerHTML = `
      <div class="modal-box" style="max-width:460px">
        <div class="modal-header">
          <h3 class="font-cinzel">
            <i class="fa-solid fa-pen" style="color:var(--gold);margin-right:8px"></i>Recorde ${Utils.escapeHtml(labelTipo)}
          </h3>
          <button class="modal-close" id="recModalClose"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:14px;padding:24px">
          <div class="form-group">
            <label class="form-label">Membro <span style="color:var(--red-bright)">*</span></label>
            <select class="form-input form-select" id="rec-membro">
              <option value="">Selecionar membro...</option>
              ${(membros || []).map(m => `<option value="${Utils.escapeHtml(m.name)}" ${rec?.nome === m.name ? 'selected' : ''}>${Utils.escapeHtml(m.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Mensagens <span style="color:var(--red-bright)">*</span></label>
            <input type="number" class="form-input" id="rec-msgs" min="1" placeholder="Ex: 1420" value="${rec?.mensagens || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Período</label>
            <input type="text" class="form-input" id="rec-periodo" placeholder="Ex: 14/03/2025" value="${Utils.escapeHtml(rec?.periodo || '')}">
          </div>
          <button class="btn btn-gold" id="recSaveBtn">
            <i class="fa-solid fa-floppy-disk"></i> Salvar Recorde
          </button>
        </div>
      </div>
    `;

    requestAnimationFrame(() => modal.classList.add('open'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
    document.getElementById('recModalClose').addEventListener('click', () => modal.classList.remove('open'));

    document.getElementById('recSaveBtn').addEventListener('click', async () => {
      const nome    = document.getElementById('rec-membro').value;
      const msgs    = parseInt(document.getElementById('rec-msgs').value);
      const periodo = document.getElementById('rec-periodo').value.trim();

      if (!nome || !msgs || msgs < 1) { Utils.showToast('Preencha membro e quantidade.', 'error'); return; }

      const btn = document.getElementById('recSaveBtn');
      btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Salvando...';

      // Upsert — funciona para INSERT e UPDATE sem depender de rec.id
      // onConflict:'tipo' usa a constraint UNIQUE(tipo) da tabela msy_recordes
      const { error: dbErr } = await db.from('msy_recordes').upsert(
        { tipo, nome, mensagens: msgs, periodo },
        { onConflict: 'tipo', ignoreDuplicates: false }
      );

      if (dbErr) {
        console.error('[MSY] Erro ao salvar recorde:', dbErr);
        Utils.showToast('Erro ao salvar recorde: ' + (dbErr.message || 'verifique as permissões.'), 'error');
        btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar Recorde';
        return;
      }

      Utils.showToast('Recorde salvo!');
      // Invalida cache para que renderRecordes e insígnias reflitam imediatamente
      window._msyRecordesCache   = null;
      window._msyRecordesCacheTs = 0;
      modal.classList.remove('open');
      renderRecordes();
    });
  }

  // ──────── ROTEAMENTO INICIAL ────────

  if (viewState.mode === 'detail') renderDetalhe(viewState.id);
  else renderLista();
}


/* ============================================================
   PAGE: ESTRUTURA DA ORDEM (Estática / Institucional)
   ============================================================ */
async function initOrdem() {
  const profile = await renderSidebar('ordem');
  if (!profile) return;
  await renderTopBar('Estrutura da Ordem', profile);

  const content = document.getElementById('pageContent');

  content.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-header-title">Estrutura da Ordem</div>
        <div class="page-header-sub">Hierarquia, valores, conduta e direitos da Masayoshi Order</div>
      </div>
    </div>

    <!-- APRESENTAÇÃO -->
    <div class="card ordem-hero" style="margin-bottom:24px">
      <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
        <div class="ordem-crest">
          <span class="font-cinzel" style="font-size:2.5rem;color:var(--gold);line-height:1">MSY</span>
          <div style="font-size:.6rem;color:var(--text-3);letter-spacing:.3em;text-transform:uppercase;margin-top:4px">Masayoshi Order</div>
        </div>
        <div style="flex:1">
          <h1 class="font-cinzel" style="font-size:1.3rem;margin-bottom:8px">A Ordem Masayoshi</h1>
          <p style="color:var(--text-2);font-size:.9rem;line-height:1.7;max-width:640px">
            A <strong style="color:var(--gold)">Masayoshi Order (MSY)</strong> é uma organização estruturada de desenvolvimento pessoal e coletivo, fundada sobre os pilares de lealdade, disciplina e evolução contínua. Cada membro é parte ativa de um sistema maior que visa excelência individual e crescimento do grupo.
          </p>
        </div>
      </div>
    </div>

    <!-- HIERARQUIA -->
    <div class="card" style="margin-bottom:24px">
      <div class="ordem-section-header">
        <i class="fa-solid fa-sitemap" style="color:var(--gold)"></i>
        <h2 class="font-cinzel">Hierarquia da Ordem</h2>
      </div>
      <div class="ordem-hierarquia">
        ${[
          { nivel: 1, cargo: 'Fundador & Grão-Mestre',        desc: 'Visionário e criador da Ordem. Responsável pela direção estratégica, cultura organizacional e decisões fundamentais. Autoridade máxima.', cor: '#c9a84c', icon: '👑' },
          { nivel: 2, cargo: 'Coordenador Geral',              desc: 'Braço direito do Fundador. Coordena as operações globais da Ordem, garante o alinhamento entre áreas e representa a liderança em ausência do Grão-Mestre.', cor: '#dc2626', icon: '⚔️' },
          { nivel: 3, cargo: 'Secretária Geral / Chefe de Estrutura', desc: 'Responsável pela organização interna, documentação oficial, registros da Ordem e gestão das comunicações formais.', cor: '#e8c060', icon: '📋' },
          { nivel: 3, cargo: 'Supervisor de Execução',         desc: 'Garante que as atividades e projetos da Ordem sejam executados com qualidade e dentro dos prazos estabelecidos pela Diretoria.', cor: '#e8c060', icon: '⚡' },
          { nivel: 4, cargo: 'Redatora Oficial',               desc: 'Responsável pela produção e revisão de todos os conteúdos escritos da Ordem: comunicados, atas, artigos e materiais oficiais.', cor: '#f5e199', icon: '✍️' },
          { nivel: 4, cargo: 'Designer Oficial',               desc: 'Criação e manutenção da identidade visual da Ordem. Responsável por materiais gráficos, apresentações e assets digitais.', cor: '#f5e199', icon: '🎨' },
          { nivel: 5, cargo: 'Membro',                         desc: 'Integrante ativo da Ordem. Participa das atividades, cumpre os deveres, tem direito de voz e contribui para o crescimento coletivo.', cor: 'var(--text-2)', icon: '🔰' },
        ].map((item, i) => `
          <div class="ordem-cargo-item" style="--nivel:${item.nivel}">
            <div class="ordem-cargo-icon">${item.icon}</div>
            <div class="ordem-cargo-body">
              <div class="ordem-cargo-titulo" style="color:${item.cor}">${item.cargo}</div>
              <div class="ordem-cargo-desc">${item.desc}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- VALORES E CÓDIGO -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px;margin-bottom:24px">

      <!-- Valores -->
      <div class="card">
        <div class="ordem-section-header">
          <i class="fa-solid fa-gem" style="color:var(--gold)"></i>
          <h2 class="font-cinzel">Valores da Ordem</h2>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;padding:0 24px 24px">
          ${[
            { valor: 'Lealdade',           desc: 'Fidelidade aos membros, à Ordem e aos seus princípios.',            icon: '🤝' },
            { valor: 'Disciplina',         desc: 'Comprometimento com as responsabilidades e prazos assumidos.',      icon: '⚙️' },
            { valor: 'União',              desc: 'Força coletiva acima dos interesses individuais.',                  icon: '🔗' },
            { valor: 'Mérito',             desc: 'Reconhecimento baseado em contribuição real e desempenho.',         icon: '🏅' },
            { valor: 'Responsabilidade',   desc: 'Prestação de contas por ações e compromissos assumidos.',           icon: '⚖️' },
            { valor: 'Evolução Contínua',  desc: 'Busca constante por crescimento pessoal e coletivo.',               icon: '📈' },
          ].map(v => `
            <div class="ordem-valor-item">
              <span class="ordem-valor-icon">${v.icon}</span>
              <div>
                <div style="font-weight:600;color:var(--gold);font-size:.88rem">${v.valor}</div>
                <div style="font-size:.78rem;color:var(--text-3);margin-top:2px">${v.desc}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Código de conduta -->
      <div class="card">
        <div class="ordem-section-header">
          <i class="fa-solid fa-scroll" style="color:var(--gold)"></i>
          <h2 class="font-cinzel">Código de Conduta</h2>
        </div>
        <div style="padding:0 24px 24px">
          ${[
            { titulo: 'Ética',         desc: 'Todo membro deve agir com integridade, honestidade e respeito em todas as interações dentro e fora da Ordem.', icon: '🛡️' },
            { titulo: 'Coesão',        desc: 'Preservar a unidade interna, evitar conflitos desnecessários e resolver divergências com maturidade e respeito.', icon: '🔐' },
            { titulo: 'Participação',  desc: 'Presença ativa nas atividades, reuniões e iniciativas da Ordem. O silêncio não é contribuição.', icon: '🎯' },
          ].map(c => `
            <div class="ordem-conduta-item">
              <div style="display:flex;align-items:flex-start;gap:12px">
                <span style="font-size:1.4rem;line-height:1;flex-shrink:0;margin-top:2px">${c.icon}</span>
                <div>
                  <div style="font-weight:700;color:var(--text-1);font-size:.9rem;margin-bottom:4px">${c.titulo}</div>
                  <div style="font-size:.82rem;color:var(--text-2);line-height:1.5">${c.desc}</div>
                </div>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="ordem-section-header" style="margin-top:0">
          <i class="fa-solid fa-gavel" style="color:var(--red-bright)"></i>
          <h2 class="font-cinzel" style="color:var(--red-bright)">Condutas Inaceitáveis</h2>
        </div>
        <div style="padding:0 24px 24px">
          <ul style="list-style:none;display:flex;flex-direction:column;gap:8px">
            ${['Desrespeito a membros ou à liderança','Vazamento de informações internas','Inatividade reiterada sem justificativa','Sabotagem ou deslealdade à Ordem'].map(item => `
              <li style="display:flex;align-items:center;gap:8px;font-size:.82rem;color:var(--text-2)">
                <span style="color:var(--red-bright);flex-shrink:0">✗</span> ${item}
              </li>
            `).join('')}
          </ul>
        </div>
      </div>
    </div>

    <!-- DIREITOS E DEVERES -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px;margin-bottom:24px">

      <!-- Direitos -->
      <div class="card">
        <div class="ordem-section-header">
          <i class="fa-solid fa-scale-balanced" style="color:var(--gold)"></i>
          <h2 class="font-cinzel">Direitos dos Membros</h2>
        </div>
        <div style="padding:0 24px 24px;display:flex;flex-direction:column;gap:10px">
          ${[
            { dir: 'Participação',           desc: 'Direito de participar de todas as atividades e iniciativas da Ordem.' },
            { dir: 'Direito de Ser Ouvido',  desc: 'Toda sugestão, crítica construtiva ou reclamação será considerada pela Diretoria.' },
            { dir: 'Confidencialidade',      desc: 'Informações pessoais e conteúdo interno são protegidos e não serão expostos externamente.' },
            { dir: 'Reconhecimento',         desc: 'Contribuições relevantes serão reconhecidas pelo sistema de premiações e na comunidade.' },
            { dir: 'Apoio da Ordem',         desc: 'A MSY apoia seus membros em desenvolvimento pessoal e profissional dentro de seus limites.' },
          ].map(d => `
            <div style="display:flex;gap:10px;align-items:flex-start">
              <span style="color:var(--gold);font-weight:700;flex-shrink:0;margin-top:1px">✦</span>
              <div>
                <div style="font-weight:600;font-size:.88rem;color:var(--text-1)">${d.dir}</div>
                <div style="font-size:.78rem;color:var(--text-3);margin-top:2px">${d.desc}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Deveres -->
      <div class="card">
        <div class="ordem-section-header">
          <i class="fa-solid fa-list-check" style="color:var(--gold)"></i>
          <h2 class="font-cinzel">Deveres dos Membros</h2>
        </div>
        <div style="padding:0 24px 24px;display:flex;flex-direction:column;gap:10px">
          ${[
            { dev: 'Cumprir as Regras',          desc: 'Conhecer e respeitar o Código de Conduta e as normas da Ordem.' },
            { dev: 'Representar a MSY',           desc: 'Agir de forma alinhada com os valores da Ordem dentro e fora do ambiente interno.' },
            { dev: 'Contribuir com o Grupo',      desc: 'Participar ativamente das atividades, comunicados e iniciativas coletivas.' },
            { dev: 'Cumprir Atividades',          desc: 'Entregar as tarefas atribuídas com qualidade e dentro dos prazos estabelecidos.' },
            { dev: 'Manter Atualização',          desc: 'Acompanhar os comunicados e manter-se informado sobre o andamento da Ordem.' },
          ].map(d => `
            <div style="display:flex;gap:10px;align-items:flex-start">
              <span style="color:var(--red-bright);font-weight:700;flex-shrink:0;margin-top:1px">◈</span>
              <div>
                <div style="font-weight:600;font-size:.88rem;color:var(--text-1)">${d.dev}</div>
                <div style="font-size:.78rem;color:var(--text-3);margin-top:2px">${d.desc}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <!-- CAMADAS DA ORDEM -->
    <div class="card" style="margin-bottom:24px">
      <div class="ordem-section-header">
        <i class="fa-solid fa-layer-group" style="color:var(--gold)"></i>
        <h2 class="font-cinzel">Camadas da Organização</h2>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;padding:0 24px 24px">
        ${[
          { nome: 'MSY', sub: 'Núcleo Central',       desc: 'O coração da Ordem. Membros fundadores, diretoria e estrutura de liderança. Define a direção estratégica.', icon: '⚔️', cor: 'var(--red-bright)' },
          { nome: 'NeverMind', sub: 'Conteúdo & Mídia', desc: 'Pipeline de produção de conteúdo e presença nas redes sociais. Responsável pela voz externa da Ordem.', icon: '📡', cor: 'var(--gold)' },
          { nome: 'Britannia', sub: 'Comunidade',      desc: 'Conector comunitário da Ordem. Expande a influência e integra novos membros ao ecossistema MSY.', icon: '🌐', cor: '#3b82f6' },
        ].map(c => `
          <div style="background:var(--black-4);border:1px solid var(--border-faint);border-radius:var(--radius-lg);padding:20px;display:flex;flex-direction:column;gap:10px;border-top:3px solid ${c.cor}">
            <div style="display:flex;align-items:center;gap:10px">
              <span style="font-size:1.8rem">${c.icon}</span>
              <div>
                <div class="font-cinzel" style="color:${c.cor};font-size:1rem">${c.nome}</div>
                <div style="font-size:.72rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.1em">${c.sub}</div>
              </div>
            </div>
            <p style="font-size:.82rem;color:var(--text-2);line-height:1.6">${c.desc}</p>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- RODAPÉ INSTITUCIONAL -->
    <div style="text-align:center;padding:32px;color:var(--text-3);font-size:.8rem;letter-spacing:.1em;text-transform:uppercase">
      <div class="font-cinzel" style="color:var(--gold);font-size:1.1rem;margin-bottom:8px">Masayoshi Order</div>
      <div>Lealdade · Disciplina · União · Mérito · Responsabilidade · Evolução</div>
    </div>
  `;
}

/* ============================================================
   FUNÇÃO: Renderizar Insígnias no Perfil
   Chamada dentro de initPerfil() após carregar o perfil.
   ============================================================ */
async function renderBadgesNoPerfil(userId, containerId) {
  const container = document.getElementById(containerId);
  try {
    /* Delega ao sistema unificado MSYBadges quando disponível */
    if (typeof MSYBadges !== 'undefined') {
      return MSYBadges.render(userId, containerId, { compact: false });
    }

    /* Fallback legado — só executa se badges_unificado.js não estiver carregado */
    if (!container) return;

    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:80px;color:var(--text-3)">
        <i class="fa-solid fa-circle-notch fa-spin" style="color:var(--gold);margin-right:8px"></i> Carregando insígnias...
      </div>
    `;

    const [badgesRes, insigniasRecordes] = await Promise.all([
      db.rpc('get_member_badges', { p_user_id: userId }),
      calcInsigniasRecordes(userId),
    ]);
    if (badgesRes.error) throw badgesRes.error;

    const badges    = badgesRes.data || [];
    const temBadges = badges.length > 0 || insigniasRecordes.length > 0;

    if (!temBadges) {
      container.innerHTML = `
        <div style="text-align:center;padding:28px;color:var(--text-3)">
          <div style="font-size:2rem;margin-bottom:8px">🎖️</div>
          <div style="font-size:.82rem">Nenhuma insígnia conquistada ainda.</div>
        </div>
      `;
      return;
    }

    const IMPORTANCIA_COLORS = { 'Semanal':'#3b82f6','Mensal':'var(--gold)','Anual':'var(--red-bright)','Especial':'#8b5cf6' };

    const badgesHtml = badges.map(b => {
      const color   = IMPORTANCIA_COLORS[b.importancia] || 'var(--gold)';
      const tooltip = b.periodos ? b.periodos.join(' · ') : '';
      return `
        <div class="badge-item" title="${Utils.escapeHtml(tooltip)}" style="--badge-color:${color}">
          <div class="badge-icon">${b.icone || '🏆'}</div>
          <div class="badge-info">
            <div class="badge-titulo">${Utils.escapeHtml(b.titulo)}</div>
            <div class="badge-qtd" style="color:${color}">${b.quantidade}x</div>
          </div>
        </div>
      `;
    }).join('');

    const recordesHtml = insigniasRecordes.map(ins => `
      <div class="badge-item" title="${Utils.escapeHtml(ins.tooltip)}" style="--badge-color:${ins.cor}">
        <div class="badge-icon" style="filter:drop-shadow(0 0 6px ${ins.cor}88)">${ins.emoji}</div>
        <div class="badge-info">
          <div class="badge-titulo">${Utils.escapeHtml(ins.titulo)}</div>
          <div class="badge-qtd" style="color:${ins.cor};font-size:.68rem;text-transform:uppercase;letter-spacing:.04em">Recorde</div>
        </div>
      </div>
    `).join('');

    container.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:12px;padding:4px 0">
        ${recordesHtml}${badgesHtml}
      </div>
    `;
  } catch (err) {
    console.error('[MSY][badges] Erro ao renderizar badges no perfil:', err);
    if (container) container.innerHTML = `<div style="text-align:center;padding:24px;color:var(--text-3)">Erro ao carregar insígnias.</div>`;
  }
}

/* ============================================================
   FUNÇÃO: Calcula insígnias de recordes para um membro
   Cache de sessão evita reconsulta desnecessária ao banco.
   ============================================================ */

// Cache de sessão: evita recalcular enquanto o portal estiver aberto
/** @global {Array|null} window._msyRecordesCache — cache em memória dos dados de recordes.
 *  Lido/escrito por _carregarDadosRecordes(). TTL de 5 min.
 *  ⚠️  Será substituído por /js/core/cache.js na Fase 4. */
window._msyRecordesCache = window._msyRecordesCache || null;
/** @global {number} window._msyRecordesCacheTs — timestamp (ms) da última atualização do cache. */
window._msyRecordesCacheTs = window._msyRecordesCacheTs || 0;
const MSY_RECORDES_CACHE_TTL = 5 * 60 * 1000; // 5 minutos

async function _carregarDadosRecordes() {
  try {
    const agora = Date.now();
    if (window._msyRecordesCache && (agora - window._msyRecordesCacheTs) < MSY_RECORDES_CACHE_TTL) {
      return window._msyRecordesCache;
    }

    // Lê o Top 3 persistido na tabela dedicada — fonte de verdade do Trono dos Recordes
    const { data: top3Rows, error } = await db.from('msy_recordes_top3')
      .select('tipo, posicao, nome, mensagens, periodo, data_ref')
      .order('tipo').order('posicao');
    if (error) throw error;

    const top3 = { semanal: [], mensal: [], diario: [] };
    for (const row of (top3Rows || [])) {
      if (top3[row.tipo]) top3[row.tipo].push(row);
    }

    // Compatibilidade com código que espera melhorSem / melhorMes / recDiario
    // melhorSem e melhorMes = posição 1 de cada tipo (Top 1 histórico)
    const semPos1  = top3.semanal.find(r => r.posicao === 1);
    const mesPos1  = top3.mensal.find(r  => r.posicao === 1);
    const diarPos1 = top3.diario.find(r  => r.posicao === 1);

    const melhorSem  = semPos1  ? { name: semPos1.nome,  messages: semPos1.mensagens  } : null;
    const melhorMes  = mesPos1  ? { name: mesPos1.nome,  messages: mesPos1.mensagens  } : null;
    const recDiario  = diarPos1 ? { nome: diarPos1.nome, mensagens: diarPos1.mensagens } : null;

    const dados = { melhorSem, melhorMes, recDiario, top3 };
    window._msyRecordesCache   = dados;
    window._msyRecordesCacheTs = agora;
    return dados;
  } catch (err) {
    console.error('[MSY][recordes] Erro ao carregar dados de recordes:', err);
    return { melhorSem: null, melhorMes: null, recDiario: null, top3: { semanal: [], mensal: [], diario: [] } };
  }
}

async function calcInsigniasRecordes(userId) {
  try {
    const insignias = [];

    // Busca nome do usuário
    const { data: prof, error } = await db.from('profiles').select('name').eq('id', userId).limit(1);
    if (error) throw error;
    if (!prof || prof.length === 0) return insignias;
    const nome = prof[0].name;

  // Normaliza para comparação sem acento/caixa
  const normNome = (n) => (n||'').toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
  const nomeNorm = normNome(nome);

  // Carrega dados com cache (lê da msy_recordes_top3)
  const { top3 } = await _carregarDadosRecordes();

  const INSIG_META = {
    semanal: { emoji: '⚡', titulo: 'Soberania Semanal', cor: '#f59e0b',      label: 'semanal'  },
    mensal:  { emoji: '🩸', titulo: 'Domínio Mensal',    cor: 'var(--red-bright)', label: 'mensal'  },
    diario:  { emoji: '🔱', titulo: 'Marca Perpétua',    cor: '#8b5cf6',      label: 'diário'   },
  };

  const POS_SUFIXOS = ['1º lugar', '2º lugar', '3º lugar'];

  for (const [tipo, meta] of Object.entries(INSIG_META)) {
    const lista = (top3 || {})[tipo] || [];
    const entrada = lista.find(r => r.posicao === 1 && normNome(r.nome) === nomeNorm);
    if (!entrada) continue;

    const posIdx  = entrada.posicao - 1; // 0-based
    const sufixo  = POS_SUFIXOS[posIdx] || `${entrada.posicao}º lugar`;

    insignias.push({
      emoji:   meta.emoji,
      titulo:  meta.titulo,
      cor:     meta.cor,
      tooltip: `${sufixo} no Trono dos Recordes (${meta.label}) — ${Number(entrada.mensagens).toLocaleString('pt-BR')} mensagens`,
    });
  }

    return insignias;
  } catch (err) {
    console.error('[MSY][recordes] Erro ao calcular insígnias de recordes:', err);
    return [];
  }
}

/* ============================================================
   ROUTER — Módulos adicionais
   Estende o router do app.js
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  const extraRoutes = {
    // biblioteca: migrada para js/pages/biblioteca.js (Fase 3 — Batch 3)
    premiacoes: initPremiacoes,
    ordem:      initOrdem,
  };
  Promise.resolve(extraRoutes[page]?.()).catch(err => {
    console.error('[MSY][router-modules] Erro ao inicializar módulo:', err);
    Utils.showToast?.('Erro ao carregar módulo.', 'error');
  });
});
