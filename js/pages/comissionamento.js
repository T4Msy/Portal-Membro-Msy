import { calculateCommission, parseDecimal, money, SOURCES, STATUS } from '../lib/commission-calculator.mjs';
import { commissionService } from '../lib/commission-service.mjs';

const { db, Utils, ViewMode, renderSidebar, renderTopBar } = window.MSY;
const api = commissionService(db);
const esc = value => Utils.escapeHtml(String(value ?? ''));
const root = document.getElementById('pageContent');
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const decimal = cents => (cents / 100).toFixed(2).replace('.', ',');
const DEFAULT_ROLES = ['Squad Leader', 'Tech Lead', 'Full Stack', 'Arquitetura', 'Desenvolvimento', 'Frontend', 'Backend', 'QA', 'UI', 'UX', 'Gestão de Projetos', 'Outro'];
const MEMBER_PRESETS = {
  tales: { roles: ['Squad Leader'], weight_bp: 3500 },
  xitter: { roles: ['Arquiteto'], weight_bp: 3000 },
  pepeu: { roles: ['QA (Quality Assurance)'], weight_bp: 2000 },
  joao: { roles: ['Gestor de Projetos'], weight_bp: 1500 },
  'joão': { roles: ['Gestor de Projetos'], weight_bp: 1500 },
};
const ACTIONS = { create: 'Criou o cálculo', save: 'Salvou alterações e recalculou a distribuição', review: 'Enviou para análise', approve: 'Aprovou a distribuição e definiu as participações', settle: 'Registrou quitação integral do cliente', pay: 'Registrou pagamento', cancel: 'Cancelou o cálculo' };
let profile, permissions = {}, workspace = { projects: [], payments: [], profiles: [], linked_projects: [], role_options: [], history: [] };
let current = null, detail = null, dirty = false, busy = false, routeToken = 0, currentRoute = '', failedCreateId = null;
const can = key => permissions[key] === true;
const administration = () => can('view_all') || can('create');
const nameOf = id => workspace.profiles.find(person => person.id === id)?.name || 'Membro removido';
const memberName = (id, snapshot = []) => (snapshot || []).find(member => member.member_key === id)?.name_snapshot || nameOf(id);
const normalizeMemberName = name => String(name || '').trim().toLocaleLowerCase('pt-BR')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const memberPreset = userId => {
  const normalized = normalizeMemberName(nameOf(userId));
  const key = Object.keys(MEMBER_PRESETS).find(candidate => normalized === candidate
    || normalized.startsWith(`${candidate} `)
    || normalized.startsWith(`${candidate}-`));
  return key ? MEMBER_PRESETS[key] : null;
};
const button = (action, label, extra = '', kind = 'ghost') => `<button type="button" class="btn btn-${kind} btn-sm" data-action="${action}" ${extra}>${label}</button>`;
const badge = status => `<span class="commission-badge">${esc(STATUS[status] || status)}</span>`;
const empty = text => `<div class="commission-empty">${esc(text)}</div>`;
const field = (label, control, wide = false) => `<label class="commission-field${wide ? ' commission-wide' : ''}"><span>${label}</span>${control}</label>`;
const input = (name, value, type = 'text', extra = '') => `<input class="form-input" name="${name}" type="${type}" value="${esc(value)}" ${extra}>`;
const option = (value, label, selected) => `<option value="${esc(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${esc(label)}</option>`;
const select = (name, options, extra = '') => `<select class="form-input" name="${name}" ${extra}>${options}</select>`;
const table = (headers, rows) => rows.length ? `<div class="commission-table-wrap" tabindex="0" role="region" aria-label="Tabela; deslize para consultar todas as colunas"><table class="commission-table"><thead><tr>${headers.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : empty('Nenhum registro encontrado.');
const projectHref = id => `comissionamento.html#project/${encodeURIComponent(id)}`;
const stat = (label, value) => `<div class="commission-stat"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;

function shell(tab, body) {
  const tabs = administration() ? [['dashboard', 'Dashboard'], ['projects', 'Projetos'], ...(can('create') ? [['new', 'Novo cálculo']] : []), ['history', 'Histórico'], ['own', 'Minhas comissões']] : [['own', 'Minhas comissões']];
  root.innerHTML = `<div class="commission-shell"><div class="commission-header"><div><h1>Comissionamento</h1><p>Distribuições, recebimentos e comissões dos projetos MSY.</p></div>${can('create') ? '<a class="btn btn-primary" href="#new">+ Novo cálculo</a>' : ''}</div>
    <nav class="commission-tabs" aria-label="Áreas do comissionamento">${tabs.map(([key,label]) => `<a href="#${key}" ${tab === key ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav><div id="commissionContent">${body}</div></div>`;
}

function showError(error) {
  console.error('[MSY][comissionamento]', error);
  const message = /commission_(read|command)|schema cache|PGRST202/.test(`${error.message} ${error.code}`)
    ? 'O Comissionamento ainda não está disponível no banco. A migração precisa ser aplicada.'
    : error.message || 'Não foi possível concluir. Tente novamente.';
  Utils.showToast(message, 'error');
  return message;
}

function personOptions(selected, allowCompany = false) {
  const people = workspace.profiles.filter(person => person.status === 'ativo' || person.id === selected);
  let html = option('', allowCompany ? 'MSY — origem sem responsável individual' : 'Selecione um membro', selected);
  html += people.map(person => option(person.id, person.name + (person.status === 'ativo' ? '' : ' (inativo)'), selected)).join('');
  if (selected && !people.some(person => person.id === selected)) html += option(selected, 'Membro removido', selected);
  return html;
}

function blankInput() {
  return { project_name: '', client_name: '', project_date: today(), project_id: null, gross_cents: 0, notes: '', costs: [], referral_source: SOURCES[0], referral_user_id: null, members: [] };
}

function costRow(cost, index) {
  return `<div class="commission-cost" data-cost="${index}">${field('Descrição', input('cost_description', cost.description, 'text', 'maxlength="300"'))}${field('Valor (R$)', input('cost_amount', decimal(cost.amount_cents), 'text', 'inputmode="decimal"'))}${button('remove-cost', 'Remover', `data-index="${index}" aria-label="Remover custo ${index + 1}"`)}</div>`;
}

function memberRow(member, index) {
  return `<section class="commission-person" data-member="${index}"><div class="commission-person-head">${field('Pessoa', select('member_user', personOptions(member.user_id)))}${button('remove-member', 'Remover', `data-index="${index}" aria-label="Remover participante ${index + 1}"`)}</div>
    <div class="commission-grid">${field('Cargo no projeto', input('member_roles', member.roles.join(' / '), 'text', 'list="commissionRoles" placeholder="Ex.: Tech Lead / Backend" maxlength="300"'), true)}
    ${field('Peso na execução (%)', input('member_weight', decimal(member.weight_bp), 'text', 'inputmode="decimal"'))}
    ${field('Participação definida manualmente', select('member_participation', option('', 'Selecione a participação', member.participation) + [0,50,75,100].map(value => option(value, `${value}%`, member.participation)).join('')))}
    ${field('Justificativa da participação (opcional)', input('member_justification', member.justification || '', 'text', 'maxlength="2000"'), true)}</div><div data-member-result="${index}" class="commission-notice"></div></section>`;
}

function readForm() {
  const form = document.getElementById('commissionForm');
  const value = name => form.elements.namedItem(name)?.value || '';
  return { project_name: value('project_name').trim(), client_name: value('client_name').trim(), project_date: value('project_date'),
    project_id: value('project_id') || null, gross_cents: parseDecimal(value('gross_cents') || '0'), notes: value('notes'),
    referral_source: value('referral_source'), referral_user_id: value('referral_user_id') || null,
    costs: [...form.querySelectorAll('[data-cost]')].map(row => ({ description: row.querySelector('[name="cost_description"]').value.trim(), amount_cents: parseDecimal(row.querySelector('[name="cost_amount"]').value || '0') })),
    members: [...form.querySelectorAll('[data-member]')].map(row => ({ user_id: row.querySelector('[name="member_user"]').value || null,
      roles: [...new Set(row.querySelector('[name="member_roles"]').value.split('/').map(role => role.trim()).filter(Boolean))],
      weight_bp: parseDecimal(row.querySelector('[name="member_weight"]').value || '0'), participation: row.querySelector('[name="member_participation"]').value === '' ? null : Number(row.querySelector('[name="member_participation"]').value),
      justification: row.querySelector('[name="member_justification"]').value.trim() })) };
}

function summary(result, referralUser) {
  const line = (label, cents, total = false) => `<div${total ? ' class="commission-total"' : ''}><dt>${esc(label)}</dt><dd>${money(cents)}</dd></div>`;
  return `<h2>Resumo financeiro</h2><dl>${line('Valor bruto',result.gross_cents)}${line('Custos externos',result.costs_cents)}${line('Base de distribuição',result.distribution_cents,true)}
    ${line('MSY — 25% fixos',result.company_cents)}${line(referralUser ? `Indicação — 10% para ${nameOf(referralUser)}` : 'Indicação — 10% para MSY',result.referral_cents)}<div><dt>Responsável pela indicação</dt><dd>${esc(referralUser ? nameOf(referralUser) : 'MSY')}</dd></div>
    ${line('Execução prevista — 65%',result.execution_cents)}${line('Retenção por participação → MSY',result.retained_cents)}${line('Execução efetiva',result.effective_execution_cents)}
    ${line('Total da MSY',result.company_total_cents,true)}${line('Indicação devida a membro',referralUser ? result.referral_cents : 0)}${line('Execução devida aos membros',result.effective_execution_cents)}
    ${line('TOTAL DISTRIBUÍDO',result.company_total_cents + (referralUser ? result.referral_cents : 0) + result.effective_execution_cents,true)}</dl>
    <p class="commission-notice ${result.valid ? 'commission-ok' : ''}" role="status">${result.valid ? '✓ Cálculo fechado corretamente.' : esc(result.errors.join(' '))}</p>
    <p class="commission-muted">Valores em centavos. Eventuais resíduos das bases são ajustados no último participante com peso positivo. Não há redistribuição entre pessoas.</p>`;
}

function refreshPreview() {
  try {
    const data = readForm();
    const result = calculateCommission(data);
    document.getElementById('commissionSummary').innerHTML = summary(result, data.referral_user_id);
    const remaining = 10000 - result.weight_bp;
    document.getElementById('commissionWeights').innerHTML = `Peso distribuído: <strong>${decimal(result.weight_bp)}% / 100%</strong> ${remaining > 0 ? `— Restam ${decimal(remaining)}%.` : remaining < 0 ? '— Os pesos ultrapassaram 100%.' : '— Distribuição completa.'}`;
    result.members.forEach((member,index) => {
      document.querySelector(`[data-member-result="${index}"]`).innerHTML = `Base: ${money(member.base_cents)} · Redução para MSY: ${money(member.retained_cents)}<br><strong>Comissão: ${money(member.final_cents)}</strong>`;
    });
    return result;
  } catch (error) {
    document.getElementById('commissionSummary').innerHTML = `<h2>Resumo financeiro</h2><p class="commission-error" role="alert">${esc(error.message)}</p>`;
    document.getElementById('commissionWeights').textContent = 'Revise os valores para conferir a distribuição.';
    document.querySelectorAll('[data-member-result]').forEach(node => { node.textContent = 'Aguardando valores válidos.'; });
    return null;
  }
}

function renderEditor(data) {
  const editing = Boolean(current);
  shell(editing ? 'projects' : 'new', `<div class="commission-actions"><a class="btn btn-ghost btn-sm" href="#projects">Voltar aos projetos</a>${editing ? badge(current.status) : ''}</div>
    ${editing && current.approved_at ? '<p class="commission-notice">Salvar uma alteração suspende a aprovação e os pagamentos até uma nova aprovação. A versão anterior será preservada.</p>' : ''}
    <div class="commission-form-layout"><form id="commissionForm" class="commission-form" novalidate><fieldset id="commissionFields">
    <div class="commission-form"><section class="commission-panel"><h2>Informações gerais</h2><div class="commission-grid">
    ${field('Projeto da Gestão de Projetos (opcional)', select('project_id', option('', 'Sem vínculo', data.project_id) + workspace.linked_projects.map(project => option(project.id, project.name, data.project_id)).join('')), true)}
    ${field('Nome do projeto', input('project_name',data.project_name,'text','required maxlength="200"'))}${field('Cliente',input('client_name',data.client_name,'text','required maxlength="200"'))}
    ${field('Valor do projeto (R$)',input('gross_cents',decimal(data.gross_cents),'text','inputmode="decimal" required'))}${field('Data do projeto',input('project_date',data.project_date,'date','required'))}
    ${field('Observações (opcional)',`<textarea class="form-input" name="notes" maxlength="5000">${esc(data.notes)}</textarea>`,true)}</div></section>
    <section class="commission-panel"><details id="commissionCosts" ${data.costs.length ? 'open' : ''}><summary>Custos externos pagos pela MSY</summary><p class="commission-muted">Descontados do bruto antes das porcentagens.</p><div id="commissionCostRows">${data.costs.map(costRow).join('')}</div>${button('add-cost','+ Adicionar custo')}</details></section>
    <section class="commission-panel"><h2>Quem trouxe esse cliente?</h2><div class="commission-grid">${field('Origem',select('referral_source',SOURCES.map(source => option(source,source,data.referral_source)).join('')))}${field('Responsável pela indicação',select('referral_user_id',personOptions(data.referral_user_id,true)))}</div><p class="commission-muted">Os 10% pertencem a quem originou o cliente. Sem responsável individual, ficam com a MSY.</p></section>
    <section class="commission-panel"><h2>Participantes da execução</h2><p class="commission-muted">Se houver mais de um cargo no projeto, separe por /. A participação final é definida pela liderança ao aprovar.</p><div id="commissionMemberRows">${data.members.map(memberRow).join('')}</div>
    <p id="commissionWeights" class="commission-notice" role="status"></p>${button('add-member','+ Adicionar participante')}<datalist id="commissionRoles">${[...new Set([...DEFAULT_ROLES,...workspace.role_options])].map(role => `<option value="${esc(role)}"></option>`).join('')}</datalist></section>
    </div></fieldset><div class="commission-actions"><button type="submit" class="btn btn-primary">Salvar rascunho</button><span id="commissionSaveState" class="commission-muted" role="status">${dirty ? 'Alterações não salvas' : 'A prévia é atualizada automaticamente'}</span></div>
    <p class="commission-muted">Depois de salvar, você poderá enviar o cálculo para análise e aprovação.</p></form><aside class="commission-panel commission-summary" id="commissionSummary" aria-label="Resumo financeiro" aria-live="polite"></aside></div>`);
  refreshPreview();
}

function projectTable(projects) {
  return table(['Projeto / cliente','Data','Valor bruto','Situação'],projects.map(project => `<tr><td><a href="${projectHref(project.id)}" class="commission-project-link">${esc(project.input.project_name || 'Rascunho sem nome')}</a><small>${esc(project.input.client_name)}</small></td><td>${esc(Utils.formatDate(project.input.project_date))}</td><td class="commission-number">${money(project.result.gross_cents)}</td><td>${badge(project.status)}<small>${project.settled_at ? 'Cliente quitou' : 'Aguardando quitação'}</small></td></tr>`));
}

function projectCards(projects) {
  if (!projects.length) return empty('Nenhum projeto encontrado com esses filtros.');
  return `<div class="commission-project-cards">${projects.map(project => `<a class="commission-project-card" href="${projectHref(project.id)}" aria-label="Abrir projeto ${esc(project.input.project_name || 'Rascunho sem nome')}">
    <div class="commission-project-card-head"><span class="commission-project-card-icon"><i class="fa-solid fa-diagram-project"></i></span><span class="commission-project-card-status">${badge(project.status)}</span></div>
    <h3>${esc(project.input.project_name || 'Rascunho sem nome')}</h3><p class="commission-project-card-client">${esc(project.input.client_name || 'Cliente não informado')}</p>
    <div class="commission-project-card-meta"><span><small>Valor bruto</small><strong>${money(project.result.gross_cents)}</strong></span><span><small>Data</small><strong>${esc(Utils.formatDate(project.input.project_date))}</strong></span></div>
    <div class="commission-project-card-footer"><span>${project.settled_at ? 'Cliente quitou' : 'Aguardando quitação'}</span><span class="commission-project-card-open">Abrir projeto <i class="fa-solid fa-arrow-up-right-from-square"></i></span></div>
  </a>`).join('')}</div>`;
}

function filters() {
  return `<form id="commissionFilters" class="commission-filters commission-panel">${field('Projeto / cliente',input('search',''))}
    ${field('Membro',select('member',option('','Todos','')+workspace.profiles.map(p=>option(p.id,p.name,'')).join('')))}
    ${field('Status',select('status',option('','Todos','')+Object.entries(STATUS).map(([k,v])=>option(k,v,'')).join('')))}
    ${field('Origem',select('source',option('','Todas','')+SOURCES.map(s=>option(s,s,'')).join('')))}
    ${field('Indicação',select('referral',option('','Todas','')+option('msy','MSY','')+workspace.profiles.map(p=>option(p.id,p.name,'')).join('')))}
    ${field('Pagamentos',select('payment',option('','Todos','')+option('paid','Com pagamentos','')+option('pending','Saldo pendente','')))}
    ${field('De',input('from',`${today().slice(0,7)}-01`,'date'))}${field('Até',input('to',today(),'date'))}<div class="commission-actions commission-wide">${button('filter','Aplicar filtros','','primary')}${button('all-period','Todo o período')}<span class="commission-muted">Projetos: data informada no cálculo. Pagos: data do pagamento.</span></div></form>`;
}

function filteredProjects() {
  const form = document.getElementById('commissionFilters');
  if (!form) return workspace.projects;
  const get = name => form.elements.namedItem(name).value;
  const q = get('search').toLocaleLowerCase('pt-BR');
  return workspace.projects.filter(p => {
    const d = p.input;
    const paid = workspace.payments.filter(payment => payment.project_id === p.id).reduce((sum,payment)=>sum+payment.amount_cents,0);
    const owed = p.result.effective_execution_cents + (d.referral_user_id ? p.result.referral_cents : 0);
    return (!q || `${d.project_name} ${d.client_name}`.toLocaleLowerCase('pt-BR').includes(q))
      && (!get('member') || d.referral_user_id === get('member') || d.members.some(m=>m.user_id === get('member')))
      && (!get('status') || p.status === get('status')) && (!get('source') || d.referral_source === get('source'))
      && (!get('referral') || (get('referral') === 'msy' ? !d.referral_user_id : d.referral_user_id === get('referral')))
      && (!get('from') || d.project_date >= get('from')) && (!get('to') || d.project_date <= get('to'))
      && (!get('payment') || (get('payment') === 'paid' ? paid > 0 : Boolean(p.approved_at) && p.status !== 'cancelled' && owed > paid));
  });
}

let listPage = 0;
function renderOverview(tab) {
  shell(tab,`${filters()}<div id="commissionResults"></div>`);
  listPage = 0;
  updateOverview(tab);
}

function historyView(history, expanded = false) {
  if (!history.length) return empty('Nenhuma alteração registrada.');
  return `<div class="commission-history">${history.map(event => {
    const oldMembers = event.old_value?.input?.members || [];
    const nextMembers = event.new_value?.input?.members || [];
    const changes = nextMembers.flatMap(member => {
      const old = oldMembers.find(item => item.user_id === member.user_id);
      const name = memberName(member.user_id,event.new_value?.member_snapshot);
      if(!old) return [`${name}: adicionado à execução (${decimal(member.weight_bp)}%, participação ${member.participation}%).`];
      const entries=[];
      if(old.participation!==member.participation) entries.push(`${name}: participação ${old.participation}% → ${member.participation}%.`);
      if(old.weight_bp!==member.weight_bp) entries.push(`${name}: peso ${decimal(old.weight_bp)}% → ${decimal(member.weight_bp)}%.`);
      if(JSON.stringify(old.roles)!==JSON.stringify(member.roles)) entries.push(`${name}: cargo no projeto ${old.roles.join(' / ')} → ${member.roles.join(' / ')}.`);
      if(old.justification!==member.justification) entries.push(`${name}: justificativa atualizada para “${member.justification||'sem justificativa'}”.`);
      return entries;
    });
    oldMembers.filter(old=>!nextMembers.some(member=>member.user_id===old.user_id)).forEach(old=>changes.push(`${memberName(old.user_id,event.old_value?.member_snapshot)}: removido da execução.`));
    const before=event.old_value?.input, after=event.new_value?.input;
    if(before&&after) {
      for(const [key,label] of [['project_name','Projeto'],['client_name','Cliente'],['project_date','Data'],['referral_source','Origem'],['notes','Observações']]) {
        if(before[key]!==after[key]) changes.push(`${label}: ${before[key]||'—'} → ${after[key]||'—'}`);
      }
      if(before.gross_cents!==after.gross_cents) changes.push(`Valor bruto: ${money(before.gross_cents)} → ${money(after.gross_cents)}`);
      if(before.referral_user_id!==after.referral_user_id) changes.push(`Indicação: ${before.referral_user_id?nameOf(before.referral_user_id):'MSY'} → ${after.referral_user_id?nameOf(after.referral_user_id):'MSY'}`);
      if(JSON.stringify(before.costs)!==JSON.stringify(after.costs)) changes.push(`Custos: ${before.costs.map(c=>`${c.description}: ${money(c.amount_cents)}`).join('; ')||'nenhum'} → ${after.costs.map(c=>`${c.description}: ${money(c.amount_cents)}`).join('; ')||'nenhum'}`);
    }
    if(event.new_value?.details?.reason) changes.push(`Justificativa: ${event.new_value.details.reason}`);
    if(event.new_value?.details?.date) changes.push(`Data registrada: ${Utils.formatDate(event.new_value.details.date)}`);
    if(event.action==='pay') changes.push(`${nameOf(event.new_value?.details?.user_id)} — ${event.new_value?.details?.payment_type==='execution'?'execução':'indicação'}`);
    return `<article><p class="commission-muted">${esc(Utils.formatDateTime(event.created_at))} · ${esc(event.actor_name)}</p><p>${esc(ACTIONS[event.action] || event.action)}</p>${expanded?changes.map(change=>`<p>${esc(change)}</p>`).join(''):`<a href="${projectHref(event.project_id)}">Abrir projeto</a>`}</article>`;
  }).join('')}</div>`;
}

function updateOverview(tab) {
  const projects = filteredProjects();
  const target = document.getElementById('commissionResults');
  if (tab === 'projects') {
    const pages = Math.max(1,Math.ceil(projects.length/25));
    listPage = Math.min(listPage,pages-1);
    target.innerHTML = `<section class="commission-panel"><h2>Projetos (${projects.length})</h2>${projectCards(projects.slice(listPage*25,listPage*25+25))}<div class="commission-actions commission-pagination">${button('previous','Anterior',listPage===0?'disabled':'')}<span>${listPage+1} / ${pages}</span>${button('next','Próxima',listPage+1===pages?'disabled':'')}</div></section>`;
    return;
  }
  if (tab === 'history') {
    const ids = new Set(projects.map(p=>p.id));
    target.innerHTML = `<section class="commission-panel"><h2>Últimas alterações</h2><p class="commission-muted">Até 100 eventos recentes. O histórico completo está disponível em cada projeto.</p>${historyView(workspace.history.filter(event=>ids.has(event.project_id)))}</section>`;
    return;
  }
  const active = projects.filter(p=>p.status !== 'cancelled');
  const approved = active.filter(p=>p.approved_at);
  const sum = (rows,key) => rows.reduce((total,p)=>total+p.result[key],0);
  const payable = approved.filter(p=>['pending','paid'].includes(p.status)).reduce((total,p)=>total+p.result.effective_execution_cents+(p.input.referral_user_id?p.result.referral_cents:0)-workspace.payments.filter(payment=>payment.project_id===p.id).reduce((v,payment)=>v+payment.amount_cents,0),0);
  const from = document.querySelector('[name="from"]').value, to = document.querySelector('[name="to"]').value;
  // Payment period is independent of the project date filter.
  const form = document.getElementById('commissionFilters');
  const savedFrom = form.elements.from.value, savedTo = form.elements.to.value;
  form.elements.from.value=''; form.elements.to.value='';
  const paymentIds = new Set(filteredProjects().map(p=>p.id));
  form.elements.from.value=savedFrom; form.elements.to.value=savedTo;
  const payments = workspace.payments.filter(p=>paymentIds.has(p.project_id)&&(!from||p.paid_at>=from)&&(!to||p.paid_at<=to));
  const ranking = new Map();
  payments.forEach(p=>ranking.set(p.name_snapshot,(ranking.get(p.name_snapshot)||0)+p.amount_cents));
  target.innerHTML = `<section class="commission-panel"><h2>Visão do período</h2><div class="commission-stats">${stat('Valor bruto cadastrado',money(sum(active,'gross_cents')))}${stat('MSY — valores aprovados',money(sum(approved,'company_total_cents')))}${stat('Execução efetiva aprovada',money(sum(approved,'effective_execution_cents')))}${stat('Indicações aprovadas',money(sum(approved,'referral_cents')))}${stat('Disponível a pagar',money(payable))}${stat('Pago no período',money(payments.reduce((v,p)=>v+p.amount_cents,0)))}</div>
    <p class="commission-muted">MSY: ${money(sum(approved,'company_cents'))} fixos + ${money(sum(approved,'retained_cents'))} de retenções + ${money(approved.filter(p=>!p.input.referral_user_id).reduce((s,p)=>s+p.result.referral_cents,0))} de indicação institucional. ${active.filter(p=>!p.approved_at).length} cálculo(s) ainda são estimativas.</p></section>
    <div class="commission-grid"><section class="commission-panel"><h2>Projetos recentes</h2>${projectTable(active.slice(0,5))}</section><section class="commission-panel"><h2>Pagamentos pendentes</h2>${projectTable(approved.filter(p=>p.status==='pending').slice(0,5))}</section>
    <section class="commission-panel"><h2>Participantes que mais receberam</h2>${table(['Membro','Recebido'],[...ranking.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,amount])=>`<tr><td>${esc(name)}</td><td class="commission-number">${money(amount)}</td></tr>`))}</section>
    <section class="commission-panel"><h2>Últimos cálculos</h2>${projectTable([...active].sort((a,b)=>b.updated_at.localeCompare(a.updated_at)).slice(0,5))}</section></div>`;
}

function ownView(rows) {
  const paid = rows.reduce((sum,row)=>sum+row.payments.reduce((v,p)=>v+p.amount_cents,0),0);
  const expected = rows.reduce((sum,row)=>sum+(row.execution?.final_cents||0)+row.referral_cents,0);
  shell('own',`<section class="commission-panel"><h2>Minhas comissões</h2><div class="commission-stats">${stat('Total recebido',money(paid))}${stat('A receber',money(expected-paid))}${stat('Projetos participados',String(rows.length))}</div><p class="commission-muted">Somente distribuições aprovadas. Valores aguardando quitação ainda não estão liberados.</p></section>
    ${rows.length ? rows.map(row=>{ const m=row.execution; return `<section class="commission-panel"><div class="commission-header"><h2>${esc(row.project_name)}</h2>${badge(row.status)}</div><p class="commission-muted">${esc(Utils.formatDate(row.project_date))} · ${row.settled_at?'Quitação registrada':'Aguardando quitação integral do cliente'}</p>
      ${m?`<div class="commission-line"><strong>Execução final</strong><strong>${money(m.final_cents)}</strong></div><p class="commission-muted">${esc(m.roles.join(' / '))}</p><div class="commission-grid">${stat('Peso',`${decimal(m.weight_bp)}%`)}${stat('Participação',`${m.participation}%`)}${stat('Valor base',money(m.base_cents))}${stat('Redução para MSY',money(m.base_cents-m.final_cents))}</div>`:''}
      ${row.referral_cents ? `<p class="commission-notice">Comissão de indicação: <strong>${money(row.referral_cents)}</strong></p>`:''}
      ${row.payments.length?table(['Pagamento','Valor','Data'],row.payments.map(p=>`<tr><td>${p.payment_type==='execution'?'Execução':'Indicação'}</td><td>${money(p.amount_cents)}</td><td>${esc(Utils.formatDate(p.paid_at))}</td></tr>`)):empty('Nenhum pagamento registrado neste projeto.')}</section>`; }).join(''):empty('Você ainda não tem comissões aprovadas.')}`);
}

function renderDetail(data) {
  detail = data; current = data.project;
  if (!current) throw new Error('Cálculo não encontrado.');
  const p = current, d = p.input, r = p.result;
  const locked = data.payments.length > 0 || p.status === 'cancelled';
  const due = data.members.filter(m=>m.final_cents>0).map(m=>({id:m.member_key,name:m.name_snapshot,type:'execution',amount:m.final_cents}));
  if (d.referral_user_id && r.referral_cents>0) due.push({id:d.referral_user_id,name:nameOf(d.referral_user_id),type:'referral',amount:r.referral_cents});
  shell('projects',`<div class="commission-header"><div><h2>${esc(d.project_name||'Rascunho sem nome')}</h2><p>${esc(d.client_name)} · ${esc(Utils.formatDate(d.project_date))}</p></div>${badge(p.status)}</div>
    <div class="commission-actions"><a class="btn btn-ghost btn-sm" href="#projects">Voltar</a>${can('edit')&&!locked?button('edit','Editar cálculo'):''}${can('edit')&&p.status==='draft'?button('review','Enviar para análise'):''}${can('approve')&&['draft','review'].includes(p.status)?button('approve','Aprovar distribuição','','primary'):''}${can('delete')&&!locked?button('cancel','Cancelar cálculo'):''}${can('delete')?button('delete-project','Excluir cálculo','aria-describedby="delete-project-help"'):''}</div>
    ${can('delete')?'<p id="delete-project-help" class="commission-muted">Exclusão definitiva: remove este cálculo, pagamentos e histórico. Use apenas para testes ou registros que precisam ser removidos.</p>':''}
    ${locked?'<p class="commission-notice">Os valores financeiros estão bloqueados. O histórico e as versões aprovadas permanecem preservados.</p>':''}
    <div class="commission-form-layout"><div class="commission-form"><section class="commission-panel"><h2>Distribuição da execução</h2>${table(['Pessoa / cargo no projeto','Peso / participação','Base','Retido para MSY','Final'],data.members.map(m=>`<tr><td>${esc(m.name_snapshot)}<small>${esc(m.roles.join(' / '))}</small>${m.defined_at?`<small>Definida por ${esc(nameOf(m.defined_by))} em ${esc(Utils.formatDateTime(m.defined_at))}</small>`:''}${m.justification?`<small>${esc(m.justification)}</small>`:''}</td><td>${decimal(m.weight_bp)}% / ${m.participation}%</td><td>${money(m.base_cents)}</td><td>${money(m.base_cents-m.final_cents)}</td><td>${money(m.final_cents)}</td></tr>`))}</section>
    <section class="commission-panel"><h2>Quitação e pagamentos</h2><p class="commission-muted">${p.approved_at?`Aprovado por ${esc(nameOf(p.approved_by))} em ${esc(Utils.formatDateTime(p.approved_at))}.`:'Distribuição ainda não aprovada.'}</p>
    <p class="commission-notice">${p.settled_at?`Cliente quitou o valor bruto de ${money(r.gross_cents)} em ${esc(Utils.formatDate(p.settled_at))}. Registrado por ${esc(nameOf(p.settled_by))}.`:'O pagamento das comissões só será liberado após a aprovação e a confirmação de quitação integral do cliente.'}</p>
    ${can('mark_paid')&&p.status==='approved'?`<div class="commission-grid">${field('Data da quitação',input('settlement_date',today(),'date',`max="${today()}"`))}<div class="commission-actions">${button('settle','Confirmar quitação integral','','primary')}</div></div>`:''}
    ${can('mark_paid')&&p.status==='pending'?field('Data do pagamento',input('payment_date',today(),'date',`max="${today()}" min="${p.settled_at}"`)):''}
    ${table(['Beneficiário','Tipo','Valor','Pagamento'],due.map(item=>{const payment=data.payments.find(pay=>pay.beneficiary_key===item.id&&pay.payment_type===item.type);return `<tr><td>${esc(item.name)}</td><td>${item.type==='execution'?'Execução':'Indicação'}</td><td>${money(item.amount)}</td><td>${payment?`Pago em ${esc(Utils.formatDate(payment.paid_at))}<small>Registrado por ${esc(nameOf(payment.registered_by))}</small>`:can('mark_paid')&&p.status==='pending'?button('pay','Marcar pago',`data-user="${item.id}" data-type="${item.type}"`):'Pendente'}</td></tr>`;}))}</section>
    <section class="commission-panel"><h2>Informações complementares</h2><p>${esc(d.notes||'Sem observações.')}</p>${table(['Custo externo','Valor'],d.costs.map(cost=>`<tr><td>${esc(cost.description)}</td><td>${money(cost.amount_cents)}</td></tr>`))}<p class="commission-muted">Origem: ${esc(d.referral_source)}</p></section>
    <section class="commission-panel"><h2>Histórico e versões aprovadas</h2>${data.revisions.map((revision,index)=>`<details><summary>Versão ${revision.version} — ${esc(Utils.formatDateTime(revision.approved_at))} ${index===0&&p.approved_at&&p.status!=='cancelled'?'(vigente)':'(substituída ou cancelada)'}</summary><p class="commission-muted">Aprovada por ${esc(nameOf(revision.approved_by))}. Indicação: ${esc(revision.snapshot.referral_name||'MSY')}.</p>${table(['Pessoa','Peso / participação','Comissão'],(revision.snapshot.members||[]).map(m=>`<tr><td>${esc(m.name_snapshot)}</td><td>${decimal(m.weight_bp)}% / ${m.participation}%</td><td>${money(m.final_cents)}</td></tr>`))}${revision.snapshot.project?.result?`<p>Base: ${money(revision.snapshot.project.result.distribution_cents)} · MSY: ${money(revision.snapshot.project.result.company_total_cents)} · Indicação: ${money(revision.snapshot.project.result.referral_cents)}</p>`:''}</details>`).join('')}${historyView(data.history,true)}</section>
    </div><aside class="commission-panel commission-summary">${summary(r,d.referral_user_id)}</aside></div>`);
}

async function navigate() {
  const token = ++routeToken;
  const path = location.hash.slice(1) || (administration()?'dashboard':'own');
  currentRoute = path;
  current=null; detail=null; dirty=false;
  shell(path.split('/')[0],'<div class="loading-container">Carregando…</div>');
  try {
    if (path === 'own' || !administration()) {
      const data = await api.read(null,true);
      if (token===routeToken) ownView(data.own);
      return;
    }
    workspace = await api.read();
    if (token!==routeToken) return;
    if (path.startsWith('project/')) {
      const data = await api.read(path.split('/')[1]);
      if (token===routeToken) renderDetail(data);
    } else if (path==='new') {
      if (!can('create')) throw new Error('Sem permissão para criar cálculos.');
      failedCreateId = crypto.randomUUID();
      renderEditor(blankInput());
    } else renderOverview(['dashboard','projects','history'].includes(path)?path:'dashboard');
  } catch (error) {
    if (token!==routeToken) return;
    shell(path.split('/')[0],`<section class="commission-panel"><h2>Não foi possível carregar</h2><p role="alert">${esc(showError(error))}</p>${button('retry','Tentar novamente')}</section>`);
  }
}

async function runMutation(action,payload={}) {
  const result = await api.command(action,current.id,current.version,payload);
  dirty=false;
  current=result;
  renderDetail(await api.read(result.id));
  Utils.showToast('Registro salvo com sucesso.','success');
}

async function confirmAction(text) {
  return window.MSYConfirm.show(text,{confirmText:'Confirmar',cancelText:'Voltar'});
}

async function handleClick(event) {
  const control = event.target.closest('[data-action]');
  if (!control || busy) return;
  const action = control.dataset.action;
  if (['filter','all-period','next','previous'].includes(action)) {
    if(action==='all-period') { document.querySelector('[name="from"]').value=''; document.querySelector('[name="to"]').value=''; }
    listPage = action==='next'?listPage+1:action==='previous'?Math.max(0,listPage-1):0;
    updateOverview(currentRoute);return;
  }
  if(action==='retry') { await navigate();return; }
  try {
    if(action==='edit') { renderEditor(current.input);return; }
    if(['add-member','remove-member','add-cost','remove-cost'].includes(action)) {
      const data=readForm();
      if(action==='add-member') { if(data.members.length>=200) throw new Error('Limite de 200 participantes.'); data.members.push({user_id:null,roles:[],weight_bp:0,participation:null,justification:''}); }
      if(action==='remove-member') data.members.splice(Number(control.dataset.index),1);
      if(action==='add-cost') { if(data.costs.length>=100) throw new Error('Limite de 100 custos.'); data.costs.push({description:'',amount_cents:0}); }
      if(action==='remove-cost') data.costs.splice(Number(control.dataset.index),1);
      dirty=true;renderEditor(data);
      if(action==='add-cost') document.getElementById('commissionCosts').open=true;
      return;
    }
    busy=true;control.disabled=true;
    if(action==='approve') {
      calculateCommission(current.input,true);
      if(await confirmAction('Aprovar estes valores e definir as participações finais? Reduções ficam com a MSY.')) await runMutation('approve');
    } else if(action==='review') await runMutation('review');
    else if(action==='settle') {
      const date=document.querySelector('[name="settlement_date"]').value;
      if(await confirmAction(`Confirmar que o cliente quitou integralmente ${money(current.result.gross_cents)}?`)) await runMutation('settle',{date});
    } else if(action==='pay') {
      if(await confirmAction(`Confirmar o pagamento integral de ${control.dataset.type==='execution'?'execução':'indicação'} para ${nameOf(control.dataset.user)}? Os valores do cálculo ficarão bloqueados.`)) await runMutation('pay',{user_id:control.dataset.user,payment_type:control.dataset.type,date:document.querySelector('[name="payment_date"]').value});
    } else if(action==='cancel') {
      const reason=window.prompt('Justificativa do cancelamento:');
      if(reason?.trim() && await confirmAction('Cancelar este cálculo preservando o histórico?')) await runMutation('cancel',{reason:reason.trim()});
    } else if(action==='delete-project') {
      if(await confirmAction('Excluir definitivamente este cálculo, incluindo pagamentos e histórico? Essa ação não pode ser desfeita.')) {
        await api.delete(current.id,current.version);
        dirty=false;
        Utils.showToast('Cálculo excluído.','success');
        location.hash='#projects';
      }
    }
  } catch(error) { showError(error); }
  finally { busy=false;control.disabled=false; }
}

async function handleSubmit(event) {
  event.preventDefault();
  if(busy) return;
  const form=event.target;
  if(form.id==='commissionFilters') { listPage=0;updateOverview(currentRoute);return; }
  busy=true;
  const controls=[...form.querySelectorAll('input,select,textarea,button')];
  controls.forEach(control=>{control.disabled=true;});
  try {
    if(form.id==='commissionForm') {
      const data=readForm();calculateCommission(data);
      const result=await api.command(current?'save':'create',current?.id||failedCreateId,current?.version||null,{input:data});
      dirty=false;current=result;
      Utils.showToast('Rascunho salvo.','success');
      if(location.hash===`#project/${result.id}`) renderDetail(await api.read(result.id));
    else location.hash=`project/${result.id}`;
    }
  } catch(error) { showError(error); }
  finally { busy=false;controls.forEach(control=>{control.disabled=false;}); }
}

async function init() {
  profile=await renderSidebar('comissionamento');
  if(!profile) return;
  await renderTopBar('Comissionamento',profile);
  const keys=['view_own','view_all','create','edit','approve','mark_paid','delete'];
  const checks=await Promise.all(keys.map(key=>ViewMode.isActive()?false:MSYPerms.check(profile.id,profile.tier,`commission.${key}`)));
  keys.forEach((key,index)=>{permissions[key]=checks[index];});
  root.addEventListener('click',handleClick);
  root.addEventListener('submit',handleSubmit);
  root.addEventListener('input',event=>{if(event.target.closest('#commissionForm')) {dirty=true;document.getElementById('commissionSaveState').textContent='Alterações não salvas';refreshPreview();}});
  root.addEventListener('change',async event=>{
    if(event.target.name!=='project_id'||!event.target.value) return;
    try {
      const selected=workspace.linked_projects.find(p=>p.id===event.target.value);
      const form=document.getElementById('commissionForm');
      if(!form.elements.project_name.value) form.elements.project_name.value=selected?.name||'';
      if(!form.querySelector('[data-member]')) {
        const {data,error}=await db.from('project_participants').select('user_id,roles').eq('project_id',event.target.value);
        if(error) throw error;
        const draft=readForm();draft.members=(data||[]).map(m=>({...m,weight_bp:memberPreset(m.user_id)?.weight_bp || 0,participation:null,justification:''}));renderEditor(draft);
      }
      dirty=true;refreshPreview();
    } catch(error) {showError(error);}
  });
  root.addEventListener('change',event=>{
    if(event.target.name !== 'member_user') return;
    const row = event.target.closest('[data-member]');
    const preset = memberPreset(event.target.value);
    if(!row || !preset) return;
    row.querySelector('[name="member_roles"]').value = preset.roles.join(' / ');
    row.querySelector('[name="member_weight"]').value = decimal(preset.weight_bp);
    row.querySelector('[name="member_participation"]').value = '';
    dirty = true;
    refreshPreview();
  });
  window.addEventListener('beforeunload',event=>{if(dirty||busy) {event.preventDefault();event.returnValue='';}});
  // Intercept internal links before hashchange to avoid discarding an editor.
  document.addEventListener('click',event=>{
    const link=event.target.closest('a[href]');
    if(link&&(dirty||busy)&&!link.target&&!event.ctrlKey&&!event.metaKey) {
      if(busy) {event.preventDefault();return;}
      if(!window.confirm('Sair e descartar as alterações não salvas?')) event.preventDefault();else dirty=false;
    }
  },true);
  window.addEventListener('hashchange',event=>{
    if(busy || (dirty && !window.confirm('Sair e descartar as alterações não salvas?'))) {
      history.replaceState(null,'',event.oldURL);
      return;
    }
    navigate();
  });
  await navigate();
}

init().catch(error=>{root.innerHTML=`<div class="commission-panel" role="alert">${esc(showError(error))}</div>`;});
