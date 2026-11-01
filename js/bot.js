/* ============================================================
   PAGE: BOT CORVUS — central do bot de WhatsApp (quem está em bot_settings.allowed_senders)
   Enviar avisos, quem recebe, grupo padrão, quem pode usar e histórico.
   Tudo passa por /api/whatsapp (WhatsAppManager, push.js) e pelas
   tabelas bot_settings, member_whatsapp e bot_messages.
   ============================================================ */

async function initBot() {
  const profile = await renderSidebar('bot');
  if (!profile) return;
  await renderTopBar('Bot Corvus', profile);

  const esc = value => Utils.escapeHtml(String(value ?? ''));
  const content = document.getElementById('pageContent');
  Utils.showLoading(content);

  if (!await WhatsAppManager.canUse(profile.id)) {
    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i class="fa-solid fa-lock"></i></div>
        <div class="empty-state-text">Acesso restrito. Peça a quem já usa o bot para liberar você na aba <b>Acesso</b>.</div>
      </div>`;
    return;
  }

  const state = { tab: 'aviso', api: null, members: [], contacts: new Map(), settings: null };

  async function loadData() {
    const [api, membersRes, contactsRes, settings] = await Promise.all([
      WhatsAppManager.request('GET').catch(err => ({ erro: err.message, conectado: false, grupos: [], comWhatsapp: [] })),
      db.from('profiles').select('id,name,tier').eq('status', 'ativo').order('name'),
      db.from('member_whatsapp').select('user_id,whatsapp,receive'),
      WhatsAppManager.settings({ refresh: true }),
    ]);
    if (membersRes.error) throw membersRes.error;
    if (contactsRes.error) throw contactsRes.error;
    state.api = api;
    state.members = membersRes.data || [];
    state.contacts = new Map((contactsRes.data || []).map(c => [c.user_id, c]));
    state.settings = settings || {};
  }

  try {
    await loadData();
  } catch (err) {
    console.error('[MSY][bot]', err);
    content.innerHTML = '<div class="empty-state">Erro ao carregar. Tente recarregar a página.</div>';
    return;
  }

  const TABS = [
    ['aviso', 'fa-paper-plane', 'Enviar aviso'],
    ['destinatarios', 'fa-address-book', 'Destinatários'],
    ['grupos', 'fa-users', 'Grupos'],
    ['acesso', 'fa-user-shield', 'Acesso'],
    ['historico', 'fa-clock-rotate-left', 'Histórico'],
  ];

  function renderShell() {
    const receiving = [...state.contacts.values()].filter(c => c.receive).length;
    const online = state.api.conectado;
    content.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-header-title">Bot Corvus</div>
          <div class="page-header-sub">Central do bot de WhatsApp: avisos, quem recebe e configurações</div>
        </div>
      </div>
      <div class="stats-grid bot-stats">
        <div class="stat-card ${online ? 'green-accent' : 'red-accent'} card-enter"><div class="stat-icon ${online ? 'green' : 'red'}"><i class="fa-brands fa-whatsapp"></i></div><div class="stat-info"><div class="stat-value">${online ? 'Online' : 'Offline'}</div><div class="stat-label">${online ? 'Conectado ao WhatsApp' : esc(state.api.erro || 'Bot desconectado')}</div></div></div>
        <div class="stat-card gold-accent card-enter"><div class="stat-icon gold"><i class="fa-solid fa-users"></i></div><div class="stat-info"><div class="stat-value">${state.api.grupos.length}</div><div class="stat-label">Grupos do bot</div></div></div>
        <div class="stat-card blue-accent card-enter"><div class="stat-icon blue"><i class="fa-solid fa-address-book"></i></div><div class="stat-info"><div class="stat-value">${receiving}</div><div class="stat-label">Membros recebendo</div></div></div>
      </div>
      <div class="filters-bar bot-tabs" role="tablist">
        ${TABS.map(([id, icon, label]) => `<button class="filter-btn ${state.tab === id ? 'active' : ''}" data-tab="${id}"><i class="fa-solid ${icon}"></i> ${label}</button>`).join('')}
      </div>
      <div class="card bot-panel" id="botTab"></div>`;
    content.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab;
      content.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b === btn));
      renderTab();
    }));
    renderTab();
  }

  function renderTab() {
    const el = document.getElementById('botTab');
    ({ aviso: tabAviso, destinatarios: tabDestinatarios, grupos: tabGrupos, acesso: tabAcesso, historico: tabHistorico })[state.tab](el);
  }

  /* ── Enviar aviso ─────────────────────────────────────── */
  function tabAviso(el) {
    el.innerHTML = `
      <div class="bot-help">Manda uma mensagem agora pelo Corvus. O grupo padrão já vem marcado; no privado só recebe quem está ativo em <b>Destinatários</b>.</div>
      <div id="botComposer"></div>`;
    renderWhatsAppComposer(document.getElementById('botComposer'));
  }

  /* ── Destinatários (quem recebe no privado) ───────────── */
  function tabDestinatarios(el) {
    el.innerHTML = `
      <div class="bot-help">Número de WhatsApp de cada membro e se ele recebe mensagens do bot. O privado só chega para quem também está no grupo <b>Masayoshi 🍷</b>.</div>
      <div class="bot-table">
        ${state.members.map(m => {
          const c = state.contacts.get(m.id);
          return `
            <div class="bot-row" data-id="${m.id}">
              <div class="bot-row-name">${esc(m.name)}</div>
              <input class="form-input bot-phone" inputmode="tel" placeholder="(34) 99999-9999" value="${c ? `+${esc(c.whatsapp)}` : ''}">
              <label class="bot-check"><input type="checkbox" class="bot-receive" ${!c || c.receive ? 'checked' : ''}> Recebe</label>
              <button class="btn btn-sm btn-outline bot-save"><i class="fa-solid fa-floppy-disk"></i> Salvar</button>
            </div>`;
        }).join('')}
      </div>`;

    el.querySelectorAll('.bot-row').forEach(row => row.querySelector('.bot-save').addEventListener('click', async () => {
      const userId = row.dataset.id;
      const whatsapp = normalizeWhatsapp(row.querySelector('.bot-phone').value);
      const receive = row.querySelector('.bot-receive').checked;
      if (whatsapp === false) { Utils.showToast('WhatsApp inválido. Use DDD + número.', 'error'); return; }
      const btn = row.querySelector('.bot-save');
      btn.disabled = true;
      try {
        const { error } = whatsapp
          ? await db.from('member_whatsapp').upsert({ user_id: userId, whatsapp, receive, updated_at: new Date().toISOString() })
          : await db.from('member_whatsapp').delete().eq('user_id', userId);
        if (error) throw error;
        if (whatsapp) state.contacts.set(userId, { user_id: userId, whatsapp, receive });
        else state.contacts.delete(userId);
        Utils.showToast('Salvo!');
      } catch (err) {
        console.error('[MSY][bot]', err);
        Utils.showToast('Erro ao salvar. Tente novamente.', 'error');
      }
      btn.disabled = false;
    }));
  }

  async function saveSettings(patch) {
    const { error } = await db.from('bot_settings')
      .update({ ...patch, updated_at: new Date().toISOString(), updated_by: profile.id })
      .eq('id', 1);
    if (error) throw error;
    state.settings = await WhatsAppManager.settings({ refresh: true }) || {};
  }

  /* ── Grupos (grupo padrão dos avisos) ─────────────────── */
  function tabGrupos(el) {
    const grupos = state.api.grupos;
    el.innerHTML = `
      <div class="bot-help">Grupos em que o Corvus está. O <b>grupo padrão</b> já vem marcado ao enviar avisos. Para o bot entrar em outro grupo, adicione o número dele no WhatsApp.</div>
      ${grupos.length ? `
        <div class="bot-table">
          ${grupos.map(g => `
            <label class="bot-row bot-row-radio">
              <input type="radio" name="botDefaultGroup" value="${esc(g.id)}" ${g.id === state.settings.default_group ? 'checked' : ''}>
              <div class="bot-row-name">${esc(g.nome)}</div>
              <div class="bot-muted">${g.participantes ?? '—'} participantes</div>
            </label>`).join('')}
        </div>
        <div class="bot-actions">
          <button class="btn btn-ghost" id="botClearDefault">Sem grupo padrão</button>
          <button class="btn btn-primary" id="botSaveDefault"><i class="fa-solid fa-floppy-disk"></i> Salvar grupo padrão</button>
        </div>` : '<div class="empty-state">O bot não está em nenhum grupo ou está desconectado.</div>'}`;

    const save = async (groupId) => {
      const g = grupos.find(x => x.id === groupId);
      try {
        await saveSettings({ default_group: g?.id || null, default_group_name: g?.nome || null });
        Utils.showToast(g ? `Grupo padrão: ${g.nome}` : 'Grupo padrão removido.');
        renderTab();
      } catch (err) {
        console.error('[MSY][bot]', err);
        Utils.showToast('Erro ao salvar. Tente novamente.', 'error');
      }
    };
    document.getElementById('botSaveDefault')?.addEventListener('click', () => {
      const picked = el.querySelector('input[name="botDefaultGroup"]:checked');
      if (!picked) { Utils.showToast('Escolha um grupo.', 'error'); return; }
      save(picked.value);
    });
    document.getElementById('botClearDefault')?.addEventListener('click', () => save(null));
  }

  /* ── Acesso (quem pode usar o bot pelo portal) ────────── */
  function tabAcesso(el) {
    const allowed = new Set(state.settings.allowed_senders || []);
    el.innerHTML = `
      <div class="bot-help">Quem pode usar o bot: esta central (aparece no menu como <b>Bot Corvus</b>), o canal WhatsApp ao criar atividade e o botão Notificação. Não precisa ser da diretoria. Quem só recebe mensagens não precisa estar aqui.</div>
      <div class="bot-table">
        ${state.members.map(m => `
          <label class="bot-row bot-row-radio">
            <input type="checkbox" class="bot-sender" value="${m.id}" ${allowed.has(m.id) ? 'checked' : ''}>
            <div class="bot-row-name">${esc(m.name)}${m.id === profile.id ? ' <span class="bot-muted">(você)</span>' : ''}</div>
          </label>`).join('')}
      </div>
      <div class="bot-actions">
        <button class="btn btn-primary" id="botSaveAccess"><i class="fa-solid fa-floppy-disk"></i> Salvar acesso</button>
      </div>`;

    document.getElementById('botSaveAccess').addEventListener('click', async () => {
      const ids = [...el.querySelectorAll('.bot-sender:checked')].map(i => i.value);
      if (!ids.length) { Utils.showToast('Deixe pelo menos uma pessoa com acesso.', 'error'); return; }
      if (!ids.includes(profile.id) && !await MSYConfirm.show('Você vai remover o seu próprio acesso ao bot. Continuar?')) return;
      try {
        await saveSettings({ allowed_senders: ids });
        MSYSessionCache.invalidatePrefix('bot_sender:');
        Utils.showToast('Acesso atualizado!');
        if (!ids.includes(profile.id)) setTimeout(() => location.reload(), 600);
      } catch (err) {
        console.error('[MSY][bot]', err);
        Utils.showToast('Erro ao salvar. Tente novamente.', 'error');
      }
    });
  }

  /* ── Histórico ───────────────────────────────────────── */
  async function tabHistorico(el) {
    el.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i></div>';
    try {
      const { data, error } = await db.from('bot_messages')
        .select('id,sent_by,target_type,target,target_name,message,ok,error,created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      const names = Object.fromEntries(state.members.map(m => [m.id, m.name]));
      el.innerHTML = !data?.length
        ? '<div class="empty-state">Nenhuma mensagem enviada pelo portal ainda.</div>'
        : `<div class="bot-history">${data.map(h => `
            <div class="bot-history-item">
              <div class="bot-history-head">
                <span class="badge ${h.ok ? 'badge-done' : 'badge-red'}">${h.ok ? 'Enviada' : 'Falhou'}</span>
                <span><i class="fa-solid ${h.target_type === 'grupo' ? 'fa-users' : 'fa-user'}"></i> ${esc(h.target_name || names[h.target] || h.target)}</span>
                <span class="bot-muted">por ${esc(names[h.sent_by] || '—')} · ${esc(Utils.formatDateTime(h.created_at))}</span>
              </div>
              <div class="bot-history-msg">${esc(h.message)}</div>
              ${h.error ? `<div class="bot-history-error">${esc(h.error)}</div>` : ''}
            </div>`).join('')}</div>`;
    } catch (err) {
      console.error('[MSY][bot]', err);
      el.innerHTML = '<div class="empty-state">Erro ao carregar o histórico.</div>';
    }
  }

  renderShell();
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'bot') initBot().catch(error => { console.error('[MSY][bot]', error); Utils.showToast?.('Erro ao carregar o Bot Corvus.', 'error'); });
});
