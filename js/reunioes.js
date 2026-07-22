/* ============================================================
   PAGE: REUNIÕES — agenda privada, participantes e atas
   ============================================================ */

async function initReunioes() {
  const profile = await renderSidebar('reunioes');
  if (!profile) return;
  await renderTopBar('Reuniões', profile);

  const content = document.getElementById('pageContent');
  const isManager = profile.tier === 'diretoria'
    || await MSYPerms.check(profile.id, profile.tier, 'gerenciar_reunioes');
  let membersCache = null;
  let activeTab = 'reunioes';

  const activeMembers = async () => {
    if (membersCache) return membersCache;
    const { data, error } = await db.from('profiles').select('id,name,initials,color')
      .eq('status', 'ativo').order('name');
    if (error) throw error;
    membersCache = data || [];
    return membersCache;
  };

  const notifyParticipants = async (meetingId, userIds, message, icon = '📅') => {
    if (!userIds.length) return;
    const { error } = await db.rpc('notify_scheduled_meeting', {
      p_meeting_id: meetingId, p_user_ids: userIds, p_message: message,
      p_type: 'reuniao', p_icon: icon
    });
    if (error) console.warn('[MSY][reunioes] Falha ao notificar participantes:', error);
  };

  content.innerHTML = `
    <div class="page-header"><div>
      <div class="page-header-title">Reuniões</div>
      <div class="page-header-sub">Agenda privada, solicitações e atas</div>
    </div><button class="btn btn-primary" id="solicitarReunBtn"><i class="fa-solid fa-handshake"></i> Solicitar Reunião</button></div>
    <div class="filters-bar" style="margin-bottom:20px">
      <button class="filter-btn active" data-tab="reunioes"><i class="fa-solid fa-calendar-check"></i> Reuniões</button>
      ${isManager ? '<button class="filter-btn" data-tab="solicitacoes"><i class="fa-solid fa-inbox"></i> Solicitações</button>' : ''}
      <button class="filter-btn" data-tab="atas"><i class="fa-solid fa-file-lines"></i> Atas de Reunião</button>
    </div><div id="meetTab"></div>`;

  _injectMeetingModals(isManager);
  bindRequestModal();
  if (isManager) bindScheduleModal();

  content.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
    activeTab = button.dataset.tab;
    content.querySelectorAll('[data-tab]').forEach(item => item.classList.toggle('active', item === button));
    if (activeTab === 'reunioes') loadMeetings();
    if (activeTab === 'solicitacoes') loadRequests();
    if (activeTab === 'atas') loadMinutes();
  }));

  async function loadMeetings() {
    const tab = document.getElementById('meetTab');
    tab.innerHTML = loadingMarkup();
    let generalQuery = db.from('meetings').select('*').order('meeting_date', { ascending: false });
    if (!isManager) generalQuery = generalQuery.eq('type', 'geral');

    try {
      const [{ data: generals, error: generalError }, { data: personal, error: personalError }] = await Promise.all([
        generalQuery,
        db.from('scheduled_meetings')
          .select('*, participants:scheduled_meeting_participants(user_id, profile:profiles!scheduled_meeting_participants_user_id_fkey(name,initials,color))')
          .order('meeting_date', { ascending: false })
      ]);
      if (generalError) throw generalError;
      if (personalError) throw personalError;

      const today = new Date().toLocaleDateString('en-CA');
      const futurePersonal = (personal || []).filter(item => item.meeting_date >= today && item.status === 'agendada');
      const historyPersonal = (personal || []).filter(item => item.meeting_date < today || item.status !== 'agendada');
      const futureGeneral = (generals || []).filter(item => item.meeting_date >= today && item.status === 'agendada');
      const historyGeneral = (generals || []).filter(item => item.meeting_date < today || item.status !== 'agendada');

      tab.innerHTML = `
        ${isManager ? `<div style="margin-bottom:18px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary" id="newMeetBtn"><i class="fa-solid fa-calendar-plus"></i> Nova Reunião</button>
          <button class="btn btn-gold" id="agendarMeetBtn"><i class="fa-solid fa-user-clock"></i> Agendar com Membro</button>
        </div>` : ''}
        ${futurePersonal.length ? section('Reuniões ativas', futurePersonal.map(personalCard).join(''), 'fa-user-clock') : ''}
        ${futureGeneral.length ? section('Próximas reuniões gerais', futureGeneral.map(generalCard).join(''), 'fa-calendar-days') : ''}
        ${!futurePersonal.length && !futureGeneral.length ? empty('Nenhuma reunião ativa.') : ''}
        ${historyPersonal.length ? section('Histórico de reuniões privadas', historyPersonal.map(personalCard).join(''), 'fa-clock', true) : ''}
        ${historyGeneral.length ? section('Reuniões gerais passadas', historyGeneral.map(generalCard).join(''), 'fa-calendar', true) : ''}`;

      tab.querySelector('#newMeetBtn')?.addEventListener('click', () => document.getElementById('newMeetModal').classList.add('open'));
      tab.querySelector('#agendarMeetBtn')?.addEventListener('click', () => openScheduleModal());
      bindMeetingActions(tab, personal || []);
    } catch (error) {
      console.error('[MSY][reunioes] Erro ao carregar reuniões:', error);
      tab.innerHTML = empty('Erro ao carregar reuniões.');
      Utils.showToast('Erro ao carregar reuniões.', 'error');
    }
  }

  const section = (label, body, icon, muted = false) =>
    `<div class="meet-section-label" style="${muted ? 'color:var(--text-3)' : ''}"><i class="fa-solid ${icon}"></i> ${label}</div>${body}`;
  const empty = text => `<div class="empty-state" style="padding:32px"><div class="empty-state-text">${text}</div></div>`;
  const loadingMarkup = () => `<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin" style="color:var(--gold)"></i></div>`;

  function generalCard(meeting) {
    const status = meeting.status === 'realizada' ? 'Realizada' : meeting.status === 'cancelada' ? 'Cancelada' : 'Agendada';
    const color = meeting.status === 'realizada' ? '#10b981' : meeting.status === 'cancelada' ? '#ef4444' : 'var(--gold)';
    return `<div class="meet-card"><div class="meet-card-inner"><div class="meet-card-top"><div>
      <div class="meet-card-title">${Utils.escapeHtml(meeting.title)}</div><div class="meet-card-meta" style="margin-top:4px">
      <span><i class="fa-regular fa-calendar"></i> ${Utils.formatDate(meeting.meeting_date)}</span>
      ${meeting.meeting_time ? `<span><i class="fa-regular fa-clock"></i> ${meeting.meeting_time}</span>` : ''}
      <span><i class="fa-solid fa-users"></i> ${meeting.type === 'diretoria' ? 'Diretoria' : 'Geral'}</span>
      <span style="color:${color}">${status}</span></div></div>
      ${isManager ? `<div style="display:flex;gap:6px">${meeting.status === 'agendada' ? `<button class="btn btn-ghost btn-sm general-conclude" data-id="${meeting.id}" title="Concluir" style="color:#10b981"><i class="fa-solid fa-circle-check"></i></button>` : ''}<button class="btn btn-ghost btn-sm general-delete" data-id="${meeting.id}" title="Excluir" style="color:var(--red-bright)"><i class="fa-solid fa-trash"></i></button></div>` : ''}
    </div>${meeting.description ? `<div class="meet-card-desc">${Utils.escapeHtml(meeting.description)}</div>` : ''}</div></div>`;
  }

  function personalCard(meeting) {
    const participants = meeting.participants || [];
    const names = participants.map(item => item.profile?.name).filter(Boolean);
    const status = meeting.status === 'concluida' ? ['Concluída', 'meet-badge-approved'] : meeting.status === 'cancelada' ? ['Cancelada', 'meet-badge-refused'] : ['Agendada', 'meet-badge-personal'];
    return `<div class="meet-card" style="border-color:rgba(201,168,76,.18)"><div class="meet-card-inner"><div class="meet-card-top"><div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px"><div class="meet-card-title">Reunião com a Diretoria</div><span class="meet-badge ${status[1]}">${status[0]}</span></div>
      <div class="meet-card-meta"><span><i class="fa-regular fa-calendar"></i> ${Utils.formatDate(meeting.meeting_date)}</span><span><i class="fa-regular fa-clock"></i> ${meeting.meeting_time || '—'}</span><span><i class="fa-solid fa-users"></i> ${names.length} participante${names.length === 1 ? '' : 's'}</span></div>
      ${names.length ? `<div class="meet-card-meta" style="margin-top:7px"><span title="${Utils.escapeHtml(names.join(', '))}"><i class="fa-solid fa-user-group"></i> ${Utils.escapeHtml(names.join(', '))}</span></div>` : ''}
    </div>${isManager ? `<div style="display:flex;gap:6px">${meeting.status === 'agendada' ? `<button class="btn btn-ghost btn-sm add-participant" data-id="${meeting.id}" title="Adicionar membros" style="color:var(--gold)"><i class="fa-solid fa-user-plus"></i></button><button class="btn btn-ghost btn-sm scheduled-conclude" data-id="${meeting.id}" title="Concluir" style="color:#10b981"><i class="fa-solid fa-circle-check"></i></button><button class="btn btn-ghost btn-sm scheduled-cancel" data-id="${meeting.id}" title="Cancelar" style="color:#f59e0b"><i class="fa-solid fa-ban"></i></button>` : ''}<button class="btn btn-ghost btn-sm scheduled-delete" data-id="${meeting.id}" title="Excluir" style="color:var(--red-bright)"><i class="fa-solid fa-trash"></i></button></div>` : ''}</div>
      ${meeting.description ? `<div class="meet-card-desc">${Utils.escapeHtml(meeting.description)}</div>` : ''}</div></div>`;
  }

  function bindMeetingActions(tab, meetings) {
    tab.querySelectorAll('.general-conclude').forEach(btn => btn.addEventListener('click', () => updateGeneral(btn.dataset.id, 'realizada')));
    tab.querySelectorAll('.general-delete').forEach(btn => btn.addEventListener('click', () => deleteRow('meetings', btn.dataset.id, 'Excluir esta reunião?')));
    tab.querySelectorAll('.scheduled-conclude').forEach(btn => btn.addEventListener('click', () => updateScheduled(btn.dataset.id, 'concluida')));
    tab.querySelectorAll('.scheduled-cancel').forEach(btn => btn.addEventListener('click', async () => { if (await MSYConfirm.show('Cancelar esta reunião?', { title: 'Cancelar reunião', type: 'warn' })) updateScheduled(btn.dataset.id, 'cancelada'); }));
    tab.querySelectorAll('.scheduled-delete').forEach(btn => btn.addEventListener('click', () => deleteRow('scheduled_meetings', btn.dataset.id, 'Excluir esta reunião?')));
    tab.querySelectorAll('.add-participant').forEach(btn => btn.addEventListener('click', () => openParticipantModal(meetings.find(item => item.id === btn.dataset.id))));
  }

  async function updateGeneral(id, status) {
    const { error } = await db.from('meetings').update({ status }).eq('id', id);
    if (error) return Utils.showToast('Erro ao atualizar reunião.', 'error');
    Utils.showToast('Reunião atualizada.'); loadMeetings();
  }
  async function updateScheduled(id, status) {
    const meeting = await getMeeting(id);
    const { error } = await db.from('scheduled_meetings').update({ status }).eq('id', id);
    if (error) return Utils.showToast('Erro ao atualizar reunião.', 'error');
    await notifyParticipants(id, (meeting?.participants || []).map(item => item.user_id), status === 'concluida' ? 'Sua reunião com a Diretoria foi concluída.' : 'Sua reunião com a Diretoria foi cancelada.', status === 'concluida' ? '✅' : '🚫');
    Utils.showToast(status === 'concluida' ? 'Reunião concluída.' : 'Reunião cancelada.'); loadMeetings();
  }
  async function deleteRow(table, id, question) {
    if (!(await MSYConfirm.show(question, { title: 'Excluir reunião' }))) return;
    const { error } = await db.from(table).delete().eq('id', id);
    if (error) return Utils.showToast('Erro ao excluir.', 'error');
    Utils.showToast('Excluída.'); loadMeetings();
  }
  async function getMeeting(id) {
    const { data } = await db.from('scheduled_meetings').select('id,participants:scheduled_meeting_participants(user_id)').eq('id', id).single();
    return data;
  }

  async function loadRequests() {
    const tab = document.getElementById('meetTab'); tab.innerHTML = loadingMarkup();
    try {
      const { data, error } = await db.from('meeting_requests').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      const members = await activeMembers(); const map = Object.fromEntries(members.map(member => [member.id, member]));
      const pending = (data || []).filter(item => item.status === 'pendente'); const resolved = (data || []).filter(item => item.status !== 'pendente');
      const card = (request, actions) => `<div class="meet-req-card"><div style="display:flex;justify-content:space-between;gap:10px"><div><div style="font-weight:600;color:var(--text-1)">${Utils.escapeHtml(map[request.user_id]?.name || 'Membro')}</div><div style="font-size:.72rem;color:var(--text-3)">${Utils.formatDate(request.created_at.split('T')[0])}</div></div><span class="meet-badge ${request.status === 'aprovado' ? 'meet-badge-approved' : request.status === 'recusado' ? 'meet-badge-refused' : 'meet-badge-pending'}">${request.status}</span></div><div style="font-weight:600;margin:10px 0 6px">${Utils.escapeHtml(request.motivo)}</div>${request.descricao ? `<div style="font-size:.8rem;color:var(--text-2)">${Utils.escapeHtml(request.descricao)}</div>` : ''}${request.data_sugerida ? `<div class="meet-card-meta" style="margin-top:8px">Sugestão: ${Utils.escapeHtml(request.data_sugerida)}</div>` : ''}${actions ? `<div style="display:flex;gap:8px;margin-top:12px"><button class="btn btn-sm req-schedule" data-id="${request.id}" data-user="${request.user_id}" data-motivo="${Utils.escapeHtml(request.motivo)}"><i class="fa-solid fa-calendar-plus"></i> Aceitar e agendar</button><button class="btn btn-sm req-refuse" data-id="${request.id}" style="color:#ef4444"><i class="fa-solid fa-xmark"></i> Recusar</button></div>` : ''}</div>`;
      tab.innerHTML = `${pending.length ? section(`Solicitações pendentes (${pending.length})`, pending.map(item => card(item, true)).join(''), 'fa-inbox') : empty('Nenhuma solicitação pendente.')}${resolved.length ? section('Resolvidas', resolved.map(item => card(item, false)).join(''), 'fa-check-double', true) : ''}`;
      tab.querySelectorAll('.req-schedule').forEach(btn => btn.addEventListener('click', () => openScheduleModal({ requestId: btn.dataset.id, userId: btn.dataset.user, description: btn.dataset.motivo })));
      tab.querySelectorAll('.req-refuse').forEach(btn => btn.addEventListener('click', async () => { const { error } = await db.from('meeting_requests').update({ status: 'recusado' }).eq('id', btn.dataset.id); if (error) return Utils.showToast('Erro ao recusar.', 'error'); Utils.showToast('Solicitação recusada.'); loadRequests(); }));
    } catch (error) { console.error(error); tab.innerHTML = empty('Erro ao carregar solicitações.'); }
  }

  function bindRequestModal() {
    const modal = document.getElementById('solicitarModal'); const close = () => modal.classList.remove('open');
    document.getElementById('solicitarReunBtn').onclick = () => { ['sol-motivo', 'sol-desc', 'sol-data'].forEach(id => document.getElementById(id).value = ''); modal.classList.add('open'); };
    ['solModalClose', 'solModalCancel'].forEach(id => document.getElementById(id).onclick = close);
    document.getElementById('solModalSave').onclick = async () => { const motivo = document.getElementById('sol-motivo').value.trim(); if (!motivo) return Utils.showToast('Informe o motivo.', 'error'); const { error } = await db.from('meeting_requests').insert({ user_id: profile.id, motivo, descricao: document.getElementById('sol-desc').value.trim() || null, data_sugerida: document.getElementById('sol-data').value.trim() || null }); if (error) return Utils.showToast('Erro ao enviar.', 'error'); close(); Utils.showToast('Solicitação enviada.'); };
  }

  function bindScheduleModal() {
    const modal = document.getElementById('agendarModal');
    ['agendarClose', 'agendarCancel'].forEach(id => document.getElementById(id).onclick = () => modal.classList.remove('open'));
    document.getElementById('agendarSave').onclick = saveScheduledMeeting;
    document.getElementById('newMeetSave').onclick = async () => { const title = document.getElementById('nm-title').value.trim(); const meeting_date = document.getElementById('nm-date').value; if (!title || !meeting_date) return Utils.showToast('Preencha título e data.', 'error'); const { error } = await db.from('meetings').insert({ title, meeting_date, meeting_time: document.getElementById('nm-time').value || null, type: document.getElementById('nm-type').value, description: document.getElementById('nm-desc').value.trim() || null, status: 'agendada', created_by: profile.id }); if (error) return Utils.showToast('Erro ao criar.', 'error'); document.getElementById('newMeetModal').classList.remove('open'); Utils.showToast('Reunião criada.'); loadMeetings(); };
  }

  async function openScheduleModal(prefill = {}) {
    const members = await activeMembers(); const select = document.getElementById('ag-member');
    select.innerHTML = `<option value="">Selecionar membro...</option>` + members.map(member => `<option value="${member.id}" ${member.id === prefill.userId ? 'selected' : ''}>${Utils.escapeHtml(member.name)}</option>`).join('');
    document.getElementById('ag-request-id').value = prefill.requestId || '';
    document.getElementById('ag-request-member').textContent = prefill.userId
      ? `Solicitante: ${members.find(member => member.id === prefill.userId)?.name || 'Membro'}`
      : '';
    document.getElementById('ag-member-group').style.display = prefill.userId ? 'none' : '';
    document.getElementById('ag-description-group').style.display = prefill.userId ? 'none' : '';
    document.getElementById('ag-date').value = ''; document.getElementById('ag-time').value = '19:00'; document.getElementById('ag-desc').value = prefill.description || '';
    document.getElementById('agendarModal').classList.add('open');
  }

  async function saveScheduledMeeting() {
    const memberId = document.getElementById('ag-member').value;
    const ids = memberId ? [memberId] : [];
    const meeting_date = document.getElementById('ag-date').value; const meeting_time = document.getElementById('ag-time').value; const requestId = document.getElementById('ag-request-id').value || null;
    if (!ids.length || !meeting_date || !meeting_time) return Utils.showToast('Selecione membros, data e horário.', 'error');
    const { data: meeting, error } = await db.from('scheduled_meetings').insert({ created_by: profile.id, assigned_to: ids[0], meeting_date, meeting_time, description: document.getElementById('ag-desc').value.trim() || null, status: 'agendada', meeting_request_id: requestId }).select().single();
    if (error) return Utils.showToast(error.message || 'Erro ao agendar.', 'error');
    const { error: participantError } = await db.from('scheduled_meeting_participants').insert(ids.map(user_id => ({ meeting_id: meeting.id, user_id, added_by: profile.id })));
    if (participantError) { await db.from('scheduled_meetings').delete().eq('id', meeting.id); return Utils.showToast('Erro ao adicionar participantes.', 'error'); }
    if (requestId) { const { error: requestError } = await db.from('meeting_requests').update({ status: 'aprovado' }).eq('id', requestId); if (requestError) console.warn(requestError); }
    await notifyParticipants(meeting.id, ids, `Sua reunião com a Diretoria foi agendada para ${Utils.formatDate(meeting_date)} às ${meeting_time}.`);
    document.getElementById('agendarModal').classList.remove('open'); Utils.showToast('Reunião agendada.'); activeTab = 'reunioes'; content.querySelectorAll('[data-tab]').forEach(item => item.classList.toggle('active', item.dataset.tab === 'reunioes')); loadMeetings();
  }

  async function openParticipantModal(meeting) {
    if (!meeting) return; const members = await activeMembers(); const existing = new Set((meeting.participants || []).map(item => item.user_id));
    const select = document.getElementById('participant-members'); select.innerHTML = `<option value="">Selecionar membro...</option>` + members.filter(member => !existing.has(member.id)).map(member => `<option value="${member.id}">${Utils.escapeHtml(member.name)}</option>`).join('');
    document.getElementById('participant-meeting-id').value = meeting.id; document.getElementById('participantModal').classList.add('open');
  }
  document.getElementById('participantSave')?.addEventListener('click', async () => {
    const memberId = document.getElementById('participant-members').value; const ids = memberId ? [memberId] : []; const meetingId = document.getElementById('participant-meeting-id').value;
    if (!ids.length) return Utils.showToast('Selecione pelo menos um membro.', 'error');
    const { error } = await db.from('scheduled_meeting_participants').insert(ids.map(user_id => ({ meeting_id: meetingId, user_id, added_by: profile.id })));
    if (error) return Utils.showToast('Erro ao adicionar membros.', 'error'); await notifyParticipants(meetingId, ids, 'Você foi incluído em uma reunião com a Diretoria.'); document.getElementById('participantModal').classList.remove('open'); Utils.showToast('Participantes adicionados.'); loadMeetings();
  });
  ['participantClose', 'participantCancel'].forEach(id => document.getElementById(id)?.addEventListener('click', () => document.getElementById('participantModal').classList.remove('open')));

  async function loadMinutes() {
    const tab = document.getElementById('meetTab'); tab.innerHTML = loadingMarkup();
    try {
      const { data: minutes, error } = await db.from('meeting_minutes').select('*, creator:created_by(name)').order('meeting_date', { ascending: false }); if (error) throw error;
      tab.innerHTML = `${isManager ? '<div style="margin-bottom:18px"><button class="btn btn-primary" id="newAtaBtn"><i class="fa-solid fa-plus"></i> Nova Ata</button></div>' : ''}${(minutes || []).length ? (minutes || []).map(minute => `<div class="card card-enter" style="margin-bottom:10px"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><div><div style="font-weight:600;color:var(--text-1)">${Utils.escapeHtml(minute.title)}</div><div class="meet-card-meta"><span><i class="fa-regular fa-calendar"></i> ${Utils.formatDate(minute.meeting_date)}</span><span>${minute.type === 'diretoria' ? 'Diretoria' : 'Geral'}</span></div></div><div style="display:flex;gap:6px"><button class="btn btn-outline btn-sm view-ata" data-id="${minute.id}"><i class="fa-solid fa-eye"></i> Ver</button>${isManager ? `<button class="btn btn-ghost btn-sm manage-ata-access" data-id="${minute.id}" title="Quem pode ver" style="color:var(--gold)"><i class="fa-solid fa-user-shield"></i></button><button class="btn btn-ghost btn-sm delete-ata" data-id="${minute.id}" style="color:var(--red-bright)"><i class="fa-solid fa-trash"></i></button>` : ''}</div></div></div>`).join('') : empty('Nenhuma ata disponível.')}`;
      tab.querySelector('#newAtaBtn')?.addEventListener('click', () => openMinuteModal());
      tab.querySelectorAll('.view-ata').forEach(btn => btn.addEventListener('click', () => openMinuteView((minutes || []).find(item => item.id === btn.dataset.id))));
      tab.querySelectorAll('.delete-ata').forEach(btn => btn.addEventListener('click', () => deleteMinute(btn.dataset.id)));
      tab.querySelectorAll('.manage-ata-access').forEach(btn => btn.addEventListener('click', () => openMinuteAccess(btn.dataset.id)));
    } catch (error) { console.error(error); tab.innerHTML = empty('Erro ao carregar atas.'); }
  }

  async function openMinuteModal() { const members = await activeMembers(); document.getElementById('ata-viewers').innerHTML = members.map(member => `<option value="${member.id}">${Utils.escapeHtml(member.name)}</option>`).join(''); ['ata-title', 'ata-date', 'ata-content'].forEach(id => document.getElementById(id).value = ''); document.getElementById('newAtaModal').classList.add('open'); }
  document.getElementById('newAtaSave')?.addEventListener('click', async () => { const title = document.getElementById('ata-title').value.trim(); const meeting_date = document.getElementById('ata-date').value; if (!title || !meeting_date) return Utils.showToast('Preencha título e data.', 'error'); const viewers = [...document.getElementById('ata-viewers').selectedOptions].map(option => option.value); const { data: minute, error } = await db.from('meeting_minutes').insert({ title, meeting_date, type: document.getElementById('ata-type').value, content: document.getElementById('ata-content').value.trim() || null, created_by: profile.id }).select().single(); if (error) return Utils.showToast('Erro ao salvar ata.', 'error'); if (viewers.length) { const { error: viewerError } = await db.from('meeting_minute_viewers').insert(viewers.map(user_id => ({ minute_id: minute.id, user_id, added_by: profile.id }))); if (viewerError) return Utils.showToast('Ata salva, mas houve erro ao liberar acessos.', 'error'); } document.getElementById('newAtaModal').classList.remove('open'); Utils.showToast('Ata registrada.'); loadMinutes(); });
  async function openMinuteAccess(minuteId) { const [members, viewers] = await Promise.all([activeMembers(), db.from('meeting_minute_viewers').select('user_id').eq('minute_id', minuteId)]); if (viewers.error) return Utils.showToast('Erro ao carregar acessos.', 'error'); const selected = new Set((viewers.data || []).map(item => item.user_id)); document.getElementById('access-minute-id').value = minuteId; document.getElementById('ata-access-members').innerHTML = members.map(member => `<option value="${member.id}" ${selected.has(member.id) ? 'selected' : ''}>${Utils.escapeHtml(member.name)}</option>`).join(''); document.getElementById('ataAccessModal').classList.add('open'); }
  document.getElementById('ataAccessSave')?.addEventListener('click', async () => { const minuteId = document.getElementById('access-minute-id').value; const ids = [...document.getElementById('ata-access-members').selectedOptions].map(option => option.value); const { error: removeError } = await db.from('meeting_minute_viewers').delete().eq('minute_id', minuteId); if (removeError) return Utils.showToast('Erro ao atualizar acessos.', 'error'); if (ids.length) { const { error } = await db.from('meeting_minute_viewers').insert(ids.map(user_id => ({ minute_id: minuteId, user_id, added_by: profile.id }))); if (error) return Utils.showToast('Erro ao salvar acessos.', 'error'); } document.getElementById('ataAccessModal').classList.remove('open'); Utils.showToast('Acessos atualizados.'); });
  async function deleteMinute(id) { if (!(await MSYConfirm.show('Excluir esta ata?', { title: 'Excluir ata' }))) return; const { error } = await db.from('meeting_minutes').delete().eq('id', id); if (error) return Utils.showToast('Erro ao excluir.', 'error'); Utils.showToast('Ata excluída.'); loadMinutes(); }
  function openMinuteView(minute) { if (!minute) return; document.getElementById('ataViewTitle').textContent = minute.title; document.getElementById('ataViewBody').innerHTML = `<div class="meet-card-meta" style="margin-bottom:16px"><span>${Utils.formatDate(minute.meeting_date)}</span><span>${minute.type === 'diretoria' ? 'Diretoria' : 'Geral'}</span></div><div style="white-space:pre-wrap;line-height:1.7">${Utils.escapeHtml(minute.content || 'Sem conteúdo registrado.')}</div>`; document.getElementById('ataViewModal').classList.add('open'); }
  ['newAtaClose', 'newAtaCancel'].forEach(id => document.getElementById(id)?.addEventListener('click', () => document.getElementById('newAtaModal').classList.remove('open')));
  ['ataViewClose', 'ataViewCancel'].forEach(id => document.getElementById(id)?.addEventListener('click', () => document.getElementById('ataViewModal').classList.remove('open')));
  ['ataAccessClose', 'ataAccessCancel'].forEach(id => document.getElementById(id)?.addEventListener('click', () => document.getElementById('ataAccessModal').classList.remove('open')));

  await loadMeetings();
}

function _injectMeetingModals(isManager) {
  ['solicitarModal', 'newMeetModal', 'agendarModal', 'participantModal', 'newAtaModal', 'ataViewModal', 'ataAccessModal'].forEach(id => document.getElementById(id)?.remove());
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="modal-overlay" id="solicitarModal"><div class="modal"><div class="modal-header"><div class="modal-title">Solicitar Reunião</div><button class="modal-close" id="solModalClose"><i class="fa-solid fa-xmark"></i></button></div><div class="modal-body"><div class="form-group"><label class="form-label">Motivo *</label><input class="form-input" id="sol-motivo"></div><div class="form-group"><label class="form-label">Descrição</label><textarea class="form-input form-textarea" id="sol-desc"></textarea></div><div class="form-group"><label class="form-label">Sugestão de data/horário</label><input class="form-input" id="sol-data"></div></div><div class="modal-footer"><button class="btn btn-ghost" id="solModalCancel">Cancelar</button><button class="btn btn-primary" id="solModalSave">Enviar</button></div></div></div>${isManager ? `<div class="modal-overlay" id="newMeetModal"><div class="modal"><div class="modal-header"><div class="modal-title">Nova Reunião</div><button class="modal-close" onclick="document.getElementById('newMeetModal').classList.remove('open')"><i class="fa-solid fa-xmark"></i></button></div><div class="modal-body"><div class="form-group"><label class="form-label">Título *</label><input class="form-input" id="nm-title"></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="form-group"><label class="form-label">Data *</label><input class="form-input" type="date" id="nm-date"></div><div class="form-group"><label class="form-label">Horário</label><input class="form-input" type="time" id="nm-time" value="19:00"></div></div><div class="form-group"><label class="form-label">Tipo</label><select class="form-input" id="nm-type"><option value="geral">Geral</option><option value="diretoria">Diretoria</option></select></div><div class="form-group"><label class="form-label">Pauta</label><textarea class="form-input form-textarea" id="nm-desc"></textarea></div></div><div class="modal-footer"><button class="btn btn-primary" id="newMeetSave">Criar</button></div></div></div><div class="modal-overlay" id="agendarModal"><div class="modal"><div class="modal-header"><div class="modal-title">Agendar Reunião com Membros</div><button class="modal-close" id="agendarClose"><i class="fa-solid fa-xmark"></i></button></div><div class="modal-body"><input type="hidden" id="ag-request-id"><div class="form-group"><label class="form-label">Participantes *</label><select class="form-input" id="ag-members" multiple size="6"></select><div class="form-hint">Use Ctrl/Cmd para selecionar mais de um membro.</div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="form-group"><label class="form-label">Data *</label><input class="form-input" type="date" id="ag-date"></div><div class="form-group"><label class="form-label">Horário *</label><input class="form-input" type="time" id="ag-time" value="19:00"></div></div><div class="form-group"><label class="form-label">Pauta</label><textarea class="form-input form-textarea" id="ag-desc"></textarea></div></div><div class="modal-footer"><button class="btn btn-ghost" id="agendarCancel">Cancelar</button><button class="btn btn-gold" id="agendarSave">Agendar</button></div></div></div><div class="modal-overlay" id="participantModal"><div class="modal"><div class="modal-header"><div class="modal-title">Adicionar Participantes</div><button class="modal-close" id="participantClose"><i class="fa-solid fa-xmark"></i></button></div><div class="modal-body"><input type="hidden" id="participant-meeting-id"><div class="form-group"><label class="form-label">Membros</label><select class="form-input" id="participant-members" multiple size="8"></select></div></div><div class="modal-footer"><button class="btn btn-ghost" id="participantCancel">Cancelar</button><button class="btn btn-primary" id="participantSave">Adicionar</button></div></div></div><div class="modal-overlay" id="newAtaModal"><div class="modal"><div class="modal-header"><div class="modal-title">Nova Ata</div><button class="modal-close" id="newAtaClose"><i class="fa-solid fa-xmark"></i></button></div><div class="modal-body"><div class="form-group"><label class="form-label">Título *</label><input class="form-input" id="ata-title"></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="form-group"><label class="form-label">Data *</label><input class="form-input" type="date" id="ata-date"></div><div class="form-group"><label class="form-label">Tipo</label><select class="form-input" id="ata-type"><option value="geral">Geral</option><option value="diretoria">Diretoria</option></select></div></div><div class="form-group"><label class="form-label">Quem pode ver</label><select class="form-input" id="ata-viewers" multiple size="6"></select><div class="form-hint">Apenas os membros escolhidos, além da gestão, verão a ata.</div></div><div class="form-group"><label class="form-label">Conteúdo</label><textarea class="form-input form-textarea" id="ata-content"></textarea></div></div><div class="modal-footer"><button class="btn btn-ghost" id="newAtaCancel">Cancelar</button><button class="btn btn-primary" id="newAtaSave">Salvar Ata</button></div></div></div><div class="modal-overlay" id="ataAccessModal"><div class="modal"><div class="modal-header"><div class="modal-title">Acesso à Ata</div><button class="modal-close" id="ataAccessClose"><i class="fa-solid fa-xmark"></i></button></div><div class="modal-body"><input type="hidden" id="access-minute-id"><div class="form-group"><label class="form-label">Membros autorizados</label><select class="form-input" id="ata-access-members" multiple size="9"></select></div></div><div class="modal-footer"><button class="btn btn-ghost" id="ataAccessCancel">Cancelar</button><button class="btn btn-primary" id="ataAccessSave">Salvar acessos</button></div></div></div>` : ''}<div class="modal-overlay" id="ataViewModal"><div class="modal"><div class="modal-header"><div class="modal-title" id="ataViewTitle"></div><button class="modal-close" id="ataViewClose"><i class="fa-solid fa-xmark"></i></button></div><div class="modal-body" id="ataViewBody"></div><div class="modal-footer"><button class="btn btn-outline" id="ataViewCancel">Fechar</button></div></div></div>`;
  [...wrap.children].forEach(element => document.body.appendChild(element));
  if (isManager) {
    const initialMember = document.getElementById('ag-members');
    if (initialMember) {
      initialMember.id = 'ag-member';
      initialMember.removeAttribute('multiple');
      initialMember.removeAttribute('size');
      initialMember.closest('.modal').querySelector('.modal-title').textContent = 'Agendar Reunião';
      const group = initialMember.closest('.form-group');
      group.id = 'ag-member-group';
      group.querySelector('.form-label').textContent = 'Membro inicial *';
      group.querySelector('.form-hint')?.remove();
      group.insertAdjacentHTML('afterend', '<div id="ag-request-member" class="meet-card-meta" style="margin:-4px 0 12px"></div>');
      document.getElementById('ag-desc').closest('.form-group').id = 'ag-description-group';
    }
    const extraMember = document.getElementById('participant-members');
    if (extraMember) {
      extraMember.removeAttribute('multiple');
      extraMember.removeAttribute('size');
      extraMember.closest('.form-group').querySelector('.form-label').textContent = 'Adicionar membro';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'reunioes') initReunioes().catch(error => { console.error('[MSY][reunioes]', error); Utils.showToast?.('Erro ao carregar reuniões.', 'error'); });
});
