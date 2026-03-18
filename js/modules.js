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

      const { error } = await db.from('biblioteca_conteudos').insert({
        titulo, descricao, link, categoria, criado_por: profile.id
      });

      if (error) {
        Utils.showToast('Erro ao salvar conteúdo.', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar Conteúdo';
        return;
      }

      Utils.showToast('Conteúdo adicionado com sucesso!');
      modal.classList.remove('open');

      // Notificar todos os membros
      await db.rpc('notify_member', {
        p_user_id: null,
        p_message: `📚 Novo conteúdo na Biblioteca: "${titulo}"`,
        p_type:    'info',
        p_icon:    '📚',
        p_link:    'biblioteca.html'
      });

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
          ${isDiretoria ? `<button class="btn btn-gold" id="emptyAddBtn" style="margin-top:16px"><i class="fa-solid fa-plus"></i> Adicionar primeiro conteúdo</button>` : ''}
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
            ${isDiretoria ? `<button class="btn btn-ghost btn-sm bib-delete-btn" data-id="${c.id}" title="Remover">
              <i class="fa-solid fa-trash" style="color:var(--red-bright)"></i>
            </button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Delete handlers
    grid.querySelectorAll('.bib-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Remover este conteúdo da biblioteca?')) return;
        const id = btn.dataset.id;
        const { error } = await db.from('biblioteca_conteudos').delete().eq('id', id);
        if (!error) { Utils.showToast('Conteúdo removido.'); await carregarConteudos(); }
        else Utils.showToast('Erro ao remover.', 'error');
      });
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

    const { data, error } = await db
      .from('biblioteca_conteudos')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[MSY] Erro biblioteca:', error);
      document.getElementById('bibGrid').innerHTML = `<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--text-3)">
        <i class="fa-solid fa-triangle-exclamation" style="color:var(--red-bright);font-size:1.5rem;margin-bottom:12px;display:block"></i>
        Erro ao carregar conteúdos.<br>
        <small style="color:var(--text-3);font-size:.75rem;margin-top:8px;display:block">${error.message || 'Verifique se o schema_modules.sql foi executado no Supabase.'}</small>
      </div>`;
      return;
    }

    allConteudos = data || [];

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
      ${isDiretoria ? `
        <button class="btn btn-gold" id="bibAddBtn">
          <i class="fa-solid fa-plus"></i> Adicionar Conteúdo
        </button>
      ` : ''}
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
  document.getElementById('bibAddBtn')?.addEventListener('click', renderModal);

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

      let error;
      if (isEdit) {
        ({ error } = await db.from('premiacoes').update(payload).eq('id', premiacao.id));
      } else {
        ({ error } = await db.from('premiacoes').insert({ ...payload, criado_por: profile.id }));
      }

      if (error) {
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
    const { data: membros } = await db.from('profiles')
      .select('id, name, role')
      .eq('status', 'ativo')
      .order('name');

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

      const { error } = await db.from('premiacao_vencedores').insert({
        premiacao_id:  premiacaoId,
        membro_id:     membroId,
        periodo,
        observacao,
        concedido_por: profile.id
      });

      if (error) {
        Utils.showToast('Erro ao registrar vencedor.', 'error');
        btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-plus"></i> Registrar Vencedor';
        return;
      }

      // Notificar o membro premiado
      await db.rpc('notify_member', {
        p_user_id: membroId,
        p_message: `🏆 Você recebeu uma premiação! Verifique suas conquistas.`,
        p_type:    'approval',
        p_icon:    '🏆',
        p_link:    `premiacoes.html?id=${premiacaoId}`
      });

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

    const { data: premiacoes, error } = await db
      .from('premiacoes')
      .select('*')
      .eq('ativo', true)
      .order('importancia')
      .order('titulo');

    if (error) {
      console.error('[MSY] Erro premiacoes:', error);
      content.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-3)">
        <i class="fa-solid fa-triangle-exclamation" style="color:var(--red-bright);font-size:1.5rem;margin-bottom:12px;display:block"></i>
        Erro ao carregar premiações.<br>
        <small style="color:var(--text-3);font-size:.75rem;margin-top:8px;display:block">${error.message || 'Verifique se o schema_modules.sql foi executado no Supabase.'}</small>
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
          <button class="btn btn-gold" id="premAddBtn">
            <i class="fa-solid fa-plus"></i> Nova Premiação
          </button>
        ` : ''}
      </div>

      ${(!premiacoes || premiacoes.length === 0) ? `
        <div style="text-align:center;padding:80px 20px;color:var(--text-3)">
          <div style="font-size:3rem;margin-bottom:16px">🏆</div>
          <p>Nenhuma premiação cadastrada ainda.</p>
          ${isDiretoria ? `<button class="btn btn-gold" id="premAddBtnEmpty" style="margin-top:16px"><i class="fa-solid fa-plus"></i> Criar primeira premiação</button>` : ''}
        </div>
      ` : gruposHtml}
    `;

    document.getElementById('premAddBtn')?.addEventListener('click', () => renderModalPremiacao());
    document.getElementById('premAddBtnEmpty')?.addEventListener('click', () => renderModalPremiacao());
    document.querySelectorAll('.prem-detail-btn').forEach(btn => {
      btn.addEventListener('click', () => renderDetalhe(btn.dataset.id));
    });
    document.querySelectorAll('.prem-card').forEach(card => {
      card.style.cursor = 'pointer';
      card.addEventListener('click', (e) => {
        if (e.target.closest('.prem-detail-btn')) return;
        renderDetalhe(card.dataset.id);
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
        if (!confirm('Remover este vencedor do histórico?')) return;
        const { error } = await db.from('premiacao_vencedores').delete().eq('id', btn.dataset.id);
        if (!error) { Utils.showToast('Removido.'); renderDetalhe(id); }
        else Utils.showToast('Erro ao remover.', 'error');
      });
    });
  }

  // Roteamento inicial
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
  if (!container) return;

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;height:80px;color:var(--text-3)">
      <i class="fa-solid fa-circle-notch fa-spin" style="color:var(--gold);margin-right:8px"></i> Carregando insígnias...
    </div>
  `;

  const { data: badges, error } = await db.rpc('get_member_badges', { p_user_id: userId });

  if (error || !badges || badges.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:28px;color:var(--text-3)">
        <div style="font-size:2rem;margin-bottom:8px">🎖️</div>
        <div style="font-size:.82rem">Nenhuma insígnia conquistada ainda.</div>
      </div>
    `;
    return;
  }

  const IMPORTANCIA_COLORS = { 'Semanal':'#3b82f6','Mensal':'var(--gold)','Anual':'var(--red-bright)','Especial':'#8b5cf6' };

  container.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:12px;padding:4px 0">
      ${badges.map(b => {
        const color = IMPORTANCIA_COLORS[b.importancia] || 'var(--gold)';
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
      }).join('')}
    </div>
  `;
}

/* ============================================================
   ROUTER — Módulos adicionais
   Estende o router do app.js
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  const extraRoutes = {
    biblioteca: initBiblioteca,
    premiacoes: initPremiacoes,
    ordem:      initOrdem,
  };
  extraRoutes[page]?.();
});
