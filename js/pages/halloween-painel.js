// Halloween Masayoshi 2026 — painel da diretoria: quem abriu o convite (halloween.html)
// e até onde foi. Dados: halloween_views (supabase/migrations/20261017_halloween_views.sql).
const { db, Utils, renderSidebar, renderTopBar } = window.MSY;

const INVITE_URL = 'https://portalmsy.site/halloween.html';
const SHARE_TEXT = '🦇 Você recebeu um convite especial para o Halloween Masayoshi 2026. De 24/10 a 01/11, nove dias de mistérios, desafios e eventos. Abra o convite e descubra o que te espera... 🩸';
const TOTAL_DAYS = 9;
const STAGES = ['Aviso', 'Fita', 'Convite', 'Cronograma', 'Aceitar'];
const FILTERS = [
  { key: 'todos', label: 'Todos' },
  { key: 'completo', label: 'Viram tudo' },
  { key: 'parcial', label: 'Pararam no meio' },
  { key: 'nunca', label: 'Não abriram' },
];

const esc = (value) => Utils.escapeHtml(String(value ?? ''));
const state = { rows: [], filter: 'todos', search: '' };

function rowStatus(view) {
  if (!view) return 'nunca';
  return view.completed_at ? 'completo' : 'parcial';
}

function avatar(member) {
  const color = /^#[0-9a-f]{3,8}$/i.test(member.color || '') ? member.color : '#7f1d1d';
  const inner = member.avatar_url
    ? `<img src="${esc(member.avatar_url)}" alt="" loading="lazy">`
    : esc(member.initials || Utils.getInitials(member.name || '?'));
  return `<div class="avatar hw-avatar" style="background:linear-gradient(135deg,${color},#1a1a1a)">${inner}</div>`;
}

function stageTrack(view) {
  const reached = view ? view.reached_stage : -1;
  return `<div class="hw-track" aria-label="Chegou até: ${esc(view ? STAGES[reached] : 'não abriu')}">
    ${STAGES.map((label, i) => `<span class="hw-step ${i <= reached ? 'is-on' : ''}" title="${esc(label)}"></span>`).join('')}
  </div>`;
}

function rowHtml({ member, view }) {
  const status = rowStatus(view);
  const days = view?.days_seen?.length || 0;
  const chip = {
    completo: `<span class="hw-chip is-done"><i class="fa-solid fa-check"></i> Viu tudo</span>`,
    parcial: `<span class="hw-chip is-mid"><i class="fa-solid fa-hourglass-half"></i> Parou em ${esc(STAGES[view?.reached_stage ?? 0])}</span>`,
    nunca: `<span class="hw-chip is-none"><i class="fa-solid fa-eye-slash"></i> Não abriu</span>`,
  }[status];
  return `<li class="hw-row is-${status}">
    ${avatar(member)}
    <div class="hw-who">
      <b>${esc(member.name || 'Membro')}</b>
      <small>${esc(member.role || '')}</small>
    </div>
    <div class="hw-progress">
      ${chip}
      ${stageTrack(view)}
    </div>
    <div class="hw-meta">
      <span title="Dias do cronograma abertos"><i class="fa-solid fa-film"></i> ${days}/${TOTAL_DAYS}</span>
      ${view?.signed_at ? `<span class="hw-signed" title="Assinou em ${esc(Utils.formatDateTime(view.signed_at))}"><i class="fa-solid fa-fingerprint"></i> Assinou</span>` : ''}
      ${view?.secrets_found ? `<span title="Segredos encontrados"><i class="fa-solid fa-key"></i> ${view.secrets_found}/8</span>` : ''}
    </div>
    <div class="hw-when">
      ${view ? `<span>${esc(Utils.formatDateTime(view.last_seen_at))}</span><small>${view.visits} ${view.visits === 1 ? 'visita' : 'visitas'}</small>` : '<span class="hw-dim">—</span>'}
    </div>
  </li>`;
}

function statTile(icon, label, value, total, cls) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return `<div class="hw-stat ${cls}">
    <i class="fa-solid ${icon}"></i>
    <div><b>${value}</b><span>${esc(label)}</span></div>
    <em>${pct}%</em>
  </div>`;
}

function render() {
  const content = document.getElementById('pageContent');
  const rows = state.rows;
  const total = rows.length;
  const opened = rows.filter((r) => r.view).length;
  const done = rows.filter((r) => r.view?.completed_at).length;
  const signed = rows.filter((r) => r.view?.signed_at).length;
  const search = state.search.trim().toLowerCase();
  const visible = rows.filter((r) => (state.filter === 'todos' || rowStatus(r.view) === state.filter)
    && (!search || (r.member.name || '').toLowerCase().includes(search)));
  const count = (key) => (key === 'todos' ? total : rows.filter((r) => rowStatus(r.view) === key).length);

  content.innerHTML = `
    <section class="hw-hero">
      <div class="hw-hero-text">
        <span class="hw-kicker"><i class="fa-solid fa-ghost"></i> Evento temporário · 24/10 a 01/11</span>
        <h1>Halloween Masayoshi 2026</h1>
        <p>Quem abriu o convite e até onde chegou. "Viu tudo" = chegou ao final (Aceitar o convite).</p>
      </div>
      <div class="hw-hero-actions">
        <a class="btn btn-ghost btn-sm" href="halloween.html"><i class="fa-solid fa-film"></i> Abrir convite</a>
        <button class="btn btn-ghost btn-sm" data-act="copy"><i class="fa-solid fa-link"></i> Copiar link</button>
        <a class="btn btn-primary btn-sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`${SHARE_TEXT}\n\n${INVITE_URL}`)}"><i class="fa-brands fa-whatsapp"></i> Enviar no WhatsApp</a>
      </div>
    </section>

    <section class="hw-stats">
      ${statTile('fa-users', 'Membros ativos', total, total, 'is-total')}
      ${statTile('fa-door-open', 'Abriram', opened, total, 'is-open')}
      ${statTile('fa-eye', 'Viram tudo', done, total, 'is-done')}
      ${statTile('fa-fingerprint', 'Assinaram', signed, total, 'is-signed')}
    </section>

    <section class="hw-list-card">
      <div class="hw-toolbar">
        <div class="hw-filters" role="tablist">
          ${FILTERS.map((f) => `<button class="hw-filter ${state.filter === f.key ? 'is-active' : ''}" data-filter="${f.key}" role="tab" aria-selected="${state.filter === f.key}">${esc(f.label)} <span>${count(f.key)}</span></button>`).join('')}
        </div>
        <div class="hw-tools">
          <label class="hw-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" placeholder="Buscar membro" value="${esc(state.search)}" data-search aria-label="Buscar membro"></label>
          <button class="btn btn-ghost btn-sm" data-act="reload" title="Atualizar"><i class="fa-solid fa-rotate"></i></button>
        </div>
      </div>
      ${visible.length
        ? `<ul class="hw-list">${visible.map(rowHtml).join('')}</ul>`
        : '<div class="empty-state"><div class="empty-state-icon"><i class="fa-solid fa-ghost"></i></div><div class="empty-state-text">Ninguém por aqui.</div></div>'}
    </section>`;

  const input = content.querySelector('[data-search]');
  input.addEventListener('input', () => {
    state.search = input.value;
    const pos = input.selectionStart;
    render();
    const again = document.querySelector('[data-search]');
    again.focus();
    again.setSelectionRange(pos, pos);
  });
}

async function load() {
  const [membersRes, viewsRes] = await Promise.all([
    db.from('profiles').select('id, name, initials, color, avatar_url, role, status'),
    db.from('halloween_views').select('*'),
  ]);
  if (membersRes.error) throw membersRes.error;
  if (viewsRes.error) throw viewsRes.error;
  const views = new Map((viewsRes.data || []).map((v) => [v.user_id, v]));
  // Ativos + quem já abriu (mesmo que hoje esteja inativo).
  state.rows = (membersRes.data || [])
    .filter((m) => m.status === 'ativo' || views.has(m.id))
    .map((member) => ({ member, view: views.get(member.id) || null }))
    .sort((a, b) => {
      const order = { completo: 0, parcial: 1, nunca: 2 };
      const diff = order[rowStatus(a.view)] - order[rowStatus(b.view)];
      if (diff) return diff;
      if (a.view && b.view) return new Date(b.view.last_seen_at) - new Date(a.view.last_seen_at);
      return (a.member.name || '').localeCompare(b.member.name || '', 'pt-BR');
    });
}

async function refresh() {
  const content = document.getElementById('pageContent');
  content.innerHTML = '<div class="loading-container"><i class="fa-solid fa-circle-notch fa-spin"></i> Carregando...</div>';
  try {
    await load();
    render();
  } catch (err) {
    console.error('[MSY][halloween-painel]', err);
    content.innerHTML = '<div class="empty-state">Erro ao carregar. Tente recarregar a página.</div>';
  }
}

async function initHalloweenPainel() {
  const profile = await renderSidebar('halloween-painel');
  if (!profile) return; // sem acesso: já redirecionado
  await renderTopBar('Halloween · Quem viu', profile);

  const content = document.getElementById('pageContent');
  content.addEventListener('click', async (e) => {
    const filter = e.target.closest('[data-filter]');
    if (filter) { state.filter = filter.dataset.filter; render(); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'reload') refresh();
    if (act === 'copy') {
      try {
        await navigator.clipboard.writeText(INVITE_URL);
        Utils.showToast('Link do convite copiado.');
      } catch (err) {
        console.error('[MSY][halloween-painel] copiar link', err);
        Utils.showToast(`Não foi possível copiar. Link: ${INVITE_URL}`, 'error');
      }
    }
  });
  await refresh();
}

initHalloweenPainel();
