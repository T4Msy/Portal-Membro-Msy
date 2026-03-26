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
  let modal = document.getElementById('permsManagerModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'permsManagerModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal" style="max-width:700px;max-height:90vh;display:flex;flex-direction:column">
        <div class="modal-header">
          <div class="modal-title"><i class="fa-solid fa-shield-halved" style="color:var(--gold)"></i> Gerenciar Permissões</div>
          <button class="modal-close" id="permsManagerClose"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body" id="permsManagerBody" style="overflow-y:auto;flex:1;padding:0"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
    document.getElementById('permsManagerClose').addEventListener('click', () => modal.classList.remove('open'));
  }

  modal.classList.add('open');
  const body = document.getElementById('permsManagerBody');
  body.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-3)"><i class="fa-solid fa-circle-notch fa-spin" style="color:var(--gold)"></i> Carregando membros...</div>`;

  const { data: members } = await db.from('profiles')
    .select('id,name,role,initials,color,avatar_url,tier')
    .eq('status', 'ativo')
    .neq('tier', 'diretoria')
    .order('name');

  if (!members || members.length === 0) {
    body.innerHTML = `<div style="padding:30px;text-align:center;color:var(--text-3)">Nenhum membro ativo encontrado.</div>`;
    return;
  }

  // Carregar permissões de todos de uma vez
  const { data: allPermsData } = await db.from('member_permissions').select('user_id,permissions').in('user_id', members.map(m => m.id));
  const permsMap = {};
  (allPermsData || []).forEach(p => { permsMap[p.user_id] = p.permissions || []; });

  // Agrupar permissões por grupo
  const groups = {};
  MSYPerms.ALL.forEach(p => {
    if (!groups[p.group]) groups[p.group] = [];
    groups[p.group].push(p);
  });

  let selectedMemberId = members[0].id;

  function renderPermsPanel() {
    const member = members.find(m => m.id === selectedMemberId);
    const currentPerms = permsMap[selectedMemberId] || [];

    return `
      <div style="display:grid;grid-template-columns:220px 1fr;height:100%;min-height:0">
        <!-- Lista de membros -->
        <div style="border-right:1px solid var(--border-faint);overflow-y:auto;max-height:calc(90vh - 140px)">
          <div style="padding:10px 12px;font-size:.7rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid var(--border-faint)">Membros</div>
          ${members.map(m => {
            const count = (permsMap[m.id] || []).length;
            return `<div class="perm-member-item ${m.id === selectedMemberId ? 'active' : ''}" data-mid="${m.id}" style="display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;border-bottom:1px solid var(--border-faint);transition:background .15s;${m.id === selectedMemberId ? 'background:var(--black-4)' : ''}">
              <div class="avatar" style="width:32px;height:32px;font-size:.65rem;background:linear-gradient(135deg,${m.color||'#7f1d1d'},#1a1a1a);flex-shrink:0">
                ${m.avatar_url ? `<img src="${m.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : (m.initials||Utils.getInitials(m.name))}
              </div>
              <div style="flex:1;min-width:0">
                <div style="font-size:.82rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${m.id === selectedMemberId ? 'var(--gold)' : 'var(--text-1)'}">${Utils.escapeHtml(m.name)}</div>
                <div style="font-size:.68rem;color:var(--text-3)">${count} permissão${count !== 1 ? 'ões' : ''}</div>
              </div>
            </div>`;
          }).join('')}
        </div>

        <!-- Painel de permissões -->
        <div style="overflow-y:auto;max-height:calc(90vh - 140px)">
          <div style="padding:14px 18px;border-bottom:1px solid var(--border-faint);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
            <div>
              <div style="font-weight:700;font-size:.9rem;color:var(--text-1)">${Utils.escapeHtml(member?.name || '—')}</div>
              <div style="font-size:.72rem;color:var(--text-3)">${Utils.escapeHtml(member?.role || '')}</div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-ghost btn-sm" id="permsSelectNone" style="font-size:.72rem">Limpar tudo</button>
              <button class="btn btn-outline btn-sm" id="permsSave" style="font-size:.72rem"><i class="fa-solid fa-floppy-disk"></i> Salvar</button>
            </div>
          </div>
          <div style="padding:16px 18px">
            ${Object.entries(groups).map(([groupName, perms]) => `
              <div style="margin-bottom:20px">
                <div style="font-size:.7rem;color:var(--gold);text-transform:uppercase;letter-spacing:.1em;margin-bottom:10px;display:flex;align-items:center;gap:8px">
                  <div style="height:1px;width:18px;background:var(--border-gold)"></div>
                  ${groupName}
                  <div style="height:1px;flex:1;background:var(--border-gold);opacity:.4"></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                  ${perms.map(p => `
                    <label class="perm-toggle-item" style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--black-3);border:1px solid ${currentPerms.includes(p.key) ? 'var(--border-gold)' : 'var(--border-faint)'};border-radius:var(--radius);cursor:pointer;transition:all .15s">
                      <input type="checkbox" class="perm-checkbox" data-key="${p.key}" ${currentPerms.includes(p.key) ? 'checked' : ''} style="accent-color:var(--gold);width:14px;height:14px;flex-shrink:0">
                      <div>
                        <div style="font-size:.8rem;font-weight:600;color:var(--text-1)">${p.label}</div>
                      </div>
                    </label>`).join('')}
                </div>
              </div>`).join('')}
          </div>
        </div>
      </div>`;
  }

  function mount() {
    body.innerHTML = renderPermsPanel();

    // Member item click
    body.querySelectorAll('.perm-member-item').forEach(el => {
      el.addEventListener('click', () => {
        // Save current before switching
        selectedMemberId = el.dataset.mid;
        mount();
      });
    });

    // Checkbox change updates local cache visual
    body.querySelectorAll('.perm-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        const item = cb.closest('label');
        if (item) item.style.borderColor = cb.checked ? 'var(--border-gold)' : 'var(--border-faint)';
      });
    });

    // Clear all
    document.getElementById('permsSelectNone')?.addEventListener('click', () => {
      body.querySelectorAll('.perm-checkbox').forEach(cb => {
        cb.checked = false;
        const item = cb.closest('label');
        if (item) item.style.borderColor = 'var(--border-faint)';
      });
    });

    // Save
    document.getElementById('permsSave')?.addEventListener('click', async () => {
      const checked = [...body.querySelectorAll('.perm-checkbox:checked')].map(cb => cb.dataset.key);
      const btn = document.getElementById('permsSave');
      btn.disabled = true; btn.textContent = 'Salvando...';
      const ok = await MSYPerms.save(selectedMemberId, checked);
      if (ok) {
        permsMap[selectedMemberId] = checked;
        MSYPerms.invalidate();
        Utils.showToast('Permissões salvas!');
        mount(); // re-render to update badge counts
      } else {
        Utils.showToast('Erro ao salvar permissões.', 'error');
      }
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar';
    });
  }

  mount();
}

/* ============================================================
   CARD DE ALERTAS DO SISTEMA
   Exibe alertas automáticos baseados nos dados reais do portal.
   ============================================================ */
async function renderSystemAlerts(containerEl) {
  if (!containerEl) return;

  /* ── Injetar CSS completo ── */
  if (!document.getElementById('msy-alerts-css')) {
    const s = document.createElement('style');
    s.id = 'msy-alerts-css';
    s.textContent = `
      #systemAlertsCard {
        background: linear-gradient(160deg,#0d0d11 0%,#090909 100%);
        border: 1px solid rgba(201,168,76,.18);
        border-radius: var(--radius);
        padding: 0;
        overflow: hidden;
        position: relative;
      }
      #systemAlertsCard::before {
        content:'';position:absolute;top:0;left:0;right:0;height:2px;
        background:linear-gradient(90deg,transparent,rgba(201,168,76,.8) 30%,#c9a84c 50%,rgba(201,168,76,.8) 70%,transparent);
      }
      .sa-header {
        display:flex;align-items:center;justify-content:space-between;
        padding:18px 22px 14px;border-bottom:1px solid rgba(201,168,76,.1);gap:12px;flex-wrap:wrap;
      }
      .sa-header-left { display:flex;align-items:center;gap:14px; }
      .sa-icon-box {
        width:42px;height:42px;
        background:linear-gradient(135deg,rgba(245,158,11,.22),rgba(180,83,9,.12));
        border:1px solid rgba(245,158,11,.35);border-radius:10px;
        display:flex;align-items:center;justify-content:center;
        color:#f59e0b;font-size:1rem;flex-shrink:0;
      }
      .sa-title {
        font-family:'Cinzel',serif;font-size:.86rem;font-weight:700;
        color:var(--text-1);letter-spacing:.06em;text-transform:uppercase;
      }
      .sa-sub { font-size:.68rem;color:var(--text-3);margin-top:2px; }
      .sa-badge {
        display:inline-flex;align-items:center;gap:5px;padding:4px 14px;
        border-radius:20px;font-size:.72rem;font-weight:700;letter-spacing:.05em;cursor:default;
      }
      .sa-badge.danger  { background:rgba(185,28,28,.22);border:1px solid rgba(239,68,68,.4);color:#ef4444; }
      .sa-badge.warning { background:rgba(245,158,11,.14);border:1px solid rgba(245,158,11,.4);color:#f59e0b; }
      .sa-badge.ok      { background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.3);color:#10b981; }
      /* ── Score bar ── */
      .sa-score-wrap { padding:14px 22px 0; }
      .sa-score-label {
        display:flex;justify-content:space-between;align-items:center;
        font-size:.72rem;color:var(--text-3);margin-bottom:7px;
      }
      .sa-score-label strong { font-size:1.05rem;font-family:'Cinzel',serif; }
      .sa-score-track {
        height:6px;background:rgba(255,255,255,.06);border-radius:6px;overflow:hidden;margin-bottom:14px;
      }
      .sa-score-fill {
        height:100%;border-radius:6px;transition:width .8s cubic-bezier(.4,0,.2,1);
      }
      /* ── Mini métricas ── */
      .sa-metrics {
        display:grid;grid-template-columns:repeat(4,1fr);gap:0;
        border-top:1px solid rgba(255,255,255,.05);border-bottom:1px solid rgba(255,255,255,.05);
        margin:0 0 2px;
      }
      .sa-metric {
        padding:12px 16px;text-align:center;position:relative;cursor:pointer;
        transition:background .15s;
      }
      .sa-metric:not(:last-child)::after {
        content:'';position:absolute;right:0;top:20%;bottom:20%;
        width:1px;background:rgba(255,255,255,.07);
      }
      .sa-metric:hover { background:rgba(255,255,255,.03); }
      .sa-metric-val {
        font-family:'Cinzel',serif;font-size:1.25rem;font-weight:700;line-height:1;margin-bottom:4px;
      }
      .sa-metric-lbl { font-size:.62rem;color:var(--text-3);letter-spacing:.04em;text-transform:uppercase; }
      /* ── Alert items ── */
      .sa-alerts-body { padding:14px 22px 20px;display:flex;flex-direction:column;gap:8px; }
      .sa-alert-item {
        display:flex;align-items:flex-start;gap:12px;padding:13px 15px;
        border-radius:9px;cursor:pointer;transition:all .15s;position:relative;overflow:hidden;
      }
      .sa-alert-item::before {
        content:'';position:absolute;left:0;top:0;bottom:0;width:3px;
      }
      .sa-alert-item.danger  { background:linear-gradient(135deg,rgba(127,29,29,.22),rgba(127,29,29,.08));border:1px solid rgba(239,68,68,.25);border-left:none; }
      .sa-alert-item.danger::before  { background:#ef4444; }
      .sa-alert-item.warning { background:linear-gradient(135deg,rgba(120,53,15,.18),rgba(120,53,15,.06));border:1px solid rgba(245,158,11,.22);border-left:none; }
      .sa-alert-item.warning::before { background:#f59e0b; }
      .sa-alert-item.info    { background:linear-gradient(135deg,rgba(30,58,95,.18),rgba(30,58,95,.06));border:1px solid rgba(96,165,250,.18);border-left:none; }
      .sa-alert-item.info::before    { background:#60a5fa; }
      .sa-alert-item:hover   { transform:translateX(4px);filter:brightness(1.08); }
      .sa-alert-circle {
        width:34px;height:34px;border-radius:50%;display:flex;align-items:center;
        justify-content:center;font-size:.85rem;flex-shrink:0;
      }
      .sa-alert-circle.danger  { background:rgba(239,68,68,.15);color:#ef4444; }
      .sa-alert-circle.warning { background:rgba(245,158,11,.15);color:#f59e0b; }
      .sa-alert-circle.info    { background:rgba(96,165,250,.15);color:#60a5fa; }
      .sa-alert-tag {
        display:inline-block;padding:2px 8px;border-radius:20px;
        font-size:.6rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase;margin-bottom:4px;
      }
      .sa-alert-tag.danger  { background:rgba(239,68,68,.2);color:#ef4444; }
      .sa-alert-tag.warning { background:rgba(245,158,11,.2);color:#f59e0b; }
      .sa-alert-tag.info    { background:rgba(96,165,250,.2);color:#60a5fa; }
      .sa-alert-title { font-size:.84rem;font-weight:700;color:var(--text-1);margin-bottom:3px;line-height:1.3; }
      .sa-alert-detail { font-size:.73rem;color:var(--text-3);line-height:1.5; }
      .sa-alert-chevron { color:var(--text-3);font-size:.7rem;margin-left:auto;align-self:center;flex-shrink:0; }
      .sa-divider { height:1px;background:linear-gradient(90deg,transparent,rgba(201,168,76,.12),transparent);margin:4px 0; }
      .sa-ok {
        margin:14px 22px 20px;display:flex;align-items:center;gap:14px;
        padding:18px 16px;background:linear-gradient(135deg,rgba(5,46,22,.18),transparent);
        border:1px solid rgba(16,185,129,.2);border-radius:10px;border-left:3px solid #10b981;
      }
      .sa-ok-icon {
        width:44px;height:44px;background:rgba(16,185,129,.15);border-radius:50%;
        display:flex;align-items:center;justify-content:center;color:#10b981;font-size:1.2rem;flex-shrink:0;
      }
      /* ── Modal de detalhes ── */
      #saDetailModal .modal { max-width:680px;max-height:88vh;display:flex;flex-direction:column; }
      #saDetailModal .modal-body { overflow-y:auto;flex:1; }
      .sa-modal-hero {
        padding:22px 24px 18px;
        background:linear-gradient(135deg,rgba(127,29,29,.15),rgba(9,9,11,.9));
        border-bottom:1px solid rgba(255,255,255,.07);
      }
      .sa-modal-hero.warning { background:linear-gradient(135deg,rgba(120,53,15,.15),rgba(9,9,11,.9)); }
      .sa-modal-hero.info    { background:linear-gradient(135deg,rgba(30,58,95,.15),rgba(9,9,11,.9)); }
      .sa-modal-tag {
        display:inline-block;padding:3px 10px;border-radius:20px;
        font-size:.65rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px;
      }
      .sa-modal-tag.danger  { background:rgba(239,68,68,.2);color:#ef4444;border:1px solid rgba(239,68,68,.3); }
      .sa-modal-tag.warning { background:rgba(245,158,11,.2);color:#f59e0b;border:1px solid rgba(245,158,11,.3); }
      .sa-modal-tag.info    { background:rgba(96,165,250,.2);color:#60a5fa;border:1px solid rgba(96,165,250,.3); }
      .sa-modal-hero-title { font-family:'Cinzel',serif;font-size:1rem;color:var(--text-1);margin-bottom:6px;font-weight:700; }
      .sa-modal-hero-sub { font-size:.78rem;color:var(--text-3);line-height:1.6; }
      .sa-modal-section { padding:18px 24px;border-bottom:1px solid var(--border-faint); }
      .sa-modal-section:last-child { border-bottom:none; }
      .sa-modal-section-title {
        font-size:.72rem;color:var(--gold);text-transform:uppercase;letter-spacing:.1em;
        margin-bottom:12px;display:flex;align-items:center;gap:8px;
      }
      .sa-modal-section-title::after { content:'';flex:1;height:1px;background:rgba(201,168,76,.2); }
      .sa-member-chip {
        display:inline-flex;align-items:center;gap:7px;padding:6px 12px;
        background:var(--black-3);border:1px solid var(--border-faint);border-radius:20px;
        font-size:.78rem;color:var(--text-2);margin:3px;
      }
      .sa-member-chip .avatar { width:22px;height:22px;font-size:.55rem;flex-shrink:0; }
      .sa-stat-row {
        display:flex;align-items:center;justify-content:space-between;
        padding:9px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:.84rem;
      }
      .sa-stat-row:last-child { border-bottom:none; }
      .sa-stat-row-label { color:var(--text-3); }
      .sa-stat-row-val { font-weight:700;color:var(--text-1); }
      /* ── Sparkbar chart ── */
      .sa-chart-wrap { padding:0 24px 18px; }
      .sa-chart-title { font-size:.72rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px; }
      .sa-bars { display:flex;align-items:flex-end;gap:4px;height:60px; }
      .sa-bar-col { display:flex;flex-direction:column;align-items:center;flex:1;gap:3px; }
      .sa-bar {
        width:100%;border-radius:3px 3px 0 0;min-height:3px;
        transition:height .6s cubic-bezier(.4,0,.2,1);
      }
      .sa-bar-lbl { font-size:.55rem;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;text-align:center; }
    `;
    document.head.appendChild(s);
  }

  /* ── Estrutura base ── */
  containerEl.innerHTML = `
    <div class="sa-header">
      <div class="sa-header-left">
        <div class="sa-icon-box"><i class="fa-solid fa-triangle-exclamation"></i></div>
        <div>
          <div class="sa-title">Alertas do Sistema</div>
          <div class="sa-sub">Monitoramento automático da Ordem</div>
        </div>
      </div>
      <div id="saBadge"></div>
    </div>
    <div id="saScoreWrap"></div>
    <div id="saMetrics"></div>
    <div id="saAlertsBody" class="sa-alerts-body">
      <div style="display:flex;align-items:center;gap:12px;color:var(--text-3);font-size:.82rem;padding:8px 0">
        <i class="fa-solid fa-circle-notch fa-spin" style="color:var(--gold)"></i> Analisando dados da Ordem...
      </div>
    </div>
    <!-- Modal de detalhes -->
    <div class="modal-overlay" id="saDetailModal">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title" id="saDetailModalTitle"></div>
          <button class="modal-close" id="saDetailClose"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body" id="saDetailBody"></div>
      </div>
    </div>
  `;

  /* ── Setup modal ── */
  const detailModal = containerEl.querySelector('#saDetailModal') || document.getElementById('saDetailModal');
  containerEl.querySelector('#saDetailClose')?.addEventListener('click', () => detailModal?.classList.remove('open'));
  detailModal?.addEventListener('click', e => { if (e.target === detailModal) detailModal.classList.remove('open'); });

  const alerts = [];
  const today = new Date();
  let membrosAtivos = [], atividades = [], eventos = [], presencas = [];
  let atribuidos = [], respostasRecentes = [];

  try {
    const [r1, r2, r3, r4, r5, r6] = await Promise.all([
      db.from('profiles').select('id,name,initials,color,avatar_url,join_date,created_at').eq('status','ativo'),
      db.from('activities').select('id,title,deadline,status,assigned_to,closes_at').in('status',['Pendente','Em andamento']),
      db.from('events').select('id,title,event_date,mandatory,type').order('event_date',{ascending:true}),
      db.from('event_presencas').select('event_id,status'),
      db.from('activities').select('assigned_to'),
      db.from('activity_responses').select('user_id,created_at').gte('created_at', new Date(today.getTime()-30*86400000).toISOString()),
    ]);
    membrosAtivos    = r1.data || [];
    atividades       = r2.data || [];
    eventos          = r3.data || [];
    presencas        = r4.data || [];
    atribuidos       = r5.data || [];
    respostasRecentes= r6.data || [];
  } catch(e) { console.warn('[MSY Alerts]', e); }

  /* ── Calcular dados ── */
  const activeUserIds = new Set(respostasRecentes.map(r => r.user_id));
  const membrosInativos = membrosAtivos.filter(m => !activeUserIds.has(m.id));

  const atrasadas = atividades.filter(a => {
    const d = new Date(a.closes_at || (a.deadline + 'T23:59:59'));
    return d < today;
  });
  const proximas3 = atividades.filter(a => {
    const d = new Date(a.closes_at || (a.deadline + 'T23:59:59'));
    const diff = (d - today) / 86400000;
    return diff >= 0 && diff <= 3;
  });

  const pressPorEv = {};
  presencas.forEach(p => { pressPorEv[p.event_id] = (pressPorEv[p.event_id]||0)+1; });
  const eventosProximos7 = eventos.filter(e => {
    const diff = (new Date(e.event_date+'T00:00:00') - today) / 86400000;
    return diff >= 0 && diff <= 7;
  });
  const eventosSemPres = eventosProximos7.filter(e => !(pressPorEv[e.id]>0));

  const atribuidosSet = new Set(atribuidos.map(a => a.assigned_to));
  const semAtiv = membrosAtivos.filter(m => !atribuidosSet.has(m.id));

  const cutoff7 = new Date(today.getTime()-7*86400000).toISOString();
  const novos = membrosAtivos.filter(m => m.created_at > cutoff7);

  /* ── Score de saúde (0-100) ── */
  let score = 100;
  score -= Math.min(atrasadas.length * 8, 30);
  score -= Math.min(membrosInativos.length * 3, 25);
  score -= Math.min(proximas3.length * 3, 15);
  score -= Math.min(eventosSemPres.length * 4, 15);
  score -= Math.min(semAtiv.length * 1.5, 15);
  score = Math.max(0, Math.round(score));

  const scoreColor = score >= 80 ? '#10b981' : score >= 55 ? '#f59e0b' : '#ef4444';
  const scoreLabel = score >= 80 ? 'Saudável' : score >= 55 ? 'Atenção' : 'Crítico';

  /* ── Score bar ── */
  const scoreWrap = containerEl.querySelector('#saScoreWrap') || document.getElementById('saScoreWrap');
  if (scoreWrap) {
    scoreWrap.className = 'sa-score-wrap';
    scoreWrap.innerHTML = `
      <div class="sa-score-label">
        <span>Saúde da Ordem</span>
        <span><strong style="color:${scoreColor}">${score}</strong><span style="color:var(--text-3);font-size:.65rem">/100 — ${scoreLabel}</span></span>
      </div>
      <div class="sa-score-track">
        <div class="sa-score-fill" id="saScoreFill" style="width:0%;background:linear-gradient(90deg,${scoreColor}88,${scoreColor})"></div>
      </div>`;
    setTimeout(() => {
      const fill = containerEl.querySelector('#saScoreFill') || document.getElementById('saScoreFill');
      if (fill) fill.style.width = score + '%';
    }, 100);
  }

  /* ── Mini métricas ── */
  const metricsEl = containerEl.querySelector('#saMetrics') || document.getElementById('saMetrics');
  if (metricsEl) {
    const presConfTotal = presencas.filter(p=>p.status==='confirmado').length;
    const taxaPresenca = presencas.length > 0 ? Math.round(presConfTotal/presencas.length*100) : 0;
    const taxaConclusao = atribuidos.length > 0 ? Math.round((atribuidos.length-atividades.length)/Math.max(atribuidos.length,1)*100) : 0;

    const metrics = [
      { val: membrosAtivos.length,      lbl: 'Membros',     color: 'var(--gold)',   detail: 'total-membros' },
      { val: atrasadas.length,           lbl: 'Atrasadas',   color: atrasadas.length>0?'#ef4444':'#10b981', detail: 'atrasadas' },
      { val: taxaPresenca + '%',         lbl: 'Presença',    color: taxaPresenca>=70?'#10b981':taxaPresenca>=40?'#f59e0b':'#ef4444', detail: 'taxa-presenca' },
      { val: eventosProximos7.length,   lbl: 'Ev. Próx.',   color: '#60a5fa',      detail: 'eventos-proximos' },
    ];

    metricsEl.className = 'sa-metrics';
    metricsEl.innerHTML = metrics.map(m => `
      <div class="sa-metric" data-detail="${m.detail}" title="Clique para detalhes">
        <div class="sa-metric-val" style="color:${m.color}">${m.val}</div>
        <div class="sa-metric-lbl">${m.lbl}</div>
      </div>`).join('');
  }

  /* ── Montar alertas ── */
  if (membrosInativos.length > 0) alerts.push({
    level: membrosInativos.length > 4 ? 'danger' : 'warning',
    icon: 'fa-user-clock', tag: membrosInativos.length > 4 ? 'Crítico' : 'Atenção',
    title: `${membrosInativos.length} membro${membrosInativos.length>1?'s':''} inativo${membrosInativos.length>1?'s':''} nos últimos 30 dias`,
    detail: membrosInativos.slice(0,4).map(m=>m.name).join(', ')+(membrosInativos.length>4?` e mais ${membrosInativos.length-4}`:''),
    modalFn: () => openAlertModal('inativos', membrosInativos, membrosAtivos, atividades, presencas, eventos, respostasRecentes),
  });

  if (atrasadas.length > 0) alerts.push({
    level: 'danger', icon: 'fa-clock', tag: 'Urgente',
    title: `${atrasadas.length} atividade${atrasadas.length>1?'s':''} com prazo vencido`,
    detail: atrasadas.slice(0,3).map(a=>a.title).join(', ')+(atrasadas.length>3?` e mais ${atrasadas.length-3}`:''),
    modalFn: () => openAlertModal('atrasadas', atrasadas, membrosAtivos, atividades, presencas, eventos, respostasRecentes),
  });

  if (proximas3.length > 0) alerts.push({
    level: 'warning', icon: 'fa-hourglass-half', tag: 'Atenção',
    title: `${proximas3.length} atividade${proximas3.length>1?'s':''} vencendo em até 3 dias`,
    detail: proximas3.slice(0,3).map(a=>a.title).join(', '),
    modalFn: () => openAlertModal('proximas', proximas3, membrosAtivos, atividades, presencas, eventos, respostasRecentes),
  });

  if (eventosSemPres.length > 0) alerts.push({
    level: 'info', icon: 'fa-calendar-exclamation', tag: 'Eventos',
    title: `${eventosSemPres.length} evento${eventosSemPres.length>1?'s':''} próximo${eventosSemPres.length>1?'s':''} sem presença registrada`,
    detail: eventosSemPres.map(e=>e.title).join(', '),
    modalFn: () => openAlertModal('eventos-sem-pres', eventosSemPres, membrosAtivos, atividades, presencas, eventos, respostasRecentes),
  });

  if (semAtiv.length > 0) alerts.push({
    level: 'info', icon: 'fa-user-slash', tag: 'Membros',
    title: `${semAtiv.length} membro${semAtiv.length>1?'s':''} sem atividade atribuída`,
    detail: semAtiv.slice(0,4).map(m=>m.name).join(', ')+(semAtiv.length>4?` e mais ${semAtiv.length-4}`:''),
    modalFn: () => openAlertModal('sem-atividade', semAtiv, membrosAtivos, atividades, presencas, eventos, respostasRecentes),
  });

  if (novos.length > 0) alerts.push({
    level: 'info', icon: 'fa-user-plus', tag: 'Novo',
    title: `${novos.length} novo${novos.length>1?'s':''} membro${novos.length>1?'s':''} nos últimos 7 dias`,
    detail: novos.map(m=>m.name).join(', '),
    modalFn: () => openAlertModal('novos', novos, membrosAtivos, atividades, presencas, eventos, respostasRecentes),
  });

  /* ── Badge geral ── */
  const badgeEl = containerEl.querySelector('#saBadge') || document.getElementById('saBadge');
  if (badgeEl) {
    const hasDanger = alerts.some(a=>a.level==='danger');
    const hasWarning = alerts.some(a=>a.level==='warning');
    if (alerts.length===0) badgeEl.innerHTML = `<span class="sa-badge ok"><i class="fa-solid fa-circle-check"></i> Tudo em ordem</span>`;
    else if (hasDanger)    badgeEl.innerHTML = `<span class="sa-badge danger"><i class="fa-solid fa-circle-exclamation"></i> ${alerts.length} alerta${alerts.length>1?'s':''}</span>`;
    else                   badgeEl.innerHTML = `<span class="sa-badge warning"><i class="fa-solid fa-triangle-exclamation"></i> ${alerts.length} aviso${alerts.length>1?'s':''}</span>`;
  }

  /* ── Renderizar alertas ── */
  const alertsBody = containerEl.querySelector('#saAlertsBody') || document.getElementById('saAlertsBody');
  if (!alertsBody) return;

  if (alerts.length === 0) {
    alertsBody.innerHTML = `
      <div class="sa-ok">
        <div class="sa-ok-icon"><i class="fa-solid fa-shield-check"></i></div>
        <div>
          <div style="font-weight:700;font-size:.86rem;color:#10b981;margin-bottom:3px">Ordem operando sem irregularidades</div>
          <div style="font-size:.75rem;color:var(--text-3)">Nenhuma anomalia detectada nos dados do sistema</div>
        </div>
      </div>`;
    return;
  }

  const dangers  = alerts.filter(a=>a.level==='danger');
  const warnings = alerts.filter(a=>a.level==='warning');
  const infos    = alerts.filter(a=>a.level==='info');

  const renderItem = (a, idx) => `
    <div class="sa-alert-item ${a.level}" data-alert-idx="${idx}" style="cursor:pointer">
      <div class="sa-alert-circle ${a.level}"><i class="fa-solid ${a.icon}"></i></div>
      <div style="flex:1;min-width:0">
        <div class="sa-alert-tag ${a.level}">${a.tag}</div>
        <div class="sa-alert-title">${a.title}</div>
        ${a.detail ? `<div class="sa-alert-detail">${Utils.escapeHtml(a.detail)}</div>` : ''}
      </div>
      <i class="fa-solid fa-chevron-right sa-alert-chevron"></i>
    </div>`;

  let html = '';
  if (dangers.length)  html += dangers.map((a,i)=>renderItem(a, alerts.indexOf(a))).join('');
  if (warnings.length) { if(dangers.length) html += '<div class="sa-divider"></div>'; html += warnings.map(a=>renderItem(a, alerts.indexOf(a))).join(''); }
  if (infos.length)    { if(dangers.length||warnings.length) html += '<div class="sa-divider"></div>'; html += infos.map(a=>renderItem(a, alerts.indexOf(a))).join(''); }

  alertsBody.innerHTML = html;

  // Eventos de clique nos itens
  alertsBody.querySelectorAll('.sa-alert-item').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.alertIdx);
      if (alerts[idx]?.modalFn) alerts[idx].modalFn();
    });
  });

  // Clique nas métricas
  metricsEl?.querySelectorAll('.sa-metric').forEach(el => {
    el.addEventListener('click', () => {
      const detail = el.dataset.detail;
      const matchMap = {
        'total-membros':    alerts.find(a=>a.modalFn && a.title.includes('inativo')),
        'atrasadas':        alerts.find(a=>a.level==='danger' && a.icon==='fa-clock'),
        'taxa-presenca':    alerts.find(a=>a.modalFn && a.title.includes('presença')),
        'eventos-proximos': alerts.find(a=>a.title.includes('evento')),
      };
      matchMap[detail]?.modalFn?.();
    });
  });
}

/* ─── Modal de Detalhes do Alerta ─── */
async function openAlertModal(type, items, membrosAtivos, atividades, presencas, eventos, respostasRecentes) {
  const modal = document.getElementById('saDetailModal');
  const body  = document.getElementById('saDetailBody');
  const title = document.getElementById('saDetailModalTitle');
  if (!modal || !body) return;

  const today = new Date();

  const heroClass = type === 'atrasadas' || type === 'inativos' ? 'danger' :
                    type === 'proximas' ? 'warning' : 'info';

  const avatarHTML = (m) => {
    if (!m) return '';
    const bg = `linear-gradient(135deg,${m.color||'#7f1d1d'},#1a1a1a)`;
    return `<div class="avatar sa-member-chip-av" style="width:22px;height:22px;font-size:.55rem;background:${bg};flex-shrink:0">
      ${m.avatar_url ? `<img src="${m.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : (m.initials||Utils.getInitials(m.name))}
    </div>`;
  };

  const memberChip = (m) => `
    <span class="sa-member-chip">
      ${avatarHTML(m)} ${Utils.escapeHtml(m.name)}
    </span>`;

  if (type === 'inativos') {
    title.innerHTML = `<i class="fa-solid fa-user-clock" style="color:#ef4444"></i> Membros Inativos`;
    // Calcular dias sem atividade por membro
    const lastActivityMap = {};
    respostasRecentes.forEach(r => {
      if (!lastActivityMap[r.user_id] || r.created_at > lastActivityMap[r.user_id]) {
        lastActivityMap[r.user_id] = r.created_at;
      }
    });
    body.innerHTML = `
      <div class="sa-modal-hero ${heroClass}">
        <div class="sa-modal-tag ${heroClass}">Crítico</div>
        <div class="sa-modal-hero-title">${items.length} membros sem atividade nos últimos 30 dias</div>
        <div class="sa-modal-hero-sub">Membros que não enviaram nenhuma resposta de atividade no período. Considere entrar em contato ou atribuir tarefas.</div>
      </div>
      <div class="sa-modal-section">
        <div class="sa-modal-section-title"><i class="fa-solid fa-users"></i> Membros afetados</div>
        <div>${items.map(memberChip).join('')}</div>
      </div>
      <div class="sa-modal-section">
        <div class="sa-modal-section-title"><i class="fa-solid fa-chart-bar"></i> Detalhamento</div>
        ${items.map(m => {
          const last = lastActivityMap[m.id];
          const diasSem = last ? Math.floor((today - new Date(last)) / 86400000) : '∞';
          return `<div class="sa-stat-row">
            <span class="sa-stat-row-label">${Utils.escapeHtml(m.name)}</span>
            <span class="sa-stat-row-val" style="color:${diasSem > 20 ? '#ef4444' : '#f59e0b'}">${diasSem === '∞' ? 'Nunca respondeu' : diasSem + ' dias sem atividade'}</span>
          </div>`;
        }).join('')}
      </div>`;

  } else if (type === 'atrasadas' || type === 'proximas') {
    const isAtrasadas = type === 'atrasadas';
    title.innerHTML = `<i class="fa-solid fa-clock" style="color:${isAtrasadas?'#ef4444':'#f59e0b'}"></i> Atividades ${isAtrasadas?'Atrasadas':'Vencendo em Breve'}`;
    body.innerHTML = `
      <div class="sa-modal-hero ${heroClass}">
        <div class="sa-modal-tag ${heroClass}">${isAtrasadas?'Urgente':'Atenção'}</div>
        <div class="sa-modal-hero-title">${items.length} atividade${items.length>1?'s':''} ${isAtrasadas?'com prazo vencido':'vencendo em até 3 dias'}</div>
        <div class="sa-modal-hero-sub">${isAtrasadas?'Estas atividades ultrapassaram o prazo de entrega e precisam de ação imediata da Diretoria.':'Membros com prazo próximo precisam de atenção para garantir a entrega a tempo.'}</div>
      </div>
      <div class="sa-modal-section">
        <div class="sa-modal-section-title"><i class="fa-solid fa-list-check"></i> Lista de atividades</div>
        ${items.map(a => {
          const membro = membrosAtivos.find(m => m.id === a.assigned_to);
          const deadline = new Date(a.closes_at || (a.deadline+'T23:59:59'));
          const diffDays = Math.ceil((deadline-today)/86400000);
          return `<div class="sa-stat-row">
            <div>
              <div style="font-weight:600;font-size:.84rem;color:var(--text-1)">${Utils.escapeHtml(a.title)}</div>
              <div style="font-size:.72rem;color:var(--text-3)">Para: ${membro?Utils.escapeHtml(membro.name):'—'}</div>
            </div>
            <span style="font-size:.78rem;font-weight:700;color:${isAtrasadas?'#ef4444':'#f59e0b'};white-space:nowrap">
              ${isAtrasadas ? `${Math.abs(diffDays)}d atraso` : diffDays===0?'Hoje':diffDays+'d restantes'}
            </span>
          </div>`;
        }).join('')}
      </div>`;

  } else if (type === 'eventos-sem-pres') {
    title.innerHTML = `<i class="fa-solid fa-calendar-exclamation" style="color:#60a5fa"></i> Eventos sem Presença Registrada`;
    body.innerHTML = `
      <div class="sa-modal-hero info">
        <div class="sa-modal-tag info">Eventos</div>
        <div class="sa-modal-hero-title">${items.length} evento${items.length>1?'s':''} nos próximos 7 dias sem controle de presença</div>
        <div class="sa-modal-hero-sub">Acesse a aba Presenças para registrar a participação dos membros nestes eventos.</div>
      </div>
      <div class="sa-modal-section">
        <div class="sa-modal-section-title"><i class="fa-solid fa-calendar-days"></i> Eventos pendentes</div>
        ${items.map(ev => {
          const d = new Date(ev.event_date+'T00:00:00');
          const diff = Math.ceil((d-today)/86400000);
          return `<div class="sa-stat-row">
            <div>
              <div style="font-weight:600;font-size:.84rem;color:var(--text-1)">${Utils.escapeHtml(ev.title)}</div>
              <div style="font-size:.72rem;color:var(--text-3)">${ev.type} · ${Utils.formatDate(ev.event_date)}</div>
            </div>
            <span style="font-size:.78rem;font-weight:700;color:#60a5fa;white-space:nowrap">
              ${diff===0?'Hoje':diff===1?'Amanhã':'Em '+diff+'d'}
            </span>
          </div>`;
        }).join('')}
      </div>
      <div class="sa-modal-section">
        <div style="text-align:center">
          <a href="presencas.html" class="btn btn-primary"><i class="fa-solid fa-clipboard-list"></i> Ir para Presenças</a>
        </div>
      </div>`;

  } else if (type === 'sem-atividade') {
    title.innerHTML = `<i class="fa-solid fa-user-slash" style="color:#60a5fa"></i> Membros sem Atividade`;
    body.innerHTML = `
      <div class="sa-modal-hero info">
        <div class="sa-modal-tag info">Membros</div>
        <div class="sa-modal-hero-title">${items.length} membro${items.length>1?'s':''} sem nenhuma atividade atribuída</div>
        <div class="sa-modal-hero-sub">Estes membros ainda não possuem atividades no sistema. Considere atribuir tarefas para engajá-los.</div>
      </div>
      <div class="sa-modal-section">
        <div class="sa-modal-section-title"><i class="fa-solid fa-users"></i> Membros</div>
        <div>${items.map(memberChip).join('')}</div>
      </div>
      <div class="sa-modal-section">
        <div style="text-align:center">
          <a href="atividades.html" class="btn btn-primary"><i class="fa-solid fa-plus"></i> Criar Atividades</a>
        </div>
      </div>`;

  } else if (type === 'novos') {
    title.innerHTML = `<i class="fa-solid fa-user-plus" style="color:#60a5fa"></i> Novos Membros`;
    body.innerHTML = `
      <div class="sa-modal-hero info">
        <div class="sa-modal-tag info">Novo</div>
        <div class="sa-modal-hero-title">${items.length} novo${items.length>1?'s':''} membro${items.length>1?'s':''} integrado${items.length>1?'s':''}</div>
        <div class="sa-modal-hero-sub">Aprovados nos últimos 7 dias. Certifique-se de que receberam orientação de onboarding.</div>
      </div>
      <div class="sa-modal-section">
        <div class="sa-modal-section-title"><i class="fa-solid fa-users"></i> Novos integrantes</div>
        ${items.map(m => {
          const daysAgo = Math.floor((today-new Date(m.created_at))/86400000);
          return `<div class="sa-stat-row">
            <div style="display:flex;align-items:center;gap:10px">${avatarHTML(m)}<span style="font-weight:600;font-size:.84rem">${Utils.escapeHtml(m.name)}</span></div>
            <span style="font-size:.75rem;color:var(--text-3)">${daysAgo===0?'Hoje':daysAgo===1?'Ontem':daysAgo+'d atrás'}</span>
          </div>`;
        }).join('')}
      </div>`;
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
