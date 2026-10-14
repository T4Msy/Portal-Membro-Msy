/* ============================================================
   PAGE: REUNIÕES — agenda com convidados, solicitações e atas
   ============================================================ */

async function initReunioes() {
  const profile = await renderSidebar('reunioes');
  if (!profile) return;
  await renderTopBar('Reuniões', profile);

  const esc = value => Utils.escapeHtml(String(value ?? ''));
  const content = document.getElementById('pageContent');
  const isManager = profile.tier === 'diretoria'
    || await MSYPerms.check(profile.id, profile.tier, 'gerenciar_reunioes');

  const state = { tab: 'proximas', meetings: [], minutes: [], requests: [], members: null, attachments: new Map() };
  const FILES_BUCKET = 'meeting-files';
  const FILE_MAX_BYTES = 100 * 1024 * 1024;

  /* ── Helpers ─────────────────────────────────────────── */
  const todayIso = () => new Date().toLocaleDateString('en-CA');
  const toDate = iso => new Date(`${iso}T12:00:00`);
  const shortTime = time => (time ? String(time).slice(0, 5) : '');
  const daysUntil = iso => Math.round((toDate(iso) - toDate(todayIso())) / 86400000);

  const activeMembers = async () => {
    if (state.members) return state.members;
    const { data, error } = await db.from('profiles').select('id,name,initials,color,avatar_url,tier')
      .eq('status', 'ativo').order('name');
    if (error) throw error;
    state.members = data || [];
    return state.members;
  };

  const avatar = member => {
    const color = /^#[0-9a-f]{3,8}$/i.test(member?.color || '') ? member.color : '#7f1d1d';
    const inner = member?.avatar_url
      ? `<img src="${esc(member.avatar_url)}" alt="">`
      : esc(member?.initials || Utils.getInitials(member?.name || '?'));
    return `<span class="rn-avatar" style="--rn-c:${color}" title="${esc(member?.name || '')}">${inner}</span>`;
  };

  const formatSize = bytes => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  };
  const fileIcon = (mime = '', name = '') => {
    const ext = name.split('.').pop().toLowerCase();
    if (mime.startsWith('image/')) return 'fa-file-image';
    if (mime.startsWith('video/')) return 'fa-file-video';
    if (mime.startsWith('audio/')) return 'fa-file-audio';
    if (mime === 'application/pdf' || ext === 'pdf') return 'fa-file-pdf';
    if (['doc', 'docx', 'odt'].includes(ext)) return 'fa-file-word';
    if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return 'fa-file-excel';
    if (['ppt', 'pptx', 'odp'].includes(ext)) return 'fa-file-powerpoint';
    if (['zip', 'rar', '7z'].includes(ext)) return 'fa-file-zipper';
    return 'fa-file-lines';
  };
  const storageName = name => name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80) || 'arquivo';

  async function loadAttachments() {
    const { data, error } = await db.from('meeting_minute_attachments')
      .select('id,minute_id,file_name,file_path,mime_type,file_size').order('created_at');
    // Tabela ausente enquanto a migration de anexos não foi aplicada: segue sem anexos
    if (error) { console.warn('[MSY][reunioes] Anexos indisponíveis:', error); return new Map(); }
    const map = new Map();
    (data || []).forEach(item => {
      if (!map.has(item.minute_id)) map.set(item.minute_id, []);
      map.get(item.minute_id).push(item);
    });
    return map;
  }

  async function uploadMinuteFiles(minuteId, files) {
    let failed = 0;
    for (const [index, file] of files.entries()) {
      const path = `${minuteId}/${Date.now()}-${index}-${storageName(file.name)}`;
      const { error: uploadError } = await db.storage.from(FILES_BUCKET).upload(path, file, { contentType: file.type || undefined });
      if (uploadError) { console.error('[MSY][reunioes] Falha no upload:', uploadError); failed++; continue; }
      const { error: rowError } = await db.from('meeting_minute_attachments').insert({
        minute_id: minuteId, file_name: file.name, file_path: path,
        mime_type: file.type || null, file_size: file.size, created_by: profile.id,
      });
      if (rowError) {
        console.error('[MSY][reunioes] Falha ao registrar anexo:', rowError);
        await db.storage.from(FILES_BUCKET).remove([path]).catch(() => null);
        failed++;
      }
    }
    return failed;
  }

  const acceptFiles = (fileList, current) => {
    const accepted = [...current];
    [...fileList].forEach(file => {
      if (file.size > FILE_MAX_BYTES) return Utils.showToast(`"${file.name}" passa de 100MB.`, 'error');
      if (!accepted.some(item => item.name === file.name && item.size === file.size)) accepted.push(file);
    });
    return accepted;
  };

  const emptyState = (icon, text) => `<div class="rn-empty"><i class="fa-solid ${icon}"></i>${esc(text)}</div>`;
  const sectionLabel = (icon, label, muted = false) =>
    `<div class="rn-section-label${muted ? ' is-muted' : ''}"><i class="fa-solid ${icon}"></i> ${esc(label)}</div>`;

  const notifyParticipants = async (meetingId, userIds, message, icon = '📅') => {
    if (!userIds.length) return;
    const { error } = await db.rpc('notify_scheduled_meeting', {
      p_meeting_id: meetingId, p_user_ids: userIds, p_message: message,
      p_type: 'reuniao', p_icon: icon
    });
    if (error) console.warn('[MSY][reunioes] Falha ao notificar participantes:', error);
  };

  /* ── Estrutura da página ─────────────────────────────── */
  const statCount = isManager ? 4 : 3;
  content.innerHTML = `
    <div class="rn-shell">
      <section class="rn-hero card-enter">
        <div class="rn-hero-main">
          <div>
            <div class="rn-kicker"><i class="fa-solid fa-chess-king"></i> Conselho da Ordem</div>
            <h1 class="rn-title">Reuniões Masayoshi</h1>
            <div class="rn-subtitle">Agenda das reuniões, convidados, pautas e atas da Masayoshi Order — tudo num só lugar.</div>
            <div class="rn-hero-cta">
              ${isManager ? '<button class="btn btn-primary" id="rnNewMeeting"><i class="fa-solid fa-calendar-plus"></i> Nova Reunião</button>' : ''}
              <button class="btn ${isManager ? 'btn-outline' : 'btn-primary'}" id="rnRequest"><i class="fa-solid fa-handshake"></i> Solicitar Reunião</button>
            </div>
          </div>
          <div class="rn-hero-stats" style="--rn-stats:${statCount}">
            <div class="rn-stat"><div class="rn-stat-value" data-stat="proximas">0</div><div class="rn-stat-label">Próximas</div></div>
            <div class="rn-stat"><div class="rn-stat-value" data-stat="concluidas">0</div><div class="rn-stat-label">Concluídas</div></div>
            <div class="rn-stat"><div class="rn-stat-value" data-stat="atas">0</div><div class="rn-stat-label">Atas</div></div>
            ${isManager ? '<div class="rn-stat rn-stat-alert"><div class="rn-stat-value" data-stat="pendentes">0</div><div class="rn-stat-label">Pedidos</div></div>' : ''}
          </div>
        </div>
      </section>
      <div class="rn-tabs" role="tablist">
        <button class="rn-tab active" data-tab="proximas"><i class="fa-solid fa-calendar-days"></i> Próximas <span class="rn-tab-count" data-count="proximas"></span></button>
        <button class="rn-tab" data-tab="historico"><i class="fa-solid fa-clock-rotate-left"></i> Histórico</button>
        <button class="rn-tab" data-tab="atas"><i class="fa-solid fa-scroll"></i> Atas <span class="rn-tab-count" data-count="atas"></span></button>
        ${isManager ? '<button class="rn-tab" data-tab="solicitacoes"><i class="fa-solid fa-inbox"></i> Solicitações <span class="rn-tab-count is-alert" data-count="pendentes"></span></button>' : ''}
      </div>
      <div id="rnTab"><div class="rn-loading"><i class="fa-solid fa-circle-notch fa-spin"></i></div></div>
    </div>`;

  _injectMeetingModals(isManager);

  content.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.tab)));
  document.getElementById('rnRequest').addEventListener('click', openRequestModal);
  document.getElementById('rnNewMeeting')?.addEventListener('click', () => openMeetingModal());

  function switchTab(tab) {
    state.tab = tab;
    content.querySelectorAll('[data-tab]').forEach(item => item.classList.toggle('active', item.dataset.tab === tab));
    renderTab();
  }

  /* ── Carregamento ────────────────────────────────────── */
  async function loadMinutes() {
    const base = 'id,title,meeting_date,type,content,created_at';
    let res = await db.from('meeting_minutes').select(`${base},scheduled_meeting_id,meeting_id`).order('meeting_date', { ascending: false });
    // Fallback enquanto a migration 20261013_meetings_redesign não foi aplicada
    if (res.error && /scheduled_meeting_id|meeting_id/.test(res.error.message || '')) {
      res = await db.from('meeting_minutes').select(base).order('meeting_date', { ascending: false });
    }
    if (res.error) throw res.error;
    return res.data || [];
  }

  async function loadAll() {
    const tab = document.getElementById('rnTab');
    try {
      let legacyQuery = db.from('meetings').select('*').order('meeting_date', { ascending: false });
      if (!isManager) legacyQuery = legacyQuery.eq('type', 'geral');

      const [scheduled, legacy, minutes, requests, , attachments] = await Promise.all([
        db.from('scheduled_meetings')
          .select('*, participants:scheduled_meeting_participants(user_id, profile:profiles!scheduled_meeting_participants_user_id_fkey(id,name,initials,color,avatar_url))')
          .order('meeting_date', { ascending: false }),
        legacyQuery,
        loadMinutes(),
        isManager
          ? db.from('meeting_requests').select('*').order('created_at', { ascending: false })
          : Promise.resolve({ data: [] }),
        isManager ? activeMembers() : Promise.resolve([]),
        loadAttachments(),
      ]);
      if (scheduled.error) throw scheduled.error;
      if (legacy.error) throw legacy.error;
      if (requests.error) throw requests.error;

      state.minutes = minutes;
      state.attachments = attachments;
      state.requests = requests.data || [];
      const minuteByMeeting = new Map(minutes.filter(m => m.scheduled_meeting_id).map(m => [m.scheduled_meeting_id, m]));
      const minuteByLegacy = new Map(minutes.filter(m => m.meeting_id).map(m => [m.meeting_id, m]));

      state.meetings = [
        ...(scheduled.data || []).map(item => ({
          id: item.id,
          source: 'scheduled',
          title: item.title || 'Reunião com a Diretoria',
          date: item.meeting_date,
          time: item.meeting_time,
          description: item.description,
          status: item.status === 'concluida' ? 'concluida' : item.status === 'cancelada' ? 'cancelada' : 'agendada',
          participants: (item.participants || []).map(p => p.profile).filter(Boolean),
          audience: null,
          minute: minuteByMeeting.get(item.id) || null,
        })),
        ...(legacy.data || []).map(item => ({
          id: item.id,
          source: 'legacy',
          title: item.title,
          date: item.meeting_date,
          time: item.meeting_time,
          description: item.description,
          status: item.status === 'realizada' ? 'concluida' : item.status === 'cancelada' ? 'cancelada' : 'agendada',
          participants: [],
          audience: item.type === 'diretoria' ? 'Só a Diretoria' : 'Todos os membros',
          minute: minuteByLegacy.get(item.id) || null,
        })),
      ];
      updateCounters();
      renderTab();
    } catch (error) {
      console.error('[MSY][reunioes] Erro ao carregar reuniões:', error);
      tab.innerHTML = emptyState('fa-triangle-exclamation', 'Erro ao carregar. Tente recarregar a página.');
      Utils.showToast('Erro ao carregar reuniões.', 'error');
    }
  }

  const linkedMeeting = minute => state.meetings.find(m =>
    (m.source === 'scheduled' && m.id === minute.scheduled_meeting_id) || (m.source === 'legacy' && m.id === minute.meeting_id));

  const isUpcoming = meeting => meeting.status === 'agendada' && meeting.date >= todayIso();

  function updateCounters() {
    const counts = {
      proximas: state.meetings.filter(isUpcoming).length,
      concluidas: state.meetings.filter(m => m.status === 'concluida').length,
      atas: state.minutes.length,
      pendentes: state.requests.filter(r => r.status === 'pendente').length,
    };
    Object.entries(counts).forEach(([key, value]) => {
      content.querySelectorAll(`[data-stat="${key}"]`).forEach(el => { el.textContent = value; });
      content.querySelectorAll(`[data-count="${key}"]`).forEach(el => { el.textContent = value ? value : ''; });
    });
  }

  /* ── Renderização ────────────────────────────────────── */
  function renderTab() {
    const tab = document.getElementById('rnTab');
    if (state.tab === 'proximas') tab.innerHTML = renderUpcoming();
    if (state.tab === 'historico') tab.innerHTML = renderHistory();
    if (state.tab === 'atas') tab.innerHTML = renderMinutes();
    if (state.tab === 'solicitacoes') tab.innerHTML = renderRequests();
  }

  function renderUpcoming() {
    const upcoming = state.meetings.filter(isUpcoming)
      .sort((a, b) => (a.date + shortTime(a.time)).localeCompare(b.date + shortTime(b.time)));
    if (!upcoming.length) {
      return emptyState('fa-calendar-xmark', isManager
        ? 'Nenhuma reunião marcada. Clique em "Nova Reunião" para convocar os membros.'
        : 'Você não tem reuniões marcadas no momento.');
    }
    const thisWeek = upcoming.filter(m => daysUntil(m.date) <= 7);
    const later = upcoming.filter(m => daysUntil(m.date) > 7);
    return `${thisWeek.length ? sectionLabel('fa-bolt', 'Nos próximos 7 dias') + thisWeek.map(meetingCard).join('') : ''}
      ${later.length ? sectionLabel('fa-calendar-days', 'Mais adiante') + later.map(meetingCard).join('') : ''}`;
  }

  function renderHistory() {
    const past = state.meetings.filter(m => !isUpcoming(m))
      .sort((a, b) => (b.date + shortTime(b.time)).localeCompare(a.date + shortTime(a.time)));
    if (!past.length) return emptyState('fa-clock-rotate-left', 'Nenhuma reunião no histórico ainda.');
    const groups = new Map();
    past.forEach(meeting => {
      const label = toDate(meeting.date).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(meeting);
    });
    return [...groups.entries()].map(([label, items]) => sectionLabel('fa-calendar', label, true) + items.map(meetingCard).join('')).join('');
  }

  function meetingCard(meeting) {
    const date = toDate(meeting.date);
    const diff = daysUntil(meeting.date);
    const upcoming = isUpcoming(meeting);
    const statusLabel = { agendada: 'Agendada', concluida: 'Concluída', cancelada: 'Cancelada' }[meeting.status];
    const soon = upcoming ? (diff === 0 ? 'Hoje' : diff === 1 ? 'Amanhã' : diff <= 7 ? `Em ${diff} dias` : '') : '';
    const pastPending = meeting.status === 'agendada' && !upcoming;

    const people = meeting.audience
      ? `<div class="rn-people"><span class="rn-chip rn-chip-muted"><i class="fa-solid fa-users"></i> ${esc(meeting.audience)}</span></div>`
      : `<div class="rn-people">
          <div class="rn-avatars">${meeting.participants.slice(0, 6).map(avatar).join('')}${meeting.participants.length > 6 ? `<span class="rn-avatar rn-avatar-more">+${meeting.participants.length - 6}</span>` : ''}</div>
          <span class="rn-people-names">${esc(meeting.participants.map(p => p.name).join(', ') || 'Sem convidados')}</span>
        </div>`;

    let ataButton = '';
    if (meeting.minute) ataButton = `<button class="rn-ata-btn is-ready" data-act="view-ata" data-id="${meeting.id}" data-source="${meeting.source}"><i class="fa-solid fa-scroll"></i> Ver ata</button>`;
    else if (isManager && meeting.status !== 'cancelada') ataButton = `<button class="rn-ata-btn" data-act="write-ata" data-id="${meeting.id}" data-source="${meeting.source}"><i class="fa-solid fa-feather-pointed"></i> Escrever ata</button>`;

    let actions = '';
    if (isManager) {
      const open = meeting.status === 'agendada';
      actions = `<div class="rn-actions">
        ${open && meeting.source === 'scheduled' ? `<button class="rn-icon-btn" data-act="add" data-id="${meeting.id}" title="Convidar mais membros"><i class="fa-solid fa-user-plus"></i></button>` : ''}
        ${open ? `<button class="rn-icon-btn is-success" data-act="conclude" data-id="${meeting.id}" data-source="${meeting.source}" title="Marcar como concluída"><i class="fa-solid fa-circle-check"></i></button>` : ''}
        ${open && meeting.source === 'scheduled' ? `<button class="rn-icon-btn is-warn" data-act="cancel" data-id="${meeting.id}" title="Cancelar reunião"><i class="fa-solid fa-ban"></i></button>` : ''}
        <button class="rn-icon-btn is-danger" data-act="delete" data-id="${meeting.id}" data-source="${meeting.source}" title="Excluir"><i class="fa-solid fa-trash"></i></button>
      </div>`;
    }

    const cls = ['rn-card', 'card-enter', `is-${meeting.status}`, upcoming && diff === 0 ? 'is-today' : ''].filter(Boolean).join(' ');
    return `<article class="${cls}">
      <div class="rn-date" aria-hidden="true">
        <span class="rn-date-wd">${esc(date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''))}</span>
        <span class="rn-date-day">${date.getDate()}</span>
        <span class="rn-date-mon">${esc(date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''))}</span>
      </div>
      <div class="rn-card-body">
        <div class="rn-card-head">
          <div style="min-width:0">
            <div class="rn-chips">
              <span class="rn-chip rn-chip-${meeting.status}">${statusLabel}</span>
              ${soon ? `<span class="rn-chip rn-chip-soon"><i class="fa-solid fa-bolt"></i> ${soon}</span>` : ''}
              ${pastPending ? '<span class="rn-chip rn-chip-muted">Aguardando conclusão</span>' : ''}
            </div>
            <h3 class="rn-card-title">${esc(meeting.title)}</h3>
            <div class="rn-meta">
              <span><i class="fa-regular fa-calendar"></i>${esc(Utils.formatDate(meeting.date))}</span>
              ${meeting.time ? `<span><i class="fa-regular fa-clock"></i>${esc(shortTime(meeting.time))}</span>` : ''}
              ${meeting.audience ? '' : `<span><i class="fa-solid fa-user-group"></i>${meeting.participants.length} convidado${meeting.participants.length === 1 ? '' : 's'}</span>`}
            </div>
          </div>
          ${actions}
        </div>
        ${meeting.description ? `<div class="rn-pauta"><span class="rn-pauta-label">Pauta</span>${esc(meeting.description)}</div>` : ''}
        <div class="rn-card-foot">${people}${ataButton}</div>
      </div>
    </article>`;
  }

  function renderMinutes() {
    const header = isManager ? `<div style="margin-bottom:16px"><button class="btn btn-primary" data-act="new-ata"><i class="fa-solid fa-plus"></i> Nova Ata</button></div>` : '';
    if (!state.minutes.length) return header + emptyState('fa-scroll', 'Nenhuma ata disponível ainda.');
    return header + state.minutes.map(minute => `<div class="rn-row card-enter">
      <div class="rn-row-icon"><i class="fa-solid fa-scroll"></i></div>
      <div class="rn-row-body">
        <div class="rn-row-title">${esc(minute.title)}</div>
        <div class="rn-meta">
          <span><i class="fa-regular fa-calendar"></i>${esc(Utils.formatDate(minute.meeting_date))}</span>
          ${linkedMeeting(minute) ? `<span><i class="fa-solid fa-link"></i>${esc(linkedMeeting(minute).title)}</span>` : ''}
          ${state.attachments.get(minute.id)?.length ? `<span><i class="fa-solid fa-paperclip"></i>${state.attachments.get(minute.id).length} anexo${state.attachments.get(minute.id).length === 1 ? '' : 's'}</span>` : ''}
        </div>
      </div>
      <div class="rn-row-actions">
        <button class="btn btn-outline btn-sm" data-act="open-minute" data-id="${minute.id}"><i class="fa-solid fa-eye"></i> Ler</button>
        ${isManager ? `<button class="rn-icon-btn" data-act="minute-edit" data-id="${minute.id}" title="Editar ata"><i class="fa-solid fa-pen"></i></button>
        <button class="rn-icon-btn" data-act="minute-access" data-id="${minute.id}" title="Quem pode ler"><i class="fa-solid fa-user-shield"></i></button>
        <button class="rn-icon-btn is-danger" data-act="minute-delete" data-id="${minute.id}" title="Excluir ata"><i class="fa-solid fa-trash"></i></button>` : ''}
      </div>
    </div>`).join('');
  }

  function renderRequests() {
    const memberName = id => state.members?.find(m => m.id === id)?.name || 'Membro';
    const pending = state.requests.filter(r => r.status === 'pendente');
    const resolved = state.requests.filter(r => r.status !== 'pendente');
    const row = (request, withActions) => `<div class="rn-row card-enter">
      <div class="rn-row-icon"><i class="fa-solid fa-handshake"></i></div>
      <div class="rn-row-body">
        <div class="rn-chips"><span class="rn-chip rn-chip-${esc(request.status)}">${esc(request.status)}</span></div>
        <div class="rn-row-title">${esc(request.motivo)}</div>
        <div class="rn-meta">
          <span><i class="fa-solid fa-user"></i>${esc(memberName(request.user_id))}</span>
          <span><i class="fa-regular fa-calendar"></i>${esc(Utils.formatDate(String(request.created_at).split('T')[0]))}</span>
          ${request.data_sugerida ? `<span><i class="fa-regular fa-clock"></i>Sugere: ${esc(request.data_sugerida)}</span>` : ''}
        </div>
        ${request.descricao ? `<div class="rn-row-text">${esc(request.descricao)}</div>` : ''}
      </div>
      <div class="rn-row-actions">
        ${withActions ? `<button class="btn btn-gold btn-sm" data-act="accept-request" data-id="${request.id}"><i class="fa-solid fa-calendar-plus"></i> Aceitar e marcar</button>
        <button class="btn btn-ghost btn-sm" data-act="refuse-request" data-id="${request.id}"><i class="fa-solid fa-xmark"></i> Recusar</button>` : ''}
        <button class="rn-icon-btn is-danger" data-act="delete-request" data-id="${request.id}" title="Excluir solicitação"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`;
    return (pending.length ? sectionLabel('fa-inbox', `Aguardando resposta (${pending.length})`) + pending.map(r => row(r, true)).join('') : emptyState('fa-inbox', 'Nenhuma solicitação pendente.'))
      + (resolved.length ? sectionLabel('fa-check-double', 'Respondidas', true) + resolved.map(r => row(r, false)).join('') : '');
  }

  /* ── Ações nos cards ─────────────────────────────────── */
  document.getElementById('rnTab').addEventListener('click', async event => {
    const button = event.target.closest('[data-act]');
    if (!button) return;
    const { act, id, source } = button.dataset;
    const meeting = state.meetings.find(m => m.id === id && (!source || m.source === source));
    try {
      if (act === 'add') await openParticipantModal(meeting);
      if (act === 'conclude') await setStatus(meeting, 'concluida');
      if (act === 'cancel' && await MSYConfirm.show('Os convidados serão avisados do cancelamento.', { title: 'Cancelar reunião', type: 'warn' })) await setStatus(meeting, 'cancelada');
      if (act === 'delete') await deleteMeeting(meeting);
      if (act === 'write-ata') await openMinuteModal(meeting);
      if (act === 'view-ata') openMinuteView(meeting.minute);
      if (act === 'new-ata') await openMinuteModal(null);
      if (act === 'open-minute') openMinuteView(state.minutes.find(m => m.id === id));
      if (act === 'minute-edit') await openMinuteModal(null, state.minutes.find(m => m.id === id));
      if (act === 'minute-access') await openMinuteAccess(id);
      if (act === 'minute-delete') await deleteMinute(id);
      if (act === 'accept-request') await acceptRequest(id);
      if (act === 'refuse-request') await refuseRequest(id);
      if (act === 'delete-request') await deleteRequest(id);
    } catch (error) {
      console.error('[MSY][reunioes] Ação falhou:', act, error);
      Utils.showToast('Não foi possível concluir a ação. Tente novamente.', 'error');
    }
  });

  async function setStatus(meeting, status) {
    if (!meeting) return;
    if (meeting.source === 'legacy') {
      const { error } = await db.from('meetings').update({ status: status === 'concluida' ? 'realizada' : status }).eq('id', meeting.id);
      if (error) throw error;
    } else {
      const { error } = await db.from('scheduled_meetings').update({ status }).eq('id', meeting.id);
      if (error) throw error;
      await notifyParticipants(meeting.id, meeting.participants.map(p => p.id),
        status === 'concluida' ? `A reunião "${meeting.title}" foi concluída.` : `A reunião "${meeting.title}" foi cancelada.`,
        status === 'concluida' ? '✅' : '🚫');
    }
    Utils.showToast(status === 'concluida' ? 'Reunião concluída.' : 'Reunião cancelada.');
    await loadAll();
  }

  async function deleteMeeting(meeting) {
    if (!meeting) return;
    if (!(await MSYConfirm.show(`Excluir "${meeting.title}"? Essa ação não pode ser desfeita.`, { title: 'Excluir reunião' }))) return;
    const { error } = await db.from(meeting.source === 'legacy' ? 'meetings' : 'scheduled_meetings').delete().eq('id', meeting.id);
    if (error) throw error;
    Utils.showToast('Reunião excluída.');
    await loadAll();
  }

  async function deleteRequest(id) {
    if (!(await MSYConfirm.show('Excluir esta solicitação? Reuniões já marcadas a partir dela continuam na agenda.', { title: 'Excluir solicitação' }))) return;
    const { data, error } = await db.from('meeting_requests').delete().eq('id', id).select('id');
    if (error) throw error;
    // Sem permissão de exclusão o RLS não devolve erro, só não apaga nada
    if (!data?.length) return Utils.showToast('Sem permissão para excluir esta solicitação.', 'error');
    Utils.showToast('Solicitação excluída.');
    await loadAll();
  }

  async function refuseRequest(id) {
    const { error } = await db.from('meeting_requests').update({ status: 'recusado' }).eq('id', id);
    if (error) throw error;
    Utils.showToast('Solicitação recusada.');
    await loadAll();
  }

  async function acceptRequest(id) {
    const request = state.requests.find(r => r.id === id);
    if (!request) return;
    await openMeetingModal({
      requestId: request.id,
      title: request.motivo,
      description: request.descricao || request.motivo,
      selected: [request.user_id],
    });
  }

  /* ── Seletor de membros ──────────────────────────────── */
  function mountPicker(host, members, selectedIds = []) {
    const selected = new Set(selectedIds);
    host.innerHTML = `
      <div class="rn-picker-tools">
        <div class="rn-search"><i class="fa-solid fa-magnifying-glass"></i><input class="form-input" type="search" placeholder="Buscar membro..." data-pick-search></div>
        <button type="button" class="rn-quick" data-pick="all">Todos</button>
        <button type="button" class="rn-quick" data-pick="diretoria">Diretoria</button>
        <button type="button" class="rn-quick" data-pick="none">Limpar</button>
      </div>
      <div class="rn-picker-count" data-pick-count></div>
      <div class="rn-picker-grid">${members.map(member => `
        <button type="button" class="rn-pick" data-id="${member.id}" data-name="${esc((member.name || '').toLowerCase())}" aria-pressed="${selected.has(member.id)}">
          ${avatar(member)}<span class="rn-pick-name">${esc(member.name)}</span><i class="fa-solid fa-circle-check rn-pick-check"></i>
        </button>`).join('') || '<div class="rn-hint">Todos os membros ativos já foram convidados.</div>'}
      </div>`;

    const buttons = [...host.querySelectorAll('.rn-pick')];
    const refresh = () => {
      buttons.forEach(btn => btn.setAttribute('aria-pressed', String(selected.has(btn.dataset.id))));
      host.querySelector('[data-pick-count]').innerHTML = `<strong>${selected.size}</strong> selecionado${selected.size === 1 ? '' : 's'}`;
    };
    buttons.forEach(btn => btn.addEventListener('click', () => {
      selected.has(btn.dataset.id) ? selected.delete(btn.dataset.id) : selected.add(btn.dataset.id);
      refresh();
    }));
    host.querySelector('[data-pick-search]').addEventListener('input', event => {
      const term = event.target.value.trim().toLowerCase();
      buttons.forEach(btn => { btn.hidden = Boolean(term) && !btn.dataset.name.includes(term); });
    });
    host.querySelectorAll('[data-pick]').forEach(btn => btn.addEventListener('click', () => {
      if (btn.dataset.pick === 'none') selected.clear();
      if (btn.dataset.pick === 'all') buttons.filter(b => !b.hidden).forEach(b => selected.add(b.dataset.id));
      if (btn.dataset.pick === 'diretoria') members.filter(m => m.tier === 'diretoria').forEach(m => selected.add(m.id));
      refresh();
    }));
    refresh();
    return () => [...selected];
  }

  const openModal = id => document.getElementById(id).classList.add('open');
  const closeModal = id => document.getElementById(id).classList.remove('open');
  document.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.dataset.closeModal)));

  /* ── Nova reunião ────────────────────────────────────── */
  let getMeetingGuests = () => [];
  let meetingRequestId = null;

  async function openMeetingModal(prefill = {}) {
    const members = await activeMembers();
    meetingRequestId = prefill.requestId || null;
    document.getElementById('rn-meet-title').value = prefill.title || '';
    document.getElementById('rn-meet-date').value = '';
    document.getElementById('rn-meet-time').value = '19:00';
    document.getElementById('rn-meet-desc').value = prefill.description || '';
    getMeetingGuests = mountPicker(document.getElementById('rn-meet-picker'), members, prefill.selected || []);
    openModal('rnMeetingModal');
  }

  document.getElementById('rnMeetingSave')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    const title = document.getElementById('rn-meet-title').value.trim();
    const meeting_date = document.getElementById('rn-meet-date').value;
    const meeting_time = document.getElementById('rn-meet-time').value;
    const description = document.getElementById('rn-meet-desc').value.trim() || null;
    const ids = getMeetingGuests();
    if (!title || !meeting_date || !meeting_time) return Utils.showToast('Preencha título, data e horário.', 'error');
    if (!ids.length) return Utils.showToast('Escolha pelo menos um convidado.', 'error');

    button.disabled = true;
    try {
      const { data: meeting, error } = await db.from('scheduled_meetings').insert({
        created_by: profile.id, assigned_to: ids[0], title, meeting_date, meeting_time,
        description, status: 'agendada', meeting_request_id: meetingRequestId,
      }).select('id').single();
      if (error) throw error;

      const { error: participantError } = await db.from('scheduled_meeting_participants')
        .insert(ids.map(user_id => ({ meeting_id: meeting.id, user_id, added_by: profile.id })));
      if (participantError) {
        await db.from('scheduled_meetings').delete().eq('id', meeting.id);
        throw participantError;
      }
      if (meetingRequestId) {
        const { error: requestError } = await db.from('meeting_requests').update({ status: 'aprovado' }).eq('id', meetingRequestId);
        if (requestError) console.warn('[MSY][reunioes] Falha ao aprovar solicitação:', requestError);
      }
      await notifyParticipants(meeting.id, ids, `Você foi convocado para a reunião "${title}" em ${Utils.formatDate(meeting_date)} às ${meeting_time}.`);
      closeModal('rnMeetingModal');
      Utils.showToast(`Reunião marcada com ${ids.length} convidado${ids.length === 1 ? '' : 's'}.`);
      switchTab('proximas');
      await loadAll();
    } catch (error) {
      console.error('[MSY][reunioes] Erro ao marcar reunião:', error);
      Utils.showToast('Erro ao marcar reunião. Tente novamente.', 'error');
    } finally {
      button.disabled = false;
    }
  });

  /* ── Convidar mais membros ───────────────────────────── */
  let getExtraGuests = () => [];
  let extraMeeting = null;

  async function openParticipantModal(meeting) {
    if (!meeting) return;
    extraMeeting = meeting;
    const existing = new Set(meeting.participants.map(p => p.id));
    const members = (await activeMembers()).filter(m => !existing.has(m.id));
    document.getElementById('rnParticipantSubtitle').textContent = meeting.title;
    getExtraGuests = mountPicker(document.getElementById('rn-participant-picker'), members);
    openModal('rnParticipantModal');
  }

  document.getElementById('rnParticipantSave')?.addEventListener('click', async () => {
    const ids = getExtraGuests();
    if (!extraMeeting || !ids.length) return Utils.showToast('Escolha pelo menos um membro.', 'error');
    try {
      const { error } = await db.from('scheduled_meeting_participants')
        .insert(ids.map(user_id => ({ meeting_id: extraMeeting.id, user_id, added_by: profile.id })));
      if (error) throw error;
      await notifyParticipants(extraMeeting.id, ids, `Você foi convocado para a reunião "${extraMeeting.title}" em ${Utils.formatDate(extraMeeting.date)}${extraMeeting.time ? ` às ${shortTime(extraMeeting.time)}` : ''}.`);
      closeModal('rnParticipantModal');
      Utils.showToast('Convidados adicionados.');
      await loadAll();
    } catch (error) {
      console.error('[MSY][reunioes] Erro ao convidar membros:', error);
      Utils.showToast('Erro ao convidar membros.', 'error');
    }
  });

  /* ── Atas (criar e editar) ───────────────────────────── */
  let getMinuteViewers = () => [];
  let minuteLink = {};
  let editingMinute = null;
  let pendingFiles = [];
  let keptFiles = [];
  let removedFiles = [];

  function renderPendingFiles() {
    const list = document.getElementById('rn-ata-file-list');
    if (!list) return;
    const row = (icon, name, size, attr, badge = '') => `<div class="rn-file">
      <i class="fa-solid ${icon} rn-file-icon"></i>
      <span class="rn-file-name">${esc(name)}</span>${badge}<span class="rn-file-size">${esc(formatSize(size))}</span>
      <button type="button" class="rn-icon-btn is-danger" ${attr} title="Remover"><i class="fa-solid fa-xmark"></i></button>
    </div>`;
    list.innerHTML = keptFiles.map(file => row(fileIcon(file.mime_type || '', file.file_name), file.file_name, file.file_size, `data-remove-kept="${file.id}"`)).join('')
      + pendingFiles.map((file, index) => row(fileIcon(file.type, file.name), file.name, file.size, `data-remove-file="${index}"`, '<span class="rn-chip rn-chip-agendada">Novo</span>')).join('');
  }

  document.getElementById('rn-ata-files')?.addEventListener('change', event => {
    pendingFiles = acceptFiles(event.target.files, pendingFiles);
    event.target.value = '';
    renderPendingFiles();
  });
  document.getElementById('rn-ata-file-list')?.addEventListener('click', event => {
    const pending = event.target.closest('[data-remove-file]');
    const kept = event.target.closest('[data-remove-kept]');
    if (pending) pendingFiles.splice(Number(pending.dataset.removeFile), 1);
    if (kept) {
      removedFiles.push(...keptFiles.filter(file => file.id === kept.dataset.removeKept));
      keptFiles = keptFiles.filter(file => file.id !== kept.dataset.removeKept);
    }
    renderPendingFiles();
  });

  async function openMinuteModal(meeting, minute = null) {
    const members = await activeMembers();
    editingMinute = minute;
    pendingFiles = [];
    removedFiles = [];
    keptFiles = minute ? [...(state.attachments.get(minute.id) || [])] : [];

    let viewers = meeting ? meeting.participants.map(p => p.id) : [];
    // Reuniões antigas não têm convidados: sugere a Diretoria ou todos, conforme o tipo
    if (meeting?.source === 'legacy') viewers = members.filter(m => meeting.audience !== 'Só a Diretoria' || m.tier === 'diretoria').map(m => m.id);
    if (minute) {
      const { data, error } = await db.from('meeting_minute_viewers').select('user_id').eq('minute_id', minute.id);
      if (error) throw error;
      viewers = (data || []).map(item => item.user_id);
    }

    minuteLink = minute ? {}
      : meeting?.source === 'scheduled' ? { scheduled_meeting_id: meeting.id }
      : meeting?.source === 'legacy' ? { meeting_id: meeting.id } : {};
    const heading = minute ? 'Editar ata' : meeting ? 'Ata da reunião' : 'Nova ata';
    document.getElementById('rnMinuteModalTitle').innerHTML = `<i class="fa-solid fa-feather-pointed"></i> ${heading}`;
    document.getElementById('rn-ata-title').value = minute ? minute.title : meeting ? `Ata — ${meeting.title}` : '';
    document.getElementById('rn-ata-date').value = minute ? minute.meeting_date : meeting?.date || todayIso();
    document.getElementById('rn-ata-content').value = minute?.content || '';
    document.getElementById('rnMinuteSave').innerHTML = `<i class="fa-solid fa-floppy-disk"></i> ${minute ? 'Salvar alterações' : 'Salvar ata'}`;
    renderPendingFiles();
    getMinuteViewers = mountPicker(document.getElementById('rn-ata-picker'), members, viewers);
    closeModal('rnViewModal');
    openModal('rnMinuteModal');
  }

  async function saveMinuteViewers(minuteId, viewers, replace) {
    if (replace) {
      const { error } = await db.from('meeting_minute_viewers').delete().eq('minute_id', minuteId);
      if (error) throw error;
    }
    if (!viewers.length) return;
    const { error } = await db.from('meeting_minute_viewers')
      .insert(viewers.map(user_id => ({ minute_id: minuteId, user_id, added_by: profile.id })));
    if (error) throw error;
  }

  document.getElementById('rnMinuteSave')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    const title = document.getElementById('rn-ata-title').value.trim();
    const meeting_date = document.getElementById('rn-ata-date').value;
    if (!title || !meeting_date) return Utils.showToast('Preencha título e data.', 'error');
    const content = document.getElementById('rn-ata-content').value.trim() || null;
    const viewers = getMinuteViewers();
    const editing = editingMinute;
    const idleLabel = `<i class="fa-solid fa-floppy-disk"></i> ${editing ? 'Salvar alterações' : 'Salvar ata'}`;

    button.disabled = true;
    try {
      let minuteId;
      if (editing) {
        const { error } = await db.from('meeting_minutes').update({ title, meeting_date, content }).eq('id', editing.id);
        if (error) throw error;
        minuteId = editing.id;
      } else {
        const payload = { title, meeting_date, type: 'geral', content, created_by: profile.id };
        Object.assign(payload, minuteLink);
        const { data, error } = await db.from('meeting_minutes').insert(payload).select('id').single();
        if (error) throw error;
        minuteId = data.id;
      }

      try {
        await saveMinuteViewers(minuteId, viewers, Boolean(editing));
      } catch (viewerError) {
        console.error('[MSY][reunioes] Erro ao salvar leitores:', viewerError);
        Utils.showToast('Ata salva, mas houve erro ao atualizar os leitores.', 'error');
      }

      if (removedFiles.length) {
        const { error: removeError } = await db.from('meeting_minute_attachments').delete().in('id', removedFiles.map(file => file.id));
        if (removeError) console.error('[MSY][reunioes] Erro ao remover anexos:', removeError);
        else await db.storage.from(FILES_BUCKET).remove(removedFiles.map(file => file.file_path)).catch(() => null);
      }
      if (pendingFiles.length) {
        button.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Enviando anexos...';
        const failed = await uploadMinuteFiles(minuteId, pendingFiles);
        if (failed) Utils.showToast(`Ata salva, mas ${failed} anexo${failed === 1 ? '' : 's'} não ${failed === 1 ? 'pôde' : 'puderam'} ser enviado${failed === 1 ? '' : 's'}.`, 'error');
      }

      pendingFiles = [];
      removedFiles = [];
      editingMinute = null;
      closeModal('rnMinuteModal');
      Utils.showToast(editing ? 'Ata atualizada.' : 'Ata registrada.');
      await loadAll();
    } catch (error) {
      console.error('[MSY][reunioes] Erro ao salvar ata:', error);
      Utils.showToast('Erro ao salvar ata.', 'error');
    } finally {
      button.disabled = false;
      button.innerHTML = idleLabel;
    }
  });

  let viewingMinute = null;

  function openMinuteView(minute) {
    if (!minute) return Utils.showToast('Você não tem acesso a esta ata.', 'error');
    viewingMinute = minute;
    const linked = linkedMeeting(minute);
    const files = state.attachments.get(minute.id) || [];
    document.getElementById('rnViewModalTitle').textContent = minute.title;
    document.getElementById('rnViewBody').innerHTML = `
      <div class="rn-view-meta">
        <span class="rn-chip rn-chip-agendada"><i class="fa-regular fa-calendar"></i> ${esc(Utils.formatDate(minute.meeting_date))}</span>
        ${linked ? `<span class="rn-chip rn-chip-muted"><i class="fa-solid fa-link"></i> ${esc(linked.title)}</span>` : ''}
        ${isManager ? '<button type="button" class="rn-ata-btn rn-view-edit" data-view-act="edit"><i class="fa-solid fa-pen"></i> Editar ata</button>' : ''}
      </div>
      <div class="rn-view-body">${esc(minute.content || 'Sem conteúdo registrado.')}</div>
      ${files.length || isManager ? `<div class="rn-modal-section" style="margin-top:20px">Anexos</div>
        <div class="rn-file-list">${files.map(file => `<div class="rn-file">
          <i class="fa-solid ${fileIcon(file.mime_type || '', file.file_name)} rn-file-icon"></i>
          <span class="rn-file-name">${esc(file.file_name)}</span><span class="rn-file-size">${esc(formatSize(file.file_size))}</span>
          <button type="button" class="rn-icon-btn" data-file-act="download" data-id="${file.id}" title="Baixar"><i class="fa-solid fa-download"></i></button>
          ${isManager ? `<button type="button" class="rn-icon-btn is-danger" data-file-act="remove" data-id="${file.id}" title="Remover anexo"><i class="fa-solid fa-trash"></i></button>` : ''}
        </div>`).join('') || '<div class="rn-hint" style="margin:0">Nenhum anexo nesta ata.</div>'}</div>
        ${isManager ? `<label class="rn-drop rn-drop-sm"><input type="file" multiple hidden data-file-act="add"><i class="fa-solid fa-paperclip"></i> Adicionar anexo</label>` : ''}` : ''}`;
    openModal('rnViewModal');
  }

  document.getElementById('rnViewBody').addEventListener('click', async event => {
    if (event.target.closest('[data-view-act="edit"]') && viewingMinute) {
      try { await openMinuteModal(null, viewingMinute); } catch (error) {
        console.error('[MSY][reunioes] Erro ao abrir edição da ata:', error);
        Utils.showToast('Não foi possível abrir a ata para edição.', 'error');
      }
      return;
    }
    const button = event.target.closest('button[data-file-act]');
    if (!button || !viewingMinute) return;
    const file = (state.attachments.get(viewingMinute.id) || []).find(item => item.id === button.dataset.id);
    if (!file) return;
    try {
      if (button.dataset.fileAct === 'download') {
        const { data, error } = await db.storage.from(FILES_BUCKET).createSignedUrl(file.file_path, 300, { download: file.file_name });
        if (error) throw error;
        if (!window.open(data.signedUrl, '_blank', 'noopener')) window.location.href = data.signedUrl;
      }
      if (button.dataset.fileAct === 'remove') {
        if (!(await MSYConfirm.show(`Remover "${file.file_name}" da ata?`, { title: 'Remover anexo' }))) return;
        const { error } = await db.from('meeting_minute_attachments').delete().eq('id', file.id);
        if (error) throw error;
        await db.storage.from(FILES_BUCKET).remove([file.file_path]).catch(() => null);
        state.attachments.set(viewingMinute.id, (state.attachments.get(viewingMinute.id) || []).filter(item => item.id !== file.id));
        openMinuteView(viewingMinute);
        renderTab();
        Utils.showToast('Anexo removido.');
      }
    } catch (error) {
      console.error('[MSY][reunioes] Erro no anexo:', error);
      Utils.showToast('Não foi possível acessar o anexo.', 'error');
    }
  });

  document.getElementById('rnViewBody').addEventListener('change', async event => {
    if (event.target.dataset.fileAct !== 'add' || !viewingMinute) return;
    const files = acceptFiles(event.target.files, []);
    if (!files.length) return;
    const minute = viewingMinute;
    Utils.showToast(`Enviando ${files.length} anexo${files.length === 1 ? '' : 's'}...`);
    try {
      const failed = await uploadMinuteFiles(minute.id, files);
      state.attachments = await loadAttachments();
      if (failed) Utils.showToast(`${failed} anexo${failed === 1 ? '' : 's'} não ${failed === 1 ? 'pôde' : 'puderam'} ser enviado${failed === 1 ? '' : 's'}.`, 'error');
      else Utils.showToast('Anexos adicionados.');
      openMinuteView(minute);
      renderTab();
    } catch (error) {
      console.error('[MSY][reunioes] Erro ao enviar anexos:', error);
      Utils.showToast('Erro ao enviar anexos.', 'error');
    }
  });

  let getAccessViewers = () => [];
  let accessMinuteId = null;

  async function openMinuteAccess(minuteId) {
    const [members, viewers] = await Promise.all([
      activeMembers(),
      db.from('meeting_minute_viewers').select('user_id').eq('minute_id', minuteId),
    ]);
    if (viewers.error) throw viewers.error;
    accessMinuteId = minuteId;
    getAccessViewers = mountPicker(document.getElementById('rn-access-picker'), members, (viewers.data || []).map(v => v.user_id));
    openModal('rnAccessModal');
  }

  document.getElementById('rnAccessSave')?.addEventListener('click', async () => {
    const ids = getAccessViewers();
    try {
      const { error: removeError } = await db.from('meeting_minute_viewers').delete().eq('minute_id', accessMinuteId);
      if (removeError) throw removeError;
      if (ids.length) {
        const { error } = await db.from('meeting_minute_viewers')
          .insert(ids.map(user_id => ({ minute_id: accessMinuteId, user_id, added_by: profile.id })));
        if (error) throw error;
      }
      closeModal('rnAccessModal');
      Utils.showToast('Leitores atualizados.');
    } catch (error) {
      console.error('[MSY][reunioes] Erro ao salvar leitores:', error);
      Utils.showToast('Erro ao salvar leitores.', 'error');
    }
  });

  async function deleteMinute(id) {
    if (!(await MSYConfirm.show('Excluir esta ata e os anexos dela?', { title: 'Excluir ata' }))) return;
    const paths = (state.attachments.get(id) || []).map(file => file.file_path);
    const { error } = await db.from('meeting_minutes').delete().eq('id', id);
    if (error) throw error;
    if (paths.length) await db.storage.from(FILES_BUCKET).remove(paths).catch(() => null);
    Utils.showToast('Ata excluída.');
    await loadAll();
  }

  /* ── Solicitar reunião (todos) ───────────────────────── */
  function openRequestModal() {
    ['rn-sol-motivo', 'rn-sol-desc', 'rn-sol-data'].forEach(id => { document.getElementById(id).value = ''; });
    openModal('rnRequestModal');
  }

  document.getElementById('rnRequestSave').addEventListener('click', async () => {
    const motivo = document.getElementById('rn-sol-motivo').value.trim();
    if (!motivo) return Utils.showToast('Informe o motivo.', 'error');
    try {
      const { error } = await db.from('meeting_requests').insert({
        user_id: profile.id, motivo,
        descricao: document.getElementById('rn-sol-desc').value.trim() || null,
        data_sugerida: document.getElementById('rn-sol-data').value.trim() || null,
      });
      if (error) throw error;
      closeModal('rnRequestModal');
      Utils.showToast('Solicitação enviada à Diretoria.');
      if (isManager) await loadAll();
    } catch (error) {
      console.error('[MSY][reunioes] Erro ao solicitar reunião:', error);
      Utils.showToast('Erro ao enviar solicitação.', 'error');
    }
  });

  await loadAll();
}

function _injectMeetingModals(isManager) {
  ['rnRequestModal', 'rnMeetingModal', 'rnParticipantModal', 'rnMinuteModal', 'rnViewModal', 'rnAccessModal']
    .forEach(id => document.getElementById(id)?.remove());

  const modal = (id, title, body, footer, subtitleId = '') => `
    <div class="modal-overlay" id="${id}">
      <div class="modal rn-modal">
        <div class="modal-header">
          <div><div class="modal-title" id="${id}Title">${title}</div>${subtitleId ? `<div class="rn-hint" id="${subtitleId}" style="margin:4px 0 0"></div>` : ''}</div>
          <button class="modal-close" data-close-modal="${id}" aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      </div>
    </div>`;
  const cancel = id => `<button class="btn btn-ghost" data-close-modal="${id}">Cancelar</button>`;

  let html = modal('rnRequestModal', '<i class="fa-solid fa-handshake"></i> Solicitar Reunião', `
    <div class="rn-hint">A Diretoria recebe o pedido e marca a reunião com você.</div>
    <div class="form-group"><label class="form-label">Motivo *</label><input class="form-input" id="rn-sol-motivo" maxlength="140"></div>
    <div class="form-group"><label class="form-label">Detalhes</label><textarea class="form-input form-textarea" id="rn-sol-desc"></textarea></div>
    <div class="form-group"><label class="form-label">Sugestão de data/horário</label><input class="form-input" id="rn-sol-data" placeholder="Ex.: sexta à noite"></div>`,
    `${cancel('rnRequestModal')}<button class="btn btn-primary" id="rnRequestSave">Enviar pedido</button>`);

  html += modal('rnViewModal', '', '<div id="rnViewBody"></div>', '<button class="btn btn-outline" data-close-modal="rnViewModal">Fechar</button>');

  if (isManager) {
    html += modal('rnMeetingModal', '<i class="fa-solid fa-calendar-plus"></i> Nova Reunião', `
      <div class="form-group"><label class="form-label">Título *</label><input class="form-input" id="rn-meet-title" maxlength="140" placeholder="Ex.: Alinhamento do mês"></div>
      <div class="rn-form-grid">
        <div class="form-group"><label class="form-label">Data *</label><input class="form-input" type="date" id="rn-meet-date"></div>
        <div class="form-group"><label class="form-label">Horário *</label><input class="form-input" type="time" id="rn-meet-time" value="19:00"></div>
      </div>
      <div class="form-group"><label class="form-label">Pauta</label><textarea class="form-input form-textarea" id="rn-meet-desc" placeholder="O que vai ser discutido?"></textarea></div>
      <div class="rn-modal-section">Convidados *</div>
      <div class="rn-hint">Só os convidados veem a reunião. Para uma reunião geral, use "Todos".</div>
      <div id="rn-meet-picker"></div>`,
      `${cancel('rnMeetingModal')}<button class="btn btn-gold" id="rnMeetingSave"><i class="fa-solid fa-paper-plane"></i> Marcar reunião</button>`);

    html += modal('rnParticipantModal', '<i class="fa-solid fa-user-plus"></i> Convidar mais membros',
      '<div id="rn-participant-picker"></div>',
      `${cancel('rnParticipantModal')}<button class="btn btn-primary" id="rnParticipantSave">Convidar</button>`, 'rnParticipantSubtitle');

    html += modal('rnMinuteModal', '<i class="fa-solid fa-feather-pointed"></i> Nova ata', `
      <div class="rn-form-grid">
        <div class="form-group"><label class="form-label">Título *</label><input class="form-input" id="rn-ata-title" maxlength="160"></div>
        <div class="form-group"><label class="form-label">Data *</label><input class="form-input" type="date" id="rn-ata-date"></div>
      </div>
      <div class="form-group"><label class="form-label">Conteúdo</label><textarea class="form-input form-textarea" id="rn-ata-content" rows="8" placeholder="Decisões, responsáveis e próximos passos..."></textarea></div>
      <div class="rn-modal-section">Anexos <span class="rn-optional">(opcional)</span></div>
      <label class="rn-drop"><input type="file" id="rn-ata-files" multiple hidden>
        <i class="fa-solid fa-cloud-arrow-up"></i>
        <span>Clique para anexar arquivos</span>
        <small>PDF, imagens, planilhas, áudios... até 100MB cada</small>
      </label>
      <div class="rn-file-list" id="rn-ata-file-list"></div>
      <div class="rn-modal-section">Quem pode ler</div>
      <div class="rn-hint">Além da gestão, só os membros marcados leem a ata. Os convidados da reunião já vêm marcados.</div>
      <div id="rn-ata-picker"></div>`,
      `${cancel('rnMinuteModal')}<button class="btn btn-primary" id="rnMinuteSave"><i class="fa-solid fa-floppy-disk"></i> Salvar ata</button>`);

    html += modal('rnAccessModal', '<i class="fa-solid fa-user-shield"></i> Quem pode ler a ata',
      '<div id="rn-access-picker"></div>',
      `${cancel('rnAccessModal')}<button class="btn btn-primary" id="rnAccessSave">Salvar leitores</button>`);
  }

  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  [...wrap.children].forEach(element => document.body.appendChild(element));
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'reunioes') initReunioes().catch(error => { console.error('[MSY][reunioes]', error); Utils.showToast?.('Erro ao carregar reuniões.', 'error'); });
});
