/* ============================================================
   MSY PORTAL — PAGES/PROJETOS.JS  (v2)
   Módulo ES — Gestão de Projetos.
   Fluxo de trabalho com aprovação, rastreamento de tempo, agenda
   operacional, governança por projeto, documentação e histórico.
   Depende de window.MSY (bridge populado por app.js).
   MSYPerms: const global de modules3.js, acessível pelo escopo global.
   ============================================================ */

const { db, Utils, Auth, ViewMode, renderSidebar, renderTopBar } = window.MSY;
const esc = (t) => Utils.escapeHtml(t == null ? '' : String(t));

/* ──────────────────────────────────────────────
   CONSTANTES
   ────────────────────────────────────────────── */
const TIPO_LABELS = { interno: 'Interno', externo: 'Externo' };

const PRIORIDADES = ['baixa', 'media', 'alta', 'critica'];
const PRIORIDADE_LABELS = { baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica' };
const PRIORIDADE_CLASS = { baixa: 'prio-baixa', media: 'prio-media', alta: 'prio-alta', critica: 'prio-critica' };

const PROJ_STATUS = ['planejamento', 'em_desenvolvimento', 'em_testes', 'homologacao', 'concluido', 'cancelado'];
const PROJ_STATUS_LABELS = {
  planejamento: 'Planejamento', em_desenvolvimento: 'Em Desenvolvimento', em_testes: 'Em Testes',
  homologacao: 'Homologação', concluido: 'Concluído', cancelado: 'Cancelado',
};
const PROJ_STATUS_CLASS = {
  planejamento: 'st-plan', em_desenvolvimento: 'st-dev', em_testes: 'st-test',
  homologacao: 'st-homolog', concluido: 'st-done', cancelado: 'st-cancel',
};

const TASK_STATUS_LABELS = {
  nao_iniciada: 'Não iniciada', em_andamento: 'Em andamento', em_revisao: 'Em revisão',
  necessita_ajustes: 'Necessita ajustes', concluida: 'Concluída', bloqueada: 'Bloqueada',
};
const TASK_STATUS_CLASS = {
  nao_iniciada: 'ts-todo', em_andamento: 'ts-doing', em_revisao: 'ts-review',
  necessita_ajustes: 'ts-fix', concluida: 'ts-done', bloqueada: 'ts-blocked',
};

const DEFAULT_ROLES = ['Front-end', 'Back-end', 'UX/UI', 'QA', 'Gestor', 'Marketing', 'Conteúdo', 'IA', 'DevOps'];

const DOC_SECTIONS = [
  { key: 'contexto', label: 'Contexto', icon: 'fa-circle-info' },
  { key: 'objetivos', label: 'Objetivos', icon: 'fa-bullseye' },
  { key: 'requisitos', label: 'Requisitos', icon: 'fa-list-check' },
  { key: 'regras_negocio', label: 'Regras de Negócio', icon: 'fa-scale-balanced' },
  { key: 'arquitetura', label: 'Arquitetura', icon: 'fa-sitemap' },
  { key: 'decisoes_tecnicas', label: 'Decisões Técnicas', icon: 'fa-code-branch' },
  { key: 'roadmap', label: 'Roadmap', icon: 'fa-road' },
  { key: 'observacoes', label: 'Observações', icon: 'fa-note-sticky' },
];

const HISTORY_META = {
  projeto_criado: { icon: 'fa-flag', label: 'Projeto criado' },
  projeto_editado: { icon: 'fa-pen', label: 'Projeto atualizado' },
  status_alterado: { icon: 'fa-arrows-rotate', label: 'Status alterado' },
  participante_adicionado: { icon: 'fa-user-plus', label: 'Participante adicionado' },
  participante_removido: { icon: 'fa-user-minus', label: 'Participante removido' },
  participante_gestao: { icon: 'fa-user-shield', label: 'Gestão alterada' },
  categoria_criada: { icon: 'fa-folder-plus', label: 'Categoria criada' },
  categoria_removida: { icon: 'fa-folder-minus', label: 'Categoria removida' },
  tarefa_criada: { icon: 'fa-plus', label: 'Tarefa criada' },
  tarefa_editada: { icon: 'fa-pen', label: 'Tarefa atualizada' },
  tarefa_iniciada: { icon: 'fa-play', label: 'Tarefa iniciada' },
  tarefa_em_revisao: { icon: 'fa-magnifying-glass', label: 'Revisão solicitada' },
  tarefa_ajustes: { icon: 'fa-rotate-left', label: 'Ajustes solicitados' },
  tarefa_concluida: { icon: 'fa-circle-check', label: 'Tarefa concluída' },
  tarefa_reatribuida: { icon: 'fa-user-pen', label: 'Tarefa reatribuída' },
  tarefa_removida: { icon: 'fa-trash', label: 'Tarefa removida' },
  doc_atualizada: { icon: 'fa-file-pen', label: 'Documentação atualizada' },
};

/* ──────────────────────────────────────────────
   ESTADO
   ────────────────────────────────────────────── */
const state = {
  profile: null,
  isDiretoria: false,
  canCreate: false,
  roleOptions: [],            // catálogo de papéis personalizados
  currentProjectTab: 'resumo',
  currentTasksView: 'minhas', // minhas | equipe | revisao | concluidas
};

const content = () => document.getElementById('pageContent');

/* ──────────────────────────────────────────────
   HELPERS DE PROGRESSO / TEMPO
   ────────────────────────────────────────────── */
function taskProgress(task, checklist) {
  const items = checklist?.[task.id] || [];
  if (items.length) {
    const done = items.filter(i => i.done).length;
    return Math.round((done / items.length) * 100);
  }
  return task.status === 'concluida' ? 100 : 0;
}
function avgProgress(tasks, checklist) {
  if (!tasks.length) return 0;
  return Math.round(tasks.reduce((s, t) => s + taskProgress(t, checklist), 0) / tasks.length);
}
function isOverdue(task) {
  if (!task.prazo || task.status === 'concluida') return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return new Date(task.prazo + 'T23:59:59') < today;
}
function fmtTime(t) { return t ? String(t).slice(0, 5) : ''; }
function fmtDuration(seconds) {
  seconds = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  if (m) return `${m}m`;
  return seconds ? `${seconds}s` : '0m';
}
function liveSeconds(t) {
  let s = Number(t.time_spent_seconds || 0);
  if (t.status === 'em_andamento' && t.period_start) {
    s += Math.max(0, (Date.now() - new Date(t.period_start).getTime()) / 1000);
  }
  return s;
}
function cmpDelivery(a, b) {
  if (a.prazo !== b.prazo) return a.prazo < b.prazo ? -1 : 1;
  const ah = a.prazo_hora || '99:99', bh = b.prazo_hora || '99:99';
  if (ah !== bh) return ah < bh ? -1 : 1;
  return (a.title || '').localeCompare(b.title || '');
}
function agendaDateLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const wd = d.toLocaleDateString('pt-BR', { weekday: 'long' });
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)} · ${Utils.formatDate(dateStr)}`;
}

/* ──────────────────────────────────────────────
   HELPERS DE UI
   ────────────────────────────────────────────── */
function avatarHTML(p, size = 30) {
  if (!p) return `<div class="proj-avatar" style="width:${size}px;height:${size}px;font-size:${size*0.36}px">?</div>`;
  const inner = p.avatar_url
    ? `<img src="${esc(p.avatar_url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
    : esc(p.initials || Utils.getInitials(p.name || '?'));
  const bg = p.color ? `background:${esc(p.color)}` : '';
  return `<div class="proj-avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size*0.36)}px;${bg}">${inner}</div>`;
}
function progressBar(pct, cls = '') {
  const v = Math.max(0, Math.min(100, pct | 0));
  return `<div class="proj-progress ${cls}"><div class="proj-progress-fill" style="width:${v}%"></div></div>`;
}
function projStatusBadge(s) {
  return `<span class="proj-badge ${PROJ_STATUS_CLASS[s] || ''}">${esc(PROJ_STATUS_LABELS[s] || s)}</span>`;
}
function prioBadge(p) {
  return `<span class="proj-prio ${PRIORIDADE_CLASS[p] || ''}">${esc(PRIORIDADE_LABELS[p] || p)}</span>`;
}
function taskStatusBadge(s) {
  return `<span class="proj-tstatus ${TASK_STATUS_CLASS[s] || ''}">${esc(TASK_STATUS_LABELS[s] || s)}</span>`;
}
function dueChip(t) {
  if (!t.prazo) return '';
  const time = t.prazo_hora ? ` ${fmtTime(t.prazo_hora)}` : '';
  return `<span class="proj-task-due ${isOverdue(t) ? 'overdue' : ''}"><i class="fa-regular fa-clock"></i> ${Utils.formatDate(t.prazo)}${time}</span>`;
}
function loadingHTML(msg = 'Carregando...') {
  return `<div class="loading-container"><i class="fa-solid fa-circle-notch fa-spin"></i> ${esc(msg)}</div>`;
}
function emptyHTML(text, icon = 'fa-folder-open') {
  return `<div class="empty-state"><div class="empty-state-icon"><i class="fa-solid ${icon}"></i></div><div class="empty-state-text">${esc(text)}</div></div>`;
}

/* ──────────────────────────────────────────────
   MODAL
   ────────────────────────────────────────────── */
function openModal(innerHTML, { maxWidth = 640 } = {}) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'projModal';
  overlay.innerHTML = `<div class="modal" style="max-width:${maxWidth}px">${innerHTML}</div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  overlay.querySelector('[data-modal-close]')?.addEventListener('click', closeModal);
  return overlay;
}
function closeModal() {
  const m = document.getElementById('projModal');
  if (m) m.remove();
}
function modalHeader(title, sub) {
  return `<div class="modal-header" style="padding:18px 24px">
    <div class="modal-title" style="flex-direction:column;align-items:flex-start;gap:2px">
      <span>${esc(title)}</span>
      ${sub ? `<span style="font-size:.68rem;font-weight:400;color:var(--text-3)">${esc(sub)}</span>` : ''}
    </div>
    <button class="modal-close" data-modal-close><i class="fa-solid fa-xmark"></i></button>
  </div>`;
}

/* ──────────────────────────────────────────────
   DADOS / AÇÕES AUXILIARES
   ────────────────────────────────────────────── */
async function logEvent(projectId, action, targetType = null, targetId = null, metadata = {}) {
  try {
    await db.from('project_history').insert({
      project_id: projectId, actor_id: state.profile.id,
      action, target_type: targetType, target_id: targetId, metadata,
    });
  } catch (err) {
    console.error('[MSY][projetos] Erro ao registrar histórico:', err);
  }
}
async function notifyProject(projectId, userIds, message, icon = '📁', link = null) {
  const ids = (userIds || []).filter(Boolean);
  if (!ids.length) return;
  try {
    await db.rpc('notify_project', {
      p_project_id: projectId, p_user_ids: ids,
      p_message: message, p_type: 'projeto', p_icon: icon,
      p_link: link || `projetos.html#projeto/${projectId}`,
    });
  } catch (err) {
    console.error('[MSY][projetos] Erro ao notificar:', err);
  }
}
async function projectManagerIds(projectId) {
  try {
    const { data } = await db.from('project_participants').select('user_id').eq('project_id', projectId).eq('is_manager', true);
    return (data || []).map(m => m.user_id);
  } catch { return []; }
}
async function loadActiveProfiles() {
  try {
    const { data, error } = await db.from('profiles')
      .select('id,name,role,initials,color,avatar_url')
      .eq('status', 'ativo').order('name');
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('[MSY][projetos] Erro ao carregar membros:', err);
    return [];
  }
}
async function loadRoleOptions() {
  try {
    const { data, error } = await db.from('project_role_options').select('name').order('name');
    if (error) throw error;
    state.roleOptions = (data || []).map(r => r.name);
  } catch (err) {
    console.error('[MSY][projetos] Erro ao carregar papéis:', err);
    state.roleOptions = [];
  }
}
function allRoles() {
  return Array.from(new Set([...DEFAULT_ROLES, ...state.roleOptions]));
}
/** Governança por projeto: criador OU participante gestor (independente do portal). */
function canManage(project, participants = []) {
  if (!project || !state.profile) return false;
  const me = state.profile.id;
  if (project.created_by === me) return true;
  return participants.some(p => p.user_id === me && p.is_manager);
}

/* ============================================================
   INIT + ROTEADOR
   ============================================================ */
async function initProjetos() {
  const profile = await renderSidebar('projetos');
  if (!profile) return;
  await renderTopBar('Gestão de Projetos', profile);

  state.profile = profile;
  state.isDiretoria = profile.tier === 'diretoria';
  try {
    state.canCreate = state.isDiretoria || await MSYPerms.checkAny(profile.id, profile.tier, ['criar_projetos', 'gerenciar_projetos']);
  } catch (err) {
    console.error('[MSY][projetos] Erro ao checar permissões:', err);
  }

  await loadRoleOptions();

  // Delegação de eventos (sobrevive a re-renders)
  const root = content();
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('keydown', onKeydown);

  window.addEventListener('hashchange', route);
  route();
}

function route() {
  const hash = location.hash.replace(/^#/, '');
  const parts = hash.split('/');
  if (parts[0] === 'projeto' && parts[1]) {
    state.currentProjectTab = parts[2] || 'resumo';
    renderProject(parts[1]);
  } else if (parts[0] === 'minhas-tarefas') {
    renderMyTasks();
  } else {
    renderDashboard();
  }
}
function goto(hash) { location.hash = hash; }

/* ============================================================
   DASHBOARD GERAL
   ============================================================ */
async function renderDashboard() {
  const root = content();
  root.innerHTML = loadingHTML();
  try {
    const { data: projects, error: pErr } = await db.from('projects')
      .select('*, responsavel:responsavel_id(name,initials,color,avatar_url)')
      .order('created_at', { ascending: false });
    if (pErr) throw pErr;

    const projIds = (projects || []).map(p => p.id);
    let tasks = [];
    let checklist = {};
    if (projIds.length) {
      const { data: t, error: tErr } = await db.from('project_tasks')
        .select('id,project_id,category_id,status,prazo,assigned_to')
        .in('project_id', projIds);
      if (tErr) throw tErr;
      tasks = t || [];
      const taskIds = tasks.map(t => t.id);
      if (taskIds.length) {
        const { data: items } = await db.from('task_checklist_items')
          .select('task_id,done').in('task_id', taskIds);
        (items || []).forEach(i => { (checklist[i.task_id] ||= []).push(i); });
      }
    }

    const tasksByProj = {};
    tasks.forEach(t => { (tasksByProj[t.project_id] ||= []).push(t); });

    const total = projects.length;
    const ativos = projects.filter(p => !['concluido', 'cancelado'].includes(p.status)).length;
    const concluidos = projects.filter(p => p.status === 'concluido').length;
    const pendentes = tasks.filter(t => t.status !== 'concluida').length;
    const emRevisao = tasks.filter(t => t.status === 'em_revisao').length;
    const atrasadas = tasks.filter(isOverdue).length;

    const cards = `
      <div class="stats-grid proj-stats">
        ${statCard('fa-diagram-project', total, 'Projetos', 'gold-accent')}
        ${statCard('fa-bolt', ativos, 'Ativos', 'blue-accent')}
        ${statCard('fa-magnifying-glass', emRevisao, 'Em revisão', 'blue-accent')}
        ${statCard('fa-circle-check', concluidos, 'Concluídos', 'green-accent')}
        ${statCard('fa-list-check', pendentes, 'Tarefas pendentes', 'gold-accent')}
        ${statCard('fa-triangle-exclamation', atrasadas, 'Tarefas atrasadas', 'red-accent')}
      </div>`;

    const andamento = projects.length ? `
      <div class="proj-panel">
        <div class="proj-panel-title"><i class="fa-solid fa-chart-line"></i> Andamento dos projetos</div>
        <div class="proj-chart">
          ${projects.slice(0, 12).map(p => {
            const pct = avgProgress(tasksByProj[p.id] || [], checklist);
            return `<div class="proj-chart-row" data-action="open-project" data-id="${p.id}" role="button" tabindex="0">
              <div class="proj-chart-label">${esc(p.name)}</div>
              ${progressBar(pct)}
              <div class="proj-chart-val">${pct}%</div>
            </div>`;
          }).join('')}
        </div>
      </div>` : '';

    const doneByUser = {};
    tasks.filter(t => t.status === 'concluida' && t.assigned_to).forEach(t => {
      doneByUser[t.assigned_to] = (doneByUser[t.assigned_to] || 0) + 1;
    });
    const topUsers = Object.entries(doneByUser).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const maxDone = topUsers.length ? topUsers[0][1] : 1;
    let prodPanel = '';
    if (topUsers.length) {
      const profs = await loadActiveProfiles();
      const pmap = {}; profs.forEach(p => pmap[p.id] = p);
      prodPanel = `
        <div class="proj-panel">
          <div class="proj-panel-title"><i class="fa-solid fa-users-gear"></i> Produtividade por equipe</div>
          <div class="proj-chart">
            ${topUsers.map(([uid, n]) => `
              <div class="proj-chart-row">
                <div class="proj-chart-label" style="display:flex;align-items:center;gap:8px">${avatarHTML(pmap[uid], 24)}<span>${esc(pmap[uid]?.name || '—')}</span></div>
                ${progressBar(Math.round(n / maxDone * 100), 'green')}
                <div class="proj-chart-val">${n}</div>
              </div>`).join('')}
          </div>
        </div>`;
    }

    const grid = projects.length ? `
      <div class="proj-grid">
        ${projects.map(p => projectCard(p, tasksByProj[p.id] || [], checklist)).join('')}
      </div>` : emptyHTML('Nenhum projeto ainda. Crie o primeiro para começar.', 'fa-diagram-project');

    root.innerHTML = `
      <div class="proj-shell">
        <div class="proj-header">
          <div>
            <h1 class="proj-h1">Gestão de Projetos</h1>
            <p class="proj-sub">Centralize ideias, planejamento, tarefas e acompanhamento.</p>
          </div>
          <div class="proj-header-actions">
            <button class="btn btn-ghost" data-action="go-mytasks"><i class="fa-solid fa-circle-user"></i> Minhas Tarefas</button>
            ${state.canCreate ? `<button class="btn btn-gold" data-action="new-project"><i class="fa-solid fa-plus"></i> Novo Projeto</button>` : ''}
          </div>
        </div>
        ${cards}
        <div class="proj-panels">${andamento}${prodPanel}</div>
        <div class="proj-section-title">Todos os projetos</div>
        ${grid}
      </div>`;
  } catch (err) {
    console.error('[MSY][projetos] Erro ao carregar dashboard:', err);
    root.innerHTML = emptyHTML('Erro ao carregar. Tente recarregar a página.', 'fa-triangle-exclamation');
  }
}

function statCard(icon, value, label, accent = 'gold-accent') {
  return `<div class="stat-card ${accent}">
    <div class="proj-stat-ico"><i class="fa-solid ${icon}"></i></div>
    <div><div class="proj-stat-val">${value}</div><div class="proj-stat-label">${esc(label)}</div></div>
  </div>`;
}

function projectCard(p, tasks, checklist) {
  const pct = avgProgress(tasks, checklist);
  const done = tasks.filter(t => t.status === 'concluida').length;
  return `<div class="proj-card" data-action="open-project" data-id="${p.id}" role="button" tabindex="0">
    <div class="proj-card-top">
      ${projStatusBadge(p.status)}
      ${prioBadge(p.prioridade)}
    </div>
    <div class="proj-card-name">${esc(p.name)}</div>
    <div class="proj-card-desc">${esc(p.objetivo || p.description || 'Sem descrição.')}</div>
    <div class="proj-card-prog">
      ${progressBar(pct)}
      <div class="proj-card-prog-meta"><span>${pct}% concluído</span><span>${done}/${tasks.length} tarefas</span></div>
    </div>
    <div class="proj-card-foot">
      <span class="proj-chip"><i class="fa-regular fa-flag"></i> ${esc(TIPO_LABELS[p.tipo] || p.tipo)}</span>
      ${p.responsavel ? `<span class="proj-chip">${avatarHTML(p.responsavel, 20)} ${esc(p.responsavel.name)}</span>` : ''}
    </div>
  </div>`;
}

/* ============================================================
   CRIAR / EDITAR PROJETO
   ============================================================ */
async function openProjectModal(existing = null) {
  const profs = await loadActiveProfiles();
  const roadmap = Array.isArray(existing?.roadmap) ? existing.roadmap : [];
  const rmGet = (v) => roadmap.find(r => r.versao === v)?.descricao || '';
  const e = existing || {};
  const html = `
    ${modalHeader(existing ? 'Editar Projeto' : 'Novo Projeto', 'Documente o projeto antes de iniciar o desenvolvimento')}
    <div class="modal-body proj-form">
      <div class="proj-form-section">Informações Gerais</div>
      <div class="form-group"><label class="form-label">Nome do projeto *</label>
        <input class="form-input" id="pf-name" value="${esc(e.name)}" placeholder="Ex.: Novo App de Membros"></div>
      <div class="form-group"><label class="form-label">Descrição</label>
        <textarea class="form-textarea" id="pf-description" rows="2">${esc(e.description)}</textarea></div>
      <div class="form-group"><label class="form-label">Objetivo</label>
        <textarea class="form-textarea" id="pf-objetivo" rows="2">${esc(e.objetivo)}</textarea></div>
      <div class="form-group"><label class="form-label">Problema que resolve</label>
        <textarea class="form-textarea" id="pf-problema" rows="2">${esc(e.problema)}</textarea></div>
      <div class="proj-form-grid">
        <div class="form-group"><label class="form-label">Público-alvo</label>
          <input class="form-input" id="pf-publico" value="${esc(e.publico_alvo)}"></div>
        <div class="form-group"><label class="form-label">Tipo do projeto</label>
          <select class="form-select" id="pf-tipo">
            ${Object.entries(TIPO_LABELS).map(([k, l]) => `<option value="${k}" ${e.tipo === k ? 'selected' : ''}>${l}</option>`).join('')}
          </select></div>
      </div>

      <div class="proj-form-section">Planejamento</div>
      <div class="form-group"><label class="form-label">Funcionalidades previstas</label>
        <textarea class="form-textarea" id="pf-func" rows="2">${esc(e.funcionalidades_previstas)}</textarea></div>
      <div class="form-group"><label class="form-label">Benefícios esperados</label>
        <textarea class="form-textarea" id="pf-benef" rows="2">${esc(e.beneficios_esperados)}</textarea></div>
      <div class="form-group"><label class="form-label">Critérios de sucesso</label>
        <textarea class="form-textarea" id="pf-criterios" rows="2">${esc(e.criterios_sucesso)}</textarea></div>

      <div class="proj-form-section">Roadmap</div>
      <div class="form-group"><label class="form-label">V1</label>
        <textarea class="form-textarea" id="pf-rm-v1" rows="2">${esc(rmGet('V1'))}</textarea></div>
      <div class="form-group"><label class="form-label">V2</label>
        <textarea class="form-textarea" id="pf-rm-v2" rows="2">${esc(rmGet('V2'))}</textarea></div>
      <div class="form-group"><label class="form-label">V3</label>
        <textarea class="form-textarea" id="pf-rm-v3" rows="2">${esc(rmGet('V3'))}</textarea></div>

      <div class="proj-form-section">Definições</div>
      <div class="proj-form-grid">
        <div class="form-group"><label class="form-label">Prioridade</label>
          <select class="form-select" id="pf-prio">
            ${PRIORIDADES.map(k => `<option value="${k}" ${(e.prioridade || 'media') === k ? 'selected' : ''}>${PRIORIDADE_LABELS[k]}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Status</label>
          <select class="form-select" id="pf-status">
            ${PROJ_STATUS.map(k => `<option value="${k}" ${(e.status || 'planejamento') === k ? 'selected' : ''}>${PROJ_STATUS_LABELS[k]}</option>`).join('')}
          </select></div>
      </div>
      <div class="proj-form-grid">
        <div class="form-group"><label class="form-label">Data de início</label>
          <input type="date" class="form-input" id="pf-inicio" value="${esc(e.data_inicio)}"></div>
        <div class="form-group"><label class="form-label">Data prevista de entrega</label>
          <input type="date" class="form-input" id="pf-entrega" value="${esc(e.data_entrega)}"></div>
      </div>
      <div class="form-group"><label class="form-label">Responsável principal</label>
        <select class="form-select" id="pf-resp">
          <option value="">— Selecionar —</option>
          ${profs.map(p => `<option value="${p.id}" ${e.responsavel_id === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-modal-close>Cancelar</button>
      <button class="btn btn-gold" id="pf-save"><i class="fa-solid fa-check"></i> ${existing ? 'Salvar' : 'Criar Projeto'}</button>
    </div>`;
  openModal(html, { maxWidth: 720 });
  document.getElementById('pf-save').addEventListener('click', () => saveProject(existing));
}

function buildRoadmap() {
  const out = [];
  ['V1', 'V2', 'V3'].forEach(v => {
    const val = document.getElementById(`pf-rm-${v.toLowerCase()}`)?.value.trim();
    if (val) out.push({ versao: v, descricao: val });
  });
  return out;
}

async function saveProject(existing) {
  const name = document.getElementById('pf-name').value.trim();
  if (!name) { Utils.showToast('Informe o nome do projeto.', 'error'); return; }
  const payload = {
    name,
    description: document.getElementById('pf-description').value.trim() || null,
    objetivo: document.getElementById('pf-objetivo').value.trim() || null,
    problema: document.getElementById('pf-problema').value.trim() || null,
    publico_alvo: document.getElementById('pf-publico').value.trim() || null,
    tipo: document.getElementById('pf-tipo').value,
    funcionalidades_previstas: document.getElementById('pf-func').value.trim() || null,
    beneficios_esperados: document.getElementById('pf-benef').value.trim() || null,
    criterios_sucesso: document.getElementById('pf-criterios').value.trim() || null,
    roadmap: buildRoadmap(),
    prioridade: document.getElementById('pf-prio').value,
    status: document.getElementById('pf-status').value,
    data_inicio: document.getElementById('pf-inicio').value || null,
    data_entrega: document.getElementById('pf-entrega').value || null,
    responsavel_id: document.getElementById('pf-resp').value || null,
  };
  const btn = document.getElementById('pf-save');
  btn.disabled = true;
  try {
    if (existing) {
      payload.updated_at = new Date().toISOString();
      const { error } = await db.from('projects').update(payload).eq('id', existing.id);
      if (error) throw error;
      await logEvent(existing.id, 'projeto_editado', 'project', existing.id);
      if (existing.status !== payload.status) {
        await logEvent(existing.id, 'status_alterado', 'project', existing.id, { de: existing.status, para: payload.status });
      }
      Utils.showToast('Projeto atualizado.', 'success');
      closeModal();
      route();
    } else {
      payload.created_by = state.profile.id;
      const { data, error } = await db.from('projects').insert(payload).select('id').single();
      if (error) throw error;
      const pid = data.id;
      const parts = [{ project_id: pid, user_id: state.profile.id, roles: ['Gestor'], is_manager: true }];
      if (payload.responsavel_id && payload.responsavel_id !== state.profile.id) {
        parts.push({ project_id: pid, user_id: payload.responsavel_id, roles: ['Gestor'], is_manager: true });
      }
      await db.from('project_participants').insert(parts);
      await logEvent(pid, 'projeto_criado', 'project', pid, { name });
      if (payload.responsavel_id) {
        await notifyProject(pid, [payload.responsavel_id], `Você é responsável pelo projeto "${name}".`, '📁');
      }
      Utils.showToast('Projeto criado!', 'success');
      closeModal();
      goto(`projeto/${pid}`);
    }
  } catch (err) {
    console.error('[MSY][projetos] Erro ao salvar projeto:', err);
    Utils.showToast('Erro ao salvar projeto. Verifique suas permissões.', 'error');
    btn.disabled = false;
  }
}

/* ============================================================
   PÁGINA DO PROJETO (com sub-abas)
   ============================================================ */
async function renderProject(projectId) {
  const root = content();
  root.innerHTML = loadingHTML();
  try {
    const [{ data: project, error: pErr }, partsRes, catsRes, tasksRes, docsRes] = await Promise.all([
      db.from('projects').select('*, responsavel:responsavel_id(id,name,initials,color,avatar_url), criador:created_by(name)').eq('id', projectId).single(),
      db.from('project_participants').select('*, profile:user_id(id,name,role,initials,color,avatar_url)').eq('project_id', projectId),
      db.from('project_categories').select('*').eq('project_id', projectId).order('order_index'),
      db.from('project_tasks').select('*, assignee:assigned_to(id,name,initials,color,avatar_url)').eq('project_id', projectId).order('created_at'),
      db.from('project_docs').select('*').eq('project_id', projectId),
    ]);
    if (pErr) throw pErr;

    const participants = partsRes.data || [];
    const categories = catsRes.data || [];
    const tasks = tasksRes.data || [];
    const docs = {}; (docsRes.data || []).forEach(d => docs[d.section_key] = d);

    const checklist = {};
    const taskIds = tasks.map(t => t.id);
    if (taskIds.length) {
      const { data: items } = await db.from('task_checklist_items')
        .select('*').in('task_id', taskIds).order('order_index');
      (items || []).forEach(i => { (checklist[i.task_id] ||= []).push(i); });
    }

    const manage = canManage(project, participants);
    const isMember = participants.some(p => p.user_id === state.profile.id);
    const ctx = { project, participants, categories, tasks, docs, checklist, manage, isMember };

    const tabs = [
      { key: 'resumo', label: 'Resumo', icon: 'fa-gauge' },
      { key: 'tarefas', label: 'Tarefas', icon: 'fa-list-check' },
      { key: 'agenda', label: 'Agenda', icon: 'fa-calendar-day' },
      { key: 'participantes', label: 'Participantes', icon: 'fa-users' },
      { key: 'documentacao', label: 'Documentação', icon: 'fa-book' },
      { key: 'historico', label: 'Histórico', icon: 'fa-clock-rotate-left' },
    ];
    const tab = state.currentProjectTab;

    root.innerHTML = `
      <div class="proj-shell">
        <div class="proj-detail-top">
          <button class="btn btn-ghost btn-sm" data-action="go-dashboard"><i class="fa-solid fa-arrow-left"></i> Projetos</button>
          <div class="proj-detail-actions">
            ${!manage && state.isDiretoria ? `<button class="btn btn-ghost btn-sm" data-action="take-over" data-id="${project.id}"><i class="fa-solid fa-shield-halved"></i> Assumir gestão</button>` : ''}
            ${manage ? `
              <button class="btn btn-ghost btn-sm" data-action="edit-project" data-id="${project.id}"><i class="fa-solid fa-pen"></i> Editar</button>
              <button class="btn btn-ghost btn-sm proj-danger" data-action="delete-project" data-id="${project.id}"><i class="fa-solid fa-trash"></i></button>` : ''}
          </div>
        </div>
        <div class="proj-detail-head">
          <div>
            <div class="proj-detail-badges">${projStatusBadge(project.status)} ${prioBadge(project.prioridade)} <span class="proj-chip"><i class="fa-regular fa-flag"></i> ${esc(TIPO_LABELS[project.tipo] || project.tipo)}</span>${manage ? '' : '<span class="proj-chip proj-chip-ro"><i class="fa-solid fa-eye"></i> Somente leitura</span>'}</div>
            <h1 class="proj-h1">${esc(project.name)}</h1>
            ${project.objetivo ? `<p class="proj-sub">${esc(project.objetivo)}</p>` : ''}
          </div>
        </div>
        <div class="proj-tabs">
          ${tabs.map(t => `<button class="proj-tab ${tab === t.key ? 'active' : ''}" data-action="proj-tab" data-tab="${t.key}" data-pid="${project.id}"><i class="fa-solid ${t.icon}"></i> ${t.label}</button>`).join('')}
        </div>
        <div class="proj-tab-body" id="projTabBody">${renderTab(tab, ctx)}</div>
      </div>`;

    if (tab === 'historico') loadHistory(project.id);
  } catch (err) {
    console.error('[MSY][projetos] Erro ao carregar projeto:', err);
    root.innerHTML = emptyHTML('Projeto não encontrado ou sem acesso.', 'fa-lock');
  }
}

function renderTab(tab, ctx) {
  switch (tab) {
    case 'tarefas': return renderTasksTab(ctx);
    case 'agenda': return renderAgendaTab(ctx);
    case 'participantes': return renderParticipantsTab(ctx);
    case 'documentacao': return renderDocsTab(ctx);
    case 'historico': return '<div id="histMount">' + loadingHTML() + '</div>';
    default: return renderResumoTab(ctx);
  }
}

/* ── Resumo ── */
function renderResumoTab(ctx) {
  const { project, participants, tasks, checklist } = ctx;
  const pct = avgProgress(tasks, checklist);
  const done = tasks.filter(t => t.status === 'concluida').length;
  const rm = Array.isArray(project.roadmap) ? project.roadmap : [];
  const field = (label, val) => val ? `<div class="proj-field"><div class="proj-field-l">${esc(label)}</div><div class="proj-field-v">${esc(val)}</div></div>` : '';

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const upcoming = tasks.filter(t => t.prazo && t.status !== 'concluida').sort(cmpDelivery).slice(0, 5);
  const upcomingHTML = upcoming.length
    ? upcoming.map(t => agendaItem(t, project.id, true)).join('')
    : `<div class="proj-empty-sm">Nenhuma entrega prevista.</div>`;

  return `
    <div class="proj-resumo">
      <div class="proj-resumo-main">
        <div class="proj-panel">
          <div class="proj-panel-title"><i class="fa-solid fa-calendar-day"></i> Próximas entregas
            <button class="proj-panel-link" data-action="proj-tab" data-tab="agenda" data-pid="${project.id}">ver agenda <i class="fa-solid fa-arrow-right"></i></button>
          </div>
          <div class="proj-agenda-mini">${upcomingHTML}</div>
        </div>
        <div class="proj-panel">
          <div class="proj-panel-title"><i class="fa-solid fa-circle-info"></i> Visão geral</div>
          ${field('Descrição', project.description)}
          ${field('Problema que resolve', project.problema)}
          ${field('Público-alvo', project.publico_alvo)}
          ${field('Funcionalidades previstas', project.funcionalidades_previstas)}
          ${field('Benefícios esperados', project.beneficios_esperados)}
          ${field('Critérios de sucesso', project.criterios_sucesso)}
        </div>
        ${rm.length ? `<div class="proj-panel">
          <div class="proj-panel-title"><i class="fa-solid fa-road"></i> Roadmap</div>
          ${rm.map(r => `<div class="proj-field"><div class="proj-field-l">${esc(r.versao)}</div><div class="proj-field-v">${esc(r.descricao)}</div></div>`).join('')}
        </div>` : ''}
      </div>
      <div class="proj-resumo-side">
        <div class="proj-panel">
          <div class="proj-panel-title"><i class="fa-solid fa-chart-pie"></i> Progresso geral</div>
          <div class="proj-bigpct">${pct}%</div>
          ${progressBar(pct)}
          <div class="proj-mini-stats">
            <div><b>${done}</b><span>Entregas concluídas</span></div>
            <div><b>${tasks.length}</b><span>Tarefas</span></div>
            <div><b>${participants.length}</b><span>Participantes</span></div>
          </div>
        </div>
        <div class="proj-panel">
          <div class="proj-panel-title"><i class="fa-solid fa-calendar"></i> Datas do projeto</div>
          <div class="proj-field"><div class="proj-field-l">Início</div><div class="proj-field-v">${Utils.formatDate(project.data_inicio)}</div></div>
          <div class="proj-field"><div class="proj-field-l">Entrega prevista</div><div class="proj-field-v">${Utils.formatDate(project.data_entrega)}</div></div>
          ${project.responsavel ? `<div class="proj-field"><div class="proj-field-l">Responsável</div><div class="proj-field-v" style="display:flex;align-items:center;gap:8px">${avatarHTML(project.responsavel, 24)} ${esc(project.responsavel.name)}</div></div>` : ''}
        </div>
      </div>
    </div>`;
}

/* ============================================================
   AGENDA OPERACIONAL
   ============================================================ */
function agendaItem(t, projectId, compact = false) {
  return `<div class="proj-agenda-item ${isOverdue(t) ? 'overdue' : ''}" data-action="proj-tab" data-tab="tarefas" data-pid="${projectId}" role="button" tabindex="0">
    <div class="proj-agenda-time">${t.prazo_hora ? fmtTime(t.prazo_hora) : '<span class="proj-agenda-allday">dia</span>'}</div>
    <div class="proj-agenda-main">
      <div class="proj-agenda-title">${esc(t.title)}</div>
      <div class="proj-agenda-sub">
        ${t.assignee ? `${avatarHTML(t.assignee, 18)} ${esc(t.assignee.name)}` : '<span class="proj-part-norole">Sem responsável</span>'}
      </div>
    </div>
    ${compact ? '' : taskStatusBadge(t.status)}
  </div>`;
}

function renderAgendaTab(ctx) {
  const { project, tasks } = ctx;
  const deliveries = tasks.filter(t => t.prazo).sort(cmpDelivery);
  if (!deliveries.length) return emptyHTML('Nenhuma entrega com prazo definido. Defina prazos nas tarefas para vê-las aqui.', 'fa-calendar-day');

  const byDate = {};
  deliveries.forEach(t => { (byDate[t.prazo] ||= []).push(t); });

  return `<div class="proj-agenda">
    ${Object.keys(byDate).sort().map(date => `
      <div class="proj-agenda-day">
        <div class="proj-agenda-daylabel"><i class="fa-regular fa-calendar"></i> ${esc(agendaDateLabel(date))} <span class="proj-cat-count">${byDate[date].length}</span></div>
        <div class="proj-agenda-list">${byDate[date].map(t => agendaItem(t, project.id)).join('')}</div>
      </div>`).join('')}
  </div>`;
}

/* ============================================================
   TAREFAS — visões + fluxo de trabalho + checklist
   ============================================================ */
function flowButtons(t, manage) {
  const me = state.profile.id;
  const isAssignee = t.assigned_to === me;
  const b = [];
  if (isAssignee && t.status === 'nao_iniciada')
    b.push(`<button class="btn btn-gold btn-sm" data-action="task-start" data-id="${t.id}" data-pid="${t.project_id}"><i class="fa-solid fa-play"></i> Iniciar</button>`);
  if (isAssignee && t.status === 'necessita_ajustes')
    b.push(`<button class="btn btn-gold btn-sm" data-action="task-start" data-id="${t.id}" data-pid="${t.project_id}"><i class="fa-solid fa-rotate-left"></i> Retomar</button>`);
  if (isAssignee && t.status === 'em_andamento')
    b.push(`<button class="btn btn-gold btn-sm" data-action="task-request-review" data-id="${t.id}" data-pid="${t.project_id}"><i class="fa-solid fa-paper-plane"></i> Solicitar Revisão</button>`);
  if (isAssignee && t.status === 'em_revisao' && !manage)
    b.push(`<span class="proj-flow-wait"><i class="fa-solid fa-hourglass-half"></i> Aguardando aprovação do gestor</span>`);
  if (manage && t.status === 'em_revisao') {
    b.push(`<button class="btn btn-gold btn-sm" data-action="task-approve" data-id="${t.id}" data-pid="${t.project_id}"><i class="fa-solid fa-check"></i> ${isAssignee ? 'Autoaprovar' : 'Aprovar'}</button>`);
    if (!isAssignee)
      b.push(`<button class="btn btn-ghost btn-sm" data-action="task-request-changes" data-id="${t.id}" data-pid="${t.project_id}"><i class="fa-solid fa-rotate-left"></i> Solicitar Ajustes</button>`);
  }
  return b.length ? `<div class="proj-flow">${b.join('')}</div>` : '';
}

function taskRow(t, checklist, project, manage) {
  const items = checklist[t.id] || [];
  const pct = taskProgress(t, checklist);
  const isAssignee = t.assigned_to === state.profile.id;
  const canCheck = manage || isAssignee;       // marcar checklist / editar nota
  const canEditMeta = manage;                  // editar/excluir/reatribuir tarefa
  const doneCnt = items.filter(i => i.done).length;
  return `<div class="proj-task ${t.status === 'concluida' ? 'is-done' : ''}" id="task-${t.id}">
    <div class="proj-task-head" data-action="toggle-task" data-id="${t.id}" role="button" tabindex="0">
      <i class="fa-solid fa-chevron-right proj-task-caret"></i>
      <span class="proj-task-title">${esc(t.title)}</span>
      ${taskStatusBadge(t.status)} ${prioBadge(t.prioridade)}
      ${dueChip(t)}
      ${t.assignee ? `<span class="proj-task-assignee" title="${esc(t.assignee.name)}">${avatarHTML(t.assignee, 22)}</span>` : ''}
      <span class="proj-task-pct">${pct}%</span>
    </div>
    <div class="proj-task-body" id="taskbody-${t.id}" hidden>
      ${t.status === 'necessita_ajustes' && t.review_note ? `<div class="proj-review-note"><i class="fa-solid fa-triangle-exclamation"></i> <b>Ajustes solicitados:</b> ${esc(t.review_note)}</div>` : ''}
      ${t.description ? `<div class="proj-task-desc">${esc(t.description)}</div>` : ''}
      ${t.observacoes ? `<div class="proj-task-obs"><b>Observações:</b> ${esc(t.observacoes)}</div>` : ''}

      <div class="proj-task-meta">
        ${t.started_at ? `<span><i class="fa-solid fa-play"></i> Iniciada ${Utils.formatDateTime(t.started_at)}</span>` : ''}
        <span><i class="fa-solid fa-stopwatch"></i> ${fmtDuration(liveSeconds(t))}</span>
        ${t.revisions_count ? `<span><i class="fa-solid fa-rotate"></i> ${t.revisions_count} revisã${t.revisions_count > 1 ? 'ões' : 'o'}</span>` : ''}
        ${t.completed_at ? `<span><i class="fa-solid fa-flag-checkered"></i> Concluída ${Utils.formatDateTime(t.completed_at)}</span>` : ''}
      </div>

      ${flowButtons(t, manage)}

      ${canEditMeta ? `<div class="proj-task-controls">
        <button class="btn btn-ghost btn-sm" data-action="reassign-task" data-id="${t.id}" data-pid="${project.id}"><i class="fa-solid fa-user-pen"></i> Reatribuir</button>
        <button class="btn btn-ghost btn-sm" data-action="edit-task" data-id="${t.id}" data-pid="${project.id}"><i class="fa-solid fa-pen"></i> Editar</button>
        <button class="btn btn-ghost btn-sm proj-danger" data-action="delete-task" data-id="${t.id}" data-pid="${project.id}"><i class="fa-solid fa-trash"></i></button>
      </div>` : ''}

      <div class="proj-checklist">
        <div class="proj-checklist-title">Checklist (${doneCnt}/${items.length})</div>
        ${items.map(i => `<label class="proj-check ${i.done ? 'done' : ''}">
          <input type="checkbox" data-action="toggle-check" data-id="${i.id}" data-task="${t.id}" data-pid="${project.id}" ${i.done ? 'checked' : ''} ${canCheck ? '' : 'disabled'}>
          <span>${esc(i.text)}</span>
          ${canCheck ? `<button class="proj-icon-btn proj-danger proj-check-del" data-action="delete-check" data-id="${i.id}" data-task="${t.id}" data-pid="${project.id}"><i class="fa-solid fa-xmark"></i></button>` : ''}
        </label>`).join('')}
        ${canCheck ? `<div class="proj-check-add">
          <input class="form-input proj-input-sm" id="newcheck-${t.id}" placeholder="Novo item do checklist..." data-action="newcheck-enter" data-task="${t.id}" data-pid="${project.id}">
          <button class="btn btn-ghost btn-sm" data-action="add-check" data-task="${t.id}" data-pid="${project.id}"><i class="fa-solid fa-plus"></i></button>
        </div>` : ''}
      </div>

      ${canCheck ? `<div class="proj-exec">
        <label class="form-label">Observação da execução <span class="proj-optional">(opcional)</span></label>
        <textarea class="form-textarea proj-exec-note" id="exec-${t.id}" rows="4" placeholder="Ex.: Backend concluído, aguardando validação...">${esc(t.exec_note)}</textarea>
        <div class="proj-doc-actions"><button class="btn btn-ghost btn-sm" data-action="save-exec" data-id="${t.id}" data-pid="${project.id}"><i class="fa-solid fa-floppy-disk"></i> Salvar nota</button></div>
      </div>` : (t.exec_note ? `<div class="proj-task-obs"><b>Execução:</b> ${esc(t.exec_note)}</div>` : '')}
    </div>
  </div>`;
}

function renderTasksTab(ctx) {
  const { project, categories, tasks, checklist, manage } = ctx;
  const view = state.currentTasksView;
  const me = state.profile.id;

  const views = [
    { key: 'minhas', label: 'Minhas Tarefas', icon: 'fa-circle-user' },
    { key: 'equipe', label: 'Equipe', icon: 'fa-users' },
    { key: 'revisao', label: 'Em Revisão', icon: 'fa-magnifying-glass' },
    { key: 'concluidas', label: 'Concluídas', icon: 'fa-circle-check' },
  ];
  const counts = {
    minhas: tasks.filter(t => t.assigned_to === me).length,
    equipe: tasks.length,
    revisao: tasks.filter(t => t.status === 'em_revisao').length,
    concluidas: tasks.filter(t => t.status === 'concluida').length,
  };

  const switcher = `<div class="proj-views">
    ${views.map(v => `<button class="filter-btn ${view === v.key ? 'active' : ''}" data-action="tasks-view" data-view="${v.key}" data-pid="${project.id}"><i class="fa-solid ${v.icon}"></i> ${v.label} <span class="proj-view-count">${counts[v.key]}</span></button>`).join('')}
  </div>`;

  const flatList = (list, emptyMsg) => list.length
    ? `<div class="proj-tasklist">${list.map(t => taskRow(t, checklist, project, manage)).join('')}</div>`
    : emptyHTML(emptyMsg, 'fa-list-check');

  let bodyHTML = '';
  if (view === 'minhas') {
    bodyHTML = flatList(tasks.filter(t => t.assigned_to === me).sort(byStatusThenDue), 'Você não tem tarefas atribuídas neste projeto.');
  } else if (view === 'revisao') {
    bodyHTML = flatList(tasks.filter(t => t.status === 'em_revisao').sort(byStatusThenDue), 'Nenhuma tarefa aguardando revisão.');
  } else if (view === 'concluidas') {
    bodyHTML = flatList(tasks.filter(t => t.status === 'concluida'), 'Nenhuma tarefa concluída ainda.');
  } else {
    // equipe — agrupado por categoria
    const tasksByCat = {};
    tasks.forEach(t => { (tasksByCat[t.category_id || 'none'] ||= []).push(t); });
    const catBlock = (cat) => {
      const ct = (tasksByCat[cat ? cat.id : 'none'] || []).sort(byStatusThenDue);
      const pct = avgProgress(ct, checklist);
      const color = cat?.color || 'var(--text-3)';
      return `<div class="proj-cat">
        <div class="proj-cat-head">
          <div class="proj-cat-name"><i class="fa-solid ${esc(cat?.icon || 'fa-inbox')}" style="color:${esc(color)}"></i> ${esc(cat ? cat.name : 'Sem categoria')} <span class="proj-cat-count">${ct.length}</span></div>
          <div class="proj-cat-right">
            <span class="proj-cat-pct">${pct}%</span>
            ${cat && manage ? `<button class="proj-icon-btn" data-action="edit-category" data-id="${cat.id}" data-pid="${project.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
            <button class="proj-icon-btn proj-danger" data-action="delete-category" data-id="${cat.id}" data-pid="${project.id}" title="Excluir"><i class="fa-solid fa-trash"></i></button>` : ''}
            ${manage ? `<button class="btn btn-ghost btn-sm" data-action="add-task" data-pid="${project.id}" data-cat="${cat ? cat.id : ''}"><i class="fa-solid fa-plus"></i> Tarefa</button>` : ''}
          </div>
        </div>
        ${progressBar(pct)}
        <div class="proj-tasklist">
          ${ct.length ? ct.map(t => taskRow(t, checklist, project, manage)).join('') : `<div class="proj-empty-sm">Nenhuma tarefa.</div>`}
        </div>
      </div>`;
    };
    const blocks = categories.map(c => catBlock(c)).join('') + ((tasksByCat['none'] || []).length ? catBlock(null) : '');
    bodyHTML = (categories.length || (tasksByCat['none'] || []).length)
      ? blocks
      : emptyHTML('Crie categorias e tarefas para organizar o trabalho.', 'fa-list-check');
  }

  return `
    <div class="proj-tasks">
      <div class="proj-toolbar">
        ${switcher}
        ${manage ? `<div class="proj-toolbar-actions">
          <button class="btn btn-ghost btn-sm" data-action="add-category" data-pid="${project.id}"><i class="fa-solid fa-folder-plus"></i> Categoria</button>
          <button class="btn btn-gold btn-sm" data-action="add-task" data-pid="${project.id}" data-cat=""><i class="fa-solid fa-plus"></i> Nova tarefa</button>
        </div>` : ''}
      </div>
      ${bodyHTML}
    </div>`;
}

const STATUS_ORDER = { necessita_ajustes: 0, em_andamento: 1, nao_iniciada: 2, em_revisao: 3, bloqueada: 4, concluida: 5 };
function byStatusThenDue(a, b) {
  const sa = STATUS_ORDER[a.status] ?? 9, sb = STATUS_ORDER[b.status] ?? 9;
  if (sa !== sb) return sa - sb;
  if (a.prazo && b.prazo) return cmpDelivery(a, b);
  if (a.prazo) return -1;
  if (b.prazo) return 1;
  return 0;
}

/** Atualiza contagem do checklist e % da tarefa sem recarregar (otimista). */
function updateChecklistUI(taskId) {
  const body = document.getElementById(`taskbody-${taskId}`);
  if (!body) return;
  const boxes = body.querySelectorAll('.proj-check input[type="checkbox"][data-action="toggle-check"]');
  const total = boxes.length;
  const done = [...boxes].filter(b => b.checked).length;
  const titleEl = body.querySelector('.proj-checklist-title');
  if (titleEl) titleEl.textContent = `Checklist (${done}/${total})`;
  const pct = total ? Math.round(done / total * 100) : 0;
  const pctEl = document.querySelector(`#task-${taskId} .proj-task-pct`);
  if (pctEl) pctEl.textContent = `${pct}%`;
}

/* ── Categoria modal ── */
async function openCategoryModal(projectId, existing = null) {
  const e = existing || {};
  const icons = ['fa-folder', 'fa-code', 'fa-server', 'fa-paintbrush', 'fa-database', 'fa-network-wired', 'fa-robot', 'fa-bullhorn', 'fa-file-lines'];
  const colors = ['#c9a84c', '#60a5fa', '#10b981', '#a78bfa', '#f59e0b', '#ef4444', '#38bdf8', '#fb923c'];
  const html = `
    ${modalHeader(existing ? 'Editar Categoria' : 'Nova Categoria')}
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Nome *</label>
        <input class="form-input" id="cat-name" value="${esc(e.name)}" placeholder="Ex.: Front-end"></div>
      <div class="form-group"><label class="form-label">Cor</label>
        <div class="proj-swatches" id="cat-colors">
          ${colors.map(c => `<button type="button" class="proj-swatch ${(e.color || '#c9a84c') === c ? 'active' : ''}" data-color="${c}" style="background:${c}"></button>`).join('')}
        </div></div>
      <div class="form-group"><label class="form-label">Ícone</label>
        <div class="proj-icons" id="cat-icons">
          ${icons.map(i => `<button type="button" class="proj-iconpick ${(e.icon || 'fa-folder') === i ? 'active' : ''}" data-icon="${i}"><i class="fa-solid ${i}"></i></button>`).join('')}
        </div></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-modal-close>Cancelar</button>
      <button class="btn btn-gold" id="cat-save">Salvar</button>
    </div>`;
  openModal(html, { maxWidth: 460 });
  let color = e.color || '#c9a84c', icon = e.icon || 'fa-folder';
  document.getElementById('cat-colors').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-color]'); if (!b) return;
    color = b.dataset.color;
    document.querySelectorAll('#cat-colors .proj-swatch').forEach(s => s.classList.toggle('active', s === b));
  });
  document.getElementById('cat-icons').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-icon]'); if (!b) return;
    icon = b.dataset.icon;
    document.querySelectorAll('#cat-icons .proj-iconpick').forEach(s => s.classList.toggle('active', s === b));
  });
  document.getElementById('cat-save').addEventListener('click', async () => {
    const name = document.getElementById('cat-name').value.trim();
    if (!name) { Utils.showToast('Informe o nome.', 'error'); return; }
    try {
      if (existing) {
        const { error } = await db.from('project_categories').update({ name, color, icon }).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await db.from('project_categories').insert({ project_id: projectId, name, color, icon });
        if (error) throw error;
        await logEvent(projectId, 'categoria_criada', 'category', null, { name });
      }
      Utils.showToast('Categoria salva.', 'success');
      closeModal();
      reloadProjectTab(projectId, 'tarefas');
    } catch (err) {
      console.error('[MSY][projetos] Erro ao salvar categoria:', err);
      Utils.showToast('Erro ao salvar categoria.', 'error');
    }
  });
}

/* ── Tarefa modal (criar/editar) ── */
async function openTaskModal(projectId, categoryId = '', existing = null) {
  const [profs, catsRes] = await Promise.all([
    loadActiveProfiles(),
    db.from('project_categories').select('id,name').eq('project_id', projectId).order('order_index'),
  ]);
  const cats = catsRes.data || [];
  const e = existing || {};
  const selCat = existing ? (e.category_id || '') : categoryId;
  const html = `
    ${modalHeader(existing ? 'Editar Tarefa' : 'Nova Tarefa', 'Defina responsável, prazo e checklist')}
    <div class="modal-body proj-form">
      <div class="form-group"><label class="form-label">Título *</label>
        <input class="form-input" id="tk-title" value="${esc(e.title)}" placeholder="Ex.: Criar tela inicial"></div>
      <div class="form-group"><label class="form-label">Descrição</label>
        <textarea class="form-textarea" id="tk-desc" rows="2">${esc(e.description)}</textarea></div>
      <div class="proj-form-grid">
        <div class="form-group"><label class="form-label">Categoria</label>
          <select class="form-select" id="tk-cat"><option value="">— Sem categoria —</option>
            ${cats.map(c => `<option value="${c.id}" ${selCat === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Responsável</label>
          <select class="form-select" id="tk-resp"><option value="">— Selecionar —</option>
            ${profs.map(p => `<option value="${p.id}" ${e.assigned_to === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
          </select></div>
      </div>
      <div class="proj-form-grid">
        <div class="form-group"><label class="form-label">Prioridade</label>
          <select class="form-select" id="tk-prio">
            ${PRIORIDADES.map(k => `<option value="${k}" ${(e.prioridade || 'media') === k ? 'selected' : ''}>${PRIORIDADE_LABELS[k]}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Prazo</label>
          <input type="date" class="form-input" id="tk-prazo" value="${esc(e.prazo)}"></div>
      </div>
      <div class="proj-form-grid">
        <div class="form-group"><label class="form-label">Horário da entrega <span class="proj-optional">(opcional)</span></label>
          <input type="time" class="form-input" id="tk-hora" value="${esc(fmtTime(e.prazo_hora))}"></div>
        <div></div>
      </div>
      ${existing ? '' : `<div class="form-group"><label class="form-label">Checklist <span class="proj-optional">(opcional)</span></label>
        <div class="proj-checkbuilder" id="tk-checks"></div>
        <div class="proj-check-add">
          <input class="form-input proj-input-sm" id="tk-newcheck" placeholder="Adicionar item e Enter...">
          <button type="button" class="btn btn-ghost btn-sm" id="tk-addcheck"><i class="fa-solid fa-plus"></i></button>
        </div></div>`}
      <div class="form-group"><label class="form-label">Observações <span class="proj-optional">(opcional)</span></label>
        <textarea class="form-textarea" id="tk-obs" rows="2">${esc(e.observacoes)}</textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-modal-close>Cancelar</button>
      <button class="btn btn-gold" id="tk-save">Salvar</button>
    </div>`;
  openModal(html, { maxWidth: 600 });

  // Construtor de checklist (somente em nova tarefa)
  const checkItems = [];
  if (!existing) {
    const wrap = document.getElementById('tk-checks');
    const renderChecks = () => {
      wrap.innerHTML = checkItems.map((c, idx) => `<div class="proj-checkbuilder-item"><i class="fa-regular fa-square"></i><span>${esc(c)}</span><button type="button" class="proj-icon-btn proj-danger" data-rm="${idx}"><i class="fa-solid fa-xmark"></i></button></div>`).join('');
    };
    const addCheck = () => {
      const inp = document.getElementById('tk-newcheck');
      const v = inp.value.trim();
      if (!v) return;
      checkItems.push(v); inp.value = ''; renderChecks(); inp.focus();
    };
    document.getElementById('tk-addcheck').addEventListener('click', addCheck);
    document.getElementById('tk-newcheck').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addCheck(); } });
    wrap.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-rm]'); if (!b) return;
      checkItems.splice(Number(b.dataset.rm), 1); renderChecks();
    });
  }

  document.getElementById('tk-save').addEventListener('click', async () => {
    const title = document.getElementById('tk-title').value.trim();
    if (!title) { Utils.showToast('Informe o título.', 'error'); return; }
    const payload = {
      title,
      description: document.getElementById('tk-desc').value.trim() || null,
      category_id: document.getElementById('tk-cat').value || null,
      assigned_to: document.getElementById('tk-resp').value || null,
      prioridade: document.getElementById('tk-prio').value,
      prazo: document.getElementById('tk-prazo').value || null,
      prazo_hora: document.getElementById('tk-hora').value || null,
      observacoes: document.getElementById('tk-obs').value.trim() || null,
    };
    try {
      if (existing) {
        payload.updated_at = new Date().toISOString();
        const { error } = await db.from('project_tasks').update(payload).eq('id', existing.id);
        if (error) throw error;
        await logEvent(projectId, 'tarefa_editada', 'task', existing.id, { title });
        if (payload.assigned_to && payload.assigned_to !== existing.assigned_to) {
          await notifyProject(projectId, [payload.assigned_to], `Tarefa atribuída a você: "${title}".`, '📝');
        }
      } else {
        payload.project_id = projectId;
        payload.created_by = state.profile.id;
        const { data, error } = await db.from('project_tasks').insert(payload).select('id').single();
        if (error) throw error;
        if (checkItems.length) {
          await db.from('task_checklist_items').insert(checkItems.map((text, idx) => ({ task_id: data.id, text, order_index: idx })));
        }
        await logEvent(projectId, 'tarefa_criada', 'task', data.id, { title });
        if (payload.assigned_to) {
          await notifyProject(projectId, [payload.assigned_to], `Nova tarefa atribuída a você: "${title}".`, '📝');
        }
      }
      Utils.showToast('Tarefa salva.', 'success');
      closeModal();
      reloadProjectTab(projectId, 'tarefas');
    } catch (err) {
      console.error('[MSY][projetos] Erro ao salvar tarefa:', err);
      Utils.showToast('Erro ao salvar tarefa.', 'error');
    }
  });
}

/* ── Reatribuir tarefa ── */
async function openReassignModal(projectId, taskId) {
  const { data: parts } = await db.from('project_participants')
    .select('user_id, profile:user_id(name,role)').eq('project_id', projectId);
  const { data: task } = await db.from('project_tasks').select('title,assigned_to').eq('id', taskId).single();
  const html = `
    ${modalHeader('Reatribuir Tarefa', task?.title || '')}
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Novo responsável</label>
        <select class="form-select" id="ra-user">
          <option value="">— Sem responsável —</option>
          ${(parts || []).map(p => `<option value="${p.user_id}" ${task?.assigned_to === p.user_id ? 'selected' : ''}>${esc(p.profile?.name || '—')} ${p.profile?.role ? '— ' + esc(p.profile.role) : ''}</option>`).join('')}
        </select></div>
      <p class="proj-hint">Apenas participantes do projeto aparecem aqui.</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-modal-close>Cancelar</button>
      <button class="btn btn-gold" id="ra-save">Salvar</button>
    </div>`;
  openModal(html, { maxWidth: 460 });
  document.getElementById('ra-save').addEventListener('click', async () => {
    const uid = document.getElementById('ra-user').value || null;
    try {
      const { error } = await db.from('project_tasks').update({ assigned_to: uid, updated_at: new Date().toISOString() }).eq('id', taskId);
      if (error) throw error;
      await logEvent(projectId, 'tarefa_reatribuida', 'task', taskId, { title: task?.title });
      if (uid && uid !== state.profile.id) await notifyProject(projectId, [uid], `Tarefa atribuída a você: "${task?.title}".`, '📝');
      Utils.showToast('Tarefa reatribuída.', 'success');
      closeModal();
      reloadProjectTab(projectId, 'tarefas');
    } catch (err) {
      console.error('[MSY][projetos] Erro ao reatribuir:', err);
      Utils.showToast('Erro ao reatribuir tarefa.', 'error');
    }
  });
}

/* ── Solicitar ajustes (com nota) ── */
function openChangesModal(projectId, taskId) {
  const html = `
    ${modalHeader('Solicitar Ajustes')}
    <div class="modal-body">
      <div class="form-group"><label class="form-label">O que precisa ser ajustado?</label>
        <textarea class="form-textarea" id="ch-note" rows="3" placeholder="Descreva os ajustes necessários..."></textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-modal-close>Cancelar</button>
      <button class="btn btn-gold" id="ch-save"><i class="fa-solid fa-rotate-left"></i> Solicitar ajustes</button>
    </div>`;
  openModal(html, { maxWidth: 480 });
  document.getElementById('ch-save').addEventListener('click', async () => {
    const note = document.getElementById('ch-note').value.trim();
    try {
      const { data: t } = await db.from('project_tasks').select('title,assigned_to').eq('id', taskId).single();
      const { error } = await db.rpc('task_request_changes', { p_task_id: taskId, p_note: note || null });
      if (error) throw error;
      if (t?.assigned_to) await notifyProject(projectId, [t.assigned_to], `Ajustes solicitados: "${t.title}".${note ? ' ' + note : ''}`, '🔧');
      Utils.showToast('Ajustes solicitados.', 'success');
      closeModal();
      reloadProjectTab(projectId, 'tarefas');
    } catch (err) {
      console.error('[MSY][projetos] Erro ao solicitar ajustes:', err);
      Utils.showToast(err.message || 'Erro ao solicitar ajustes.', 'error');
    }
  });
}

/* ============================================================
   PARTICIPANTES (governança)
   ============================================================ */
function renderParticipantsTab(ctx) {
  const { project, participants, tasks, checklist, manage } = ctx;
  const rows = participants.map(pp => {
    const myTasks = tasks.filter(t => t.assigned_to === pp.user_id);
    const pct = avgProgress(myTasks, checklist);
    const done = myTasks.filter(t => t.status === 'concluida').length;
    const isCreator = project.created_by === pp.user_id;
    return `<div class="proj-part">
      <div class="proj-part-id">
        ${avatarHTML(pp.profile, 40)}
        <div>
          <div class="proj-part-name">${esc(pp.profile?.name || '—')} ${pp.is_manager ? '<span class="proj-tag-mgr">Gestor</span>' : ''} ${isCreator ? '<span class="proj-tag-creator">Criador</span>' : ''}</div>
          <div class="proj-part-role">${esc(pp.profile?.role || '')}</div>
          <div class="proj-part-tags">${(pp.roles || []).map(r => `<span class="proj-roletag">${esc(r)}</span>`).join('') || '<span class="proj-part-norole">Sem papel definido</span>'}</div>
        </div>
      </div>
      <div class="proj-part-prog">
        ${progressBar(pct)}
        <div class="proj-part-prog-meta">${pct}% · ${done}/${myTasks.length} tarefas</div>
      </div>
      ${manage ? `<div class="proj-part-actions">
        <button class="proj-icon-btn" data-action="toggle-manager" data-id="${pp.id}" data-uid="${pp.user_id}" data-mgr="${pp.is_manager ? 1 : 0}" data-pid="${project.id}" title="${pp.is_manager ? 'Remover gestão' : 'Tornar gestor'}"><i class="fa-solid ${pp.is_manager ? 'fa-user-minus' : 'fa-user-shield'}"></i></button>
        <button class="proj-icon-btn" data-action="edit-roles" data-id="${pp.id}" data-pid="${project.id}" title="Editar papéis"><i class="fa-solid fa-tags"></i></button>
        ${isCreator ? '' : `<button class="proj-icon-btn proj-danger" data-action="remove-participant" data-id="${pp.id}" data-uid="${pp.user_id}" data-pid="${project.id}" title="Remover"><i class="fa-solid fa-user-xmark"></i></button>`}
      </div>` : ''}
    </div>`;
  }).join('');

  return `
    <div class="proj-parts">
      <div class="proj-toolbar">
        <span class="proj-section-title" style="margin:0">Participantes (${participants.length})</span>
        ${manage ? `<button class="btn btn-gold btn-sm" data-action="add-participant" data-pid="${project.id}"><i class="fa-solid fa-user-plus"></i> Adicionar</button>` : ''}
      </div>
      ${participants.length ? rows : emptyHTML('Nenhum participante ainda.', 'fa-users')}
    </div>`;
}

function rolePickerHTML(selected = []) {
  const sel = new Set(selected);
  return `<div class="proj-roles-pick" id="rp-roles">
    ${allRoles().map(r => `<button type="button" class="proj-rolepick ${sel.has(r) ? 'active' : ''}" data-role="${esc(r)}">${esc(r)}</button>`).join('')}
  </div>
  <div class="form-group proj-newrole">
    <input class="form-input proj-input-sm" id="rp-newrole" placeholder="Criar papel personalizado...">
    <button type="button" class="btn btn-ghost btn-sm" id="rp-addrole"><i class="fa-solid fa-plus"></i></button>
  </div>`;
}
function bindRolePicker(initial = []) {
  const picked = new Set(initial);
  const wrap = document.getElementById('rp-roles');
  wrap.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-role]'); if (!b) return;
    const r = b.dataset.role;
    if (picked.has(r)) { picked.delete(r); b.classList.remove('active'); }
    else { picked.add(r); b.classList.add('active'); }
  });
  document.getElementById('rp-addrole').addEventListener('click', async () => {
    const input = document.getElementById('rp-newrole');
    const name = input.value.trim();
    if (!name) return;
    try { await db.from('project_role_options').insert({ name, created_by: state.profile.id }); } catch { /* UNIQUE */ }
    if (!state.roleOptions.includes(name)) state.roleOptions.push(name);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'proj-rolepick active'; b.dataset.role = name; b.textContent = name;
    wrap.appendChild(b); picked.add(name); input.value = '';
  });
  return picked;
}

async function openParticipantModal(projectId) {
  const [profs, existingRes] = await Promise.all([
    loadActiveProfiles(),
    db.from('project_participants').select('user_id').eq('project_id', projectId),
  ]);
  const existingIds = new Set((existingRes.data || []).map(p => p.user_id));
  const available = profs.filter(p => !existingIds.has(p.id));
  const html = `
    ${modalHeader('Adicionar Participante')}
    <div class="modal-body proj-form">
      <div class="form-group"><label class="form-label">Membro *</label>
        <select class="form-select" id="pp-user">
          <option value="">— Selecionar —</option>
          ${available.map(p => `<option value="${p.id}">${esc(p.name)} — ${esc(p.role || '')}</option>`).join('')}
        </select></div>
      <div class="form-group"><label class="form-label">Papéis no projeto</label>${rolePickerHTML()}</div>
      <label class="proj-check" style="margin-top:6px">
        <input type="checkbox" id="pp-mgr"><span>É gestor do projeto (pode gerenciar tarefas e participantes)</span>
      </label>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-modal-close>Cancelar</button>
      <button class="btn btn-gold" id="pp-save">Adicionar</button>
    </div>`;
  openModal(html, { maxWidth: 520 });
  const picked = bindRolePicker([]);
  document.getElementById('pp-save').addEventListener('click', async () => {
    const uid = document.getElementById('pp-user').value;
    if (!uid) { Utils.showToast('Selecione um membro.', 'error'); return; }
    try {
      const { error } = await db.from('project_participants').insert({
        project_id: projectId, user_id: uid,
        roles: Array.from(picked), is_manager: document.getElementById('pp-mgr').checked,
      });
      if (error) throw error;
      await logEvent(projectId, 'participante_adicionado', 'participant', null, { user_id: uid });
      await notifyProject(projectId, [uid], `Você foi adicionado a um projeto.`, '👥');
      Utils.showToast('Participante adicionado.', 'success');
      closeModal();
      reloadProjectTab(projectId, 'participantes');
    } catch (err) {
      console.error('[MSY][projetos] Erro ao adicionar participante:', err);
      Utils.showToast('Erro ao adicionar participante.', 'error');
    }
  });
}

async function openRolesModal(projectId, participantId) {
  const { data: pp } = await db.from('project_participants').select('roles, profile:user_id(name)').eq('id', participantId).single();
  const current = pp?.roles || [];
  const html = `
    ${modalHeader('Editar Papéis', pp?.profile?.name || '')}
    <div class="modal-body proj-form">
      <div class="form-group"><label class="form-label">Papéis no projeto</label>${rolePickerHTML(current)}</div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-modal-close>Cancelar</button>
      <button class="btn btn-gold" id="rp-save">Salvar</button>
    </div>`;
  openModal(html, { maxWidth: 480 });
  const picked = bindRolePicker(current);
  document.getElementById('rp-save').addEventListener('click', async () => {
    try {
      const { error } = await db.from('project_participants').update({ roles: Array.from(picked) }).eq('id', participantId);
      if (error) throw error;
      Utils.showToast('Papéis atualizados.', 'success');
      closeModal();
      reloadProjectTab(projectId, 'participantes');
    } catch (err) {
      console.error('[MSY][projetos] Erro ao salvar papéis:', err);
      Utils.showToast('Erro ao salvar papéis.', 'error');
    }
  });
}

/* ============================================================
   DOCUMENTAÇÃO (wiki)
   ============================================================ */
function renderDocsTab(ctx) {
  const { project, docs, manage } = ctx;
  return `<div class="proj-docs">
    <div class="proj-section-title" style="margin-top:0">Centro de Documentação</div>
    ${DOC_SECTIONS.map(sec => {
      const d = docs[sec.key];
      const contentVal = d?.content || '';
      return `<div class="proj-doc">
        <div class="proj-doc-head"><i class="fa-solid ${sec.icon}"></i> ${esc(sec.label)}
          ${d?.updated_at ? `<span class="proj-doc-meta">atualizado ${Utils.formatDate(d.updated_at)}</span>` : ''}
        </div>
        ${manage
          ? `<textarea class="form-textarea proj-doc-edit" id="doc-${sec.key}" rows="4" placeholder="Escreva aqui...">${esc(contentVal)}</textarea>
             <div class="proj-doc-actions"><button class="btn btn-ghost btn-sm" data-action="save-doc" data-section="${sec.key}" data-pid="${project.id}"><i class="fa-solid fa-floppy-disk"></i> Salvar</button></div>`
          : `<div class="proj-doc-view">${contentVal ? esc(contentVal).replace(/\n/g, '<br>') : '<span class="proj-part-norole">Sem conteúdo.</span>'}</div>`
        }
      </div>`;
    }).join('')}
  </div>`;
}

async function saveDoc(projectId, sectionKey) {
  const ta = document.getElementById(`doc-${sectionKey}`);
  if (!ta) return;
  const contentVal = ta.value.trim();
  try {
    const { error } = await db.from('project_docs').upsert({
      project_id: projectId, section_key: sectionKey, content: contentVal,
      updated_by: state.profile.id, updated_at: new Date().toISOString(),
    }, { onConflict: 'project_id,section_key' });
    if (error) throw error;
    await logEvent(projectId, 'doc_atualizada', 'doc', null, { section: sectionKey });
    Utils.showToast('Documentação salva.', 'success');
  } catch (err) {
    console.error('[MSY][projetos] Erro ao salvar documentação:', err);
    Utils.showToast('Erro ao salvar documentação.', 'error');
  }
}

/* ============================================================
   HISTÓRICO (timeline)
   ============================================================ */
async function loadHistory(projectId) {
  const mount = document.getElementById('histMount');
  if (!mount) return;
  try {
    const { data, error } = await db.from('project_history')
      .select('*, actor:actor_id(name,initials,color,avatar_url)')
      .eq('project_id', projectId).order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    const events = data || [];
    if (!events.length) { mount.innerHTML = emptyHTML('Sem eventos registrados.', 'fa-clock-rotate-left'); return; }
    mount.innerHTML = `<div class="proj-timeline">
      ${events.map(ev => {
        const meta = HISTORY_META[ev.action] || { icon: 'fa-circle', label: ev.action };
        const detail = ev.metadata?.name || ev.metadata?.title ||
          (ev.metadata?.de ? `${PROJ_STATUS_LABELS[ev.metadata.de] || ev.metadata.de} → ${PROJ_STATUS_LABELS[ev.metadata.para] || ev.metadata.para}` : '');
        return `<div class="proj-tl-item">
          <div class="proj-tl-ico"><i class="fa-solid ${meta.icon}"></i></div>
          <div class="proj-tl-body">
            <div class="proj-tl-main">${esc(meta.label)}${detail ? `: <b>${esc(detail)}</b>` : ''}</div>
            <div class="proj-tl-meta">${esc(ev.actor?.name || 'Sistema')} · ${Utils.formatDateTime(ev.created_at)}</div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
  } catch (err) {
    console.error('[MSY][projetos] Erro ao carregar histórico:', err);
    mount.innerHTML = emptyHTML('Erro ao carregar histórico.', 'fa-triangle-exclamation');
  }
}

/* ============================================================
   MINHAS TAREFAS (global, todos os projetos)
   ============================================================ */
async function renderMyTasks() {
  const root = content();
  root.innerHTML = loadingHTML();
  try {
    const { data, error } = await db.from('project_tasks')
      .select('*, project:project_id(id,name)')
      .eq('assigned_to', state.profile.id).order('prazo', { ascending: true, nullsFirst: false });
    if (error) throw error;
    const tasks = data || [];

    const checklist = {};
    const ids = tasks.map(t => t.id);
    if (ids.length) {
      const { data: items } = await db.from('task_checklist_items').select('task_id,done').in('task_id', ids);
      (items || []).forEach(i => { (checklist[i.task_id] ||= []).push(i); });
    }

    const pendentes = tasks.filter(t => t.status !== 'concluida' && !isOverdue(t));
    const atrasadas = tasks.filter(isOverdue);
    const concluidas = tasks.filter(t => t.status === 'concluida');
    const proximos = pendentes.filter(t => {
      if (!t.prazo) return false;
      const d = new Date(t.prazo + 'T23:59:59'); const now = new Date();
      const diff = (d - now) / 86400000;
      return diff >= 0 && diff <= 7;
    });

    const card = (t) => {
      const pct = taskProgress(t, checklist);
      return `<div class="proj-mt-card" data-action="open-project" data-id="${t.project_id}" role="button" tabindex="0">
        <div class="proj-mt-top">${taskStatusBadge(t.status)} ${prioBadge(t.prioridade)} ${dueChip(t)}</div>
        <div class="proj-mt-title">${esc(t.title)}</div>
        <div class="proj-mt-proj"><i class="fa-solid fa-diagram-project"></i> ${esc(t.project?.name || '—')}</div>
        ${progressBar(pct)}
      </div>`;
    };
    const group = (title, list, icon, cls = '') => `
      <div class="proj-mt-group">
        <div class="proj-mt-group-title ${cls}"><i class="fa-solid ${icon}"></i> ${esc(title)} <span class="proj-cat-count">${list.length}</span></div>
        ${list.length ? `<div class="proj-mt-grid">${list.map(card).join('')}</div>` : `<div class="proj-empty-sm">Nada por aqui.</div>`}
      </div>`;

    root.innerHTML = `
      <div class="proj-shell">
        <div class="proj-detail-top">
          <button class="btn btn-ghost btn-sm" data-action="go-dashboard"><i class="fa-solid fa-arrow-left"></i> Projetos</button>
        </div>
        <h1 class="proj-h1">Minhas Tarefas</h1>
        <p class="proj-sub">Suas tarefas em todos os projetos que você participa.</p>
        <div class="stats-grid proj-stats">
          ${statCard('fa-list-check', pendentes.length, 'Pendentes', 'gold-accent')}
          ${statCard('fa-triangle-exclamation', atrasadas.length, 'Atrasadas', 'red-accent')}
          ${statCard('fa-hourglass-half', proximos.length, 'Próx. 7 dias', 'blue-accent')}
          ${statCard('fa-circle-check', concluidas.length, 'Concluídas', 'green-accent')}
        </div>
        ${atrasadas.length ? group('Atrasadas', atrasadas, 'fa-triangle-exclamation', 'overdue') : ''}
        ${group('Próximos prazos', proximos, 'fa-hourglass-half')}
        ${group('Pendentes', pendentes, 'fa-list-check')}
        ${group('Concluídas', concluidas, 'fa-circle-check')}
      </div>`;
  } catch (err) {
    console.error('[MSY][projetos] Erro ao carregar minhas tarefas:', err);
    root.innerHTML = emptyHTML('Erro ao carregar suas tarefas.', 'fa-triangle-exclamation');
  }
}

/* ============================================================
   RELOAD parcial de uma aba do projeto
   ============================================================ */
function reloadProjectTab(projectId, tab) {
  state.currentProjectTab = tab || state.currentProjectTab;
  if (location.hash.startsWith(`#projeto/${projectId}`)) {
    renderProject(projectId);
  } else {
    goto(`projeto/${projectId}/${state.currentProjectTab}`);
  }
}

/* ── RPC de fluxo + notificações ── */
async function runFlow(rpc, taskId, pid, { okMsg, notify } = {}) {
  try {
    const { error } = await db.rpc(rpc, { p_task_id: taskId });
    if (error) throw error;
    if (notify) await notify();
    if (okMsg) Utils.showToast(okMsg, 'success');
    reloadProjectTab(pid, 'tarefas');
  } catch (err) {
    console.error('[MSY][projetos] Erro no fluxo de tarefa:', err);
    Utils.showToast(err.message || 'Erro ao executar a ação.', 'error');
  }
}

/* ============================================================
   EVENTOS DELEGADOS
   ============================================================ */
async function onClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  const id = el.dataset.id;
  const pid = el.dataset.pid;

  switch (action) {
    case 'new-project': openProjectModal(); break;
    case 'go-dashboard': goto('dashboard'); break;
    case 'go-mytasks': goto('minhas-tarefas'); break;
    case 'open-project': goto(`projeto/${id}`); break;

    case 'proj-tab':
      state.currentProjectTab = el.dataset.tab;
      goto(`projeto/${pid}/${el.dataset.tab}`);
      break;

    case 'tasks-view':
      state.currentTasksView = el.dataset.view;
      reloadProjectTab(pid, 'tarefas');
      break;

    case 'edit-project': {
      const { data } = await db.from('projects').select('*').eq('id', id).single();
      if (data) openProjectModal(data);
      break;
    }
    case 'delete-project': {
      const ok = await window.MSYConfirm.show('Excluir este projeto e todos os seus dados? Esta ação não pode ser desfeita.', { confirmText: 'Excluir', type: 'danger' });
      if (!ok) return;
      try {
        const { error } = await db.from('projects').delete().eq('id', id);
        if (error) throw error;
        Utils.showToast('Projeto excluído.', 'success');
        goto('dashboard');
      } catch (err) {
        console.error('[MSY][projetos] Erro ao excluir projeto:', err);
        Utils.showToast('Erro ao excluir projeto.', 'error');
      }
      break;
    }

    case 'take-over': {
      const ok = await window.MSYConfirm.show('Assumir a gestão deste projeto? Você entrará como gestor.', { confirmText: 'Assumir', type: 'info' });
      if (!ok) return;
      try {
        const { error } = await db.from('project_participants').insert({
          project_id: id, user_id: state.profile.id, roles: ['Gestor'], is_manager: true,
        });
        if (error) throw error;
        await logEvent(id, 'participante_gestao', 'participant', null, { user_id: state.profile.id, assumiu: true });
        Utils.showToast('Você agora gerencia este projeto.', 'success');
        reloadProjectTab(id, state.currentProjectTab);
      } catch (err) {
        console.error('[MSY][projetos] Erro ao assumir gestão:', err);
        Utils.showToast('Erro ao assumir gestão.', 'error');
      }
      break;
    }

    case 'add-category': openCategoryModal(pid); break;
    case 'edit-category': {
      const { data } = await db.from('project_categories').select('*').eq('id', id).single();
      if (data) openCategoryModal(pid, data);
      break;
    }
    case 'delete-category': {
      const ok = await window.MSYConfirm.show('Excluir esta categoria? As tarefas ficarão sem categoria.', { confirmText: 'Excluir', type: 'danger' });
      if (!ok) return;
      try {
        const { error } = await db.from('project_categories').delete().eq('id', id);
        if (error) throw error;
        await logEvent(pid, 'categoria_removida', 'category', id);
        Utils.showToast('Categoria excluída.', 'success');
        reloadProjectTab(pid, 'tarefas');
      } catch (err) {
        console.error('[MSY][projetos] Erro ao excluir categoria:', err);
        Utils.showToast('Erro ao excluir categoria.', 'error');
      }
      break;
    }

    case 'add-task': openTaskModal(pid, el.dataset.cat || ''); break;
    case 'edit-task': {
      const { data } = await db.from('project_tasks').select('*').eq('id', id).single();
      if (data) openTaskModal(pid, '', data);
      break;
    }
    case 'reassign-task': openReassignModal(pid, id); break;
    case 'delete-task': {
      const ok = await window.MSYConfirm.show('Excluir esta tarefa?', { confirmText: 'Excluir', type: 'danger' });
      if (!ok) return;
      try {
        const { error } = await db.from('project_tasks').delete().eq('id', id);
        if (error) throw error;
        await logEvent(pid, 'tarefa_removida', 'task', id);
        Utils.showToast('Tarefa excluída.', 'success');
        reloadProjectTab(pid, 'tarefas');
      } catch (err) {
        console.error('[MSY][projetos] Erro ao excluir tarefa:', err);
        Utils.showToast('Erro ao excluir tarefa.', 'error');
      }
      break;
    }

    // ── Fluxo de trabalho ──
    case 'task-start':
      runFlow('task_start', id, pid, { okMsg: 'Tarefa iniciada.' });
      break;
    case 'task-request-review':
      runFlow('task_request_review', id, pid, {
        okMsg: 'Revisão solicitada.',
        notify: async () => {
          const { data: t } = await db.from('project_tasks').select('title').eq('id', id).single();
          const mgrs = await projectManagerIds(pid);
          await notifyProject(pid, mgrs, `Revisão solicitada: "${t?.title}".`, '🔍');
        },
      });
      break;
    case 'task-approve':
      runFlow('task_approve', id, pid, {
        okMsg: 'Tarefa aprovada.',
        notify: async () => {
          const { data: t } = await db.from('project_tasks').select('title,assigned_to').eq('id', id).single();
          if (t?.assigned_to) await notifyProject(pid, [t.assigned_to], `Sua tarefa foi aprovada: "${t.title}".`, '✅');
        },
      });
      break;
    case 'task-request-changes': openChangesModal(pid, id); break;

    case 'toggle-task': {
      const body = document.getElementById(`taskbody-${id}`);
      if (body) { body.hidden = !body.hidden; el.querySelector('.proj-task-caret')?.classList.toggle('open', !body.hidden); }
      break;
    }

    case 'add-check': {
      const input = document.getElementById(`newcheck-${el.dataset.task}`);
      const text = input?.value.trim();
      if (!text) return;
      try {
        const { error } = await db.from('task_checklist_items').insert({ task_id: el.dataset.task, text });
        if (error) throw error;
        reloadProjectTab(pid, 'tarefas');
      } catch (err) {
        console.error('[MSY][projetos] Erro ao adicionar item:', err);
        Utils.showToast('Erro ao adicionar item.', 'error');
      }
      break;
    }
    case 'delete-check': {
      try {
        const { error } = await db.from('task_checklist_items').delete().eq('id', id);
        if (error) throw error;
        reloadProjectTab(pid, 'tarefas');
      } catch (err) {
        console.error('[MSY][projetos] Erro ao excluir item:', err);
      }
      break;
    }

    case 'save-exec': {
      const ta = document.getElementById(`exec-${id}`);
      if (!ta) return;
      try {
        const { error } = await db.from('project_tasks').update({ exec_note: ta.value.trim() || null, updated_at: new Date().toISOString() }).eq('id', id);
        if (error) throw error;
        Utils.showToast('Observação salva.', 'success');
      } catch (err) {
        console.error('[MSY][projetos] Erro ao salvar observação:', err);
        Utils.showToast('Erro ao salvar observação.', 'error');
      }
      break;
    }

    case 'add-participant': openParticipantModal(pid); break;
    case 'edit-roles': openRolesModal(pid, id); break;
    case 'toggle-manager': {
      const newVal = el.dataset.mgr !== '1';
      try {
        const { error } = await db.from('project_participants').update({ is_manager: newVal }).eq('id', id);
        if (error) throw error;
        await logEvent(pid, 'participante_gestao', 'participant', null, { user_id: el.dataset.uid, is_manager: newVal });
        Utils.showToast(newVal ? 'Participante promovido a gestor.' : 'Gestão removida.', 'success');
        reloadProjectTab(pid, 'participantes');
      } catch (err) {
        console.error('[MSY][projetos] Erro ao alterar gestão:', err);
        Utils.showToast('Erro ao alterar gestão.', 'error');
      }
      break;
    }
    case 'remove-participant': {
      const ok = await window.MSYConfirm.show('Remover este participante do projeto?', { confirmText: 'Remover', type: 'danger' });
      if (!ok) return;
      try {
        const { error } = await db.from('project_participants').delete().eq('id', id);
        if (error) throw error;
        await logEvent(pid, 'participante_removido', 'participant', null, { user_id: el.dataset.uid });
        Utils.showToast('Participante removido.', 'success');
        reloadProjectTab(pid, 'participantes');
      } catch (err) {
        console.error('[MSY][projetos] Erro ao remover participante:', err);
        Utils.showToast('Erro ao remover participante.', 'error');
      }
      break;
    }

    case 'save-doc': saveDoc(pid, el.dataset.section); break;
  }
}

function onKeydown(e) {
  if (e.key !== 'Enter') return;
  const el = e.target.closest('[data-action="newcheck-enter"]');
  if (!el) return;
  e.preventDefault();
  const text = el.value.trim();
  if (!text) return;
  const taskId = el.dataset.task, pid = el.dataset.pid;
  db.from('task_checklist_items').insert({ task_id: taskId, text })
    .then(({ error }) => {
      if (error) throw error;
      reloadProjectTab(pid, 'tarefas');
    })
    .catch(err => {
      console.error('[MSY][projetos] Erro ao adicionar item:', err);
      Utils.showToast('Erro ao adicionar item.', 'error');
    });
}

async function onChange(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  if (el.dataset.action !== 'toggle-check') return;

  const checkId = el.dataset.id;
  const taskId = el.dataset.task;
  const checked = el.checked;
  el.closest('.proj-check')?.classList.toggle('done', checked);
  try {
    const { error } = await db.from('task_checklist_items').update({ done: checked }).eq('id', checkId);
    if (error) throw error;
    updateChecklistUI(taskId);  // otimista, sem recarregar a aba
  } catch (err) {
    console.error('[MSY][projetos] Erro ao atualizar item:', err);
    Utils.showToast('Erro ao atualizar checklist.', 'error');
    el.checked = !checked;
    el.closest('.proj-check')?.classList.toggle('done', !checked);
  }
}

initProjetos().catch((err) => {
  console.error('[MSY][projetos] Erro ao inicializar:', err);
  Utils.showToast?.('Erro ao carregar Gestão de Projetos.', 'error');
});
