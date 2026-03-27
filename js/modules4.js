/* ============================================================
   MSY PORTAL — MODULES4.JS v1.0
   Painel de Desempenho Avançado · Eventos Aprimorados
   ============================================================ */

'use strict';

/* ============================================================
   CSS — Injetado uma vez
   ============================================================ */
(function injectDesempCSS() {
  if (document.getElementById('msy-desemp-css')) return;
  const s = document.createElement('style');
  s.id = 'msy-desemp-css';
  s.textContent = `
    /* ══ PAGE LAYOUT ══ */
    .dp-page { display:flex; flex-direction:column; gap:22px; }

    /* ══ HERO SCORE ══ */
    .dp-hero {
      background: linear-gradient(160deg,#0f0f16 0%,#0a0a0e 100%);
      border: 1px solid rgba(201,168,76,.2);
      border-radius: var(--radius);
      padding: 0;
      overflow: hidden;
      position: relative;
    }
    .dp-hero::before {
      content:''; position:absolute; top:0; left:0; right:0; height:2px;
      background: linear-gradient(90deg,transparent,rgba(201,168,76,.8) 30%,#c9a84c 50%,rgba(201,168,76,.8) 70%,transparent);
    }
    .dp-hero-inner {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0;
    }
    .dp-hero-score {
      padding: 28px 32px;
      border-right: 1px solid rgba(255,255,255,.06);
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .dp-hero-label {
      font-size: .7rem;
      color: var(--gold);
      letter-spacing: .12em;
      text-transform: uppercase;
      font-weight: 700;
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .dp-score-display {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      margin-bottom: 14px;
    }
    .dp-score-num {
      font-family: 'Cinzel', serif;
      font-size: 4rem;
      font-weight: 700;
      line-height: 1;
    }
    .dp-score-denom {
      font-size: 1.1rem;
      color: var(--text-3);
      margin-bottom: 8px;
    }
    .dp-score-label-text {
      font-size: .75rem;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
      padding: 3px 12px;
      border-radius: 20px;
      margin-bottom: 16px;
      display: inline-block;
    }
    .dp-score-track {
      height: 8px;
      background: rgba(255,255,255,.07);
      border-radius: 99px;
      overflow: hidden;
    }
    .dp-score-fill {
      height: 100%;
      border-radius: 99px;
      transition: width 1.2s cubic-bezier(.4,0,.2,1);
    }
    .dp-hero-metrics {
      padding: 0;
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
    }
    .dp-hm {
      padding: 20px 20px;
      border-bottom: 1px solid rgba(255,255,255,.05);
      position: relative;
      cursor: default;
    }
    .dp-hm:nth-child(odd) { border-right: 1px solid rgba(255,255,255,.05); }
    .dp-hm:nth-child(3), .dp-hm:nth-child(4) { border-bottom: none; }
    .dp-hm-val {
      font-family: 'Cinzel', serif;
      font-size: 1.6rem;
      font-weight: 700;
      line-height: 1;
      margin-bottom: 4px;
    }
    .dp-hm-lbl { font-size: .65rem; color: var(--text-3); letter-spacing: .06em; text-transform: uppercase; }
    .dp-hm-sub { font-size: .7rem; color: var(--text-3); margin-top: 3px; }

    /* ══ TABS ══ */
    .dp-tabs {
      display: flex;
      gap: 4px;
      background: rgba(255,255,255,.03);
      border: 1px solid rgba(255,255,255,.07);
      border-radius: calc(var(--radius) + 2px);
      padding: 4px;
    }
    .dp-tab {
      flex: 1;
      padding: 9px 12px;
      border-radius: var(--radius);
      border: none;
      background: transparent;
      color: var(--text-3);
      font-size: .78rem;
      font-weight: 600;
      cursor: pointer;
      transition: all .2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      letter-spacing: .03em;
    }
    .dp-tab:hover { color: var(--text-1); background: rgba(255,255,255,.04); }
    .dp-tab.active {
      background: linear-gradient(135deg,rgba(201,168,76,.18),rgba(201,168,76,.08));
      color: var(--gold);
      border: 1px solid rgba(201,168,76,.25);
    }

    /* ══ SECTION HEADER ══ */
    .dp-sec-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .dp-sec-title {
      font-family: 'Cinzel', serif;
      font-size: .85rem;
      font-weight: 700;
      color: var(--text-1);
      letter-spacing: .06em;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .dp-sec-title-icon {
      width: 30px; height: 30px;
      border-radius: 7px;
      display: flex; align-items: center; justify-content: center;
      font-size: .8rem;
    }

    /* ══ MEMBER CARDS ══ */
    .dp-members-grid {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .dp-member-row {
      background: linear-gradient(135deg,#0f0f14,#0b0b0f);
      border: 1px solid rgba(255,255,255,.07);
      border-radius: 10px;
      padding: 14px 18px;
      display: grid;
      grid-template-columns: 44px 1fr auto;
      align-items: center;
      gap: 14px;
      transition: all .2s;
      cursor: pointer;
      position: relative;
      overflow: hidden;
    }
    .dp-member-row::before {
      content:''; position:absolute; left:0; top:0; bottom:0; width:3px;
      border-radius: 10px 0 0 10px;
      transition: background .2s;
    }
    .dp-member-row:hover { border-color:rgba(201,168,76,.2); transform:translateX(3px); }
    .dp-member-row.rank-1::before { background:linear-gradient(180deg,#f59e0b,#d97706); }
    .dp-member-row.rank-2::before { background:linear-gradient(180deg,#9ca3af,#6b7280); }
    .dp-member-row.rank-3::before { background:linear-gradient(180deg,#b47c3c,#92400e); }
    .dp-member-row.rank-low::before { background:rgba(239,68,68,.5); }
    .dp-member-info { min-width:0; }
    .dp-member-name { font-weight:700; font-size:.88rem; color:var(--text-1); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .dp-member-role { font-size:.7rem; color:var(--text-3); margin-top:2px; }
    .dp-member-right { display:flex; flex-direction:column; align-items:flex-end; gap:6px; min-width:120px; }
    .dp-member-score-val { font-family:'Cinzel',serif; font-size:1rem; font-weight:700; }
    .dp-bar-wrap { width:120px; height:5px; background:rgba(255,255,255,.07); border-radius:99px; overflow:hidden; }
    .dp-bar-fill { height:100%; border-radius:99px; transition:width 1s cubic-bezier(.4,0,.2,1); }
    .dp-member-tags { display:flex; gap:4px; flex-wrap:wrap; justify-content:flex-end; }
    .dp-tag {
      font-size:.6rem; padding:2px 6px; border-radius:4px;
      font-weight:700; letter-spacing:.05em; text-transform:uppercase;
    }
    .dp-tag.good    { background:rgba(16,185,129,.14); color:#10b981; }
    .dp-tag.warn    { background:rgba(245,158,11,.14);  color:#f59e0b; }
    .dp-tag.danger  { background:rgba(239,68,68,.14);   color:#ef4444; }
    .dp-tag.info    { background:rgba(96,165,250,.14);  color:#60a5fa; }
    .dp-rank-badge {
      font-family:'Cinzel',serif; font-size:.75rem; font-weight:700;
      width:22px; height:22px; border-radius:50%;
      display:flex; align-items:center; justify-content:center;
      background:rgba(255,255,255,.06); color:var(--text-3);
      position:absolute; top:10px; right:14px; font-size:.65rem;
    }

    /* ══ ALERTAS ══ */
    .dp-alerts-grid { display:flex; flex-direction:column; gap:8px; }
    .dp-alert {
      display:flex; align-items:flex-start; gap:12px;
      padding:13px 16px; border-radius:9px;
      border-left:3px solid transparent;
      transition:all .15s; cursor:pointer;
    }
    .dp-alert:hover { filter:brightness(1.07); transform:translateX(3px); }
    .dp-alert.danger  { background:linear-gradient(135deg,rgba(127,29,29,.2),rgba(127,29,29,.07)); border:1px solid rgba(239,68,68,.22); border-left-color:#ef4444; }
    .dp-alert.warning { background:linear-gradient(135deg,rgba(120,53,15,.16),rgba(120,53,15,.06)); border:1px solid rgba(245,158,11,.2);  border-left-color:#f59e0b; }
    .dp-alert.info    { background:linear-gradient(135deg,rgba(30,58,95,.16),rgba(30,58,95,.06));   border:1px solid rgba(96,165,250,.18); border-left-color:#60a5fa; }
    .dp-alert-icon {
      width:34px; height:34px; border-radius:50%;
      display:flex; align-items:center; justify-content:center; font-size:.85rem; flex-shrink:0;
    }
    .dp-alert-icon.danger  { background:rgba(239,68,68,.15);  color:#ef4444; }
    .dp-alert-icon.warning { background:rgba(245,158,11,.15); color:#f59e0b; }
    .dp-alert-icon.info    { background:rgba(96,165,250,.15); color:#60a5fa; }
    .dp-alert-body { flex:1; min-width:0; }
    .dp-alert-tag {
      display:inline-block; padding:1px 7px; border-radius:20px; margin-bottom:4px;
      font-size:.58rem; font-weight:700; letter-spacing:.07em; text-transform:uppercase;
    }
    .dp-alert-tag.danger  { background:rgba(239,68,68,.18);  color:#ef4444; }
    .dp-alert-tag.warning { background:rgba(245,158,11,.18); color:#f59e0b; }
    .dp-alert-tag.info    { background:rgba(96,165,250,.18); color:#60a5fa; }
    .dp-alert-title  { font-size:.84rem; font-weight:700; color:var(--text-1); margin-bottom:3px; }
    .dp-alert-detail { font-size:.73rem; color:var(--text-3); line-height:1.5; }
    .dp-alert-members { display:flex; gap:4px; flex-wrap:wrap; margin-top:8px; }
    .dp-alert-chip {
      display:inline-flex; align-items:center; gap:5px;
      padding:3px 8px; background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.09);
      border-radius:20px; font-size:.72rem; color:var(--text-2);
    }
    .dp-alert-chip .avatar { width:18px; height:18px; font-size:.45rem; flex-shrink:0; }

    /* ══ EVENTOS ══ */
    .dp-events-list { display:flex; flex-direction:column; gap:10px; }
    .dp-event-card {
      background: #0f0f14;
      border: 1px solid rgba(255,255,255,.07);
      border-radius: 10px;
      padding: 14px 18px;
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .dp-event-date-box {
      width:48px; flex-shrink:0; text-align:center;
      background:rgba(201,168,76,.08); border:1px solid rgba(201,168,76,.2);
      border-radius:8px; padding:6px 4px;
    }
    .dp-event-date-day { font-family:'Cinzel',serif; font-size:1.4rem; font-weight:700; color:var(--gold); line-height:1; }
    .dp-event-date-mon { font-size:.58rem; color:var(--text-3); text-transform:uppercase; letter-spacing:.06em; }
    .dp-event-info { flex:1; min-width:0; }
    .dp-event-title { font-weight:700; font-size:.88rem; color:var(--text-1); margin-bottom:3px; }
    .dp-event-meta  { font-size:.72rem; color:var(--text-3); display:flex; gap:12px; flex-wrap:wrap; }
    .dp-event-badges { display:flex; gap:6px; align-items:center; flex-shrink:0; flex-wrap:wrap; }

    /* ══ MONTH SELECTOR ══ */
    .dp-month-sel {
      display:flex; align-items:center; gap:8px;
      background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08);
      border-radius:8px; padding:6px 12px; font-size:.78rem; color:var(--text-2);
    }
    .dp-month-sel select {
      background:transparent; border:none; color:var(--text-1); font-size:.8rem;
      outline:none; cursor:pointer; font-weight:600;
    }
    .dp-month-sel option { background:#1a1a22; }

    /* ══ MEMBER DETAIL MODAL ══ */
    .dp-detail-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; padding:0 24px 20px; }
    .dp-detail-stat {
      background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.07);
      border-radius:8px; padding:14px; text-align:center;
    }
    .dp-detail-stat-val { font-family:'Cinzel',serif; font-size:1.5rem; font-weight:700; margin-bottom:4px; }
    .dp-detail-stat-lbl { font-size:.65rem; color:var(--text-3); text-transform:uppercase; letter-spacing:.06em; }

    /* ══ PRIVATE BADGE ══ */
    .dp-private-badge {
      display:inline-flex; align-items:center; gap:4px; padding:2px 8px;
      background:rgba(168,85,247,.15); border:1px solid rgba(168,85,247,.3);
      color:#c084fc; border-radius:20px; font-size:.62rem; font-weight:700;
      letter-spacing:.05em; text-transform:uppercase;
    }

    /* ══ EMPTY STATE ══ */
    .dp-empty {
      display:flex; align-items:center; justify-content:center; flex-direction:column;
      gap:12px; padding:40px 20px; color:var(--text-3);
    }

    /* ══ RESPONSIVE ══ */
    @media (max-width:640px) {
      .dp-hero-inner { grid-template-columns:1fr; }
      .dp-hero-score { border-right:none; border-bottom:1px solid rgba(255,255,255,.06); }
      .dp-hero-metrics { grid-template-columns:repeat(2,1fr); }
      .dp-member-right { min-width:90px; }
      .dp-bar-wrap { width:90px; }
      .dp-detail-grid { grid-template-columns:1fr; }
    }
  `;
  document.head.appendChild(s);
})();

/* ============================================================
   HELPER: Calcular score de desempenho proporcional
   Baseado em taxa, não volume absoluto.
   ============================================================ */
function calcMemberScore(m, eventosTotal, eventosParticipou) {
  // Taxa de conclusão de atividades (peso 60%)
  const taxaActs = m.total_atividades > 0
    ? (m.concluidas / m.total_atividades) * 100
    : 0;

  // Taxa de participação em eventos (peso 40%)
  const taxaEvents = eventosTotal > 0
    ? (eventosParticipou / eventosTotal) * 100
    : 100; // se não há eventos, não penaliza

  // Score ponderado
  const score = (taxaActs * 0.6) + (taxaEvents * 0.4);
  return Math.round(Math.min(100, score));
}

function scoreColor(s) {
  return s >= 80 ? '#10b981' : s >= 60 ? 'var(--gold)' : s >= 40 ? '#f59e0b' : '#ef4444';
}
function scoreLabel(s) {
  return s >= 80 ? 'Excelente' : s >= 60 ? 'Bom' : s >= 40 ? 'Regular' : 'Crítico';
}

/* ============================================================
   PAGE: DESEMPENHO — Reescrito completamente
   ============================================================ */
async function initDesempenho() {
  const profile = await Auth.requireAuth();
  if (!profile || profile.tier !== 'diretoria') {
    window.location.href = 'dashboard.html'; return;
  }
  await renderSidebar('desempenho');
  await renderTopBar('Desempenho', profile);

  const content = document.getElementById('pageContent');
  Utils.showLoading(content, 'Carregando painel...');

  /* ── Mês atual e seletor ── */
  const now = new Date();
  let selectedMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  let activeTab = 'membros';

  /* ── Buscar todos os dados em paralelo ── */
  async function fetchAll(month) {
    const [y, m] = month.split('-').map(Number);
    const monthStart = new Date(y, m-1, 1).toISOString();
    const monthEnd   = new Date(y, m, 0, 23, 59, 59).toISOString();

    const [r1, r2, r3, r4, r5, r6, r7] = await Promise.all([
      // Membros ativos
      db.from('profiles').select('id,name,role,initials,color,avatar_url,tier,join_date,created_at').eq('status','ativo').order('name'),
      // Todas as atividades (para calcular taxa)
      db.from('activities').select('id,assigned_to,status,title,deadline,closes_at'),
      // Eventos do mês
      db.from('events').select('id,title,event_date,event_time,type,mandatory,created_by,helper_id,is_private,description').gte('event_date', monthStart.split('T')[0]).lte('event_date', monthEnd.split('T')[0]).order('event_date', {ascending:false}),
      // Presenças em eventos do mês
      db.from('event_presencas').select('event_id,membro_id,status'),
      // Respostas de atividades no mês (para inatividade)
      db.from('activity_responses').select('user_id,created_at').gte('created_at', monthStart).lte('created_at', monthEnd),
      // Todos os eventos (para taxa de participação geral)
      db.from('events').select('id,event_date,mandatory,is_private').eq('is_private', false),
      // Premiações
      db.from('premiacoes').select('user_id').gte('created_at', monthStart).lte('created_at', monthEnd),
    ]);

    return {
      membros:      r1.data || [],
      atividades:   r2.data || [],
      eventosMes:   r3.data || [],
      presencas:    r4.data || [],
      respostasMes: r5.data || [],
      todosEventos: r6.data || [],
      premiacoes:   r7.data || [],
    };
  }

  /* ── Render principal ── */
  async function render() {
    Utils.showLoading(content, 'Calculando desempenho...');

    let data;
    try { data = await fetchAll(selectedMonth); }
    catch(e) { content.innerHTML = `<div class="dp-empty"><i class="fa-solid fa-triangle-exclamation"></i><span>Erro ao carregar: ${e.message}</span></div>`; return; }

    const { membros, atividades, eventosMes, presencas, respostasMes, todosEventos, premiacoes } = data;

    /* ── Calcular métricas por membro ── */
    const presencasPorMembro = {};
    presencas.forEach(p => {
      if (!presencasPorMembro[p.membro_id]) presencasPorMembro[p.membro_id] = { conf:0, aus:0, just:0, total:0 };
      presencasPorMembro[p.membro_id][p.status === 'confirmado' ? 'conf' : p.status === 'ausente' ? 'aus' : 'just']++;
      presencasPorMembro[p.membro_id].total++;
    });

    const atsPorMembro = {};
    atividades.forEach(a => {
      if (!atsPorMembro[a.assigned_to]) atsPorMembro[a.assigned_to] = { total:0, concluidas:0, pendentes:0, andamento:0, atrasadas:0 };
      atsPorMembro[a.assigned_to].total++;
      if (a.status === 'Concluída')      atsPorMembro[a.assigned_to].concluidas++;
      else if (a.status === 'Pendente')  atsPorMembro[a.assigned_to].pendentes++;
      else if (a.status === 'Em andamento') atsPorMembro[a.assigned_to].andamento++;
      const d = new Date(a.closes_at || (a.deadline+'T23:59:59'));
      if (d < new Date() && a.status !== 'Concluída' && a.status !== 'Cancelada') atsPorMembro[a.assigned_to].atrasadas++;
    });

    const activeUserIds = new Set(respostasMes.map(r => r.user_id));
    const eventosPublicos = todosEventos.filter(e => !e.is_private);
    const eventosPublicosMes = eventosMes.filter(e => !e.is_private);
    const premiacoesPorMembro = {};
    premiacoes.forEach(p => { premiacoesPorMembro[p.user_id] = (premiacoesPorMembro[p.user_id]||0)+1; });

    // Mapa de criadores/helpers de eventos
    const eventContrib = {}; // user_id → { criou: N, ajudou: N }
    eventosMes.forEach(ev => {
      if (ev.created_by) {
        if (!eventContrib[ev.created_by]) eventContrib[ev.created_by] = { criou:0, ajudou:0 };
        eventContrib[ev.created_by].criou++;
      }
      if (ev.helper_id) {
        if (!eventContrib[ev.helper_id]) eventContrib[ev.helper_id] = { criou:0, ajudou:0 };
        eventContrib[ev.helper_id].ajudou++;
      }
    });

    /* ── Score de cada membro ── */
    const membrosScored = membros.map(m => {
      const acts     = atsPorMembro[m.id] || { total:0, concluidas:0, pendentes:0, andamento:0, atrasadas:0 };
      const pres     = presencasPorMembro[m.id] || { conf:0, aus:0, just:0, total:0 };
      const contrib  = eventContrib[m.id] || { criou:0, ajudou:0 };
      const taxaActs = acts.total > 0 ? Math.round((acts.concluidas / acts.total) * 100) : (acts.total === 0 ? 50 : 0); // sem atividades = neutro
      const taxaPres = eventosPublicos.length > 0 ? Math.round((pres.conf / eventosPublicos.length) * 100) : 100;
      // Bônus por contribuição em eventos
      const bonusEvento = Math.min(10, contrib.criou * 4 + contrib.ajudou * 2);
      const score = Math.min(100, Math.round((taxaActs * 0.55) + (taxaPres * 0.35) + (bonusEvento * 0.10 * 10)));
      return { ...m, acts, pres, contrib, taxaActs, taxaPres, score, ativo: activeUserIds.has(m.id), premiacoes: premiacoesPorMembro[m.id]||0 };
    }).sort((a,b) => b.score - a.score);

    /* ── Score geral da Ordem ── */
    const scoreOrdem = membrosScored.length > 0
      ? Math.round(membrosScored.reduce((s,m) => s+m.score, 0) / membrosScored.length)
      : 0;
    const colorOrdem = scoreColor(scoreOrdem);
    const labelOrdem = scoreLabel(scoreOrdem);

    /* ── Métricas globais ── */
    const totalActs = atividades.length;
    const concluidas = atividades.filter(a=>a.status==='Concluída').length;
    const taxaGeral = totalActs > 0 ? Math.round((concluidas/totalActs)*100) : 0;
    const presConfTotal = presencas.filter(p=>p.status==='confirmado').length;
    const taxaPresGeral = eventosPublicos.length > 0 && membros.length > 0
      ? Math.round((presConfTotal / (eventosPublicos.length * membros.length)) * 100)
      : 0;
    const membrosInativos = membrosScored.filter(m => !m.ativo);

    /* ── Alertas inteligentes ── */
    const alertas = buildAlertas(membrosScored, atividades, eventosMes, presencas, eventosPublicos, membrosInativos);

    /* ── Meses disponíveis para seletor ── */
    const months = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const lbl = d.toLocaleDateString('pt-BR', {month:'long', year:'numeric'});
      months.push({ val, lbl: lbl.charAt(0).toUpperCase()+lbl.slice(1) });
    }

    /* ── Render HTML ── */
    content.innerHTML = `
      <div class="dp-page">

        <!-- Cabeçalho -->
        <div class="page-header" style="margin-bottom:0">
          <div>
            <div class="page-header-title">Painel de Desempenho</div>
            <div class="page-header-sub">Análise completa da Masayoshi Order</div>
          </div>
          <div class="dp-month-sel">
            <i class="fa-regular fa-calendar" style="color:var(--gold)"></i>
            <select id="dpMonthSel">
              ${months.map(m=>`<option value="${m.val}" ${m.val===selectedMonth?'selected':''}>${m.lbl}</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- Hero Score -->
        <div class="dp-hero card-enter">
          <div class="dp-hero-inner">
            <div class="dp-hero-score">
              <div class="dp-hero-label">
                <i class="fa-solid fa-chart-line" style="color:var(--gold)"></i>
                Desempenho da Ordem
              </div>
              <div class="dp-score-display">
                <div class="dp-score-num" style="color:${colorOrdem}">${scoreOrdem}</div>
                <div class="dp-score-denom">/ 100</div>
              </div>
              <div class="dp-score-label-text" style="background:${colorOrdem}18;color:${colorOrdem};border:1px solid ${colorOrdem}35">
                ${labelOrdem}
              </div>
              <div class="dp-score-track">
                <div class="dp-score-fill" id="dpScoreFill" style="width:0%;background:linear-gradient(90deg,${colorOrdem}66,${colorOrdem})"></div>
              </div>
              <div style="font-size:.68rem;color:var(--text-3);margin-top:10px">
                Média proporcional de ${membrosScored.length} membros · Atividades 55% · Presença 35% · Eventos 10%
              </div>
            </div>
            <div class="dp-hero-metrics">
              <div class="dp-hm">
                <div class="dp-hm-val" style="color:var(--gold)">${membros.length}</div>
                <div class="dp-hm-lbl">Membros Ativos</div>
                <div class="dp-hm-sub">${membrosInativos.length} inativos no mês</div>
              </div>
              <div class="dp-hm">
                <div class="dp-hm-val" style="color:${taxaGeral>=70?'#10b981':taxaGeral>=40?'#f59e0b':'#ef4444'}">${taxaGeral}%</div>
                <div class="dp-hm-lbl">Conclusão Geral</div>
                <div class="dp-hm-sub">${concluidas} de ${totalActs} atividades</div>
              </div>
              <div class="dp-hm">
                <div class="dp-hm-val" style="color:${taxaPresGeral>=70?'#10b981':taxaPresGeral>=40?'#f59e0b':'#ef4444'}">${taxaPresGeral}%</div>
                <div class="dp-hm-lbl">Taxa de Presença</div>
                <div class="dp-hm-sub">${eventosPublicosMes.length} evento${eventosPublicosMes.length!==1?'s':''} no mês</div>
              </div>
              <div class="dp-hm">
                <div class="dp-hm-val" style="color:#a78bfa">${alertas.length}</div>
                <div class="dp-hm-lbl">Alertas Ativos</div>
                <div class="dp-hm-sub">${alertas.filter(a=>a.level==='danger').length} crítico${alertas.filter(a=>a.level==='danger').length!==1?'s':''}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Tabs -->
        <div class="dp-tabs card-enter">
          <button class="dp-tab ${activeTab==='membros'?'active':''}" data-tab="membros">
            <i class="fa-solid fa-users"></i> Membros
          </button>
          <button class="dp-tab ${activeTab==='alertas'?'active':''}" data-tab="alertas">
            <i class="fa-solid fa-triangle-exclamation"></i> Alertas
            ${alertas.filter(a=>a.level==='danger').length>0?`<span style="background:#ef4444;color:#fff;font-size:.6rem;padding:1px 6px;border-radius:20px;font-weight:700">${alertas.filter(a=>a.level==='danger').length}</span>`:''}
          </button>
          <button class="dp-tab ${activeTab==='eventos'?'active':''}" data-tab="eventos">
            <i class="fa-solid fa-calendar-days"></i> Eventos
          </button>
        </div>

        <!-- Conteúdo das tabs -->
        <div id="dpTabContent" class="card-enter"></div>

      </div>

      <!-- Modal de detalhe do membro -->
      <div class="modal-overlay" id="dpMemberModal">
        <div class="modal" style="max-width:600px">
          <div class="modal-header">
            <div class="modal-title" id="dpMemberModalTitle">Desempenho</div>
            <button class="modal-close" id="dpMemberModalClose"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="modal-body" id="dpMemberModalBody" style="padding:0"></div>
        </div>
      </div>
    `;

    // Animar score
    setTimeout(() => {
      const fill = document.getElementById('dpScoreFill');
      if (fill) fill.style.width = scoreOrdem + '%';
    }, 200);

    // Render tab ativa
    function renderTab(tab) {
      activeTab = tab;
      document.querySelectorAll('.dp-tab').forEach(el => el.classList.toggle('active', el.dataset.tab===tab));
      const tabContent = document.getElementById('dpTabContent');
      if (!tabContent) return;
      if (tab === 'membros')  renderMembrosTab(tabContent, membrosScored, eventosPublicos);
      if (tab === 'alertas')  renderAlertasTab(tabContent, alertas, membrosScored);
      if (tab === 'eventos')  renderEventosTab(tabContent, eventosMes, membros, profile);
    }

    content.querySelectorAll('.dp-tab').forEach(btn => {
      btn.addEventListener('click', () => renderTab(btn.dataset.tab));
    });

    document.getElementById('dpMonthSel')?.addEventListener('change', e => {
      selectedMonth = e.target.value;
      render();
    });

    const memberModal = document.getElementById('dpMemberModal');
    document.getElementById('dpMemberModalClose')?.addEventListener('click', () => memberModal?.classList.remove('open'));
    memberModal?.addEventListener('click', e => { if (e.target===memberModal) memberModal.classList.remove('open'); });

    renderTab(activeTab);
  }

  /* ── Tab: Membros ── */
  function renderMembrosTab(el, membrosScored, eventosPublicos) {
    const searchId = 'dpMemberSearch';
    el.innerHTML = `
      <div class="dp-sec-header">
        <div class="dp-sec-title">
          <div class="dp-sec-title-icon" style="background:rgba(201,168,76,.12);border:1px solid rgba(201,168,76,.2);color:var(--gold)">
            <i class="fa-solid fa-ranking-star"></i>
          </div>
          Desempenho Individual
        </div>
        <input type="text" id="${searchId}" class="form-input" placeholder="Buscar membro..." style="width:200px;padding:7px 12px;font-size:.8rem">
      </div>
      <div class="dp-members-grid" id="dpMembersGrid">
        ${membrosScored.map((m, i) => renderMemberRow(m, i, membrosScored.length)).join('')}
      </div>`;

    document.getElementById(searchId)?.addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      el.querySelectorAll('.dp-member-row').forEach(row => {
        row.style.display = (row.dataset.name||'').includes(q) ? '' : 'none';
      });
    });

    el.querySelectorAll('.dp-member-row').forEach(row => {
      row.addEventListener('click', () => {
        const m = membrosScored.find(x=>x.id===row.dataset.id);
        if (m) openMemberDetailModal(m, eventosPublicos);
      });
    });
  }

  function renderMemberRow(m, idx, total) {
    const sc = m.score;
    const clr = scoreColor(sc);
    const lbl = scoreLabel(sc);
    const ac = m.avatar_url ? `<img src="${m.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : (m.initials||Utils.getInitials(m.name));
    const rankClass = idx===0?'rank-1':idx===1?'rank-2':idx===2?'rank-3':sc<40?'rank-low':'';

    const tags = [];
    if (!m.ativo) tags.push(`<span class="dp-tag danger">Inativo</span>`);
    if (m.acts.atrasadas > 0) tags.push(`<span class="dp-tag danger">${m.acts.atrasadas} atrasada${m.acts.atrasadas>1?'s':''}</span>`);
    if (m.contrib.criou > 0) tags.push(`<span class="dp-tag info">Criou ${m.contrib.criou} evento${m.contrib.criou>1?'s':''}</span>`);
    if (m.premiacoes > 0) tags.push(`<span class="dp-tag good">🏆 ${m.premiacoes} prêmio${m.premiacoes>1?'s':''}</span>`);
    if (sc >= 90) tags.push(`<span class="dp-tag good">Destaque</span>`);

    return `
      <div class="dp-member-row ${rankClass} card-enter" data-id="${m.id}" data-name="${(m.name||'').toLowerCase()}" style="cursor:pointer">
        <div class="avatar" style="width:44px;height:44px;font-size:.8rem;background:linear-gradient(135deg,${m.color||'#7f1d1d'},#1a1a1a)">
          ${ac}
        </div>
        <div class="dp-member-info">
          <div class="dp-member-name">${Utils.escapeHtml(m.name)}</div>
          <div class="dp-member-role">${Utils.escapeHtml(m.role)}</div>
          ${tags.length ? `<div class="dp-member-tags" style="margin-top:5px">${tags.join('')}</div>` : ''}
        </div>
        <div class="dp-member-right">
          <div class="dp-member-score-val" style="color:${clr}">${sc}<span style="font-size:.65rem;color:var(--text-3);font-weight:400">/100</span></div>
          <div class="dp-bar-wrap">
            <div class="dp-bar-fill" style="width:${sc}%;background:linear-gradient(90deg,${clr}88,${clr})"></div>
          </div>
          <div style="font-size:.65rem;color:${clr};font-weight:700;letter-spacing:.04em">${lbl}</div>
        </div>
        <div class="dp-rank-badge">${idx<3?['🥇','🥈','🥉'][idx]:`${idx+1}º`}</div>
      </div>`;
  }

  function openMemberDetailModal(m, eventosPublicos) {
    const modal = document.getElementById('dpMemberModal');
    const body  = document.getElementById('dpMemberModalBody');
    const title = document.getElementById('dpMemberModalTitle');
    if (!modal||!body) return;

    const clr = scoreColor(m.score);
    title.innerHTML = `<i class="fa-solid fa-chart-line" style="color:${clr}"></i> ${Utils.escapeHtml(m.name)}`;

    const taxaActs = m.acts.total>0?Math.round((m.acts.concluidas/m.acts.total)*100):0;
    const taxaPres = eventosPublicos.length>0?Math.round((m.pres.conf/eventosPublicos.length)*100):100;

    body.innerHTML = `
      <div style="padding:16px 24px;background:linear-gradient(135deg,${m.color||'#7f1d1d'}18,transparent);border-bottom:1px solid rgba(255,255,255,.07)">
        <div style="display:flex;align-items:center;gap:14px">
          <div class="avatar" style="width:52px;height:52px;font-size:.9rem;background:linear-gradient(135deg,${m.color||'#7f1d1d'},#1a1a1a);border:2px solid ${clr}44">
            ${m.avatar_url?`<img src="${m.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:(m.initials||Utils.getInitials(m.name))}
          </div>
          <div>
            <div style="font-weight:700;font-size:.95rem">${Utils.escapeHtml(m.name)}</div>
            <div style="font-size:.73rem;color:var(--text-3)">${Utils.escapeHtml(m.role)}</div>
          </div>
          <div style="margin-left:auto;text-align:right">
            <div style="font-family:'Cinzel',serif;font-size:2rem;font-weight:700;color:${clr};line-height:1">${m.score}</div>
            <div style="font-size:.65rem;color:${clr};font-weight:700">${scoreLabel(m.score)}</div>
          </div>
        </div>
        <div style="margin-top:12px">
          <div class="dp-score-track" style="height:6px">
            <div class="dp-score-fill" style="width:${m.score}%;background:linear-gradient(90deg,${clr}66,${clr})"></div>
          </div>
        </div>
      </div>
      <div class="dp-detail-grid" style="padding-top:18px">
        <div class="dp-detail-stat">
          <div class="dp-detail-stat-val" style="color:${taxaActs>=70?'#10b981':taxaActs>=40?'#f59e0b':'#ef4444'}">${taxaActs}%</div>
          <div class="dp-detail-stat-lbl">Taxa de Atividades</div>
          <div style="font-size:.7rem;color:var(--text-3);margin-top:4px">${m.acts.concluidas} / ${m.acts.total} concluídas</div>
        </div>
        <div class="dp-detail-stat">
          <div class="dp-detail-stat-val" style="color:${taxaPres>=70?'#10b981':taxaPres>=40?'#f59e0b':'#ef4444'}">${taxaPres}%</div>
          <div class="dp-detail-stat-lbl">Taxa de Presença</div>
          <div style="font-size:.7rem;color:var(--text-3);margin-top:4px">${m.pres.conf} confirmadas · ${eventosPublicos.length} eventos</div>
        </div>
        <div class="dp-detail-stat">
          <div class="dp-detail-stat-val" style="color:#ef4444">${m.acts.atrasadas}</div>
          <div class="dp-detail-stat-lbl">Atividades Atrasadas</div>
          <div style="font-size:.7rem;color:var(--text-3);margin-top:4px">${m.acts.pendentes} pendentes · ${m.acts.andamento} em andamento</div>
        </div>
        <div class="dp-detail-stat">
          <div class="dp-detail-stat-val" style="color:#60a5fa">${m.contrib.criou + m.contrib.ajudou}</div>
          <div class="dp-detail-stat-lbl">Contribuição Eventos</div>
          <div style="font-size:.7rem;color:var(--text-3);margin-top:4px">${m.contrib.criou} criou · ${m.contrib.ajudou} co-criou</div>
        </div>
      </div>
      <div style="padding:0 24px 20px">
        <div style="font-size:.7rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">Composição do Score</div>
        ${[
          { lbl:'Atividades (55%)', val: Math.round(taxaActs*0.55), color:scoreColor(taxaActs), max:55 },
          { lbl:'Presença (35%)',   val: Math.round(taxaPres*0.35), color:scoreColor(taxaPres), max:35 },
          { lbl:'Eventos (10%)',    val: Math.min(10,m.contrib.criou*4+m.contrib.ajudou*2), color:'#60a5fa', max:10 },
        ].map(row=>`
          <div style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;font-size:.74rem;color:var(--text-3);margin-bottom:4px">
              <span>${row.lbl}</span><span style="color:${row.color};font-weight:700">+${row.val}</span>
            </div>
            <div style="height:4px;background:rgba(255,255,255,.06);border-radius:99px;overflow:hidden">
              <div style="width:${(row.val/row.max)*100}%;height:100%;background:${row.color};border-radius:99px"></div>
            </div>
          </div>`).join('')}
        <div style="display:flex;align-items:center;justify-content:space-between;padding-top:10px;border-top:1px solid rgba(255,255,255,.06)">
          <span style="font-size:.78rem;color:var(--text-3)">Score Total</span>
          <span style="font-family:'Cinzel',serif;font-size:1.2rem;font-weight:700;color:${clr}">${m.score} / 100</span>
        </div>
      </div>
      ${!m.ativo ? `<div style="margin:0 24px 20px;padding:12px 14px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);border-radius:8px;font-size:.8rem;color:#ef4444;display:flex;gap:8px;align-items:center"><i class="fa-solid fa-triangle-exclamation"></i> Membro inativo no período selecionado</div>` : ''}
    `;
    modal.classList.add('open');
  }

  /* ── Tab: Alertas ── */
  function renderAlertasTab(el, alertas, membrosScored) {
    if (!alertas.length) {
      el.innerHTML = `<div class="dp-empty"><i class="fa-solid fa-shield-check" style="color:#10b981;font-size:2rem"></i><span>Nenhum alerta no período</span></div>`;
      return;
    }

    const CATS = {};
    alertas.forEach(a => {
      if (!CATS[a.cat]) CATS[a.cat] = { icon: a.catIcon, color: a.catColor, items: [] };
      CATS[a.cat].items.push(a);
    });

    el.innerHTML = `
      <div class="dp-sec-header">
        <div class="dp-sec-title">
          <div class="dp-sec-title-icon" style="background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.22);color:#ef4444">
            <i class="fa-solid fa-triangle-exclamation"></i>
          </div>
          ${alertas.length} Alerta${alertas.length>1?'s':''} Ativos
        </div>
      </div>
      <div class="dp-alerts-grid">
        ${Object.entries(CATS).map(([cat, meta]) => `
          <div style="margin-bottom:6px">
            <div style="font-size:.65rem;color:${meta.color};text-transform:uppercase;letter-spacing:.1em;font-weight:700;margin-bottom:7px;display:flex;align-items:center;gap:7px">
              <i class="fa-solid ${meta.icon}" style="font-size:.65rem"></i> ${cat}
              <span style="color:var(--text-3);font-weight:400">(${meta.items.length})</span>
            </div>
            ${meta.items.map(a => `
              <div class="dp-alert ${a.level}" data-alert-id="${a.id||''}">
                <div class="dp-alert-icon ${a.level}"><i class="fa-solid ${a.icon}"></i></div>
                <div class="dp-alert-body">
                  <div class="dp-alert-tag ${a.level}">${a.tag}</div>
                  <div class="dp-alert-title">${a.title}</div>
                  ${a.detail ? `<div class="dp-alert-detail">${a.detail}</div>` : ''}
                  ${a.members?.length ? `
                    <div class="dp-alert-members">
                      ${a.members.slice(0,5).map(m => `
                        <span class="dp-alert-chip">
                          <div class="avatar" style="background:linear-gradient(135deg,${m.color||'#7f1d1d'},#1a1a1a);width:18px;height:18px;font-size:.45rem">${m.initials||Utils.getInitials(m.name)}</div>
                          ${Utils.escapeHtml(m.name)}
                        </span>`).join('')}
                      ${a.members.length>5?`<span class="dp-alert-chip">+${a.members.length-5}</span>`:''}
                    </div>` : ''}
                </div>
              </div>`).join('')}
          </div>`).join('')}
      </div>`;
  }

  /* ── Tab: Eventos ── */
  function renderEventosTab(el, eventosMes, membros, profile) {
    const publicos = eventosMes.filter(e => !e.is_private);
    const privados = eventosMes.filter(e => e.is_private);

    el.innerHTML = `
      <div class="dp-sec-header">
        <div class="dp-sec-title">
          <div class="dp-sec-title-icon" style="background:rgba(96,165,250,.12);border:1px solid rgba(96,165,250,.22);color:#60a5fa">
            <i class="fa-solid fa-calendar-days"></i>
          </div>
          Eventos do Período
        </div>
        <button class="btn btn-primary btn-sm" id="dpNewEventBtn">
          <i class="fa-solid fa-plus"></i> Novo Evento
        </button>
      </div>

      ${publicos.length > 0 ? `
        <div style="font-size:.68rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.1em;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:7px">
          <i class="fa-solid fa-calendar"></i> Eventos Públicos (${publicos.length})
        </div>
        <div class="dp-events-list" style="margin-bottom:22px">
          ${publicos.map(ev => renderEventCard(ev, membros, false)).join('')}
        </div>` : `<div class="dp-empty" style="padding:24px"><i class="fa-solid fa-calendar-xmark" style="font-size:1.5rem;opacity:.3"></i><span>Nenhum evento público no período</span></div>`}

      <div style="font-size:.68rem;color:#c084fc;text-transform:uppercase;letter-spacing:.1em;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:7px;margin-top:4px">
        <i class="fa-solid fa-lock" style="font-size:.65rem"></i> Reuniões Internas — Diretoria (${privados.length})
        <span class="dp-private-badge"><i class="fa-solid fa-eye-slash" style="font-size:.55rem"></i> Privado</span>
      </div>
      ${privados.length > 0 ? `
        <div class="dp-events-list">
          ${privados.map(ev => renderEventCard(ev, membros, true)).join('')}
        </div>` : `
        <div style="padding:16px;background:rgba(168,85,247,.08);border:1px solid rgba(168,85,247,.2);border-radius:9px;font-size:.8rem;color:var(--text-3);display:flex;align-items:center;gap:10px">
          <i class="fa-solid fa-lock" style="color:#c084fc"></i>
          Nenhuma reunião interna registrada. Use o botão acima para criar.
        </div>`}

      <!-- New Event Modal -->
      <div class="modal-overlay" id="dpNewEventModal">
        <div class="modal" style="max-width:560px">
          <div class="modal-header">
            <div class="modal-title"><i class="fa-solid fa-calendar-plus" style="color:var(--gold)"></i> Novo Evento</div>
            <button class="modal-close" id="dpNewEventClose"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="modal-body">
            ${buildNewEventForm(membros)}
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" id="dpNewEventCancel">Cancelar</button>
            <button class="btn btn-primary" id="dpNewEventSave"><i class="fa-solid fa-calendar-plus"></i> Criar Evento</button>
          </div>
        </div>
      </div>
    `;

    // Modal de novo evento
    const evModal = el.querySelector('#dpNewEventModal') || document.getElementById('dpNewEventModal');
    el.querySelector('#dpNewEventBtn')?.addEventListener('click', () => evModal?.classList.add('open'));
    el.querySelector('#dpNewEventClose')?.addEventListener('click', () => evModal?.classList.remove('open'));
    el.querySelector('#dpNewEventCancel')?.addEventListener('click', () => evModal?.classList.remove('open'));
    evModal?.addEventListener('click', e => { if(e.target===evModal) evModal.classList.remove('open'); });

    // Toggle privado
    el.querySelector('#dpEvPrivate')?.addEventListener('change', e => {
      const privSection = el.querySelector('#dpEvPrivateSection');
      if (privSection) privSection.style.display = e.target.checked ? 'block' : 'none';
    });

    // Salvar evento
    el.querySelector('#dpNewEventSave')?.addEventListener('click', async () => {
      const title      = el.querySelector('#dpEvTitle')?.value.trim();
      const date       = el.querySelector('#dpEvDate')?.value;
      const time       = el.querySelector('#dpEvTime')?.value || '19:00';
      const type       = el.querySelector('#dpEvType')?.value;
      const desc       = el.querySelector('#dpEvDesc')?.value.trim();
      const mandatory  = el.querySelector('#dpEvMandatory')?.checked || false;
      const helperId   = el.querySelector('#dpEvHelper')?.value || null;
      const isPrivate  = el.querySelector('#dpEvPrivate')?.checked || false;
      const weight     = parseInt(el.querySelector('#dpEvWeight')?.value||'1') || 1;

      if (!title || !date) { Utils.showToast('Preencha título e data.','error'); return; }

      const btn = el.querySelector('#dpNewEventSave');
      if (btn) { btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-circle-notch fa-spin"></i> Criando...'; }

      const payload = {
        title, event_date: date, event_time: time, type, description: desc||null,
        mandatory, created_by: profile.id,
        helper_id: helperId||null,
        is_private: isPrivate,
        performance_weight: weight,
      };

      const { error } = await db.from('events').insert(payload);

      if (!error) {
        evModal?.classList.remove('open');
        Utils.showToast('Evento criado!');
        if (!isPrivate) {
          await db.rpc('notify_member', { p_user_id: null, p_message: `Novo evento: "${title}" em ${Utils.formatDate(date)}`, p_type: 'event', p_icon: '🗓️' });
        }
        render(); // Re-render
      } else {
        Utils.showToast('Erro ao criar: ' + (error.message||'tente novamente'), 'error');
        if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-calendar-plus"></i> Criar Evento'; }
      }
    });
  }

  function buildNewEventForm(membros) {
    const memOptions = membros.filter(m=>m.tier!=='diretoria').map(m=>
      `<option value="${m.id}">${Utils.escapeHtml(m.name)} — ${Utils.escapeHtml(m.role)}</option>`
    ).join('');
    return `
      <div class="form-group" style="margin-bottom:14px">
        <label class="form-label">Título *</label>
        <input class="form-input" id="dpEvTitle" placeholder="Nome do evento">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px">
        <div class="form-group">
          <label class="form-label">Data *</label>
          <input class="form-input" type="date" id="dpEvDate">
        </div>
        <div class="form-group">
          <label class="form-label">Horário</label>
          <input class="form-input" type="time" id="dpEvTime" value="19:00">
        </div>
        <div class="form-group">
          <label class="form-label">Tipo</label>
          <select class="form-input form-select" id="dpEvType">
            <option>Reunião</option><option>Treinamento</option>
            <option>Evento Social</option><option>Cerimonial</option><option>Outro</option>
          </select>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
        <div class="form-group">
          <label class="form-label"><i class="fa-solid fa-user-plus" style="color:var(--gold)"></i> Co-criador (opcional)</label>
          <select class="form-input form-select" id="dpEvHelper">
            <option value="">Nenhum</option>
            ${memOptions}
          </select>
          <div style="font-size:.68rem;color:var(--text-3);margin-top:4px">Recebe crédito no desempenho</div>
        </div>
        <div class="form-group">
          <label class="form-label"><i class="fa-solid fa-star" style="color:var(--gold)"></i> Peso no Desempenho</label>
          <select class="form-input form-select" id="dpEvWeight">
            <option value="1">1 — Normal</option>
            <option value="2">2 — Importante</option>
            <option value="3">3 — Crítico</option>
          </select>
        </div>
      </div>
      <div class="form-group" style="margin-bottom:14px">
        <label class="form-label">Descrição</label>
        <textarea class="form-input form-textarea" id="dpEvDesc" style="min-height:80px" placeholder="Detalhes do evento..."></textarea>
      </div>
      <div style="display:flex;gap:18px;margin-bottom:4px;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:.83rem;color:var(--text-2)">
          <input type="checkbox" id="dpEvMandatory" style="accent-color:var(--red-bright)"> Presença obrigatória
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:.83rem;color:#c084fc">
          <input type="checkbox" id="dpEvPrivate" style="accent-color:#a855f7"> 
          <i class="fa-solid fa-lock" style="font-size:.75rem"></i> Reunião interna (privado)
        </label>
      </div>
      <div id="dpEvPrivateSection" style="display:none;margin-top:12px;padding:12px;background:rgba(168,85,247,.08);border:1px solid rgba(168,85,247,.2);border-radius:8px;font-size:.78rem;color:#c084fc">
        <i class="fa-solid fa-eye-slash"></i> Este evento será visível apenas para a Diretoria e não aparecerá para membros comuns.
      </div>
    `;
  }

  function renderEventCard(ev, membros, isPrivate) {
    const d = new Date(ev.event_date+'T00:00:00');
    const dia = String(d.getDate()).padStart(2,'0');
    const mes = d.toLocaleDateString('pt-BR',{month:'short'}).replace('.','');
    const criador = membros.find(m=>m.id===ev.created_by);
    const helper  = membros.find(m=>m.id===ev.helper_id);
    return `
      <div class="dp-event-card">
        <div class="dp-event-date-box">
          <div class="dp-event-date-day">${dia}</div>
          <div class="dp-event-date-mon">${mes}</div>
        </div>
        <div class="dp-event-info">
          <div class="dp-event-title">${Utils.escapeHtml(ev.title)}</div>
          <div class="dp-event-meta">
            <span><i class="fa-regular fa-clock"></i> ${ev.event_time||'—'}</span>
            <span><i class="fa-solid fa-tag"></i> ${Utils.escapeHtml(ev.type||'Evento')}</span>
            ${criador?`<span><i class="fa-solid fa-user-pen"></i> ${Utils.escapeHtml(criador.name)}</span>`:''}
            ${helper?`<span style="color:var(--gold)"><i class="fa-solid fa-handshake"></i> ${Utils.escapeHtml(helper.name)}</span>`:''}
          </div>
        </div>
        <div class="dp-event-badges">
          ${ev.mandatory?`<span class="badge badge-red" style="font-size:.6rem">Obrig.</span>`:''}
          ${isPrivate?`<span class="dp-private-badge"><i class="fa-solid fa-lock" style="font-size:.55rem"></i> Privado</span>`:''}
          ${ev.performance_weight>1?`<span class="badge badge-gold" style="font-size:.6rem">Peso ${ev.performance_weight}</span>`:''}
        </div>
      </div>`;
  }

  /* ── Render inicial ── */
  await render();
}

/* ============================================================
   HELPER: Construir alertas inteligentes
   ============================================================ */
function buildAlertas(membrosScored, atividades, eventosMes, presencas, eventosPublicos, membrosInativos) {
  const alertas = [];
  const today = new Date();

  // ── Cat: Membros
  if (membrosInativos.length > 0) {
    alertas.push({
      id:'inativo', level:'danger', cat:'Membros', catIcon:'fa-users', catColor:'#a78bfa',
      icon:'fa-user-clock', tag:'Inativo',
      title:`${membrosInativos.length} membro${membrosInativos.length>1?'s':''} sem atividade no período`,
      detail:'Membros que não responderam nenhuma atividade no mês selecionado.',
      members: membrosInativos,
    });
  }

  const criticos = membrosScored.filter(m => m.score < 40 && m.ativo);
  if (criticos.length > 0) {
    alertas.push({
      id:'critico', level:'warning', cat:'Membros', catIcon:'fa-users', catColor:'#a78bfa',
      icon:'fa-chart-line-down', tag:'Baixo Score',
      title:`${criticos.length} membro${criticos.length>1?'s':''} com desempenho abaixo de 40%`,
      detail: criticos.map(m=>`${m.name} (${m.score}%)`).join(', '),
      members: criticos,
    });
  }

  const semParticipacaoEvento = membrosScored.filter(m => m.pres.conf === 0 && eventosPublicos.length > 0 && m.ativo);
  if (semParticipacaoEvento.length > 0) {
    alertas.push({
      id:'sem-pres', level:'info', cat:'Membros', catIcon:'fa-users', catColor:'#a78bfa',
      icon:'fa-calendar-xmark', tag:'Ausente',
      title:`${semParticipacaoEvento.length} membro${semParticipacaoEvento.length>1?'s':''} sem presença em nenhum evento`,
      detail:`De ${eventosPublicos.length} eventos disponíveis.`,
      members: semParticipacaoEvento,
    });
  }

  // ── Cat: Atividades
  const atrasadas = atividades.filter(a => {
    const d = new Date(a.closes_at||(a.deadline+'T23:59:59'));
    return d < today && a.status!=='Concluída' && a.status!=='Cancelada';
  });
  if (atrasadas.length > 0) {
    alertas.push({
      id:'atrasadas', level:'danger', cat:'Atividades', catIcon:'fa-list-check', catColor:'#f59e0b',
      icon:'fa-clock', tag:'Atrasado',
      title:`${atrasadas.length} atividade${atrasadas.length>1?'s':''} com prazo vencido`,
      detail: atrasadas.slice(0,3).map(a=>a.title).join(', ')+(atrasadas.length>3?` e mais ${atrasadas.length-3}`:''),
    });
  }

  const vencendo = atividades.filter(a => {
    const d = new Date(a.closes_at||(a.deadline+'T23:59:59'));
    const diff = (d-today)/86400000;
    return diff>=0 && diff<=3 && a.status!=='Concluída';
  });
  if (vencendo.length > 0) {
    alertas.push({
      id:'vencendo', level:'warning', cat:'Atividades', catIcon:'fa-list-check', catColor:'#f59e0b',
      icon:'fa-hourglass-half', tag:'Urgente',
      title:`${vencendo.length} atividade${vencendo.length>1?'s':''} vencendo em até 3 dias`,
      detail: vencendo.map(a=>a.title).join(', '),
    });
  }

  // ── Cat: Eventos
  const eventosSemPres = eventosMes.filter(e => {
    if (e.is_private) return false;
    const d = new Date(e.event_date+'T00:00:00');
    const diff = (d-today)/86400000;
    return diff>=0 && diff<=7 && !presencas.some(p=>p.event_id===e.id);
  });
  if (eventosSemPres.length > 0) {
    alertas.push({
      id:'ev-sem-pres', level:'warning', cat:'Eventos', catIcon:'fa-calendar-days', catColor:'#60a5fa',
      icon:'fa-calendar-exclamation', tag:'Presença',
      title:`${eventosSemPres.length} evento${eventosSemPres.length>1?'s':''} próximo${eventosSemPres.length>1?'s':''} sem controle de presença`,
      detail: eventosSemPres.map(e=>e.title).join(', '),
    });
  }

  const eventosSemDesc = eventosMes.filter(e => !e.description || e.description.trim().length < 15);
  if (eventosSemDesc.length > 0) {
    alertas.push({
      id:'ev-sem-desc', level:'info', cat:'Eventos', catIcon:'fa-calendar-days', catColor:'#60a5fa',
      icon:'fa-file-circle-exclamation', tag:'Incompleto',
      title:`${eventosSemDesc.length} evento${eventosSemDesc.length>1?'s':''} sem descrição`,
      detail: eventosSemDesc.slice(0,3).map(e=>e.title).join(', '),
    });
  }

  return alertas;
}

/* ============================================================
   PATCH: openNewEventModal em app.js — adiciona campos
   helper_id, is_private e performance_weight
   ============================================================ */
(function patchNewEventModal() {
  // Aguarda initEventos carregar e sobrescreve openNewEventModal
  const originalOpenNew = typeof openNewEventModal !== 'undefined' ? openNewEventModal : null;

  // Monkeypatch via globalThis depois do carregamento
  const observer = new MutationObserver(() => {
    if (typeof openNewEventModal === 'function' && openNewEventModal._patched) return;
    // já está definida — não há como sobrescrever funções declaradas com function
    // O patch é feito diretamente via modules4 no initDesempenho
  });
})();

/* ============================================================
   PATCH: eventos.html — adicionar campos helper e privado
   ao modal nativo de criação de eventos em app.js
   ============================================================ */
(function patchEventosPage() {
  document.addEventListener('DOMContentLoaded', () => {
    if (document.body.dataset.page !== 'eventos') return;

    // Observar quando o modal de novo evento for aberto
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('#newEventBtn, .new-event-perm-btn');
      if (!btn) return;
      // Aguardar o modal nativo renderizar
      setTimeout(async () => {
        const modal = document.getElementById('newEventModal');
        if (!modal) return;
        const body = modal.querySelector('.modal-body');
        if (!body || body.dataset.enhanced) return;
        body.dataset.enhanced = '1';

        // Buscar membros para o select
        const { data: membros } = await db.from('profiles')
          .select('id,name,role').eq('status','ativo').order('name');

        const extras = document.createElement('div');
        extras.style.cssText = 'border-top:1px solid var(--border-faint);padding-top:14px;margin-top:4px';
        extras.innerHTML = `
          <div style="font-size:.72rem;color:var(--gold);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">
            <i class="fa-solid fa-star"></i> Configurações Avançadas
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
            <div class="form-group">
              <label class="form-label"><i class="fa-solid fa-user-plus" style="color:var(--gold)"></i> Co-criador (opcional)</label>
              <select class="form-input form-select" id="ev-helper">
                <option value="">Nenhum</option>
                ${(membros||[]).map(m=>`<option value="${m.id}">${Utils.escapeHtml(m.name)} — ${Utils.escapeHtml(m.role)}</option>`).join('')}
              </select>
              <div style="font-size:.68rem;color:var(--text-3);margin-top:3px">Recebe crédito no desempenho</div>
            </div>
            <div class="form-group">
              <label class="form-label"><i class="fa-solid fa-star" style="color:var(--gold)"></i> Peso no Desempenho</label>
              <select class="form-input form-select" id="ev-weight">
                <option value="1">1 — Normal</option>
                <option value="2">2 — Importante</option>
                <option value="3">3 — Crítico</option>
              </select>
            </div>
          </div>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:.83rem;color:#c084fc;margin-bottom:4px">
            <input type="checkbox" id="ev-private" style="accent-color:#a855f7">
            <i class="fa-solid fa-lock" style="font-size:.75rem"></i> Reunião interna — visível apenas para Diretoria
          </label>
        `;
        body.appendChild(extras);

        // Patch no botão salvar do modal nativo
        const saveBtn = modal.querySelector('#newEventSave');
        if (saveBtn) {
          const originalOnClick = saveBtn.onclick;
          saveBtn.onclick = null;
          saveBtn.addEventListener('click', async () => {
            const title      = modal.querySelector('#ev-title')?.value.trim();
            const event_date = modal.querySelector('#ev-date')?.value;
            const event_time = modal.querySelector('#ev-time')?.value || '19:00';
            const type       = modal.querySelector('#ev-type')?.value;
            const description = modal.querySelector('#ev-desc')?.value.trim();
            const mandatory   = modal.querySelector('#ev-mandatory')?.checked || false;
            const helper_id   = modal.querySelector('#ev-helper')?.value || null;
            const is_private  = modal.querySelector('#ev-private')?.checked || false;
            const performance_weight = parseInt(modal.querySelector('#ev-weight')?.value||'1') || 1;

            if (!title || !event_date) { Utils.showToast('Preencha título e data.','error'); return; }
            saveBtn.disabled = true; saveBtn.textContent = 'Criando...';

            const session = await Auth.getSession();
            const { error } = await db.from('events').insert({
              title, event_date, event_time, type,
              description: description||null, mandatory,
              created_by: session?.user?.id,
              helper_id: helper_id||null,
              is_private, performance_weight,
            });

            if (!error) {
              modal.classList.remove('open');
              Utils.showToast('Evento criado!');
              if (!is_private) {
                await db.rpc('notify_member', { p_user_id: null, p_message: `Novo evento: "${title}" em ${Utils.formatDate(event_date)}`, p_type: 'event', p_icon: '🗓️' });
              }
              // Re-trigger load
              if (typeof loadEventos === 'function') loadEventos();
            } else {
              Utils.showToast('Erro ao criar: ' + (error.message||''), 'error');
              saveBtn.disabled = false; saveBtn.textContent = 'Criar Evento';
            }
          });
        }
      }, 150);
    });
  });
})();

/* ============================================================
   ROUTER — Módulos4
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if (page === 'desempenho') initDesempenho();
});
