/* ============================================================
   PAGE: BOT CORVUS — central do bot de WhatsApp (quem está em bot_settings.allowed_senders)
   Painel em cartões: saúde do bot, grupos (ativar, boas-vindas, antilink,
   ranking, grupo padrão), envio de avisos, pessoas, acesso e histórico.
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
        <div class="empty-state-text">Acesso restrito. Peça a quem já usa o bot para liberar você em <b>Acesso</b>.</div>
      </div>`;
    return;
  }

  const state = {
    api: null, health: null, dmPhones: new Set(), members: [], contacts: new Map(),
    settings: null, history: [], sentToday: 0,
  };

  /* ── Helpers ─────────────────────────────────────────── */
  // Número canônico (sem o 9º dígito) para comparar números BR com e sem o 9.
  const phoneKey = phone => {
    const d = String(phone || '').replace(/\D/g, '');
    return d.length === 13 && d.startsWith('55') && d[4] === '9' ? d.slice(0, 4) + d.slice(5) : d;
  };
  const formatPhone = phone => {
    const d = String(phone || '');
    return d.length >= 12 ? `(${d.slice(2, 4)}) ${d.slice(4, -4)}-${d.slice(-4)}` : d;
  };
  const since = iso => {
    if (!iso) return '—';
    const min = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
    if (min < 1) return 'agora';
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} h ${min % 60} min`;
    return `${Math.floor(h / 24)} d ${h % 24} h`;
  };
  const memberByPhone = () => {
    const names = Object.fromEntries(state.members.map(m => [m.id, m.name]));
    return new Map([...state.contacts.values()].map(c => [phoneKey(c.whatsapp), names[c.user_id]]));
  };
  const toggle = (attrs, checked, label) => `
    <label class="bot-switch">
      <input type="checkbox" ${attrs} ${checked ? 'checked' : ''}>
      <span class="bot-switch-track"></span>
      <span>${label}</span>
    </label>`;

  async function loadData() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [api, health, dm, membersRes, contactsRes, settings, todayRes] = await Promise.all([
      WhatsAppManager.request('GET').catch(err => ({ erro: err.message, conectado: false, grupos: [], comWhatsapp: [] })),
      WhatsAppManager.request('GET', null, { r: 'saude' }).catch(() => null),
      WhatsAppManager.request('GET', null, { r: 'membros' }).catch(() => ({ numeros: [] })),
      db.from('profiles').select('id,name,tier').eq('status', 'ativo').order('name'),
      db.from('member_whatsapp').select('user_id,whatsapp,receive'),
      WhatsAppManager.settings({ refresh: true }),
      db.from('bot_messages').select('id', { count: 'exact', head: true }).gte('created_at', today.toISOString()),
    ]);
    if (membersRes.error) throw membersRes.error;
    if (contactsRes.error) throw contactsRes.error;
    state.api = api;
    state.health = health;
    state.dmPhones = new Set((dm.numeros || []).map(phoneKey));
    state.members = membersRes.data || [];
    state.contacts = new Map((contactsRes.data || []).map(c => [c.user_id, c]));
    state.settings = settings || {};
    state.sentToday = todayRes.count || 0;
  }

  async function reload() {
    try {
      await loadData();
      render();
    } catch (err) {
      console.error('[MSY][bot]', err);
      content.innerHTML = '<div class="empty-state">Erro ao carregar. Tente recarregar a página.</div>';
    }
  }

  /* ── Página ───────────────────────────────────────────── */
  function render() {
    const grupos = state.api.grupos;
    const ativos = grupos.filter(g => g.ativo).length;
    const receiving = [...state.contacts.values()].filter(c => c.receive).length;

    content.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-header-title"><i class="fa-brands fa-whatsapp" style="color:#25d366"></i> Bot Corvus</div>
          <div class="page-header-sub">Central do bot: grupos, avisos, quem recebe e histórico</div>
        </div>
        <button class="btn btn-outline" id="botRefresh"><i class="fa-solid fa-rotate"></i> Atualizar</button>
      </div>

      ${healthCard()}

      <div class="stats-grid bot-stats">
        <div class="stat-card gold-accent card-enter"><div class="stat-icon gold"><i class="fa-solid fa-users"></i></div><div class="stat-info"><div class="stat-value">${ativos}/${grupos.length}</div><div class="stat-label">Grupos com Corvus ativo</div></div></div>
        <div class="stat-card green-accent card-enter"><div class="stat-icon green"><i class="fa-solid fa-address-book"></i></div><div class="stat-info"><div class="stat-value">${receiving}</div><div class="stat-label">Pessoas recebendo</div></div></div>
        <div class="stat-card blue-accent card-enter"><div class="stat-icon blue"><i class="fa-solid fa-paper-plane"></i></div><div class="stat-info"><div class="stat-value">${state.sentToday}</div><div class="stat-label">Mensagens hoje</div></div></div>
      </div>

      <nav class="bot-nav">
        <a href="#botGrupos"><i class="fa-solid fa-users"></i> Grupos</a>
        <a href="#botAviso"><i class="fa-solid fa-paper-plane"></i> Enviar aviso</a>
        <a href="#botPessoas"><i class="fa-solid fa-address-book"></i> Pessoas</a>
        <a href="#botAcesso"><i class="fa-solid fa-user-shield"></i> Acesso</a>
        <a href="#botHistorico"><i class="fa-solid fa-clock-rotate-left"></i> Histórico</a>
      </nav>

      <section class="bot-section" id="botGrupos">
        <div class="bot-section-title"><i class="fa-solid fa-users"></i> Grupos</div>
        <div class="bot-help">Liga e desliga o Corvus em cada grupo (o mesmo que <b>/corvus ativar</b>), as boas-vindas e o antilink. A ⭐ marca o grupo padrão dos avisos. Para o bot entrar num grupo, adicione o número dele pelo WhatsApp.</div>
        <div class="bot-groups">${grupos.length ? grupos.map(groupCard).join('') : '<div class="empty-state">O bot não está em nenhum grupo ou está desconectado.</div>'}</div>
      </section>

      <section class="bot-section card" id="botAviso">
        <div class="bot-section-title"><i class="fa-solid fa-paper-plane"></i> Enviar aviso</div>
        <div id="botComposer"></div>
      </section>

      <section class="bot-section card" id="botPessoas">
        <div class="bot-section-title"><i class="fa-solid fa-address-book"></i> Pessoas</div>
        <div class="bot-help">Número de cada membro e se ele recebe mensagens do bot. O privado só chega para quem também está no grupo <b>Masayoshi 🍷</b>.</div>
        <div class="bot-people">${state.members.map(personRow).join('')}</div>
      </section>

      <section class="bot-section card" id="botAcesso">
        <div class="bot-section-title"><i class="fa-solid fa-user-shield"></i> Acesso</div>
        <div class="bot-help">Quem pode usar o bot pelo portal: esta central (aparece no menu como <b>Bot Corvus</b>), o canal WhatsApp ao criar atividade e o botão Notificação. Não precisa ser da diretoria.</div>
        <div class="bot-access">${accessList()}</div>
        <div class="bot-actions"><button class="btn btn-primary" id="botSaveAccess"><i class="fa-solid fa-floppy-disk"></i> Salvar acesso</button></div>
      </section>

      <section class="bot-section card" id="botHistorico">
        <div class="bot-section-title"><i class="fa-solid fa-clock-rotate-left"></i> Histórico</div>
        <div id="botHistory"></div>
      </section>`;

    document.getElementById('botRefresh').addEventListener('click', () => { Utils.showLoading(content); reload(); });
    bindGroups();
    renderWhatsAppComposer(document.getElementById('botComposer'), { onSent: () => loadHistory() });
    bindPeople();
    bindAccess();
    loadHistory();
  }

  /* ── Saúde ───────────────────────────────────────────── */
  function healthCard() {
    const h = state.health;
    const online = !!h?.conectado;
    const falhas = h?.falhasRecentes || [];
    const queda = h?.ultimaQueda;
    return `
      <div class="card bot-health ${online ? 'is-online' : 'is-offline'}">
        <div class="bot-health-main">
          <span class="bot-dot"></span>
          <div>
            <div class="bot-health-title">${online ? 'Online' : 'Offline'}</div>
            <div class="bot-muted">${online ? `Conectado há ${since(h.conectadoDesde)}` : esc(state.api.erro || 'Bot desconectado do WhatsApp')}</div>
          </div>
        </div>
        <div class="bot-health-facts">
          <div><span class="bot-muted">Ligado há</span><b>${since(h?.processoDesde)}</b></div>
          <div><span class="bot-muted">Reconexões</span><b>${h?.reconexoes ?? '—'}</b></div>
          <div><span class="bot-muted">Última queda</span><b>${queda ? `${esc(Utils.formatDateTime(queda.at))} (código ${esc(queda.code ?? '?')})` : 'nenhuma'}</b></div>
        </div>
        ${falhas.length ? `
          <details class="bot-failures">
            <summary><i class="fa-solid fa-triangle-exclamation"></i> ${falhas.length} falha${falhas.length > 1 ? 's' : ''} recente${falhas.length > 1 ? 's' : ''} de envio</summary>
            ${falhas.map(f => `<div class="bot-failure"><span class="bot-muted">${esc(Utils.formatDateTime(f.quando))}</span> ${esc(f.erro || 'erro')}</div>`).join('')}
          </details>` : ''}
      </div>`;
  }

  /* ── Grupos ──────────────────────────────────────────── */
  function groupCard(g) {
    const isDefault = g.id === state.settings.default_group;
    return `
      <div class="card bot-group ${g.ativo ? 'is-active' : ''}" data-group="${esc(g.id)}">
        <div class="bot-group-head">
          <div class="bot-group-name">${esc(g.nome)}</div>
          <button class="bot-star ${isDefault ? 'is-default' : ''}" data-default title="${isDefault ? 'Grupo padrão dos avisos' : 'Tornar grupo padrão'}"><i class="fa-${isDefault ? 'solid' : 'regular'} fa-star"></i></button>
        </div>
        <div class="bot-tags">
          <span class="bot-tag ${g.ativo ? 'is-on' : 'is-off'}">${g.ativo ? 'Corvus ativado' : 'Corvus desativado'}</span>
          <span class="bot-tag">${g.participantes} membros</span>
          ${g.botAdmin ? '<span class="bot-tag is-gold">Bot é admin</span>' : '<span class="bot-tag" title="Sem admin o bot não consegue apagar links nem remover pessoas">Bot não é admin</span>'}
        </div>
        <div class="bot-switches">
          ${toggle('data-flag="ativo"', g.ativo, 'Corvus ativo')}
          ${toggle('data-flag="boasVindas"', g.boasVindas, 'Boas-vindas')}
          ${toggle('data-flag="antilink"', g.antilink, 'Antilink')}
        </div>
        <button class="btn btn-sm btn-outline bot-rank-btn" data-rank><i class="fa-solid fa-ranking-star"></i> Ver ranking</button>
      </div>`;
  }

  function bindGroups() {
    content.querySelectorAll('.bot-group').forEach(card => {
      const groupId = card.dataset.group;
      const group = state.api.grupos.find(g => g.id === groupId);

      card.querySelectorAll('[data-flag]').forEach(input => input.addEventListener('change', async () => {
        const flag = input.dataset.flag;
        input.disabled = true;
        try {
          const out = await WhatsAppManager.request('PATCH', { grupo: groupId, [flag]: input.checked });
          Object.assign(group, { ativo: out.ativo, boasVindas: out.boasVindas, antilink: out.antilink });
          card.outerHTML = groupCard(group);
          bindGroups();
          Utils.showToast('Grupo atualizado!');
        } catch (err) {
          console.error('[MSY][bot]', err);
          input.checked = !input.checked;
          input.disabled = false;
          Utils.showToast(err.message || 'Erro ao atualizar o grupo.', 'error');
        }
      }));

      card.querySelector('[data-default]').addEventListener('click', async () => {
        const isDefault = groupId === state.settings.default_group;
        try {
          await saveSettings(isDefault
            ? { default_group: null, default_group_name: null }
            : { default_group: groupId, default_group_name: group.nome });
          Utils.showToast(isDefault ? 'Grupo padrão removido.' : `Grupo padrão: ${group.nome}`);
          render();
        } catch (err) {
          console.error('[MSY][bot]', err);
          Utils.showToast('Erro ao salvar. Tente novamente.', 'error');
        }
      });

      card.querySelector('[data-rank]').addEventListener('click', () => openRanking(group));
    });
  }

  async function openRanking(group) {
    let overlay = document.getElementById('botRankModal');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.id = 'botRankModal';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title"><i class="fa-solid fa-ranking-star"></i> Ranking — ${esc(group.nome)}</div>
          <button class="modal-close" id="botRankClose"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body" id="botRankBody"><div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i></div></div>
      </div>`;
    overlay.classList.add('open');
    document.getElementById('botRankClose').addEventListener('click', () => overlay.classList.remove('open'));

    try {
      const data = await WhatsAppManager.request('GET', null, { r: 'ranking', grupo: group.id });
      const names = memberByPhone();
      const who = row => esc(names.get(phoneKey(row.telefone)) || (row.telefone ? formatPhone(row.telefone) : 'Desconhecido'));
      const medal = i => ['🥇', '🥈', '🥉'][i] || `${i + 1}º`;
      const list = (rows, value) => rows.length
        ? rows.map((r, i) => `<div class="bot-rank-row"><span class="bot-rank-pos">${medal(i)}</span><span class="bot-rank-name">${who(r)}</span><span class="bot-muted">${value(r)}</span></div>`).join('')
        : '<div class="bot-muted">Ainda sem dados.</div>';
      document.getElementById('botRankBody').innerHTML = `
        <div class="bot-rank-cols">
          <div><div class="bot-rank-title">Nível (XP)</div>${list(data.xp, r => `nível ${r.nivel} · ${r.xp} XP`)}</div>
          <div><div class="bot-rank-title">Mensagens</div>${list(data.mensagens, r => `${r.total} msgs`)}</div>
        </div>
        <div class="bot-help" style="margin:14px 0 0">O XP só conta nos grupos com o Corvus ativado.</div>`;
    } catch (err) {
      console.error('[MSY][bot]', err);
      document.getElementById('botRankBody').innerHTML = `<div class="empty-state">${esc(err.message || 'Erro ao carregar o ranking.')}</div>`;
    }
  }

  async function saveSettings(patch) {
    const { error } = await db.from('bot_settings')
      .update({ ...patch, updated_at: new Date().toISOString(), updated_by: profile.id })
      .eq('id', 1);
    if (error) throw error;
    state.settings = await WhatsAppManager.settings({ refresh: true }) || {};
  }

  /* ── Pessoas ─────────────────────────────────────────── */
  function personTags(m) {
    const c = state.contacts.get(m.id);
    if (!c) return '<span class="bot-tag is-off">Sem WhatsApp</span>';
    const inGroup = state.dmPhones.has(phoneKey(c.whatsapp));
    return `
      <span class="bot-tag is-on">Tem WhatsApp</span>
      <span class="bot-tag ${inGroup ? 'is-on' : 'is-warn'}" ${inGroup ? '' : 'title="Fora do grupo Masayoshi: o privado não chega"'}>${inGroup ? 'Na Masayoshi' : 'Fora da Masayoshi'}</span>
      <span class="bot-tag ${c.receive ? 'is-on' : 'is-off'}">${c.receive ? 'Recebe' : 'Não recebe'}</span>`;
  }

  function personRow(m) {
    const c = state.contacts.get(m.id);
    return `
      <div class="bot-person" data-id="${m.id}">
        <div class="bot-person-info">
          <div class="bot-person-name">${esc(m.name)}${m.tier === 'diretoria' ? ' <i class="fa-solid fa-crown bot-crown" title="Diretoria"></i>' : ''}</div>
          <div class="bot-tags">${personTags(m)}</div>
        </div>
        <input class="form-input bot-phone" inputmode="tel" placeholder="(34) 99999-9999" value="${c ? `+${esc(c.whatsapp)}` : ''}">
        ${toggle('class="bot-receive"', !c || c.receive, 'Recebe')}
        <button class="btn btn-sm btn-outline bot-save" title="Salvar"><i class="fa-solid fa-floppy-disk"></i></button>
      </div>`;
  }

  function bindPeople() {
    content.querySelectorAll('.bot-person').forEach(row => row.querySelector('.bot-save').addEventListener('click', async () => {
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
        row.querySelector('.bot-tags').innerHTML = personTags(state.members.find(m => m.id === userId));
        Utils.showToast('Salvo!');
      } catch (err) {
        console.error('[MSY][bot]', err);
        Utils.showToast('Erro ao salvar. Tente novamente.', 'error');
      }
      btn.disabled = false;
    }));
  }

  /* ── Acesso ──────────────────────────────────────────── */
  function accessList() {
    const allowed = new Set(state.settings.allowed_senders || []);
    return state.members.map(m => `
      <label class="bot-access-item ${allowed.has(m.id) ? 'is-on' : ''}">
        <input type="checkbox" class="bot-sender" value="${m.id}" ${allowed.has(m.id) ? 'checked' : ''}>
        <span>${esc(m.name)}${m.id === profile.id ? ' <span class="bot-muted">(você)</span>' : ''}</span>
      </label>`).join('');
  }

  function bindAccess() {
    content.querySelectorAll('.bot-sender').forEach(i => i.addEventListener('change', () => i.closest('.bot-access-item').classList.toggle('is-on', i.checked)));
    document.getElementById('botSaveAccess').addEventListener('click', async () => {
      const ids = [...content.querySelectorAll('.bot-sender:checked')].map(i => i.value);
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

  /* ── Histórico (filtros + reenviar) ──────────────────── */
  const filters = { tipo: '', status: '', autor: '', periodo: '30', busca: '' };

  async function loadHistory() {
    const el = document.getElementById('botHistory');
    if (!el) return;
    el.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin"></i></div>';
    try {
      const { data, error } = await db.from('bot_messages')
        .select('id,sent_by,target_type,target,target_name,message,ok,error,created_at')
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      state.history = data || [];
      renderHistory();
    } catch (err) {
      console.error('[MSY][bot]', err);
      el.innerHTML = '<div class="empty-state">Erro ao carregar o histórico.</div>';
    }
  }

  function renderHistory() {
    const el = document.getElementById('botHistory');
    const names = Object.fromEntries(state.members.map(m => [m.id, m.name]));
    const authors = [...new Set(state.history.map(h => h.sent_by).filter(Boolean))];
    const select = (key, options) => `<select class="form-input form-select" data-filter="${key}">${options.map(([v, l]) => `<option value="${esc(v)}" ${filters[key] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

    el.innerHTML = `
      <div class="bot-filters">
        <input class="form-input" data-filter="busca" placeholder="Buscar mensagem, grupo ou pessoa..." value="${esc(filters.busca)}">
        ${select('tipo', [['', 'Grupos e privado'], ['grupo', 'Só grupos'], ['membro', 'Só privado']])}
        ${select('status', [['', 'Todos'], ['ok', 'Enviadas'], ['falha', 'Falhas']])}
        ${select('autor', [['', 'Qualquer pessoa'], ...authors.map(id => [id, names[id] || '—'])])}
        ${select('periodo', [['1', 'Hoje'], ['7', '7 dias'], ['30', '30 dias'], ['', 'Tudo']])}
      </div>
      <div class="bot-history" id="botHistoryList"></div>`;

    el.querySelectorAll('[data-filter]').forEach(input => input.addEventListener(input.tagName === 'INPUT' ? 'input' : 'change', () => {
      filters[input.dataset.filter] = input.value;
      renderHistoryList();
    }));
    renderHistoryList();
  }

  function renderHistoryList() {
    const list = document.getElementById('botHistoryList');
    const names = Object.fromEntries(state.members.map(m => [m.id, m.name]));
    const minDate = filters.periodo ? Date.now() - Number(filters.periodo) * 86400000 : 0;
    const busca = filters.busca.trim().toLowerCase();
    const rows = state.history.filter(h =>
      (!filters.tipo || h.target_type === filters.tipo) &&
      (!filters.status || (filters.status === 'ok') === h.ok) &&
      (!filters.autor || h.sent_by === filters.autor) &&
      (!minDate || new Date(h.created_at) >= minDate) &&
      (!busca || `${h.message} ${h.target_name || ''} ${names[h.target] || ''}`.toLowerCase().includes(busca)));

    list.innerHTML = !rows.length
      ? '<div class="empty-state">Nenhuma mensagem com esses filtros.</div>'
      : rows.map(h => `
          <div class="bot-history-item ${h.ok ? '' : 'is-failed'}">
            <div class="bot-history-head">
              <span class="badge ${h.ok ? 'badge-done' : 'badge-red'}">${h.ok ? 'Enviada' : 'Falhou'}</span>
              <span><i class="fa-solid ${h.target_type === 'grupo' ? 'fa-users' : 'fa-user'}"></i> ${esc(h.target_name || names[h.target] || h.target)}</span>
              <span class="bot-muted">por ${esc(names[h.sent_by] || '—')} · ${esc(Utils.formatDateTime(h.created_at))}</span>
              ${h.ok ? '' : `<button class="btn btn-sm btn-outline bot-resend" data-resend="${h.id}"><i class="fa-solid fa-rotate-right"></i> Reenviar</button>`}
            </div>
            <div class="bot-history-msg">${whatsappToHtml(h.message)}</div>
            ${h.error ? `<div class="bot-history-error">${esc(h.error)}</div>` : ''}
          </div>`).join('');

    list.querySelectorAll('[data-resend]').forEach(btn => btn.addEventListener('click', async () => {
      const h = state.history.find(x => String(x.id) === btn.dataset.resend);
      btn.disabled = true;
      try {
        if (h.target_type === 'grupo') await WhatsAppManager.request('POST', { grupo: h.target, mensagem: h.message, nome: h.target_name });
        else await WhatsAppManager.sendToUser(h.target, h.message, h.target_name || names[h.target]);
        Utils.showToast('Reenviada!');
      } catch (err) {
        console.error('[MSY][bot]', err);
        Utils.showToast(`Não reenviou: ${err.message}`, 'error');
      }
      loadHistory();
    }));
  }

  await reload();
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'bot') initBot().catch(error => { console.error('[MSY][bot]', error); Utils.showToast?.('Erro ao carregar o Bot Corvus.', 'error'); });
});
