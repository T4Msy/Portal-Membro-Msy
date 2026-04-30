/* ============================================================
   PAGE: REUNIÕES — MSY Portal v2
   ============================================================ */

async function initReunioes() {
  const profile = await renderSidebar('reunioes');
  if (!profile) return;
  await renderTopBar('Reuniões', profile);

  const content     = document.getElementById('pageContent');
  const isDiretoria = profile.tier === 'diretoria';

  /* ── CSS ── */
  if (!document.getElementById('msy-meet-css')) {
    const s = document.createElement('style');
    s.id = 'msy-meet-css';
    s.textContent = `
      .meet-card {
        background: var(--black-3); border: 1px solid var(--border-faint);
        border-radius: var(--radius-lg); margin-bottom: 10px; overflow: hidden;
        transition: border-color .2s, box-shadow .2s;
      }
      .meet-card:hover { border-color: rgba(201,168,76,.22); box-shadow: 0 6px 24px rgba(0,0,0,.45); }
      .meet-card-inner { padding: 16px 20px; }
      .meet-card-top { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:8px; }
      .meet-card-title { font-family:'Cinzel',serif; font-size:.95rem; font-weight:700; color:var(--text-1); line-height:1.3; }
      .meet-card-meta { font-size:.74rem; color:var(--text-3); display:flex; gap:14px; flex-wrap:wrap; }
      .meet-card-desc { font-size:.81rem; color:var(--text-2); line-height:1.6; margin-top:8px; padding-top:8px; border-top:1px solid var(--border-faint); }
      .meet-section-label {
        display:flex; align-items:center; gap:10px;
        font-size:.62rem; color:var(--gold); text-transform:uppercase;
        letter-spacing:.14em; font-weight:700; margin:20px 0 12px;
      }
      .meet-section-label::after { content:''; flex:1; height:1px; background:linear-gradient(90deg,var(--border-gold),transparent); }
      .meet-section-label:first-child { margin-top:0; }
      .meet-req-card {
        background: var(--black-3); border: 1px solid var(--border-faint);
        border-radius: var(--radius-lg); padding:14px 18px; margin-bottom:10px;
      }
      .meet-badge {
        display:inline-flex; align-items:center; gap:4px;
        font-size:.62rem; font-weight:700; padding:3px 9px;
        border-radius:20px; border:1px solid; letter-spacing:.05em; text-transform:uppercase;
        white-space:nowrap;
      }
      .meet-badge-pending  { background:rgba(245,158,11,.1); border-color:rgba(245,158,11,.3); color:#f59e0b; }
      .meet-badge-approved { background:rgba(16,185,129,.1); border-color:rgba(16,185,129,.3); color:#10b981; }
      .meet-badge-refused  { background:rgba(220,38,38,.1);  border-color:rgba(220,38,38,.3);  color:#ef4444; }
      .meet-badge-personal { background:rgba(201,168,76,.1); border-color:rgba(201,168,76,.3); color:var(--gold); }
    `;
    document.head.appendChild(s);
  }

  /* ── Estrutura ── */
  content.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-header-title">Reuniões</div>
        <div class="page-header-sub">Reuniões oficiais e solicitações de call com a Diretoria</div>
      </div>
      <button class="btn btn-primary" id="solicitarReunBtn">
        <i class="fa-solid fa-handshake"></i> Solicitar Reunião
      </button>
    </div>
    <div class="filters-bar" style="margin-bottom:20px">
      <button class="filter-btn active" data-tab="reunioes"><i class="fa-solid fa-calendar-check"></i> Reuniões</button>
      ${isDiretoria ? `<button class="filter-btn" data-tab="solicitacoes"><i class="fa-solid fa-inbox"></i> Solicitações</button>` : ''}
      <button class="filter-btn" data-tab="atas"><i class="fa-solid fa-file-lines"></i> Atas de Reunião</button>
    </div>
    <div id="meetTab"></div>
  `;

  _injectModals(isDiretoria);
  _bindSolicitarModal(profile);
  if (isDiretoria) {
    _bindNewMeetModal(loadReunioes);
    await _bindAgendarModal(profile, loadReunioes);
  }

  let activeTab = 'reunioes';

  content.querySelectorAll('.filter-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      content.querySelectorAll('.filter-btn[data-tab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTab = btn.dataset.tab;
      if (activeTab === 'reunioes') loadReunioes();
      else if (activeTab === 'solicitacoes') loadSolicitacoes();
      else if (activeTab === 'atas') loadAtas();
    });
  });

  /* ══ Load Reuniões ══ */
  async function loadReunioes() {
    const tab = document.getElementById('meetTab');
    tab.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin" style="color:var(--gold)"></i></div>`;

    let geralQuery = db.from('meetings')
      .select('*')
      .order('meeting_date', { ascending: false });
    if (!isDiretoria) geralQuery = geralQuery.eq('type', 'geral');

    const schedQuery = isDiretoria
      ? db.from('scheduled_meetings')
          .select('*, member:assigned_to(name,initials,color,avatar_url)')
          .order('meeting_date', { ascending: false })
      : db.from('scheduled_meetings')
          .select('*, member:assigned_to(name,initials,color,avatar_url)')
          .eq('assigned_to', profile.id)
          .order('meeting_date', { ascending: false });

    const [{ data: reunioes, error: errR }, { data: pessoais, error: errP }] = await Promise.all([geralQuery, schedQuery]);

    if (errR) console.error('[MSY Reuniões] Erro meetings:', errR);
    if (errP) console.error('[MSY Reuniões] Erro scheduled_meetings:', errP);

    const today  = new Date().toISOString().split('T')[0];
    const futG   = (reunioes||[]).filter(r => r.meeting_date >= today && r.status !== 'realizada');
    const pastG  = (reunioes||[]).filter(r => r.meeting_date <  today || r.status === 'realizada');
    const futP   = (pessoais||[]).filter(r => r.meeting_date >= today && r.status === 'agendada');
    const pastP  = (pessoais||[]).filter(r => r.meeting_date <  today || r.status !== 'agendada');

    const geralCard = (r) => {
      const priv = r.type === 'diretoria';
      return `<div class="meet-card"><div class="meet-card-inner">
        <div class="meet-card-top">
          <div>
            <div class="meet-card-title">${Utils.escapeHtml(r.title)}</div>
            <div class="meet-card-meta" style="margin-top:4px">
              <span><i class="fa-regular fa-calendar"></i> ${Utils.formatDate(r.meeting_date)}</span>
              ${r.meeting_time ? `<span><i class="fa-regular fa-clock"></i> ${r.meeting_time}</span>` : ''}
              ${priv ? `<span style="color:#c084fc"><i class="fa-solid fa-lock" style="font-size:.6rem"></i> Diretoria</span>` : `<span><i class="fa-solid fa-users"></i> Geral</span>`}
              ${r.status === 'realizada' ? `<span style="color:#10b981"><i class="fa-solid fa-circle-check"></i> Realizada</span>` : ''}
            </div>
          </div>
          ${isDiretoria ? `<div style="display:flex;gap:6px">
            ${r.status !== 'realizada' ? `<button class="btn btn-ghost btn-sm meet-conclude-btn" data-id="${r.id}" style="color:#10b981" title="Realizada"><i class="fa-solid fa-circle-check"></i></button>` : ''}
            <button class="btn btn-ghost btn-sm meet-delete-btn" data-id="${r.id}" style="color:var(--red-bright)" title="Excluir"><i class="fa-solid fa-trash"></i></button>
          </div>` : ''}
        </div>
        ${r.description ? `<div class="meet-card-desc">${Utils.escapeHtml(r.description)}</div>` : ''}
      </div></div>`;
    };

    const pessoalCard = (r) => {
      const nome = isDiretoria ? (r.member?.name || '—') : 'Diretoria';
      const statusBadge = r.status === 'concluida'
        ? `<span class="meet-badge meet-badge-approved"><i class="fa-solid fa-circle-check"></i> Concluída</span>`
        : r.status === 'cancelada'
        ? `<span class="meet-badge meet-badge-refused"><i class="fa-solid fa-xmark"></i> Cancelada</span>`
        : `<span class="meet-badge meet-badge-personal"><i class="fa-solid fa-clock"></i> Agendada</span>`;
      return `<div class="meet-card" style="border-color:rgba(201,168,76,.18)"><div class="meet-card-inner">
        <div class="meet-card-top">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
              <div class="meet-card-title" style="font-size:.88rem">Reunião com a Diretoria</div>
              ${statusBadge}
            </div>
            <div class="meet-card-meta">
              <span><i class="fa-regular fa-calendar"></i> ${Utils.formatDate(r.meeting_date)}</span>
              <span><i class="fa-regular fa-clock"></i> ${r.meeting_time || '—'}</span>
              <span><i class="fa-solid fa-user"></i> ${Utils.escapeHtml(nome)}</span>
            </div>
          </div>
          ${isDiretoria ? `<div style="display:flex;gap:6px">
            ${r.status === 'agendada' ? `
              <button class="btn btn-ghost btn-sm sched-conclude-btn" data-id="${r.id}" style="color:#10b981" title="Concluir"><i class="fa-solid fa-circle-check"></i></button>
              <button class="btn btn-ghost btn-sm sched-cancel-btn" data-id="${r.id}" style="color:#f59e0b" title="Cancelar"><i class="fa-solid fa-ban"></i></button>
            ` : ''}
            <button class="btn btn-ghost btn-sm sched-delete-btn" data-id="${r.id}" style="color:var(--red-bright)" title="Excluir"><i class="fa-solid fa-trash"></i></button>
          </div>` : ''}
        </div>
        ${r.description ? `<div class="meet-card-desc">${Utils.escapeHtml(r.description)}</div>` : ''}
      </div></div>`;
    };

    tab.innerHTML = `
      ${isDiretoria ? `<div style="margin-bottom:18px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" id="newMeetBtn"><i class="fa-solid fa-calendar-plus"></i> Nova Reunião</button>
        <button class="btn btn-gold" id="agendarMeetBtn"><i class="fa-solid fa-user-clock"></i> Agendar com Membro</button>
      </div>` : ''}

      ${futP.length ? `
        <div class="meet-section-label" style="color:var(--gold)"><i class="fa-solid fa-user-clock"></i> ${isDiretoria ? 'Reuniões Agendadas com Membros' : 'Reuniões Agendadas Para Você'}</div>
        ${futP.map(pessoalCard).join('')}` : ''}

      ${futG.length ? `
        <div class="meet-section-label"><i class="fa-solid fa-calendar-days"></i> Próximas Reuniões</div>
        ${futG.map(geralCard).join('')}` : ''}

      ${!futP.length && !futG.length ? `
        <div class="empty-state" style="padding:40px">
          <div class="empty-state-icon"><i class="fa-solid fa-calendar-days"></i></div>
          <div class="empty-state-text">Nenhuma reunião agendada.</div>
        </div>` : ''}

      ${pastP.length ? `
        <div class="meet-section-label" style="color:var(--text-3)"><i class="fa-solid fa-user"></i> Reuniões Pessoais Passadas</div>
        ${pastP.map(pessoalCard).join('')}` : ''}

      ${pastG.length ? `
        <div class="meet-section-label" style="color:var(--text-3)"><i class="fa-regular fa-calendar"></i> Reuniões Passadas</div>
        ${pastG.map(geralCard).join('')}` : ''}
    `;

    tab.querySelector('#newMeetBtn')?.addEventListener('click', () => {
      ['nm-title','nm-desc'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('nm-date').value = '';
      document.getElementById('nm-time').value = '19:00';
      document.getElementById('newMeetModal').classList.add('open');
    });

    tab.querySelector('#agendarMeetBtn')?.addEventListener('click', () => {
      ['ag-desc'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('ag-date').value = '';
      document.getElementById('ag-time').value = '19:00';
      document.getElementById('ag-member').value = '';
      document.getElementById('agendarModal').classList.add('open');
    });

    tab.querySelectorAll('.meet-conclude-btn').forEach(btn => btn.addEventListener('click', async () => {
      const { error } = await db.from('meetings').update({ status: 'realizada' }).eq('id', btn.dataset.id);
      if (!error) { Utils.showToast('Marcada como realizada!'); loadReunioes(); }
      else Utils.showToast('Erro.', 'error');
    }));

    tab.querySelectorAll('.meet-delete-btn').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('Excluir esta reunião?')) return;
      const { error } = await db.from('meetings').delete().eq('id', btn.dataset.id);
      if (!error) { Utils.showToast('Excluída.'); loadReunioes(); }
      else Utils.showToast('Erro.', 'error');
    }));

    tab.querySelectorAll('.sched-conclude-btn').forEach(btn => btn.addEventListener('click', async () => {
      const { error } = await db.from('scheduled_meetings').update({ status: 'concluida' }).eq('id', btn.dataset.id);
      if (!error) { Utils.showToast('Concluída!'); loadReunioes(); }
      else Utils.showToast('Erro.', 'error');
    }));

    tab.querySelectorAll('.sched-cancel-btn').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('Cancelar esta reunião?')) return;
      const { error } = await db.from('scheduled_meetings').update({ status: 'cancelada' }).eq('id', btn.dataset.id);
      if (!error) { Utils.showToast('Cancelada.'); loadReunioes(); }
      else Utils.showToast('Erro.', 'error');
    }));

    tab.querySelectorAll('.sched-delete-btn').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('Excluir?')) return;
      const { error } = await db.from('scheduled_meetings').delete().eq('id', btn.dataset.id);
      if (!error) { Utils.showToast('Excluída.'); loadReunioes(); }
      else Utils.showToast('Erro.', 'error');
    }));
  }

  /* ══ Load Solicitações (Diretoria) ══ */
  async function loadSolicitacoes() {
    if (!isDiretoria) return;
    const tab = document.getElementById('meetTab');
    tab.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin" style="color:var(--gold)"></i></div>`;

    const { data: reqs, error } = await db.from('meeting_requests')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) { tab.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-3)">Erro ao carregar solicitações.</div>`; return; }

    // Buscar nomes dos solicitantes
    const uids = [...new Set((reqs||[]).map(r => r.user_id).filter(Boolean))];
    let profileMap = {};
    if (uids.length) {
      const { data: profs } = await db.from('profiles').select('id,name,initials,color').in('id', uids);
      (profs||[]).forEach(p => { profileMap[p.id] = p; });
    }
    // Injetar requester em cada request
    (reqs||[]).forEach(r => { r.requester = profileMap[r.user_id] || null; });

    const pendentes  = (reqs||[]).filter(r => r.status === 'pendente');
    const resolvidas = (reqs||[]).filter(r => r.status !== 'pendente');

    const renderReq = (r, actions) => {
      const bc = r.status === 'aprovado' ? 'meet-badge-approved' : r.status === 'recusado' ? 'meet-badge-refused' : 'meet-badge-pending';
      const bl = r.status === 'aprovado' ? 'Aprovado' : r.status === 'recusado' ? 'Recusado' : 'Pendente';
      return `<div class="meet-req-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px">
          <div>
            <div style="font-weight:600;color:var(--text-1);margin-bottom:2px">${Utils.escapeHtml(r.requester?.name||'—')}</div>
            <div style="font-size:.72rem;color:var(--text-3)">${Utils.formatDate(r.created_at?.split('T')[0])}</div>
          </div>
          <span class="meet-badge ${bc}">${bl}</span>
        </div>
        <div style="font-size:.85rem;font-weight:600;color:var(--text-1);margin-bottom:6px">${Utils.escapeHtml(r.motivo)}</div>
        ${r.descricao ? `<div style="font-size:.78rem;color:var(--text-2);margin-bottom:6px">${Utils.escapeHtml(r.descricao)}</div>` : ''}
        ${r.data_sugerida ? `<div style="font-size:.74rem;color:var(--text-3);margin-bottom:8px"><i class="fa-regular fa-calendar"></i> Sugestão: ${Utils.escapeHtml(r.data_sugerida)}</div>` : ''}
        ${actions ? `<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
          <button class="btn btn-sm req-approve" data-id="${r.id}" style="background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.3);color:#10b981"><i class="fa-solid fa-check"></i> Aprovar</button>
          <button class="btn btn-sm req-refuse"  data-id="${r.id}" style="background:rgba(220,38,38,.07);border:1px solid rgba(220,38,38,.25);color:#ef4444"><i class="fa-solid fa-xmark"></i> Recusar</button>
          <button class="btn btn-sm req-agendar" data-id="${r.id}" data-uid="${r.user_id}" data-motivo="${Utils.escapeHtml(r.motivo)}" style="background:rgba(201,168,76,.08);border:1px solid rgba(201,168,76,.25);color:var(--gold)"><i class="fa-solid fa-calendar-plus"></i> Agendar</button>
        </div>` : ''}
      </div>`;
    };

    tab.innerHTML = `
      ${pendentes.length
        ? `<div class="meet-section-label"><i class="fa-solid fa-inbox"></i> Pendentes (${pendentes.length})</div>${pendentes.map(r => renderReq(r, true)).join('')}`
        : `<div class="empty-state" style="padding:30px"><div class="empty-state-text">Nenhuma solicitação pendente.</div></div>`}
      ${resolvidas.length ? `<div class="meet-section-label" style="color:var(--text-3)"><i class="fa-solid fa-check-double"></i> Resolvidas</div>${resolvidas.map(r => renderReq(r, false)).join('')}` : ''}
    `;

    tab.querySelectorAll('.req-approve').forEach(btn => btn.addEventListener('click', async () => {
      btn.disabled = true;
      const { error } = await db.from('meeting_requests').update({ status: 'aprovado' }).eq('id', btn.dataset.id);
      if (!error) { Utils.showToast('Aprovado.'); loadSolicitacoes(); }
      else { Utils.showToast('Erro.', 'error'); btn.disabled = false; }
    }));

    tab.querySelectorAll('.req-refuse').forEach(btn => btn.addEventListener('click', async () => {
      btn.disabled = true;
      const { error } = await db.from('meeting_requests').update({ status: 'recusado' }).eq('id', btn.dataset.id);
      if (!error) { Utils.showToast('Recusado.'); loadSolicitacoes(); }
      else { Utils.showToast('Erro.', 'error'); btn.disabled = false; }
    }));

    tab.querySelectorAll('.req-agendar').forEach(btn => btn.addEventListener('click', async () => {
      await db.from('meeting_requests').update({ status: 'aprovado' }).eq('id', btn.dataset.id);
      // Pré-preenche modal de agendar
      const sel = document.getElementById('ag-member');
      if (sel) sel.value = btn.dataset.uid;
      document.getElementById('ag-desc').value = btn.dataset.motivo || '';
      document.getElementById('ag-date').value = '';
      document.getElementById('ag-time').value = '19:00';
      document.getElementById('agendarModal').classList.add('open');
      // Volta tab reuniões ao fechar/salvar
      activeTab = 'reunioes';
      content.querySelectorAll('.filter-btn[data-tab]').forEach(b =>
        b.classList.toggle('active', b.dataset.tab === 'reunioes')
      );
      loadReunioes();
    }));
  }

  /* ══ Load Atas de Reunião ══ */
  async function loadAtas() {
    const tab = document.getElementById('meetTab');
    tab.innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin" style="color:var(--gold)"></i></div>`;

    const { data: atas, error } = await db.from('meeting_minutes')
      .select('*, creator:created_by(name,initials,color)')
      .order('meeting_date', { ascending: false });

    if (error) { tab.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-3)">Erro ao carregar atas.</div>`; return; }

    const dirAtas = (atas||[]).filter(a => a.type === 'diretoria');
    const gerAtas = (atas||[]).filter(a => a.type === 'geral');

    // Inject modais de ata if not present
    if (!document.getElementById('newAtaModal')) _injectAtaModals();

    tab.innerHTML = `
      ${isDiretoria ? `<div style="margin-bottom:18px"><button class="btn btn-primary" id="newAtaBtn"><i class="fa-solid fa-plus"></i> Nova Ata</button></div>` : ''}

      <div style="font-size:.78rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px">
        <i class="fa-solid fa-shield-halved" style="color:var(--gold)"></i> Reuniões da Diretoria
      </div>
      ${dirAtas.length === 0
        ? `<div class="empty-state" style="padding:20px"><div class="empty-state-text">Nenhuma ata de diretoria.</div></div>`
        : dirAtas.map(a => renderAtaCard(a, isDiretoria)).join('')}

      <div style="font-size:.78rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-top:28px;margin-bottom:12px">
        <i class="fa-solid fa-users" style="color:var(--gold)"></i> Reuniões Gerais da Masayoshi
      </div>
      ${gerAtas.length === 0
        ? `<div class="empty-state" style="padding:20px"><div class="empty-state-text">Nenhuma ata geral.</div></div>`
        : gerAtas.map(a => renderAtaCard(a, isDiretoria)).join('')}
    `;

    document.getElementById('newAtaBtn')?.addEventListener('click', () => openNewAtaModal(profile, loadAtas));

    tab.querySelectorAll('.delete-ata-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm('Excluir esta ata?')) return;
        const { error } = await db.from('meeting_minutes').delete().eq('id', btn.dataset.id);
        if (!error) { Utils.showToast('Ata excluída.'); loadAtas(); }
        else Utils.showToast('Erro ao excluir.', 'error');
      });
    });

    tab.querySelectorAll('.view-ata-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const ata = atas.find(a => a.id === btn.dataset.id);
        if (!ata) return;
        document.getElementById('ataViewTitle').textContent = ata.title;
        document.getElementById('ataViewBody').innerHTML = `
          <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px">
            <span class="badge ${ata.type==='diretoria'?'badge-red':'badge-gold'}">${ata.type==='diretoria'?'Diretoria':'Geral'}</span>
            <span style="font-size:.8rem;color:var(--text-3)"><i class="fa-regular fa-calendar"></i> ${Utils.formatDate(ata.meeting_date)}</span>
          </div>
          <div style="font-size:.9rem;line-height:1.7;color:var(--text-2);white-space:pre-wrap">${Utils.escapeHtml(ata.content||'')}</div>`;
        const viewModal = document.getElementById('ataViewModal');
        viewModal.classList.add('open');
        document.getElementById('ataViewClose').onclick = () => viewModal.classList.remove('open');
        document.getElementById('ataViewCancel').onclick = () => viewModal.classList.remove('open');
        viewModal.onclick = e => { if (e.target === viewModal) viewModal.classList.remove('open'); };
      });
    });
  }

  await loadReunioes();
}


/* ══ Helpers ══ */

function _injectModals(isDiretoria) {
  ['solicitarModal','newMeetModal','agendarModal'].forEach(id => document.getElementById(id)?.remove());
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="modal-overlay" id="solicitarModal">
      <div class="modal" style="max-width:500px;background:#0e0e13;border:1px solid rgba(201,168,76,.2)">
        <div class="modal-header" style="background:linear-gradient(135deg,rgba(201,168,76,.07),transparent);border-bottom:1px solid rgba(201,168,76,.15)">
          <div class="modal-title font-cinzel" style="color:var(--gold)"><i class="fa-solid fa-handshake"></i> Solicitar Reunião</div>
          <button class="modal-close" id="solModalClose"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
          <div class="form-group"><label class="form-label">Motivo <span style="color:var(--red-bright)">*</span></label><input class="form-input" id="sol-motivo" placeholder="Ex: Discussão sobre projeto X..."></div>
          <div class="form-group"><label class="form-label">Descrição detalhada</label><textarea class="form-input form-textarea" id="sol-desc" style="min-height:80px" placeholder="Contexto adicional..."></textarea></div>
          <div class="form-group"><label class="form-label">Sugestão de data/horário</label><input class="form-input" id="sol-data" placeholder="Ex: Sábado 19h..."></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="solModalCancel">Cancelar</button>
          <button class="btn btn-primary" id="solModalSave"><i class="fa-solid fa-paper-plane"></i> Enviar</button>
        </div>
      </div>
    </div>
    ${isDiretoria ? `
    <div class="modal-overlay" id="newMeetModal">
      <div class="modal" style="max-width:520px;background:#0e0e13;border:1px solid rgba(201,168,76,.2)">
        <div class="modal-header" style="background:linear-gradient(135deg,rgba(201,168,76,.07),transparent);border-bottom:1px solid rgba(201,168,76,.15)">
          <div class="modal-title font-cinzel" style="color:var(--gold)"><i class="fa-solid fa-calendar-plus"></i> Nova Reunião</div>
          <button class="modal-close" id="newMeetClose"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
          <div class="form-group"><label class="form-label">Título <span style="color:var(--red-bright)">*</span></label><input class="form-input" id="nm-title" placeholder="Nome da reunião"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="form-group"><label class="form-label">Data <span style="color:var(--red-bright)">*</span></label><input class="form-input" type="date" id="nm-date"></div>
            <div class="form-group"><label class="form-label">Horário</label><input class="form-input" type="time" id="nm-time" value="19:00"></div>
          </div>
          <div class="form-group"><label class="form-label">Tipo</label>
            <select class="form-input form-select" id="nm-type">
              <option value="geral">Geral — todos os membros</option>
              <option value="diretoria">Diretoria — apenas interna</option>
            </select>
          </div>
          <div class="form-group"><label class="form-label">Descrição / Pauta</label><textarea class="form-input form-textarea" id="nm-desc" style="min-height:80px" placeholder="Tópicos da pauta..."></textarea></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="newMeetCancel">Cancelar</button>
          <button class="btn btn-primary" id="newMeetSave"><i class="fa-solid fa-calendar-plus"></i> Criar</button>
        </div>
      </div>
    </div>
    <div class="modal-overlay" id="agendarModal">
      <div class="modal" style="max-width:500px;background:#0e0e13;border:1px solid rgba(201,168,76,.2)">
        <div class="modal-header" style="background:linear-gradient(135deg,rgba(201,168,76,.07),transparent);border-bottom:1px solid rgba(201,168,76,.15)">
          <div class="modal-title font-cinzel" style="color:var(--gold)"><i class="fa-solid fa-user-clock"></i> Agendar Reunião com Membro</div>
          <button class="modal-close" id="agendarClose"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
          <div class="form-group"><label class="form-label">Membro <span style="color:var(--red-bright)">*</span></label><select class="form-input form-select" id="ag-member"><option value="">Carregando...</option></select></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="form-group"><label class="form-label">Data <span style="color:var(--red-bright)">*</span></label><input class="form-input" type="date" id="ag-date"></div>
            <div class="form-group"><label class="form-label">Horário <span style="color:var(--red-bright)">*</span></label><input class="form-input" type="time" id="ag-time" value="19:00"></div>
          </div>
          <div class="form-group"><label class="form-label">Descrição / Pauta</label><textarea class="form-input form-textarea" id="ag-desc" style="min-height:80px" placeholder="Contexto (opcional)..."></textarea></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="agendarCancel">Cancelar</button>
          <button class="btn btn-gold" id="agendarSave"><i class="fa-solid fa-calendar-check"></i> Agendar</button>
        </div>
      </div>
    </div>` : ''}
  `;
  [...wrap.children].forEach(el => document.body.appendChild(el));
}

function _bindSolicitarModal(profile) {
  const modal = document.getElementById('solicitarModal');
  const close = () => modal.classList.remove('open');
  document.getElementById('solicitarReunBtn').addEventListener('click', () => {
    ['sol-motivo','sol-desc','sol-data'].forEach(id => document.getElementById(id).value = '');
    modal.classList.add('open');
  });
  document.getElementById('solModalClose').addEventListener('click', close);
  document.getElementById('solModalCancel').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  document.getElementById('solModalSave').addEventListener('click', async () => {
    const motivo = document.getElementById('sol-motivo').value.trim();
    if (!motivo) { Utils.showToast('Informe o motivo.', 'error'); return; }
    const btn = document.getElementById('solModalSave');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Enviando...';
    const { error } = await db.from('meeting_requests').insert({
      user_id: profile.id,
      motivo,
      descricao: document.getElementById('sol-desc').value.trim() || null,
      data_sugerida: document.getElementById('sol-data').value.trim() || null,
      status: 'pendente'
    });
    if (!error) { close(); Utils.showToast('Solicitação enviada!'); }
    else Utils.showToast('Erro ao enviar.', 'error');
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Enviar';
  });
}

function _bindNewMeetModal(onSuccess) {
  const modal = document.getElementById('newMeetModal');
  if (!modal) return;
  const close = () => modal.classList.remove('open');
  document.getElementById('newMeetClose').addEventListener('click', close);
  document.getElementById('newMeetCancel').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  document.getElementById('newMeetSave').addEventListener('click', async () => {
    const title = document.getElementById('nm-title').value.trim();
    const date  = document.getElementById('nm-date').value;
    const time  = document.getElementById('nm-time').value || '19:00';
    const type  = document.getElementById('nm-type').value;
    const desc  = document.getElementById('nm-desc').value.trim();
    if (!title || !date) { Utils.showToast('Preencha título e data.', 'error'); return; }
    const btn = document.getElementById('newMeetSave');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Criando...';
    const { error } = await db.from('meetings').insert({ title, meeting_date: date, meeting_time: time, type, description: desc||null, status: 'agendada' });
    if (!error) { close(); Utils.showToast('Reunião criada!'); onSuccess(); }
    else Utils.showToast('Erro ao criar.', 'error');
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-calendar-plus"></i> Criar';
  });
}

async function _bindAgendarModal(profile, onSuccess) {
  const modal = document.getElementById('agendarModal');
  if (!modal) return;
  const close = () => modal.classList.remove('open');
  document.getElementById('agendarClose').addEventListener('click', close);
  document.getElementById('agendarCancel').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  // Carrega membros
  const { data: membros } = await db.from('profiles').select('id,name').eq('status','ativo').order('name');
  const sel = document.getElementById('ag-member');
  sel.innerHTML = `<option value="">Selecionar membro...</option>` +
    (membros||[]).map(m => `<option value="${m.id}">${Utils.escapeHtml(m.name)}</option>`).join('');

  document.getElementById('agendarSave').addEventListener('click', async () => {
    const uid  = document.getElementById('ag-member').value;
    const date = document.getElementById('ag-date').value;
    const time = document.getElementById('ag-time').value;
    const desc = document.getElementById('ag-desc').value.trim();
    if (!uid || !date || !time) { Utils.showToast('Preencha membro, data e horário.', 'error'); return; }
    const btn = document.getElementById('agendarSave');
    btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Agendando...';
    const { error } = await db.from('scheduled_meetings').insert({
      created_by: profile.id, assigned_to: uid,
      meeting_date: date, meeting_time: time,
      description: desc||null, status: 'agendada'
    });
    if (!error) { close(); Utils.showToast('Reunião agendada!'); onSuccess(); }
    else Utils.showToast('Erro ao agendar.', 'error');
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-calendar-check"></i> Agendar';
  });
}

function renderAtaCard(ata, isDiretoria) {
  return `
    <div class="card card-enter" style="margin-bottom:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <div style="flex:1">
          <div style="font-weight:600;color:var(--text-1);margin-bottom:2px">${Utils.escapeHtml(ata.title)}</div>
          <div style="font-size:.75rem;color:var(--text-3)"><i class="fa-regular fa-calendar"></i> ${Utils.formatDate(ata.meeting_date)}</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-outline btn-sm view-ata-btn" data-id="${ata.id}"><i class="fa-solid fa-eye"></i> Ver</button>
          ${isDiretoria ? `<button class="btn btn-ghost btn-sm delete-ata-btn" data-id="${ata.id}" style="color:var(--red-bright)"><i class="fa-solid fa-trash" style="font-size:.7rem"></i></button>` : ''}
        </div>
      </div>
    </div>`;
}

/* ── Diretoria: painel detalhado de presenças (evento ativo/futuro) ── */
async function openPresenceDetailModal(eventId, evento) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:580px;background:#0e0e13;border:1px solid rgba(201,168,76,.2);max-height:88vh;display:flex;flex-direction:column">
      <div class="modal-header" style="background:linear-gradient(135deg,rgba(201,168,76,.07),transparent);border-bottom:1px solid rgba(201,168,76,.15)">
        <div>
          <div class="modal-title font-cinzel" style="color:var(--gold)"><i class="fa-solid fa-users-viewfinder"></i> Detalhes de Presença</div>
          <div style="font-size:.72rem;color:var(--text-3);margin-top:2px">${evento ? Utils.escapeHtml(evento.title) : 'Evento'}</div>
        </div>
        <button class="modal-close" id="pdClose"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="modal-body" id="pdBody" style="overflow-y:auto;flex:1">
        <div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin" style="color:var(--gold)"></i></div>
      </div>
      <div class="modal-footer"><button class="btn btn-outline" id="pdDone">Fechar</button></div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#pdClose').addEventListener('click', close);
  overlay.querySelector('#pdDone').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  const [memRes, presRes, cancelRes] = await Promise.all([
    db.from('profiles').select('id,name,role,initials,color,avatar_url').eq('status','ativo').order('name'),
    db.from('event_presencas').select('*').eq('event_id', eventId),
    db.from('event_cancel_requests').select('*, requester:user_id(name)').eq('event_id', eventId).order('created_at',{ascending:false})
  ]);

  const membros = memRes.data || [];
  const presMap = {};
  (presRes.data||[]).forEach(p => { presMap[p.user_id || p.membro_id] = p; });
  const cancelReqs = cancelRes.data || [];

  const confirmados = membros.filter(m => {
    const s = presMap[m.id]?.status;
    return s === 'participar' || s === 'confirmado';
  });
  const justificados = membros.filter(m => {
    const s = presMap[m.id]?.status;
    return s === 'nao_participar' || s === 'ausente' || s === 'justificado';
  });
  const semResp = membros.filter(m => !presMap[m.id]);
  const cancelPend = cancelReqs.filter(r => r.status === 'pendente');

  const avatarHtml = m => m.avatar_url
    ? `<img src="${m.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
    : (m.initials || Utils.getInitials(m.name));

  const memberRow = (m, statusColor, statusIcon, extra = '') => `
    <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:rgba(255,255,255,.02);border-radius:8px;border:1px solid var(--border-faint);margin-bottom:6px">
      <div class="avatar" style="width:28px;height:28px;font-size:.5rem;flex-shrink:0;background:linear-gradient(135deg,${m.color||'#7f1d1d'},#1a1a1a)">${avatarHtml(m)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:.82rem;font-weight:600;color:var(--text-1)">${Utils.escapeHtml(m.name)}</div>
        ${m.role ? `<div style="font-size:.65rem;color:var(--text-3)">${Utils.escapeHtml(m.role)}</div>` : ''}
        ${extra}
      </div>
      <i class="${statusIcon}" style="color:${statusColor};font-size:.8rem;flex-shrink:0"></i>
    </div>`;

  const cancelCardHtml = (r) => `
    <div style="padding:10px 14px;background:rgba(245,158,11,.05);border:1px solid rgba(245,158,11,.2);border-radius:8px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <div style="font-size:.82rem;font-weight:600;color:var(--text-1)">${Utils.escapeHtml(r.requester?.name||'—')}</div>
        <span style="font-size:.62rem;padding:2px 8px;border-radius:12px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);color:#f59e0b">${r.status === 'pendente' ? 'Pendente' : r.status === 'aprovado' ? 'Aprovado' : 'Recusado'}</span>
      </div>
      <div style="font-size:.78rem;color:var(--text-2);margin-bottom:8px"><i class="fa-solid fa-comment-dots" style="color:#f59e0b;margin-right:5px;font-size:.7rem"></i>${Utils.escapeHtml(r.justificativa)}</div>
      ${r.status === 'pendente' ? `
        <div style="display:flex;gap:6px">
          <button class="btn btn-sm pd-cr-approve" data-rid="${r.id}" data-uid="${r.user_id}" data-eid="${r.event_id}" style="background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.3);color:#10b981"><i class="fa-solid fa-check"></i> Aprovar</button>
          <button class="btn btn-sm pd-cr-refuse" data-rid="${r.id}" style="background:rgba(220,38,38,.07);border:1px solid rgba(220,38,38,.25);color:#ef4444"><i class="fa-solid fa-xmark"></i> Recusar</button>
        </div>` : ''}
    </div>`;

  const sectionLabel = (label, count, color = 'var(--gold)') => `
    <div style="font-size:.62rem;color:${color};text-transform:uppercase;letter-spacing:.1em;font-weight:700;margin:16px 0 8px;display:flex;align-items:center;gap:8px">
      <span>${label}</span><span style="background:rgba(255,255,255,.05);border-radius:10px;padding:1px 8px;color:var(--text-3)">${count}</span>
      <div style="flex:1;height:1px;background:linear-gradient(90deg,rgba(255,255,255,.08),transparent)"></div>
    </div>`;

  const body = overlay.querySelector('#pdBody');
  body.innerHTML = `
    <!-- Resumo -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:4px">
      <div style="background:rgba(16,185,129,.07);border:1px solid rgba(16,185,129,.18);border-radius:10px;padding:10px;text-align:center">
        <div style="font-size:1.3rem;font-weight:700;color:#10b981">${confirmados.length}</div>
        <div style="font-size:.62rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-top:2px">Confirmados</div>
      </div>
      <div style="background:rgba(220,38,38,.07);border:1px solid rgba(220,38,38,.18);border-radius:10px;padding:10px;text-align:center">
        <div style="font-size:1.3rem;font-weight:700;color:#ef4444">${justificados.length}</div>
        <div style="font-size:.62rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-top:2px">Justificados</div>
      </div>
      <div style="background:rgba(255,255,255,.03);border:1px solid var(--border-faint);border-radius:10px;padding:10px;text-align:center">
        <div style="font-size:1.3rem;font-weight:700;color:var(--text-3)">${semResp.length}</div>
        <div style="font-size:.62rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-top:2px">Sem resp.</div>
      </div>
    </div>

    ${cancelPend.length ? `
      ${sectionLabel('<i class="fa-solid fa-rotate-left"></i> Pedidos de Cancelamento', cancelPend.length, '#f59e0b')}
      ${cancelPend.map(cancelCardHtml).join('')}
    ` : ''}

    ${confirmados.length ? `
      ${sectionLabel('<i class="fa-solid fa-check"></i> Vão Participar', confirmados.length, '#10b981')}
      ${confirmados.map(m => memberRow(m, '#10b981', 'fa-solid fa-check-circle')).join('')}
    ` : ''}

    ${justificados.length ? `
      ${sectionLabel('<i class="fa-solid fa-comment-dots"></i> Justificaram Ausência', justificados.length, '#ef4444')}
      ${justificados.map(m => {
        const just = presMap[m.id]?.justificativa;
        const extra = just ? `<div style="font-size:.72rem;color:var(--text-2);margin-top:3px;padding:4px 8px;background:rgba(220,38,38,.06);border-radius:5px;border-left:2px solid rgba(220,38,38,.3)"><i class="fa-solid fa-comment-dots" style="color:#ef4444;margin-right:4px;font-size:.65rem"></i>${Utils.escapeHtml(just)}</div>` : '';
        return memberRow(m, '#ef4444', 'fa-solid fa-comment-dots', extra);
      }).join('')}
    ` : ''}

    ${semResp.length ? `
      ${sectionLabel('<i class="fa-solid fa-minus"></i> Sem Resposta', semResp.length, 'var(--text-3)')}
      ${semResp.map(m => memberRow(m, 'var(--text-3)', 'fa-solid fa-minus-circle')).join('')}
    ` : ''}
  `;

  // Cancel request handlers
  body.querySelectorAll('.pd-cr-approve').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const [{ error: e1 }, { error: e2 }] = await Promise.all([
        db.from('event_presencas').delete().eq('event_id', btn.dataset.eid).eq('membro_id', btn.dataset.uid),
        db.from('event_cancel_requests').update({ status: 'aprovado' }).eq('id', btn.dataset.rid)
      ]);
      if (!e1 && !e2) { Utils.showToast('Cancelamento aprovado.'); btn.closest('[style*="rgba(245"]').remove(); }
      else { Utils.showToast('Erro.', 'error'); btn.disabled = false; }
    });
  });
  body.querySelectorAll('.pd-cr-refuse').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const { error } = await db.from('event_cancel_requests').update({ status: 'recusado' }).eq('id', btn.dataset.rid);
      if (!error) { Utils.showToast('Recusado.'); btn.closest('[style*="rgba(245"]').remove(); }
      else { Utils.showToast('Erro.', 'error'); btn.disabled = false; }
    });
  });
}

/* ── Presença: modal Gerenciar Presenças (evento concluído/encerrado) ── */
async function openPresenceManageModal(eventId, evento, onSuccess) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:560px;background:#0e0e13;border:1px solid rgba(201,168,76,.2);max-height:85vh;display:flex;flex-direction:column">
      <div class="modal-header" style="background:linear-gradient(135deg,rgba(201,168,76,.07),transparent);border-bottom:1px solid rgba(201,168,76,.15)">
        <div>
          <div class="modal-title font-cinzel" style="color:var(--gold)"><i class="fa-solid fa-clipboard-list"></i> Presenças</div>
          <div style="font-size:.72rem;color:var(--text-3);margin-top:2px">${evento ? Utils.escapeHtml(evento.title) : 'Evento'}</div>
        </div>
        <button class="modal-close" id="pmClose"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="modal-body" id="pmBody" style="overflow-y:auto;flex:1">
        <div class="empty-state"><i class="fa-solid fa-circle-notch fa-spin" style="color:var(--gold)"></i></div>
      </div>
      <div class="modal-footer"><button class="btn btn-outline" id="pmDone">Fechar</button></div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => { overlay.remove(); onSuccess(); };
  overlay.querySelector('#pmClose').addEventListener('click', close);
  overlay.querySelector('#pmDone').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  const [memRes, presRes] = await Promise.all([
    db.from('profiles').select('id,name,role,initials,color,avatar_url').eq('status','ativo').order('name'),
    db.from('event_presencas').select('*').eq('event_id', eventId)
  ]);

  const membros  = memRes.data || [];
  const presMap  = {};
  (presRes.data||[]).forEach(p => { presMap[p.user_id || p.membro_id] = p; });

  const conf  = Object.values(presMap).filter(p => p.status === 'participar' || p.status === 'confirmado').length;
  const skip  = Object.values(presMap).filter(p => p.status === 'nao_participar' || p.status === 'ausente').length;
  const sem   = membros.length - Object.keys(presMap).length;

  const body = overlay.querySelector('#pmBody');

  function statusIcon(s) {
    if (s === 'participar' || s === 'confirmado') return '<i class="fa-solid fa-check" style="color:#10b981"></i>';
    if (s === 'nao_participar' || s === 'ausente') return '<i class="fa-solid fa-xmark" style="color:#ef4444"></i>';
    if (s === 'justificado') return '<i class="fa-solid fa-comment-dots" style="color:#f59e0b"></i>';
    return '<i class="fa-solid fa-minus" style="color:var(--text-3)"></i>';
  }

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:18px">
      <div style="background:rgba(16,185,129,.07);border:1px solid rgba(16,185,129,.2);border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:1.4rem;font-weight:700;color:#10b981">${conf}</div>
        <div style="font-size:.65rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-top:2px">Presentes</div>
      </div>
      <div style="background:rgba(220,38,38,.07);border:1px solid rgba(220,38,38,.2);border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:1.4rem;font-weight:700;color:#ef4444">${skip}</div>
        <div style="font-size:.65rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-top:2px">Ausentes</div>
      </div>
      <div style="background:rgba(255,255,255,.03);border:1px solid var(--border-faint);border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:1.4rem;font-weight:700;color:var(--text-3)">${sem}</div>
        <div style="font-size:.65rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.06em;margin-top:2px">Sem registro</div>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${membros.map(m => {
        const p = presMap[m.id];
        const status = p?.status || null;
        const av = m.avatar_url
          ? `<img src="${m.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
          : (m.initials || Utils.getInitials(m.name));
        return `
          <div class="pm-row" data-uid="${m.id}" style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(255,255,255,.02);border-radius:8px;border:1px solid var(--border-faint)">
            <div class="avatar" style="width:28px;height:28px;font-size:.5rem;flex-shrink:0;background:linear-gradient(135deg,${m.color||'#7f1d1d'},#1a1a1a)">${av}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:.82rem;font-weight:600;color:var(--text-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${Utils.escapeHtml(m.name)}</div>
              ${m.role ? `<div style="font-size:.65rem;color:var(--text-3)">${Utils.escapeHtml(m.role)}</div>` : ''}
            </div>
            <div style="display:flex;gap:5px;flex-shrink:0;align-items:center">
              ${p?.justificativa ? `<button class="pm-btn pm-justif" data-uid="${m.id}" data-justif="${Utils.escapeHtml(p.justificativa)}" title="Ver justificativa" style="width:30px;height:30px;border-radius:7px;border:1px solid rgba(245,158,11,.4);background:rgba(245,158,11,.1);cursor:pointer;color:#f59e0b;font-size:.75rem;display:inline-flex;align-items:center;justify-content:center;transition:all .15s"><i class="fa-solid fa-comment-dots"></i></button>` : ''}
              <button class="pm-btn pm-present" data-uid="${m.id}" title="Presente" style="width:30px;height:30px;border-radius:7px;border:1px solid ${(status==='participar'||status==='confirmado')?'rgba(16,185,129,.5)':'var(--border-faint)'};background:${(status==='participar'||status==='confirmado')?'rgba(16,185,129,.15)':'rgba(255,255,255,.02)'};cursor:pointer;color:${(status==='participar'||status==='confirmado')?'#10b981':'var(--text-3)'};font-size:.75rem;display:inline-flex;align-items:center;justify-content:center;transition:all .15s">
                <i class="fa-solid fa-check"></i>
              </button>
              <button class="pm-btn pm-absent" data-uid="${m.id}" title="Ausente" style="width:30px;height:30px;border-radius:7px;border:1px solid ${(status==='nao_participar'||status==='ausente')?'rgba(220,38,38,.5)':'var(--border-faint)'};background:${(status==='nao_participar'||status==='ausente')?'rgba(220,38,38,.1)':'rgba(255,255,255,.02)'};cursor:pointer;color:${(status==='nao_participar'||status==='ausente')?'#ef4444':'var(--text-3)'};font-size:.75rem;display:inline-flex;align-items:center;justify-content:center;transition:all .15s">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
          </div>`;
      }).join('')}
    </div>`;

  async function setStatus(uid, status) {
    const ex = presMap[uid];
    let error;
    if (ex) {
      ({ error } = await db.from('event_presencas').update({ status }).eq('id', ex.id));
      if (!error) presMap[uid].status = status;
    } else {
      const { data, error: e } = await db.from('event_presencas').insert({
        event_id: eventId, user_id: uid, status
      }).select().single();
      error = e;
      if (!error) presMap[uid] = data;
    }
    if (error) { Utils.showToast('Erro ao registrar.', 'error'); return; }

    // Update row visually
    const row = body.querySelector(`.pm-row[data-uid="${uid}"]`);
    if (row) {
      const pBtn = row.querySelector('.pm-present');
      const aBtn = row.querySelector('.pm-absent');
      const isP = status === 'participar' || status === 'confirmado';
      const isA = status === 'nao_participar' || status === 'ausente';
      pBtn.style.cssText = `width:30px;height:30px;border-radius:7px;border:1px solid ${isP?'rgba(16,185,129,.5)':'var(--border-faint)'};background:${isP?'rgba(16,185,129,.15)':'rgba(255,255,255,.02)'};cursor:pointer;color:${isP?'#10b981':'var(--text-3)'};font-size:.75rem;display:inline-flex;align-items:center;justify-content:center;transition:all .15s`;
      aBtn.style.cssText = `width:30px;height:30px;border-radius:7px;border:1px solid ${isA?'rgba(220,38,38,.5)':'var(--border-faint)'};background:${isA?'rgba(220,38,38,.1)':'rgba(255,255,255,.02)'};cursor:pointer;color:${isA?'#ef4444':'var(--text-3)'};font-size:.75rem;display:inline-flex;align-items:center;justify-content:center;transition:all .15s`;
    }
  }

  body.querySelectorAll('.pm-present').forEach(btn => {
    btn.addEventListener('click', () => setStatus(btn.dataset.uid, 'confirmado'));
  });
  body.querySelectorAll('.pm-absent').forEach(btn => {
    btn.addEventListener('click', () => setStatus(btn.dataset.uid, 'ausente'));
  });
  body.querySelectorAll('.pm-justif').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const justif = btn.dataset.justif;
      const tip = document.createElement('div');
      tip.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55)';
      tip.innerHTML = `<div style="max-width:360px;width:90%;background:#0e0e13;border:1px solid rgba(245,158,11,.3);border-radius:12px;padding:20px 22px;box-shadow:0 12px 40px rgba(0,0,0,.7)">
        <div style="font-size:.62rem;color:#f59e0b;text-transform:uppercase;letter-spacing:.1em;font-weight:700;margin-bottom:10px"><i class="fa-solid fa-comment-dots"></i> Justificativa</div>
        <div style="font-size:.88rem;color:var(--text-2);line-height:1.6">${Utils.escapeHtml(justif)}</div>
        <button style="margin-top:16px;width:100%;padding:8px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:8px;color:#f59e0b;cursor:pointer;font-size:.82rem">Fechar</button>
      </div>`;
      document.body.appendChild(tip);
      const closeTip = () => tip.remove();
      tip.querySelector('button').addEventListener('click', closeTip);
      tip.addEventListener('click', e => { if (e.target === tip) closeTip(); });
    });
  });
}

/* ── Presença: modal Não Participar ── */

function openNewAtaModal(profile, onSuccess) {
  const modal = document.getElementById('newAtaModal');
  modal.classList.add('open');

  const closeAta = () => modal.classList.remove('open');
  document.getElementById('newAtaClose').onclick  = closeAta;
  document.getElementById('newAtaCancel').onclick = closeAta;
  modal.onclick = e => { if (e.target === modal) closeAta(); };

  document.getElementById('newAtaSave').onclick = async () => {
    const title        = document.getElementById('ata-title').value.trim();
    const meeting_date = document.getElementById('ata-date').value;
    const type         = document.getElementById('ata-type').value;
    const content      = document.getElementById('ata-content').value.trim();

    if (!title || !meeting_date) { Utils.showToast('Preencha título e data.', 'error'); return; }

    const btn = document.getElementById('newAtaSave');
    btn.disabled = true; btn.textContent = 'Salvando...';

    const { error } = await db.from('meeting_minutes').insert({
      title, meeting_date, type, content: content || null, created_by: profile.id
    });

    if (!error) {
      modal.classList.remove('open');
      Utils.showToast('Ata registrada!');
      onSuccess();
    } else {
      Utils.showToast('Erro ao salvar ata.', 'error');
      btn.disabled = false; btn.textContent = 'Salvar Ata';
    }
  };
}



function _injectAtaModals() {
  ['newAtaModal','ataViewModal'].forEach(id => document.getElementById(id)?.remove());
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <!-- New Ata Modal -->
       <div class="modal-overlay" id="newAtaModal">
         <div class="modal">
           <div class="modal-header">
             <div class="modal-title">Nova Ata de Reunião</div>
             <button class="modal-close" id="newAtaClose"><i class="fa-solid fa-xmark"></i></button>
           </div>
           <div class="modal-body">
             <div class="form-group" style="margin-bottom:14px">
               <label class="form-label">Título *</label>
               <input class="form-input" id="ata-title" placeholder="Ex: Reunião de Planejamento Q2">
             </div>
             <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
               <div class="form-group">
                 <label class="form-label">Data da Reunião *</label>
                 <input class="form-input" type="date" id="ata-date">
               </div>
               <div class="form-group">
                 <label class="form-label">Tipo *</label>
                 <select class="form-input form-select" id="ata-type">
                   <option value="geral">Geral da Masayoshi</option>
                   <option value="diretoria">Diretoria</option>
                 </select>
               </div>
             </div>
             <div class="form-group">
               <label class="form-label">Conteúdo / Resumo</label>
               <textarea class="form-input form-textarea" id="ata-content" style="min-height:120px" placeholder="O que foi discutido, decisões, pautas..."></textarea>
             </div>
           </div>
           <div class="modal-footer">
             <button class="btn btn-ghost" id="newAtaCancel">Cancelar</button>
             <button class="btn btn-primary" id="newAtaSave"><i class="fa-solid fa-file-circle-plus"></i> Salvar Ata</button>
           </div>
         </div>
       </div>
    <!-- View Ata Modal -->
       <div class="modal-overlay" id="ataViewModal">
         <div class="modal">
           <div class="modal-header">
             <div class="modal-title" id="ataViewTitle"></div>
             <button class="modal-close" id="ataViewClose"><i class="fa-solid fa-xmark"></i></button>
           </div>
           <div class="modal-body" id="ataViewBody"></div>
           <div class="modal-footer"><button class="btn btn-outline" id="ataViewCancel">Fechar</button></div>
         </div>
       </div>
  `;
  [...wrap.children].forEach(el => document.body.appendChild(el));
}

/* ── Router ── */
document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'reunioes') initReunioes();
});
