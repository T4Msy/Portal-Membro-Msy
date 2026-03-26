/* ============================================================
   MSY PORTAL — MODULES3.JS v1.0
   Sistema de Permissões · Alertas do Sistema
   Integração Eventos/Presenças com Permissões
   ============================================================ */

'use strict';

/* ============================================================
   SISTEMA DE PERMISSÕES — MSYPerms
   Permissões individuais por membro, independentes de cargo.
   ============================================================ */
const MSYPerms = {
  // Todas as permissões disponíveis no portal
  ALL: [
    // ── Eventos
    { key: 'criar_eventos',         label: 'Criar Eventos',          group: 'Eventos',    icon: 'fa-calendar-plus' },
    { key: 'editar_eventos',        label: 'Editar Eventos',         group: 'Eventos',    icon: 'fa-pen-to-square' },
    { key: 'excluir_eventos',       label: 'Excluir Eventos',        group: 'Eventos',    icon: 'fa-calendar-xmark' },
    { key: 'gerenciar_eventos',     label: 'Gerenciar Eventos',      group: 'Eventos',    icon: 'fa-calendar-days' },
    // ── Presenças
    { key: 'registrar_participantes', label: 'Registrar Participantes', group: 'Presenças', icon: 'fa-user-check' },
    { key: 'gerenciar_presencas',    label: 'Gerenciar Presenças',    group: 'Presenças', icon: 'fa-clipboard-list' },
    { key: 'ver_relatorio_presencas', label: 'Ver Relatório de Presenças', group: 'Presenças', icon: 'fa-chart-bar' },
    // ── Membros
    { key: 'aprovar_membros',       label: 'Aprovar Membros',        group: 'Membros',    icon: 'fa-user-check' },
    { key: 'editar_membros',        label: 'Editar Perfis de Membros', group: 'Membros',  icon: 'fa-user-pen' },
    { key: 'remover_membros',       label: 'Desativar Membros',      group: 'Membros',    icon: 'fa-user-slash' },
    // ── Atividades
    { key: 'criar_atividades',      label: 'Criar Atividades',       group: 'Atividades', icon: 'fa-plus' },
    { key: 'editar_atividades',     label: 'Editar Atividades',      group: 'Atividades', icon: 'fa-pen' },
    { key: 'gerenciar_atividades',  label: 'Gerenciar Atividades',   group: 'Atividades', icon: 'fa-list-check' },
    { key: 'concluir_atividades',   label: 'Concluir/Cancelar Atividades', group: 'Atividades', icon: 'fa-circle-check' },
    // ── Comunicados
    { key: 'publicar_comunicados',  label: 'Publicar Comunicados',   group: 'Comunicados', icon: 'fa-bullhorn' },
    { key: 'gerenciar_comunicados', label: 'Gerenciar Comunicados',  group: 'Comunicados', icon: 'fa-newspaper' },
    // ── Ranking
    { key: 'gerenciar_ranking',     label: 'Gerenciar Rankings',     group: 'Ranking',    icon: 'fa-ranking-star' },
    // ── Biblioteca
    { key: 'gerenciar_biblioteca',  label: 'Gerenciar Biblioteca',   group: 'Biblioteca', icon: 'fa-book-open' },
    // ── Feed
    { key: 'publicar_feed',         label: 'Publicar no Feed',       group: 'Feed',       icon: 'fa-rss' },
    // ── Administração
    { key: 'ver_desempenho',        label: 'Ver Painel de Desempenho', group: 'Admin',    icon: 'fa-chart-line' },
    { key: 'notificar_membros',     label: 'Enviar Notificações',    group: 'Admin',      icon: 'fa-bell' },
    { key: 'gerenciar_permissoes',  label: 'Gerenciar Permissões',   group: 'Admin',      icon: 'fa-shield-halved' },
  ],

  // Cache de permissões do usuário atual
  _cache: null,
  _cacheUid: null,

  /** Carrega permissões do usuário atual do banco */
  async load(userId) {
    if (this._cacheUid === userId && this._cache !== null) return this._cache;
    const { data } = await db.from('member_permissions').select('permissions').eq('user_id', userId).single();
    this._cache = (data?.permissions) || [];
    this._cacheUid = userId;
    return this._cache;
  },

  /** Invalida cache */
  invalidate() { this._cache = null; this._cacheUid = null; },

  /** Verifica se usuário tem permissão (ou é diretoria) */
  async check(userId, tier, permKey) {
    if (tier === 'diretoria') return true;
    const perms = await this.load(userId);
    return perms.includes(permKey);
  },

  /** Verifica múltiplas permissões (qualquer uma basta) */
  async checkAny(userId, tier, permKeys) {
    if (tier === 'diretoria') return true;
    const perms = await this.load(userId);
    return permKeys.some(k => perms.includes(k));
  },

  /** Salva permissões de um membro (admin only) — INSERT ou UPDATE separados para evitar RLS */
  async save(userId, permissions) {
    const ts = new Date().toISOString();
    // Tenta UPDATE primeiro
    const { error: updErr, data: updData } = await db
      .from('member_permissions')
      .update({ permissions, updated_at: ts })
      .eq('user_id', userId)
      .select('user_id');

    if (!updErr && updData && updData.length > 0) {
      // UPDATE ok
      if (userId === this._cacheUid) this.invalidate();
      return true;
    }

    // Registro não existe ainda — INSERT
    const { error: insErr } = await db
      .from('member_permissions')
      .insert({ user_id: userId, permissions, updated_at: ts });

    if (insErr) {
      console.error('[MSY Perms] Erro ao salvar permissões:', insErr);
      return false;
    }

    if (userId === this._cacheUid) this.invalidate();
    return true;
  },

  /** Carrega permissões de um membro específico */
  async loadFor(userId) {
    const { data } = await db.from('member_permissions').select('permissions').eq('user_id', userId).single();
    return (data?.permissions) || [];
  },
};

/* ============================================================
   MODAL DE GERENCIAR PERMISSÕES
   Acessível apenas para diretoria, via painel admin.
   ============================================================ */
async function openPermissionsManager() {
  /* ── Injetar CSS premium ── */
  if (!document.getElementById('msy-perms-modal-css')) {
    const s = document.createElement('style');
    s.id = 'msy-perms-modal-css';
    s.textContent = `
      #permsManagerModal .modal {
        max-width: 820px; max-height: 92vh;
        display: flex; flex-direction: column;
        padding: 0; overflow: hidden;
        background: #0b0b0f;
        border: 1px solid rgba(201,168,76,.22);
      }
      #permsManagerModal .modal-header {
        background: linear-gradient(135deg,#0f0f15,#0b0b0f);
        border-bottom: 1px solid rgba(201,168,76,.15);
        padding: 18px 24px; flex-shrink: 0; position: relative;
      }
      #permsManagerModal .modal-header::after {
        content:''; position:absolute; bottom:0; left:0; right:0; height:1px;
        background: linear-gradient(90deg,transparent,rgba(201,168,76,.5) 40%,rgba(201,168,76,.5) 60%,transparent);
      }
      #permsManagerBody {
        display: grid; grid-template-columns: 230px 1fr;
        flex: 1; min-height: 0; overflow: hidden;
      }
      .pm-sidebar {
        background: #08080c; border-right: 1px solid rgba(255,255,255,.06);
        display: flex; flex-direction: column; overflow: hidden;
      }
      .pm-sidebar-head {
        padding: 12px 14px 10px; border-bottom: 1px solid rgba(255,255,255,.05);
        font-size: .62rem; color: var(--gold); letter-spacing: .12em;
        text-transform: uppercase; font-weight: 700; flex-shrink: 0;
      }
      .pm-sidebar-search {
        padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,.04); flex-shrink: 0;
      }
      .pm-sidebar-search input {
        width: 100%; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08);
        border-radius: 6px; padding: 6px 10px; font-size: .75rem; color: var(--text-1);
        outline: none; transition: border .2s; box-sizing: border-box;
      }
      .pm-sidebar-search input:focus { border-color: rgba(201,168,76,.4); }
      .pm-member-list { overflow-y: auto; flex: 1; }
      .pm-member-item {
        display: flex; align-items: center; gap: 10px;
        padding: 10px 14px; cursor: pointer;
        border-bottom: 1px solid rgba(255,255,255,.03);
        transition: background .15s; position: relative;
      }
      .pm-member-item:hover { background: rgba(255,255,255,.03); }
      .pm-member-item.active {
        background: linear-gradient(135deg,rgba(201,168,76,.1),rgba(201,168,76,.04));
        border-left: 2px solid var(--gold); padding-left: 12px;
      }
      .pm-member-item.active .pm-member-name { color: var(--gold); }
      .pm-member-name { font-size: .82rem; font-weight: 600; color: var(--text-1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .pm-member-count {
        font-size: .65rem; padding: 2px 7px; border-radius: 20px; margin-top: 2px;
        display: inline-block; font-weight: 700;
      }
      .pm-member-count.has-perms { background: rgba(201,168,76,.15); color: var(--gold); border: 1px solid rgba(201,168,76,.25); }
      .pm-member-count.no-perms  { background: rgba(255,255,255,.05); color: var(--text-3); }
      .pm-panel { display: flex; flex-direction: column; overflow: hidden; background: #0d0d12; }
      .pm-panel-head {
        padding: 16px 22px 14px; border-bottom: 1px solid rgba(255,255,255,.06);
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px; flex-wrap: wrap; flex-shrink: 0;
        background: linear-gradient(135deg,rgba(201,168,76,.06),transparent);
      }
      .pm-panel-member-info { display: flex; align-items: center; gap: 12px; }
      .pm-panel-member-name { font-weight: 700; font-size: .95rem; color: var(--text-1); }
      .pm-panel-member-role { font-size: .72rem; color: var(--text-3); margin-top: 1px; }
      .pm-panel-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
      .pm-active-count {
        font-size: .72rem; padding: 4px 12px; border-radius: 20px;
        background: rgba(201,168,76,.12); border: 1px solid rgba(201,168,76,.25);
        color: var(--gold); font-weight: 700; min-width: 80px; text-align: center;
      }
      .pm-scroll { overflow-y: auto; flex: 1; padding: 20px 22px 24px; }
      .pm-group { margin-bottom: 24px; }
      .pm-group-header {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,.06);
      }
      .pm-group-title {
        display: flex; align-items: center; gap: 8px;
        font-size: .72rem; color: var(--gold); font-weight: 700;
        letter-spacing: .1em; text-transform: uppercase;
      }
      .pm-group-icon {
        width: 22px; height: 22px; background: rgba(201,168,76,.12);
        border: 1px solid rgba(201,168,76,.2); border-radius: 5px;
        display: flex; align-items: center; justify-content: center;
        font-size: .65rem; color: var(--gold);
      }
      .pm-group-toggle { display: flex; gap: 6px; }
      .pm-group-btn {
        font-size: .62rem; padding: 3px 9px; border-radius: 4px; cursor: pointer;
        border: 1px solid rgba(255,255,255,.1); background: transparent;
        color: var(--text-3); transition: all .15s; font-weight: 600; letter-spacing: .04em;
      }
      .pm-group-btn:hover { background: rgba(201,168,76,.1); color: var(--gold); border-color: rgba(201,168,76,.3); }
      .pm-perms-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .pm-perm-card {
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px; padding: 12px 14px; border-radius: 8px;
        border: 1px solid rgba(255,255,255,.07); background: rgba(255,255,255,.02);
        cursor: pointer; transition: all .2s cubic-bezier(.4,0,.2,1);
        position: relative; overflow: hidden; user-select: none;
      }
      .pm-perm-card::before {
        content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
        background: transparent; border-radius: 8px 0 0 8px; transition: background .2s;
      }
      .pm-perm-card:hover { background: rgba(255,255,255,.04); border-color: rgba(201,168,76,.2); }
      .pm-perm-card.active {
        background: linear-gradient(135deg,rgba(201,168,76,.1),rgba(201,168,76,.04));
        border-color: rgba(201,168,76,.35);
      }
      .pm-perm-card.active::before { background: var(--gold); }
      .pm-perm-card.critical.active {
        background: linear-gradient(135deg,rgba(185,28,28,.15),rgba(185,28,28,.06));
        border-color: rgba(239,68,68,.35);
      }
      .pm-perm-card.critical.active::before { background: #ef4444; }
      .pm-perm-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
      .pm-perm-icon {
        width: 30px; height: 30px; border-radius: 7px;
        display: flex; align-items: center; justify-content: center;
        font-size: .75rem; flex-shrink: 0; transition: all .2s;
        background: rgba(255,255,255,.04); color: var(--text-3); border: 1px solid rgba(255,255,255,.07);
      }
      .pm-perm-card.active .pm-perm-icon { background: rgba(201,168,76,.18); color: var(--gold); border-color: rgba(201,168,76,.3); }
      .pm-perm-card.critical.active .pm-perm-icon { background: rgba(239,68,68,.15); color: #ef4444; border-color: rgba(239,68,68,.3); }
      .pm-perm-label { font-size: .8rem; font-weight: 600; color: var(--text-2); line-height: 1.3; transition: color .2s; }
      .pm-perm-card.active .pm-perm-label { color: var(--text-1); }
      .pm-perm-critical-badge {
        font-size: .55rem; padding: 1px 5px;
        background: rgba(239,68,68,.15); color: #ef4444;
        border: 1px solid rgba(239,68,68,.25); border-radius: 3px;
        font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
        margin-top: 3px; display: inline-block;
      }
      .pm-toggle { position: relative; width: 36px; height: 20px; flex-shrink: 0; }
      .pm-toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
      .pm-toggle-track {
        position: absolute; inset: 0; border-radius: 10px;
        background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.12);
        transition: all .25s cubic-bezier(.4,0,.2,1); cursor: pointer;
      }
      .pm-toggle-track::after {
        content: ''; position: absolute; left: 2px; top: 50%; transform: translateY(-50%);
        width: 14px; height: 14px; border-radius: 50%; background: rgba(255,255,255,.3);
        transition: all .25s cubic-bezier(.4,0,.2,1); box-shadow: 0 1px 3px rgba(0,0,0,.4);
      }
      .pm-toggle input:checked + .pm-toggle-track { background: rgba(201,168,76,.3); border-color: rgba(201,168,76,.5); }
      .pm-toggle input:checked + .pm-toggle-track::after { left: calc(100% - 16px); background: var(--gold); box-shadow: 0 0 6px rgba(201,168,76,.6); }
      .pm-perm-card.critical .pm-toggle input:checked + .pm-toggle-track { background: rgba(239,68,68,.25); border-color: rgba(239,68,68,.4); }
      .pm-perm-card.critical .pm-toggle input:checked + .pm-toggle-track::after { background: #ef4444; box-shadow: 0 0 6px rgba(239,68,68,.5); }
      .pm-footer {
        padding: 14px 22px; border-top: 1px solid rgba(255,255,255,.06);
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px; flex-shrink: 0; background: #09090d;
      }
      .pm-footer-hint { font-size: .72rem; color: var(--text-3); display: flex; align-items: center; gap: 7px; }
      .pm-member-list::-webkit-scrollbar, .pm-scroll::-webkit-scrollbar { width: 4px; }
      .pm-member-list::-webkit-scrollbar-thumb, .pm-scroll::-webkit-scrollbar-thumb { background: rgba(201,168,76,.2); border-radius: 4px; }
      @keyframes pm-ripple { 0% { transform:scale(0);opacity:.4; } 100% { transform:scale(2.5);opacity:0; } }
      .pm-ripple {
        position:absolute; border-radius:50%; background:rgba(201,168,76,.3);
        width:60px; height:60px; margin:-30px 0 0 -30px;
        animation:pm-ripple .45s linear; pointer-events:none;
      }
    `;
    document.head.appendChild(s);
  }

  /* ── Modal shell ── */
  let modal = document.getElementById('permsManagerModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'permsManagerModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:820px">
        <div class="modal-header" style="padding:18px 24px">
          <div class="modal-title" style="display:flex;align-items:center;gap:12px">
            <div style="width:34px;height:34px;background:linear-gradient(135deg,rgba(201,168,76,.2),rgba(201,168,76,.06));border:1px solid rgba(201,168,76,.3);border-radius:8px;display:flex;align-items:center;justify-content:center">
              <i class="fa-solid fa-shield-halved" style="color:var(--gold);font-size:.9rem"></i>
            </div>
            <div>
              <div style="font-family:'Cinzel',serif;letter-spacing:.06em">Gerenciar Permissões</div>
              <div style="font-size:.68rem;font-weight:400;color:var(--text-3);margin-top:1px">Controle individual de acesso por membro</div>
            </div>
          </div>
          <button class="modal-close" id="permsManagerClose"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div id="permsManagerBody"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
    document.getElementById('permsManagerClose').addEventListener('click', () => modal.classList.remove('open'));
  }

  modal.classList.add('open');
  const body = document.getElementById('permsManagerBody');
  body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:200px;gap:12px;color:var(--text-3)"><i class="fa-solid fa-circle-notch fa-spin" style="color:var(--gold);font-size:1.4rem"></i></div>`;

  /* ── Dados ── */
  const { data: members } = await db.from('profiles')
    .select('id,name,role,initials,color,avatar_url,tier')
    .eq('status','ativo').neq('tier','diretoria').order('name');

  if (!members || members.length === 0) {
    body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:200px;color:var(--text-3);font-size:.84rem">Nenhum membro encontrado.</div>`;
    return;
  }

  const { data: allPermsData } = await db.from('member_permissions')
    .select('user_id,permissions').in('user_id', members.map(m => m.id));
  const permsMap = {};
  (allPermsData || []).forEach(p => { permsMap[p.user_id] = p.permissions || []; });

  const GROUPS = {
    'Eventos':     { icon:'fa-calendar-days', color:'#60a5fa', keys:['criar_eventos','editar_eventos','excluir_eventos','gerenciar_eventos'] },
    'Presenças':   { icon:'fa-clipboard-list',color:'#10b981', keys:['registrar_participantes','gerenciar_presencas','ver_relatorio_presencas'] },
    'Membros':     { icon:'fa-users',         color:'#a78bfa', keys:['aprovar_membros','editar_membros','remover_membros'] },
    'Atividades':  { icon:'fa-list-check',    color:'#f59e0b', keys:['criar_atividades','editar_atividades','gerenciar_atividades','concluir_atividades'] },
    'Comunicados': { icon:'fa-bullhorn',      color:'#fb923c', keys:['publicar_comunicados','gerenciar_comunicados'] },
    'Ranking':     { icon:'fa-ranking-star',  color:'#e879f9', keys:['gerenciar_ranking'] },
    'Biblioteca':  { icon:'fa-book-open',     color:'#34d399', keys:['gerenciar_biblioteca'] },
    'Feed':        { icon:'fa-rss',           color:'#38bdf8', keys:['publicar_feed'] },
    'Admin':       { icon:'fa-shield-halved', color:'#f87171', keys:['ver_desempenho','notificar_membros','gerenciar_permissoes'] },
  };
  const CRITICAL_KEYS = new Set(['gerenciar_permissoes','notificar_membros','remover_membros','aprovar_membros']);
  const LABELS = {};
  MSYPerms.ALL.forEach(p => { LABELS[p.key] = { label: p.label, icon: p.icon }; });

  let selectedId = members[0].id;
  let filterQ = '';

  function renderPanel(memberId, current) {
    const member = members.find(m => m.id === memberId);
    if (!member) return '';
    const activeCnt = current.length;
    const totalCnt = MSYPerms.ALL.length;
    let groupsHTML = '';
    Object.entries(GROUPS).forEach(([gName, meta]) => {
      const gPerms = meta.keys.filter(k => LABELS[k]);
      const activeInGroup = gPerms.filter(k => current.includes(k)).length;
      groupsHTML += `<div class="pm-group" data-group="${Utils.escapeHtml(gName)}">
        <div class="pm-group-header">
          <div class="pm-group-title">
            <div class="pm-group-icon" style="background:${meta.color}18;border-color:${meta.color}30;color:${meta.color}"><i class="fa-solid ${meta.icon}"></i></div>
            <span>${gName}</span>
            <span style="font-size:.6rem;color:var(--text-3);font-weight:400;letter-spacing:0">(${activeInGroup}/${gPerms.length})</span>
          </div>
          <div class="pm-group-toggle">
            <button class="pm-group-btn pm-select-all" data-group="${Utils.escapeHtml(gName)}"><i class="fa-solid fa-check-double"></i> Todas</button>
            <button class="pm-group-btn pm-clear-all"  data-group="${Utils.escapeHtml(gName)}"><i class="fa-solid fa-xmark"></i> Limpar</button>
          </div>
        </div>
        <div class="pm-perms-grid">
          ${gPerms.map(key => {
            const isActive  = current.includes(key);
            const isCrit    = CRITICAL_KEYS.has(key);
            const meta2     = LABELS[key] || { label: key, icon: 'fa-key' };
            return `<div class="pm-perm-card ${isActive?'active':''} ${isCrit?'critical':''}" data-key="${key}">
              <div class="pm-perm-left">
                <div class="pm-perm-icon"><i class="fa-solid ${meta2.icon}"></i></div>
                <div>
                  <div class="pm-perm-label">${meta2.label}</div>
                  ${isCrit?`<div class="pm-perm-critical-badge">Crítico</div>`:''}
                </div>
              </div>
              <label class="pm-toggle" onclick="event.stopPropagation()">
                <input type="checkbox" class="pm-toggle-input" data-key="${key}" ${isActive?'checked':''}>
                <span class="pm-toggle-track"></span>
              </label>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    });
    return `
      <div class="pm-panel-head">
        <div class="pm-panel-member-info">
          <div class="avatar" style="width:40px;height:40px;font-size:.75rem;background:linear-gradient(135deg,${member.color||'#7f1d1d'},#1a1a1a);border:2px solid var(--border-gold)">
            ${member.avatar_url?`<img src="${member.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:(member.initials||Utils.getInitials(member.name))}
          </div>
          <div>
            <div class="pm-panel-member-name">${Utils.escapeHtml(member.name)}</div>
            <div class="pm-panel-member-role">${Utils.escapeHtml(member.role)}</div>
          </div>
        </div>
        <div class="pm-panel-actions">
          <div class="pm-active-count" id="pmActiveCount"><i class="fa-solid fa-shield-check" style="font-size:.7rem"></i> ${activeCnt} / ${totalCnt}</div>
          <button class="btn btn-ghost btn-sm pm-clear-member" style="font-size:.72rem;color:var(--text-3)"><i class="fa-solid fa-trash"></i> Limpar</button>
          <button class="btn btn-primary btn-sm pm-save" style="font-size:.75rem"><i class="fa-solid fa-floppy-disk"></i> Salvar</button>
        </div>
      </div>
      <div class="pm-scroll" id="pmScroll">${groupsHTML}</div>
      <div class="pm-footer">
        <div class="pm-footer-hint">
          <i class="fa-solid fa-circle-info" style="color:var(--gold)"></i>
          Permissões <span style="color:#ef4444;font-weight:700">Crítico</span> concedem acesso sensível ao sistema.
        </div>
      </div>`;
  }

  function mount() {
    const current = permsMap[selectedId] || [];
    const filtered = filterQ ? members.filter(m => m.name.toLowerCase().includes(filterQ.toLowerCase())) : members;
    body.innerHTML = `
      <div class="pm-sidebar">
        <div class="pm-sidebar-head">⚔ Membros da Ordem</div>
        <div class="pm-sidebar-search"><input type="text" id="pmSearch" placeholder="Filtrar membro..." value="${Utils.escapeHtml(filterQ)}"></div>
        <div class="pm-member-list" id="pmMemberList">
          ${filtered.map(m => {
            const cnt = (permsMap[m.id] || []).length;
            return `<div class="pm-member-item ${m.id===selectedId?'active':''}" data-mid="${m.id}">
              <div class="avatar" style="width:30px;height:30px;font-size:.6rem;flex-shrink:0;background:linear-gradient(135deg,${m.color||'#7f1d1d'},#1a1a1a);border-color:${m.id===selectedId?'var(--border-gold)':'var(--border-faint)'}">
                ${m.avatar_url?`<img src="${m.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:(m.initials||Utils.getInitials(m.name))}
              </div>
              <div style="flex:1;min-width:0">
                <div class="pm-member-name">${Utils.escapeHtml(m.name)}</div>
                <span class="pm-member-count ${cnt>0?'has-perms':'no-perms'}">${cnt>0?cnt+' perm.':'Sem permissões'}</span>
              </div>
              ${m.id===selectedId?'<i class="fa-solid fa-chevron-right" style="color:var(--gold);font-size:.6rem;flex-shrink:0"></i>':''}
            </div>`;
          }).join('')}
          ${filtered.length===0?`<div style="padding:20px;text-align:center;color:var(--text-3);font-size:.8rem">Nenhum resultado</div>`:''}
        </div>
      </div>
      <div class="pm-panel">${renderPanel(selectedId, current)}</div>`;

    document.getElementById('pmSearch')?.addEventListener('input', e => { filterQ = e.target.value; mount(); });
    body.querySelectorAll('.pm-member-item').forEach(el => {
      el.addEventListener('click', () => { selectedId = el.dataset.mid; mount(); });
    });
    bindPanelEvents(selectedId, current);
  }

  function updateActiveCount() {
    const cnt = body.querySelectorAll('.pm-toggle-input:checked').length;
    const el = document.getElementById('pmActiveCount');
    if (el) el.innerHTML = `<i class="fa-solid fa-shield-check" style="font-size:.7rem"></i> ${cnt} / ${MSYPerms.ALL.length}`;
    const sideItem = body.querySelector(`.pm-member-item[data-mid="${selectedId}"] .pm-member-count`);
    if (sideItem) { sideItem.className = `pm-member-count ${cnt>0?'has-perms':'no-perms'}`; sideItem.textContent = cnt>0?cnt+' perm.':'Sem permissões'; }
  }

  function bindPanelEvents(memberId) {
    body.querySelectorAll('.pm-perm-card').forEach(card => {
      const toggle = card.querySelector('.pm-toggle-input');
      if (!toggle) return;
      card.addEventListener('click', e => {
        if (e.target.closest('.pm-toggle')) return;
        toggle.checked = !toggle.checked;
        toggle.dispatchEvent(new Event('change'));
        const ripple = document.createElement('span');
        ripple.className = 'pm-ripple';
        const rect = card.getBoundingClientRect();
        ripple.style.cssText = `left:${e.clientX-rect.left}px;top:${e.clientY-rect.top}px`;
        card.appendChild(ripple);
        setTimeout(() => ripple.remove(), 500);
      });
      toggle.addEventListener('change', () => {
        card.classList.toggle('active', toggle.checked);
        updateActiveCount();
      });
    });
    body.querySelectorAll('.pm-select-all').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        body.querySelectorAll(`.pm-group[data-group="${btn.dataset.group}"] .pm-toggle-input`).forEach(cb => {
          cb.checked = true; cb.closest('.pm-perm-card')?.classList.add('active');
        });
        updateActiveCount();
      });
    });
    body.querySelectorAll('.pm-clear-all').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        body.querySelectorAll(`.pm-group[data-group="${btn.dataset.group}"] .pm-toggle-input`).forEach(cb => {
          cb.checked = false; cb.closest('.pm-perm-card')?.classList.remove('active');
        });
        updateActiveCount();
      });
    });
    body.querySelector('.pm-clear-member')?.addEventListener('click', () => {
      const name = members.find(m=>m.id===memberId)?.name || 'este membro';
      if (!confirm(`Remover todas as permissões de ${name}?`)) return;
      body.querySelectorAll('.pm-toggle-input').forEach(cb => { cb.checked = false; cb.closest('.pm-perm-card')?.classList.remove('active'); });
      updateActiveCount();
    });
    body.querySelector('.pm-save')?.addEventListener('click', async () => {
      const checked = [...body.querySelectorAll('.pm-toggle-input:checked')].map(cb => cb.dataset.key);
      const btn = body.querySelector('.pm-save');
      if (!btn) return;
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Salvando...';
      const ok = await MSYPerms.save(memberId, checked);
      if (ok) {
        permsMap[memberId] = checked;
        MSYPerms.invalidate();
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Salvo!';
        btn.style.background = 'linear-gradient(135deg,#15803d,#16a34a)';
        const sideItem = body.querySelector(`.pm-member-item[data-mid="${memberId}"] .pm-member-count`);
        if (sideItem) { sideItem.className = `pm-member-count ${checked.length>0?'has-perms':'no-perms'}`; sideItem.textContent = checked.length>0?checked.length+' perm.':'Sem permissões'; }
        setTimeout(() => { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-floppy-disk"></i> Salvar'; btn.style.background=''; }, 2200);
        Utils.showToast('Permissões de ' + (members.find(m=>m.id===memberId)?.name||'membro') + ' salvas!');
      } else {
        Utils.showToast('Erro ao salvar. Execute a migration SQL no Supabase.', 'error');
        btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar';
      }
    });
  }

  mount();
}

async function renderSystemAlerts(containerEl) {
  if (!containerEl) return;

  if (!document.getElementById('msy-alerts-v3-css')) {
    const s = document.createElement('style');
    s.id = 'msy-alerts-v3-css';
    s.textContent = `
      /* ══ CARD CONTAINER ══ */
      #systemAlertsCard {
        background: #0a0a0e;
        border: 1px solid rgba(201,168,76,.18);
        border-radius: var(--radius);
        overflow: hidden;
        position: relative;
      }
      #systemAlertsCard::before {
        content:''; position:absolute; top:0; left:0; right:0; height:2px;
        background: linear-gradient(90deg,transparent,rgba(201,168,76,.7) 30%,#c9a84c 50%,rgba(201,168,76,.7) 70%,transparent);
      }
      /* ══ CABEÇALHO ══ */
      .sa3-header {
        display:flex; align-items:center; justify-content:space-between;
        padding:16px 20px 14px; gap:12px; flex-wrap:wrap;
        border-bottom: 1px solid rgba(255,255,255,.05);
      }
      .sa3-header-left { display:flex; align-items:center; gap:12px; }
      .sa3-icon {
        width:38px;height:38px;
        background:linear-gradient(135deg,rgba(245,158,11,.2),rgba(180,83,9,.1));
        border:1px solid rgba(245,158,11,.3); border-radius:9px;
        display:flex; align-items:center; justify-content:center;
        color:#f59e0b; font-size:.95rem; flex-shrink:0;
      }
      .sa3-title { font-family:'Cinzel',serif; font-size:.82rem; font-weight:700; color:var(--text-1); letter-spacing:.07em; text-transform:uppercase; }
      .sa3-sub   { font-size:.66rem; color:var(--text-3); margin-top:2px; }
      .sa3-status-badge {
        display:inline-flex; align-items:center; gap:5px;
        padding:4px 12px; border-radius:20px; font-size:.7rem; font-weight:700; letter-spacing:.05em;
      }
      .sa3-status-badge.ok      { background:rgba(16,185,129,.12); border:1px solid rgba(16,185,129,.3); color:#10b981; }
      .sa3-status-badge.warning { background:rgba(245,158,11,.12); border:1px solid rgba(245,158,11,.3); color:#f59e0b; }
      .sa3-status-badge.danger  { background:rgba(185,28,28,.15);  border:1px solid rgba(239,68,68,.3);  color:#ef4444; }
      /* ══ SCORE ══ */
      .sa3-score-row {
        padding:12px 20px 10px;
        border-bottom:1px solid rgba(255,255,255,.04);
        display:flex; align-items:center; gap:14px;
      }
      .sa3-score-label { font-size:.7rem; color:var(--text-3); white-space:nowrap; }
      .sa3-score-track { flex:1; height:5px; background:rgba(255,255,255,.07); border-radius:6px; overflow:hidden; }
      .sa3-score-fill  { height:100%; border-radius:6px; transition:width .9s cubic-bezier(.4,0,.2,1); }
      .sa3-score-val   { font-family:'Cinzel',serif; font-size:.95rem; font-weight:700; white-space:nowrap; min-width:48px; text-align:right; }
      /* ══ MÉTRICAS ══ */
      .sa3-metrics {
        display:grid; grid-template-columns:repeat(5,1fr);
        border-bottom:1px solid rgba(255,255,255,.04);
      }
      .sa3-metric {
        padding:11px 10px; text-align:center; cursor:pointer;
        transition:background .15s; position:relative;
      }
      .sa3-metric:not(:last-child)::after {
        content:''; position:absolute; right:0; top:15%; bottom:15%;
        width:1px; background:rgba(255,255,255,.05);
      }
      .sa3-metric:hover { background:rgba(255,255,255,.025); }
      .sa3-metric-val   { font-family:'Cinzel',serif; font-size:1.2rem; font-weight:700; line-height:1; margin-bottom:3px; }
      .sa3-metric-lbl   { font-size:.58rem; color:var(--text-3); letter-spacing:.05em; text-transform:uppercase; }
      /* ══ CATEGORIAS ══ */
      .sa3-body  { padding:14px 20px 18px; }
      .sa3-cat   { margin-bottom:14px; }
      .sa3-cat-title {
        font-size:.65rem; color:var(--text-3); text-transform:uppercase; letter-spacing:.1em;
        font-weight:700; margin-bottom:8px; display:flex; align-items:center; gap:7px;
      }
      .sa3-cat-title::after { content:''; flex:1; height:1px; background:rgba(255,255,255,.05); }
      /* ══ ALERTA ITEM ══ */
      .sa3-item {
        display:flex; align-items:flex-start; gap:11px;
        padding:11px 14px; border-radius:8px; cursor:pointer;
        transition:all .18s cubic-bezier(.4,0,.2,1);
        margin-bottom:7px; position:relative;
        border-left:2px solid transparent;
      }
      .sa3-item:last-child { margin-bottom:0; }
      .sa3-item.danger  { background:linear-gradient(135deg,rgba(127,29,29,.2),rgba(127,29,29,.07)); border:1px solid rgba(239,68,68,.22); border-left-color:#ef4444; }
      .sa3-item.warning { background:linear-gradient(135deg,rgba(120,53,15,.16),rgba(120,53,15,.06)); border:1px solid rgba(245,158,11,.2);  border-left-color:#f59e0b; }
      .sa3-item.info    { background:linear-gradient(135deg,rgba(30,58,95,.16),rgba(30,58,95,.06));   border:1px solid rgba(96,165,250,.18); border-left-color:#60a5fa; }
      .sa3-item.success { background:linear-gradient(135deg,rgba(5,46,22,.16),rgba(5,46,22,.06));     border:1px solid rgba(16,185,129,.18); border-left-color:#10b981; }
      .sa3-item:hover   { transform:translateX(3px); filter:brightness(1.06); }
      .sa3-item-icon {
        width:32px; height:32px; border-radius:50%;
        display:flex; align-items:center; justify-content:center;
        font-size:.82rem; flex-shrink:0;
      }
      .sa3-item-icon.danger  { background:rgba(239,68,68,.14);  color:#ef4444; }
      .sa3-item-icon.warning { background:rgba(245,158,11,.14); color:#f59e0b; }
      .sa3-item-icon.info    { background:rgba(96,165,250,.14); color:#60a5fa; }
      .sa3-item-icon.success { background:rgba(16,185,129,.14); color:#10b981; }
      .sa3-item-body  { flex:1; min-width:0; }
      .sa3-item-tag {
        display:inline-block; padding:1px 7px; border-radius:20px;
        font-size:.58rem; font-weight:700; letter-spacing:.07em; text-transform:uppercase; margin-bottom:4px;
      }
      .sa3-item-tag.danger  { background:rgba(239,68,68,.18);  color:#ef4444; }
      .sa3-item-tag.warning { background:rgba(245,158,11,.18); color:#f59e0b; }
      .sa3-item-tag.info    { background:rgba(96,165,250,.18); color:#60a5fa; }
      .sa3-item-title  { font-size:.83rem; font-weight:700; color:var(--text-1); margin-bottom:3px; line-height:1.3; }
      .sa3-item-detail { font-size:.72rem; color:var(--text-3); line-height:1.5; }
      .sa3-item-chevron{ color:var(--text-3); font-size:.65rem; margin-left:auto; align-self:center; flex-shrink:0; padding-left:6px; }
      /* ══ ESTADO OK ══ */
      .sa3-ok {
        margin:0 0 4px; display:flex; align-items:center; gap:14px;
        padding:16px; background:linear-gradient(135deg,rgba(5,46,22,.16),transparent);
        border:1px solid rgba(16,185,129,.18); border-radius:9px; border-left:3px solid #10b981;
      }
      .sa3-ok-icon { width:40px;height:40px;background:rgba(16,185,129,.12);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#10b981;font-size:1.1rem;flex-shrink:0; }
      /* ══ MODAL ══ */
      #saDetailModal .modal { max-width:660px; max-height:88vh; display:flex; flex-direction:column; }
      #saDetailModal .modal-body { overflow-y:auto; flex:1; }
      #saDetailModal .modal-body::-webkit-scrollbar { width:4px; }
      #saDetailModal .modal-body::-webkit-scrollbar-thumb { background:rgba(201,168,76,.2); border-radius:4px; }
      .sa3-modal-hero {
        padding:20px 24px 16px;
        border-bottom:1px solid rgba(255,255,255,.07);
      }
      .sa3-modal-hero.danger  { background:linear-gradient(135deg,rgba(127,29,29,.18),transparent); }
      .sa3-modal-hero.warning { background:linear-gradient(135deg,rgba(120,53,15,.15),transparent); }
      .sa3-modal-hero.info    { background:linear-gradient(135deg,rgba(30,58,95,.15),transparent); }
      .sa3-modal-tag {
        display:inline-block; padding:3px 10px; border-radius:20px;
        font-size:.62rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; margin-bottom:10px;
      }
      .sa3-modal-tag.danger  { background:rgba(239,68,68,.18); color:#ef4444; border:1px solid rgba(239,68,68,.28); }
      .sa3-modal-tag.warning { background:rgba(245,158,11,.18); color:#f59e0b; border:1px solid rgba(245,158,11,.28); }
      .sa3-modal-tag.info    { background:rgba(96,165,250,.18); color:#60a5fa; border:1px solid rgba(96,165,250,.28); }
      .sa3-modal-title { font-family:'Cinzel',serif; font-size:.98rem; color:var(--text-1); margin-bottom:6px; font-weight:700; }
      .sa3-modal-desc  { font-size:.78rem; color:var(--text-3); line-height:1.6; }
      .sa3-modal-sec   { padding:16px 24px; border-bottom:1px solid var(--border-faint); }
      .sa3-modal-sec:last-child { border-bottom:none; }
      .sa3-sec-title {
        font-size:.68rem; color:var(--gold); text-transform:uppercase; letter-spacing:.1em;
        font-weight:700; margin-bottom:11px; display:flex; align-items:center; gap:8px;
      }
      .sa3-sec-title::after { content:''; flex:1; height:1px; background:rgba(201,168,76,.18); }
      .sa3-row {
        display:flex; align-items:center; justify-content:space-between;
        padding:8px 0; border-bottom:1px solid rgba(255,255,255,.04); font-size:.83rem;
      }
      .sa3-row:last-child { border-bottom:none; }
      .sa3-row-main  { display:flex; align-items:center; gap:9px; }
      .sa3-row-label { color:var(--text-3); }
      .sa3-row-val   { font-weight:700; color:var(--text-1); white-space:nowrap; }
      .sa3-chip {
        display:inline-flex; align-items:center; gap:6px;
        padding:5px 10px; background:var(--black-3); border:1px solid var(--border-faint);
        border-radius:20px; font-size:.76rem; color:var(--text-2); margin:3px;
      }
      .sa3-chip .avatar { width:20px; height:20px; font-size:.5rem; flex-shrink:0; }
      /* ══ SCROLLBAR ══ */
      .sa3-body::-webkit-scrollbar { width:3px; }
      .sa3-body::-webkit-scrollbar-thumb { background:rgba(201,168,76,.15); border-radius:4px; }
    `;
    document.head.appendChild(s);
  }

  /* ── Estrutura HTML ── */
  containerEl.innerHTML = `
    <div class="sa3-header">
      <div class="sa3-header-left">
        <div class="sa3-icon"><i class="fa-solid fa-radar"></i></div>
        <div>
          <div class="sa3-title">Alertas do Sistema</div>
          <div class="sa3-sub">Monitoramento contínuo · Masayoshi Order</div>
        </div>
      </div>
      <div id="sa3Badge"></div>
    </div>
    <div class="sa3-score-row">
      <span class="sa3-score-label">Saúde da Ordem</span>
      <div class="sa3-score-track"><div class="sa3-score-fill" id="sa3ScoreFill" style="width:0%"></div></div>
      <span class="sa3-score-val" id="sa3ScoreVal" style="color:var(--text-3)">—</span>
    </div>
    <div class="sa3-metrics" id="sa3Metrics">
      ${[1,2,3,4,5].map(()=>`<div class="sa3-metric"><div class="sa3-metric-val" style="color:var(--text-3)">—</div><div class="sa3-metric-lbl">···</div></div>`).join('')}
    </div>
    <div class="sa3-body" id="sa3Body">
      <div style="display:flex;align-items:center;gap:10px;color:var(--text-3);font-size:.8rem;padding:8px 0">
        <i class="fa-solid fa-circle-notch fa-spin" style="color:var(--gold)"></i> Analisando dados da Ordem...
      </div>
    </div>
    <div class="modal-overlay" id="saDetailModal">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title" id="saDetailTitle"></div>
          <button class="modal-close" id="saDetailClose"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body" id="saDetailBody"></div>
      </div>
    </div>`;

  /* ── Setup modal ── */
  const detailModal = document.getElementById('saDetailModal');
  document.getElementById('saDetailClose')?.addEventListener('click', () => detailModal?.classList.remove('open'));
  detailModal?.addEventListener('click', e => { if (e.target === detailModal) detailModal.classList.remove('open'); });

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  /* ── Fetch dados ── */
  let membrosAtivos=[], allAtividades=[], atividadesAbertas=[], eventos=[], presencas=[], atribuidos=[], respostas30d=[];
  try {
    const [r1,r2,r3,r4,r5,r6] = await Promise.all([
      db.from('profiles').select('id,name,initials,color,avatar_url,join_date,created_at,role').eq('status','ativo'),
      db.from('activities').select('id,title,deadline,status,assigned_to,closes_at').neq('status','Concluída').neq('status','Cancelada'),
      db.from('activities').select('assigned_to'),
      db.from('events').select('id,title,event_date,mandatory,type,description,created_by').order('event_date',{ascending:true}),
      db.from('event_presencas').select('event_id,membro_id,status'),
      db.from('activity_responses').select('user_id,created_at,activity_id').gte('created_at', new Date(today.getTime()-30*86400000).toISOString()),
    ]);
    membrosAtivos    = r1.data||[];
    atividadesAbertas= r2.data||[];
    atribuidos       = r3.data||[];
    eventos          = r4.data||[];
    presencas        = r5.data||[];
    respostas30d     = r6.data||[];
  } catch(e) { console.warn('[MSY Alerts v3]', e); }

  /* ── Cálculos ── */
  const activeUids = new Set(respostas30d.map(r=>r.user_id));
  const membrosInativos30 = membrosAtivos.filter(m => !activeUids.has(m.id));

  // Membros que estavam ativos e sumiram (tinham atividade entre 30-60d, mas nada nos últimos 30d)
  let respostas60d = [];
  try {
    const r = await db.from('activity_responses').select('user_id')
      .lt('created_at', new Date(today.getTime()-30*86400000).toISOString())
      .gte('created_at', new Date(today.getTime()-60*86400000).toISOString());
    respostas60d = r.data||[];
  } catch(e) {}
  const uids60d = new Set(respostas60d.map(r=>r.user_id));
  const membrosDesaparecidos = membrosAtivos.filter(m => uids60d.has(m.id) && !activeUids.has(m.id));

  const atrasadas = atividadesAbertas.filter(a => {
    const d = new Date(a.closes_at || (a.deadline+'T23:59:59'));
    return d < today;
  });
  const vencendo3 = atividadesAbertas.filter(a => {
    const d = new Date(a.closes_at || (a.deadline+'T23:59:59'));
    const diff = (d - today) / 86400000;
    return diff >= 0 && diff <= 3;
  });

  const pressPorEv = {};
  presencas.forEach(p => { pressPorEv[p.event_id] = (pressPorEv[p.event_id]||0)+1; });
  const eventosProx7 = eventos.filter(e => { const d=(new Date(e.event_date+'T00:00:00')-today)/86400000; return d>=0&&d<=7; });
  const eventosSemPres = eventosProx7.filter(e => !(pressPorEv[e.id]>0));
  const eventosSemDesc = eventos.filter(e => !e.description || e.description.trim().length < 10);
  const eventosSemResp = eventos.filter(e => !e.created_by);

  const atribSet = new Set(atribuidos.map(a=>a.assigned_to));
  const semAtiv  = membrosAtivos.filter(m => !atribSet.has(m.id));

  const cutoff7 = new Date(today.getTime()-7*86400000).toISOString();
  const novos7d = membrosAtivos.filter(m => m.created_at > cutoff7);

  // Taxa de presença geral
  const presConf = presencas.filter(p=>p.status==='confirmado').length;
  const taxaPres = presencas.length > 0 ? Math.round(presConf/presencas.length*100) : 0;

  // Taxa de conclusão de atividades
  const { data: concluidas } = await db.from('activities').select('id',{count:'exact',head:true}).eq('status','Concluída').then(r=>({data:r})).catch(()=>({data:null}));
  const totalActs = (atribuidos.length||0);
  const taxaConcl = totalActs > 0 ? Math.round(((totalActs - atividadesAbertas.length) / totalActs)*100) : 0;

  /* ── Score ── */
  let score = 100;
  score -= Math.min(atrasadas.length * 9, 30);
  score -= Math.min(membrosInativos30.length * 3, 22);
  score -= Math.min(membrosDesaparecidos.length * 5, 15);
  score -= Math.min(vencendo3.length * 2, 10);
  score -= Math.min(eventosSemPres.length * 3, 12);
  score -= Math.min(semAtiv.length * 1, 11);
  score = Math.max(0, Math.round(score));
  const scoreColor = score >= 75 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
  const scoreLabel = score >= 75 ? 'Saudável' : score >= 50 ? 'Atenção' : 'Crítico';

  /* ── Score bar ── */
  const scoreFill = document.getElementById('sa3ScoreFill');
  const scoreVal  = document.getElementById('sa3ScoreVal');
  if (scoreFill) { scoreFill.style.background = `linear-gradient(90deg,${scoreColor}66,${scoreColor})`; setTimeout(()=>scoreFill.style.width=score+'%', 120); }
  if (scoreVal)  { scoreVal.innerHTML = `<span style="color:${scoreColor}">${score}</span><span style="font-size:.6rem;color:var(--text-3)"> / 100</span>`; }

  /* ── Métricas ── */
  const metricsEl = document.getElementById('sa3Metrics');
  if (metricsEl) {
    const metrics = [
      { val: membrosAtivos.length,         lbl: 'Membros',      color: 'var(--gold)',   type:'membros' },
      { val: atrasadas.length,              lbl: 'Atrasadas',    color: atrasadas.length>0?'#ef4444':'#10b981', type:'atrasadas' },
      { val: taxaPres+'%',                  lbl: 'Presença',     color: taxaPres>=70?'#10b981':taxaPres>=40?'#f59e0b':'#ef4444', type:'presenca' },
      { val: taxaConcl+'%',                 lbl: 'Conclusão',    color: taxaConcl>=70?'#10b981':taxaConcl>=40?'#f59e0b':'#ef4444', type:'conclusao' },
      { val: eventosProx7.length,           lbl: 'Ev. 7 dias',   color: '#60a5fa',       type:'eventos' },
    ];
    metricsEl.innerHTML = metrics.map(m => `
      <div class="sa3-metric" data-mtype="${m.type}">
        <div class="sa3-metric-val" style="color:${m.color}">${m.val}</div>
        <div class="sa3-metric-lbl">${m.lbl}</div>
      </div>`).join('');
    metricsEl.querySelectorAll('.sa3-metric').forEach(el => {
      el.addEventListener('click', () => openDetailByType(el.dataset.mtype));
    });
  }

  /* ── Montar alertas por categoria ── */
  const CATS = {
    'Membros':    { icon:'fa-users',       color:'#a78bfa', alerts:[] },
    'Atividades': { icon:'fa-list-check',  color:'#f59e0b', alerts:[] },
    'Eventos':    { icon:'fa-calendar',    color:'#60a5fa', alerts:[] },
    'Sistema':    { icon:'fa-microchip',   color:'#34d399', alerts:[] },
  };

  // ── Membros
  if (membrosDesaparecidos.length > 0) CATS['Membros'].alerts.push({
    level:'danger', icon:'fa-user-xmark', tag:'Sumiu',
    title: `${membrosDesaparecidos.length} membro${membrosDesaparecidos.length>1?'s':''} que estavam ativos sumiram`,
    detail: membrosDesaparecidos.slice(0,3).map(m=>m.name).join(', ')+(membrosDesaparecidos.length>3?` e mais ${membrosDesaparecidos.length-3}`:''),
    fn: () => openAlertDetailModal('desaparecidos', membrosDesaparecidos, { membrosAtivos, atividadesAbertas, respostas30d }),
  });
  if (membrosInativos30.length > 0) CATS['Membros'].alerts.push({
    level: membrosInativos30.length > 4 ? 'warning' : 'info', icon:'fa-user-clock', tag:'Inativo',
    title: `${membrosInativos30.length} membro${membrosInativos30.length>1?'s':''} sem atividade nos últimos 30 dias`,
    detail: membrosInativos30.slice(0,3).map(m=>m.name).join(', ')+(membrosInativos30.length>3?` e mais ${membrosInativos30.length-3}`:''),
    fn: () => openAlertDetailModal('inativos', membrosInativos30, { membrosAtivos, respostas30d, atividadesAbertas }),
  });
  if (semAtiv.length > 0) CATS['Membros'].alerts.push({
    level:'info', icon:'fa-user-slash', tag:'Sem tarefa',
    title: `${semAtiv.length} membro${semAtiv.length>1?'s':''} sem atividade atribuída`,
    detail: semAtiv.slice(0,3).map(m=>m.name).join(', ')+(semAtiv.length>3?` e mais ${semAtiv.length-3}`:''),
    fn: () => openAlertDetailModal('sem-atividade', semAtiv, { membrosAtivos }),
  });
  if (novos7d.length > 0) CATS['Membros'].alerts.push({
    level:'info', icon:'fa-user-plus', tag:'Novo',
    title: `${novos7d.length} novo${novos7d.length>1?'s':''} membro${novos7d.length>1?'s':''} nos últimos 7 dias`,
    detail: novos7d.map(m=>m.name).join(', '),
    fn: () => openAlertDetailModal('novos', novos7d, { membrosAtivos }),
  });

  // ── Atividades
  if (atrasadas.length > 0) CATS['Atividades'].alerts.push({
    level:'danger', icon:'fa-clock', tag:'Urgente',
    title: `${atrasadas.length} atividade${atrasadas.length>1?'s':''} com prazo vencido`,
    detail: atrasadas.slice(0,2).map(a=>a.title).join(', ')+(atrasadas.length>2?` e mais ${atrasadas.length-2}`:''),
    fn: () => openAlertDetailModal('atrasadas', atrasadas, { membrosAtivos }),
  });
  if (vencendo3.length > 0) CATS['Atividades'].alerts.push({
    level:'warning', icon:'fa-hourglass-half', tag:'Atenção',
    title: `${vencendo3.length} atividade${vencendo3.length>1?'s':''} vencendo em até 3 dias`,
    detail: vencendo3.slice(0,2).map(a=>a.title).join(', ')+(vencendo3.length>2?` e mais ${vencendo3.length-2}`:''),
    fn: () => openAlertDetailModal('vencendo', vencendo3, { membrosAtivos }),
  });

  // ── Eventos
  if (eventosSemPres.length > 0) CATS['Eventos'].alerts.push({
    level:'warning', icon:'fa-calendar-exclamation', tag:'Presença',
    title: `${eventosSemPres.length} evento${eventosSemPres.length>1?'s':''} próximo${eventosSemPres.length>1?'s':''} sem presença registrada`,
    detail: eventosSemPres.map(e=>e.title).join(', '),
    fn: () => openAlertDetailModal('sem-presenca', eventosSemPres, { membrosAtivos, presencas }),
  });
  if (eventosSemDesc.length > 0) CATS['Eventos'].alerts.push({
    level:'info', icon:'fa-file-circle-exclamation', tag:'Descrição',
    title: `${eventosSemDesc.length} evento${eventosSemDesc.length>1?'s':''} sem descrição completa`,
    detail: eventosSemDesc.slice(0,3).map(e=>e.title).join(', ')+(eventosSemDesc.length>3?` e mais ${eventosSemDesc.length-3}`:''),
    fn: () => openAlertDetailModal('sem-descricao', eventosSemDesc, { membrosAtivos }),
  });

  // ── Sistema (alertas OK se nada crítico)
  const totalAlertas = Object.values(CATS).reduce((s,c)=>s+c.alerts.length,0);
  if (totalAlertas === 0) {
    CATS['Sistema'].alerts.push({ level:'success', icon:'fa-shield-check', tag:'OK', title:'Todos os sistemas operando normalmente', detail:'Nenhuma anomalia detectada', fn: null });
  } else {
    CATS['Sistema'].alerts.push({ level:'info', icon:'fa-chart-line', tag:'Score', title:`Saúde atual da Ordem: ${score}/100 — ${scoreLabel}`, detail:`${totalAlertas} ponto${totalAlertas>1?'s':''} de atenção identificado${totalAlertas>1?'s':''}`, fn: null });
  }

  /* ── Badge geral ── */
  const badgeEl = document.getElementById('sa3Badge');
  const allAlerts = Object.values(CATS).flatMap(c=>c.alerts);
  const hasDanger  = allAlerts.some(a=>a.level==='danger');
  const hasWarning = allAlerts.some(a=>a.level==='warning');
  if (badgeEl) {
    if (!hasDanger && !hasWarning)  badgeEl.innerHTML = `<span class="sa3-status-badge ok"><i class="fa-solid fa-circle-check"></i> Tudo em ordem</span>`;
    else if (hasDanger)             badgeEl.innerHTML = `<span class="sa3-status-badge danger"><i class="fa-solid fa-circle-exclamation"></i> ${allAlerts.filter(a=>a.level==='danger').length} crítico${allAlerts.filter(a=>a.level==='danger').length>1?'s':''}</span>`;
    else                            badgeEl.innerHTML = `<span class="sa3-status-badge warning"><i class="fa-solid fa-triangle-exclamation"></i> ${allAlerts.filter(a=>a.level!=='info'&&a.level!=='success').length} aviso${allAlerts.filter(a=>a.level!=='info'&&a.level!=='success').length>1?'s':''}</span>`;
  }

  /* ── Render corpo ── */
  const body = document.getElementById('sa3Body');
  if (!body) return;

  let html = '';
  Object.entries(CATS).forEach(([catName, cat]) => {
    if (!cat.alerts.length) return;
    html += `<div class="sa3-cat">
      <div class="sa3-cat-title" style="color:${cat.color}">
        <i class="fa-solid ${cat.icon}" style="font-size:.7rem"></i> ${catName}
      </div>
      ${cat.alerts.map((a,i) => {
        const idx = allAlerts.indexOf(a);
        return `<div class="sa3-item ${a.level}" data-aidx="${idx}" ${a.fn?'style="cursor:pointer"':'style="cursor:default"'}>
          <div class="sa3-item-icon ${a.level}"><i class="fa-solid ${a.icon}"></i></div>
          <div class="sa3-item-body">
            <div class="sa3-item-tag ${a.level}">${a.tag}</div>
            <div class="sa3-item-title">${a.title}</div>
            ${a.detail ? `<div class="sa3-item-detail">${Utils.escapeHtml(a.detail)}</div>` : ''}
          </div>
          ${a.fn ? `<i class="fa-solid fa-chevron-right sa3-item-chevron"></i>` : ''}
        </div>`;
      }).join('')}
    </div>`;
  });

  body.innerHTML = html;

  // Eventos de clique
  body.querySelectorAll('.sa3-item[data-aidx]').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.aidx);
      allAlerts[idx]?.fn?.();
    });
  });

  /* ── Função abrir detalhe por tipo de métrica ── */
  function openDetailByType(type) {
    const typeMap = {
      'atrasadas': () => atrasadas.length > 0 && openAlertDetailModal('atrasadas', atrasadas, { membrosAtivos }),
      'presenca':  () => openAlertDetailModal('presenca-geral', presencas, { membrosAtivos, eventos }),
      'eventos':   () => eventosProx7.length > 0 && openAlertDetailModal('sem-presenca', eventosSemPres.length > 0 ? eventosSemPres : eventosProx7, { membrosAtivos, presencas }),
      'membros':   () => openAlertDetailModal('inativos', membrosInativos30, { membrosAtivos, respostas30d, atividadesAbertas }),
      'conclusao': () => openAlertDetailModal('atrasadas', atrasadas.length > 0 ? atrasadas : atividadesAbertas.slice(0,10), { membrosAtivos }),
    };
    typeMap[type]?.();
  }
}

/* ── Modal de detalhes por tipo ── */
async function openAlertDetailModal(type, items, ctx) {
  const modal = document.getElementById('saDetailModal');
  const body  = document.getElementById('saDetailBody');
  const title = document.getElementById('saDetailTitle');
  if (!modal || !body || !title) return;

  const today = new Date();
  const { membrosAtivos=[], respostas30d=[], atividadesAbertas=[], presencas=[], eventos=[] } = ctx || {};

  const chipMember = (m) => {
    if (!m) return '';
    return `<span class="sa3-chip">
      <div class="avatar" style="background:linear-gradient(135deg,${m.color||'#7f1d1d'},#1a1a1a);width:20px;height:20px;font-size:.5rem">${m.avatar_url?`<img src="${m.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:(m.initials||Utils.getInitials(m.name))}</div>
      ${Utils.escapeHtml(m.name)}
    </span>`;
  };

  const heroLevel = (type==='atrasadas'||type==='desaparecidos') ? 'danger' : (type==='vencendo'||type==='sem-presenca') ? 'warning' : 'info';

  if (type === 'inativos' || type === 'desaparecidos') {
    const isDesap = type === 'desaparecidos';
    title.innerHTML = `<i class="fa-solid ${isDesap?'fa-user-xmark':'fa-user-clock'}" style="color:${isDesap?'#ef4444':'#f59e0b'}"></i> ${isDesap?'Membros que Sumiram':'Membros Inativos'}`;
    const lastMap = {};
    respostas30d.forEach(r => { if (!lastMap[r.user_id] || r.created_at > lastMap[r.user_id]) lastMap[r.user_id] = r.created_at; });
    body.innerHTML = `
      <div class="sa3-modal-hero ${heroLevel}">
        <div class="sa3-modal-tag ${heroLevel}">${isDesap?'Crítico':'Atenção'}</div>
        <div class="sa3-modal-title">${items.length} membro${items.length>1?'s':''} ${isDesap?'que estavam ativos e pararam':'sem atividade nos últimos 30 dias'}</div>
        <div class="sa3-modal-desc">${isDesap?'Estes membros tiveram atividade entre 30–60 dias atrás mas não respondem há mais de 30 dias. Possível evasão.':'Considere entrar em contato ou atribuir novas tarefas.'}</div>
      </div>
      <div class="sa3-modal-sec">
        <div class="sa3-sec-title"><i class="fa-solid fa-users"></i> Membros afetados</div>
        <div>${items.map(chipMember).join('')}</div>
      </div>
      <div class="sa3-modal-sec">
        <div class="sa3-sec-title"><i class="fa-solid fa-chart-bar"></i> Detalhamento individual</div>
        ${items.map(m => {
          const last = lastMap[m.id];
          const diasSem = last ? Math.floor((today-new Date(last))/86400000) : null;
          return `<div class="sa3-row">
            <div class="sa3-row-main">
              <div class="avatar" style="width:26px;height:26px;font-size:.55rem;background:linear-gradient(135deg,${m.color||'#7f1d1d'},#1a1a1a)">${m.initials||Utils.getInitials(m.name)}</div>
              <div><div style="font-weight:600;font-size:.84rem">${Utils.escapeHtml(m.name)}</div><div style="font-size:.7rem;color:var(--text-3)">${Utils.escapeHtml(m.role||'')}</div></div>
            </div>
            <span class="sa3-row-val" style="color:${diasSem===null||diasSem>20?'#ef4444':'#f59e0b'}">${diasSem===null?'Nunca respondeu':diasSem+'d sem atividade'}</span>
          </div>`;
        }).join('')}
      </div>
      <div class="sa3-modal-sec" style="text-align:center">
        <a href="atividades.html" class="btn btn-primary"><i class="fa-solid fa-plus"></i> Atribuir Atividades</a>
      </div>`;

  } else if (type === 'atrasadas' || type === 'vencendo') {
    const isAtr = type === 'atrasadas';
    title.innerHTML = `<i class="fa-solid fa-clock" style="color:${isAtr?'#ef4444':'#f59e0b'}"></i> Atividades ${isAtr?'Atrasadas':'Vencendo em Breve'}`;
    body.innerHTML = `
      <div class="sa3-modal-hero ${heroLevel}">
        <div class="sa3-modal-tag ${heroLevel}">${isAtr?'Urgente':'Atenção'}</div>
        <div class="sa3-modal-title">${items.length} atividade${items.length>1?'s':''} ${isAtr?'com prazo vencido':'vencendo em até 3 dias'}</div>
        <div class="sa3-modal-desc">${isAtr?'Ação imediata da Diretoria é necessária. Considere estender o prazo ou cancelar.':'Certifique-se de que os membros estão cientes do prazo próximo.'}</div>
      </div>
      <div class="sa3-modal-sec">
        <div class="sa3-sec-title"><i class="fa-solid fa-list-check"></i> Atividades</div>
        ${items.map(a => {
          const membro = membrosAtivos.find(m=>m.id===a.assigned_to);
          const deadline = new Date(a.closes_at||(a.deadline+'T23:59:59'));
          const diffD = Math.ceil((deadline-today)/86400000);
          return `<div class="sa3-row">
            <div>
              <div style="font-weight:600;font-size:.84rem;color:var(--text-1)">${Utils.escapeHtml(a.title)}</div>
              <div style="font-size:.71rem;color:var(--text-3)">Para: ${membro?Utils.escapeHtml(membro.name):'—'} · Prazo: ${Utils.formatDate(a.deadline)}</div>
            </div>
            <span class="sa3-row-val" style="color:${isAtr?'#ef4444':'#f59e0b'};white-space:nowrap">
              ${isAtr?Math.abs(diffD)+'d atraso':diffD===0?'Hoje':diffD+'d restantes'}
            </span>
          </div>`;
        }).join('')}
      </div>
      <div class="sa3-modal-sec" style="text-align:center">
        <a href="atividades.html" class="btn btn-primary"><i class="fa-solid fa-list-check"></i> Gerenciar Atividades</a>
      </div>`;

  } else if (type === 'sem-presenca') {
    title.innerHTML = `<i class="fa-solid fa-calendar-exclamation" style="color:#f59e0b"></i> Eventos sem Presença`;
    body.innerHTML = `
      <div class="sa3-modal-hero warning">
        <div class="sa3-modal-tag warning">Presença</div>
        <div class="sa3-modal-title">${items.length} evento${items.length>1?'s':''} próximo${items.length>1?'s':''} sem presença registrada</div>
        <div class="sa3-modal-desc">Acesse Presenças para registrar a participação dos membros antes ou após o evento.</div>
      </div>
      <div class="sa3-modal-sec">
        <div class="sa3-sec-title"><i class="fa-solid fa-calendar-days"></i> Eventos pendentes</div>
        ${items.map(ev => {
          const d = new Date(ev.event_date+'T00:00:00');
          const diff = Math.ceil((d-today)/86400000);
          return `<div class="sa3-row">
            <div>
              <div style="font-weight:600;font-size:.84rem">${Utils.escapeHtml(ev.title)}</div>
              <div style="font-size:.71rem;color:var(--text-3)">${ev.type||'Evento'} · ${Utils.formatDate(ev.event_date)}</div>
            </div>
            <span class="sa3-row-val" style="color:#60a5fa;white-space:nowrap">${diff<=0?'Hoje':diff===1?'Amanhã':'Em '+diff+'d'}</span>
          </div>`;
        }).join('')}
      </div>
      <div class="sa3-modal-sec" style="text-align:center">
        <a href="presencas.html" class="btn btn-primary"><i class="fa-solid fa-clipboard-list"></i> Ir para Presenças</a>
      </div>`;

  } else if (type === 'sem-atividade') {
    title.innerHTML = `<i class="fa-solid fa-user-slash" style="color:#60a5fa"></i> Sem Atividade Atribuída`;
    body.innerHTML = `
      <div class="sa3-modal-hero info">
        <div class="sa3-modal-tag info">Membros</div>
        <div class="sa3-modal-title">${items.length} membro${items.length>1?'s':''} sem atividade no sistema</div>
        <div class="sa3-modal-desc">Estes membros não possuem nenhuma atividade atribuída. Considere engajá-los com tarefas.</div>
      </div>
      <div class="sa3-modal-sec">
        <div class="sa3-sec-title"><i class="fa-solid fa-users"></i> Membros</div>
        <div>${items.map(chipMember).join('')}</div>
      </div>
      <div class="sa3-modal-sec" style="text-align:center">
        <a href="atividades.html" class="btn btn-primary"><i class="fa-solid fa-plus"></i> Criar Atividades</a>
      </div>`;

  } else if (type === 'novos') {
    title.innerHTML = `<i class="fa-solid fa-user-plus" style="color:#60a5fa"></i> Novos Membros`;
    body.innerHTML = `
      <div class="sa3-modal-hero info">
        <div class="sa3-modal-tag info">Novo</div>
        <div class="sa3-modal-title">${items.length} novo${items.length>1?'s':''} membro${items.length>1?'s':''} integrado${items.length>1?'s':''}</div>
        <div class="sa3-modal-desc">Aprovados nos últimos 7 dias. Certifique-se de que receberam orientação de onboarding.</div>
      </div>
      <div class="sa3-modal-sec">
        <div class="sa3-sec-title"><i class="fa-solid fa-users"></i> Novos integrantes</div>
        ${items.map(m => {
          const daysAgo = Math.floor((today-new Date(m.created_at))/86400000);
          return `<div class="sa3-row">
            <div class="sa3-row-main">${chipMember(m)}</div>
            <span class="sa3-row-val" style="color:var(--text-3);font-size:.75rem">${daysAgo===0?'Hoje':daysAgo===1?'Ontem':daysAgo+'d atrás'}</span>
          </div>`;
        }).join('')}
      </div>`;

  } else if (type === 'sem-descricao') {
    title.innerHTML = `<i class="fa-solid fa-file-circle-exclamation" style="color:#60a5fa"></i> Eventos sem Descrição`;
    body.innerHTML = `
      <div class="sa3-modal-hero info">
        <div class="sa3-modal-tag info">Eventos</div>
        <div class="sa3-modal-title">${items.length} evento${items.length>1?'s':''} sem descrição completa</div>
        <div class="sa3-modal-desc">Eventos sem descrição podem confundir os membros. Adicione informações relevantes.</div>
      </div>
      <div class="sa3-modal-sec">
        <div class="sa3-sec-title"><i class="fa-solid fa-calendar-days"></i> Eventos afetados</div>
        ${items.map(ev => `<div class="sa3-row">
          <div>
            <div style="font-weight:600;font-size:.84rem">${Utils.escapeHtml(ev.title)}</div>
            <div style="font-size:.71rem;color:var(--text-3)">${Utils.formatDate(ev.event_date)} · ${ev.type||'Evento'}</div>
          </div>
          <span class="sa3-row-val" style="color:#60a5fa;font-size:.75rem">Sem desc.</span>
        </div>`).join('')}
      </div>
      <div class="sa3-modal-sec" style="text-align:center">
        <a href="eventos.html" class="btn btn-primary"><i class="fa-solid fa-calendar-days"></i> Ir para Eventos</a>
      </div>`;

  } else {
    body.innerHTML = `<div style="padding:30px;text-align:center;color:var(--text-3)">Sem detalhes disponíveis.</div>`;
  }

  modal.classList.add('open');
}


async function patchAdminPage(profile) {
  if (profile.tier !== 'diretoria') return;

  // Aguarda DOM do admin estar pronto
  const content = document.getElementById('pageContent');
  if (!content) return;

  // Observar quando o conteúdo do admin for renderizado
  const tryPatch = () => {
    const acoeCard = content.querySelector('.card');
    if (!acoeCard) return false;

    // 1. Adicionar botão "Gerenciar Permissões" nas Ações Rápidas
    const actionsRow = content.querySelector('.card .btn.btn-ghost, .card [id="notifyAllBtn"]');
    if (actionsRow) {
      const parent = actionsRow.closest('div');
      if (parent && !parent.querySelector('#managePermsBtn')) {
        const permsBtn = document.createElement('button');
        permsBtn.id = 'managePermsBtn';
        permsBtn.className = 'btn btn-outline';
        permsBtn.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Gerenciar Permissões';
        permsBtn.style.borderColor = 'var(--border-gold)';
        permsBtn.style.color = 'var(--gold)';
        permsBtn.addEventListener('click', openPermissionsManager);
        parent.insertBefore(permsBtn, actionsRow);
      }
    }

    // 2. Injetar card de alertas depois dos stats
    if (!document.getElementById('systemAlertsCard')) {
      const alertsCard = document.createElement('div');
      alertsCard.id = 'systemAlertsCard';
      alertsCard.className = 'card card-enter';
      alertsCard.style.marginBottom = '20px';
      // Inserir antes do primeiro card de conteúdo (após stats)
      const firstCard = content.querySelector('.card');
      if (firstCard && firstCard.parentNode) {
        firstCard.parentNode.insertBefore(alertsCard, firstCard.nextSibling);
        renderSystemAlerts(alertsCard);
      }
    }

    return true;
  };

  // Tenta imediatamente, depois observa mudanças
  if (!tryPatch()) {
    const obs = new MutationObserver(() => {
      if (tryPatch()) obs.disconnect();
    });
    obs.observe(content, { childList: true, subtree: true });
    // Desconecta após 5s para evitar vazamento
    setTimeout(() => obs.disconnect(), 5000);
  }
}

/* (patches de eventos e presenças aplicados via MutationObserver no router abaixo) */

async function renderPresencasComPermissao(profile, canManage, canReport) {
  await renderSidebar('presencas');
  await renderTopBar('Presenças', profile);

  const content = document.getElementById('pageContent');

  async function renderLista() {
    Utils.showLoading(content);
    const { data: eventos, error } = await db.from('events').select('*').order('event_date', { ascending: false }).limit(60);
    if (error) { content.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-3)">Erro ao carregar eventos.</div>`; return; }

    let presencaMap = {};
    if (eventos?.length) {
      const eIds = eventos.map(e => e.id);
      if (canManage) {
        const { data: counts } = await db.from('event_presencas').select('event_id,status').in('event_id', eIds);
        (counts || []).forEach(c => {
          if (!presencaMap[c.event_id]) presencaMap[c.event_id] = { confirmado: 0, ausente: 0, justificado: 0 };
          presencaMap[c.event_id][c.status] = (presencaMap[c.event_id][c.status] || 0) + 1;
        });
      } else {
        const { data: mine } = await db.from('event_presencas').select('event_id,status').eq('membro_id', profile.id).in('event_id', eIds);
        (mine || []).forEach(p => { presencaMap[p.event_id] = p.status; });
      }
    }

    const today = new Date().toISOString().split('T')[0];
    const futuros = (eventos || []).filter(e => e.event_date >= today);
    const pasados = (eventos || []).filter(e => e.event_date < today);

    function card(ev) {
      const counts = canManage ? (presencaMap[ev.id] || {}) : null;
      const myStatus = !canManage ? presencaMap[ev.id] : null;
      return `
        <div class="presenca-card${ev.event_date < today ? ' past' : ''}">
          <div class="presenca-card-left">
            <div class="presenca-card-date">${Utils.formatDate(ev.event_date)}</div>
            <div class="presenca-card-title">${Utils.escapeHtml(ev.title)}</div>
            <div class="presenca-card-meta">
              <span><i class="fa-solid fa-tag"></i> ${Utils.escapeHtml(ev.type)}</span>
              ${ev.mandatory ? `<span style="color:var(--red-bright)"><i class="fa-solid fa-circle-exclamation"></i> Obrigatório</span>` : ''}
            </div>
          </div>
          <div class="presenca-card-right">
            ${canManage ? `
              <div class="presenca-badges">
                <span class="presenca-stat confirmed"><i class="fa-solid fa-check"></i> ${counts.confirmado || 0}</span>
                <span class="presenca-stat absent"><i class="fa-solid fa-xmark"></i> ${counts.ausente || 0}</span>
                <span class="presenca-stat justified"><i class="fa-solid fa-comment"></i> ${counts.justificado || 0}</span>
              </div>
              <button class="btn btn-gold btn-sm presenca-manage-btn" data-id="${ev.id}">
                <i class="fa-solid fa-clipboard-list"></i> Gerenciar
              </button>` : `
              <span class="badge ${myStatus === 'confirmado' ? 'badge-done' : myStatus === 'ausente' ? 'badge-red' : myStatus === 'justificado' ? 'badge-pending' : 'badge-gold'}">
                ${myStatus === 'confirmado' ? '✓ Presente' : myStatus === 'ausente' ? '✗ Ausente' : myStatus === 'justificado' ? '~ Justificado' : '—'}
              </span>`}
          </div>
        </div>`;
    }

    content.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-header-title">Controle de Presenças</div>
          <div class="page-header-sub">${canManage ? 'Gerencie a presença nos eventos' : 'Seu histórico de presenças'}</div>
        </div>
      </div>
      ${futuros.length ? `<div class="presenca-section-label">Próximos Eventos</div>${futuros.map(card).join('')}` : ''}
      ${pasados.length ? `<div class="presenca-section-label" style="margin-top:24px">Eventos Passados</div>${pasados.map(card).join('')}` : `
        <div style="text-align:center;padding:60px;color:var(--text-3)">
          <i class="fa-solid fa-calendar-xmark" style="font-size:2.5rem;opacity:.3;margin-bottom:14px;display:block"></i>
          Nenhum evento encontrado.
        </div>`}`;

    content.querySelectorAll('.presenca-manage-btn').forEach(btn => {
      const ev = eventos.find(e => e.id === btn.dataset.id);
      btn.addEventListener('click', () => renderDetalhe(btn.dataset.id, ev));
    });
  }

  async function renderDetalhe(eventId, evento) {
    Utils.showLoading(content);
    const [memRes, presRes] = await Promise.all([
      db.from('profiles').select('id,name,role,initials,color,avatar_url').eq('status', 'ativo').order('name'),
      db.from('event_presencas').select('*').eq('event_id', eventId)
    ]);
    const membros = memRes.data || [];
    const presencas = presRes.data || [];
    const presMap = {};
    presencas.forEach(p => { presMap[p.membro_id] = p; });

    const conf = presencas.filter(p => p.status === 'confirmado').length;
    const aus = presencas.filter(p => p.status === 'ausente').length;
    const just = presencas.filter(p => p.status === 'justificado').length;
    const semReg = membros.length - Object.keys(presMap).length;

    async function setPresenca(membroId, status) {
      const ex = presMap[membroId];
      let error;
      if (ex) {
        ({ error } = await db.from('event_presencas').update({ status, marcado_por: profile.id }).eq('id', ex.id));
        if (!error) presMap[membroId].status = status;
      } else {
        const { data, error: e } = await db.from('event_presencas').insert({ event_id: eventId, membro_id: membroId, status, marcado_por: profile.id }).select().single();
        error = e; if (!error) presMap[membroId] = data;
      }
      if (error) { Utils.showToast('Erro ao registrar.', 'error'); return; }
      const row = content.querySelector(`.presenca-membro-row[data-id="${membroId}"]`);
      if (row) row.querySelectorAll('.presenca-btn-status').forEach(b => {
        b.classList.remove('active-confirmed', 'active-absent', 'active-justified');
        if (b.dataset.status === status) b.classList.add(`active-${status === 'confirmado' ? 'confirmed' : status === 'ausente' ? 'absent' : 'justified'}`);
      });
    }

    content.innerHTML = `
      <div class="page-header">
        <div>
          <button class="btn btn-ghost btn-sm" id="presBackBtn" style="margin-bottom:10px"><i class="fa-solid fa-arrow-left"></i> Voltar</button>
          <div class="page-header-title">${evento ? Utils.escapeHtml(evento.title) : 'Evento'}</div>
          <div class="page-header-sub">${Utils.formatDate(evento?.event_date)}</div>
        </div>
        ${canManage ? `<button class="btn btn-gold" id="presMarcarTodosBtn"><i class="fa-solid fa-check-double"></i> Todos presentes</button>` : ''}
      </div>
      <div class="presenca-resumo-grid">
        ${[{ label: 'Presentes', val: conf, color: '#10b981', icon: 'fa-check-circle' }, { label: 'Ausentes', val: aus, color: 'var(--red-bright)', icon: 'fa-times-circle' }, { label: 'Justificados', val: just, color: 'var(--gold)', icon: 'fa-comment-dots' }, { label: 'Sem reg.', val: semReg, color: 'var(--text-3)', icon: 'fa-question-circle' }]
          .map(s => `<div class="presenca-resumo-card"><i class="fa-solid ${s.icon}" style="color:${s.color};font-size:1.2rem"></i><div><div class="font-cinzel" style="font-size:1.4rem;color:${s.color};line-height:1">${s.val}</div><div style="font-size:.7rem;color:var(--text-3);margin-top:2px">${s.label}</div></div></div>`).join('')}
      </div>
      <div class="card">
        <div style="padding:16px 24px;border-bottom:1px solid var(--border-faint)">
          <h3 class="font-cinzel" style="font-size:.9rem"><i class="fa-solid fa-users" style="color:var(--gold);margin-right:8px"></i>${membros.length} Membros</h3>
        </div>
        <div style="padding:16px 24px;display:flex;flex-direction:column;gap:8px">
          ${membros.map(m => {
            const p = presMap[m.id]; const status = p?.status || null;
            const ac = m.avatar_url ? `<img src="${m.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : (m.initials || Utils.getInitials(m.name));
            return `<div class="presenca-membro-row" data-id="${m.id}">
              <div class="avatar" style="background:linear-gradient(135deg,${m.color || '#7f1d1d'},#1a1a1a);flex-shrink:0">${ac}</div>
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${Utils.escapeHtml(m.name)}</div>
                <div style="font-size:.75rem;color:var(--text-3)">${Utils.escapeHtml(m.role)}</div>
              </div>
              ${canManage ? `<div class="presenca-btns">
                <button class="presenca-btn-status${status === 'confirmado' ? ' active-confirmed' : ''}" data-membro="${m.id}" data-status="confirmado" title="Presente"><i class="fa-solid fa-check"></i></button>
                <button class="presenca-btn-status${status === 'ausente' ? ' active-absent' : ''}" data-membro="${m.id}" data-status="ausente" title="Ausente"><i class="fa-solid fa-xmark"></i></button>
                <button class="presenca-btn-status${status === 'justificado' ? ' active-justified' : ''}" data-membro="${m.id}" data-status="justificado" title="Justificado"><i class="fa-solid fa-comment"></i></button>
              </div>` : `<span class="badge ${status === 'confirmado' ? 'badge-done' : status === 'ausente' ? 'badge-red' : status === 'justificado' ? 'badge-pending' : 'badge-gold'}" style="font-size:.78rem;flex-shrink:0">
                ${status === 'confirmado' ? 'Presente' : status === 'ausente' ? 'Ausente' : status === 'justificado' ? 'Justificado' : '—'}
              </span>`}
            </div>`;
          }).join('')}
        </div>
      </div>`;

    document.getElementById('presBackBtn').addEventListener('click', renderLista);
    content.querySelectorAll('.presenca-btn-status').forEach(btn => {
      btn.addEventListener('click', () => setPresenca(btn.dataset.membro, btn.dataset.status));
    });
    document.getElementById('presMarcarTodosBtn')?.addEventListener('click', async () => {
      if (!confirm(`Marcar todos os ${membros.length} membros como presentes?`)) return;
      for (const m of membros) await setPresenca(m.id, 'confirmado');
      Utils.showToast('Todos marcados!');
    });
  }

  await renderLista();
}

/* ============================================================
   CSS ADICIONAL — Estilos do sistema de permissões
   ============================================================ */
(function injectStyles() {
  if (document.getElementById('msy-perms-styles')) return;
  const style = document.createElement('style');
  style.id = 'msy-perms-styles';
  style.textContent = `
    /* ─── Permission Manager ─── */
    .perm-member-item:hover {
      background: var(--black-4) !important;
    }
    .perm-member-item.active {
      background: var(--black-4) !important;
    }
    .perm-toggle-item:hover {
      background: var(--black-4) !important;
      border-color: rgba(201,168,76,.4) !important;
    }
    .perm-checkbox {
      cursor: pointer;
    }
    /* ─── Alert card ─── */
    #systemAlertsCard .card-title {
      margin-bottom: 14px;
    }
    /* ─── Permissions button in admin ─── */
    #managePermsBtn:hover {
      background: rgba(201,168,76,.08);
    }
  `;
  document.head.appendChild(style);
})();

/* ============================================================
   ROUTER — Módulos3
   Executa após DOMContentLoaded, aguarda renders do app.js
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;

  // ── Admin: injeta Permissões + Alertas ──────────────────
  if (page === 'admin') {
    let attempts = 0;
    const checkInterval = setInterval(async () => {
      attempts++;
      const content = document.getElementById('pageContent');
      // Aguarda o pageContent ter sido preenchido pelo initAdmin
      if (content && content.querySelector('.stats-grid')) {
        clearInterval(checkInterval);
        try {
          const profile = await Auth.getProfile();
          if (profile?.tier === 'diretoria') {
            await patchAdminPage(profile);
          }
        } catch (e) {
          console.warn('[MSY Perms] Erro ao patchear admin:', e);
        }
      }
      if (attempts > 40) clearInterval(checkInterval); // timeout 8s
    }, 200);
  }

  // ── Presenças: eleva membros com permissão ──────────────
  if (page === 'presencas') {
    (async () => {
      try {
        const session = await Auth.getSession();
        if (!session) return;
        const profile = await Auth.getProfile();
        if (!profile || profile.tier === 'diretoria') return;

        const canManage = await MSYPerms.checkAny(
          profile.id, profile.tier,
          ['gerenciar_presencas', 'registrar_participantes']
        );
        if (!canManage) return;

        // Aguarda o modules2.js renderizar primeiro, depois substitui
        let waitAttempts = 0;
        const waitRender = setInterval(async () => {
          waitAttempts++;
          const content = document.getElementById('pageContent');
          if (content && content.querySelector('.presenca-card, .empty-state, [style*="calendar-xmark"]')) {
            clearInterval(waitRender);
            await renderPresencasComPermissao(profile, true, true);
          }
          if (waitAttempts > 30) clearInterval(waitRender);
        }, 200);
      } catch (e) {
        console.warn('[MSY Perms] Erro na checagem de presenças:', e);
      }
    })();
  }

  // ── Eventos: eleva membros com permissão de criar ───────
  if (page === 'eventos') {
    (async () => {
      try {
        const session = await Auth.getSession();
        if (!session) return;
        const profile = await Auth.getProfile();
        if (!profile || profile.tier === 'diretoria') return;

        const canCreate = await MSYPerms.check(profile.id, profile.tier, 'criar_eventos');
        const canDelete = await MSYPerms.check(profile.id, profile.tier, 'excluir_eventos');
        if (!canCreate && !canDelete) return;

        // Observa o #evTab para injetar botões após cada renderização
        const content = document.getElementById('pageContent');
        if (!content) return;

        const obs = new MutationObserver(() => {
          const tab = document.getElementById('evTab');
          if (!tab) return;

          // Injeta botão "Novo Evento" se não existir
          if (canCreate && !tab.querySelector('#newEventBtn') && !tab.querySelector('.perm-new-event-wrap')) {
            const wrap = document.createElement('div');
            wrap.className = 'perm-new-event-wrap';
            wrap.style.marginBottom = '18px';
            const btn = document.createElement('button');
            btn.className = 'btn btn-primary';
            btn.id = 'newEventBtn';
            btn.innerHTML = '<i class="fa-solid fa-plus"></i> Novo Evento';
            btn.addEventListener('click', () => openNewEventModal(profile, () => {
              document.querySelector('.filter-btn[data-tab="eventos"]')?.click();
            }));
            wrap.appendChild(btn);
            tab.insertBefore(wrap, tab.firstChild);
          }

          // Mostra botões de excluir eventos para quem tem permissão
          if (canDelete) {
            tab.querySelectorAll('.delete-event-btn').forEach(el => { el.style.display = ''; });
          }
        });

        obs.observe(content, { childList: true, subtree: true });
        setTimeout(() => obs.disconnect(), 30000); // desconecta após 30s
      } catch (e) {
        console.warn('[MSY Perms] Erro na checagem de eventos:', e);
      }
    })();
  }
});
