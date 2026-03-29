/* ============================================================
   MSY PORTAL — MODULES4.JS v2.0
   Painel de Desempenho · Corrigido e Refatorado
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
    .dp-page { display:flex; flex-direction:column; gap:22px; }
    .dp-hero { background:linear-gradient(160deg,#0f0f16 0%,#0a0a0e 100%); border:1px solid rgba(201,168,76,.2); border-radius:var(--radius); padding:0; overflow:hidden; position:relative; }
    .dp-hero::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,transparent,rgba(201,168,76,.8) 30%,#c9a84c 50%,rgba(201,168,76,.8) 70%,transparent); }
    .dp-hero-inner { display:grid; grid-template-columns:1fr 1fr; gap:0; }
    .dp-hero-score { padding:28px 32px; border-right:1px solid rgba(255,255,255,.06); display:flex; flex-direction:column; justify-content:center; }
    .dp-hero-label { font-size:.7rem; color:var(--gold); letter-spacing:.12em; text-transform:uppercase; font-weight:700; margin-bottom:14px; display:flex; align-items:center; gap:8px; }
    .dp-score-display { display:flex; align-items:flex-end; gap:8px; margin-bottom:14px; }
    .dp-score-num { font-family:'Cinzel',serif; font-size:4rem; font-weight:700; line-height:1; }
    .dp-score-denom { font-size:1.1rem; color:var(--text-3); margin-bottom:8px; }
    .dp-score-label-text { font-size:.75rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; padding:3px 12px; border-radius:20px; margin-bottom:16px; display:inline-block; }
    .dp-score-track { height:8px; background:rgba(255,255,255,.07); border-radius:99px; overflow:hidden; }
    .dp-score-fill { height:100%; border-radius:99px; transition:width 1.2s cubic-bezier(.4,0,.2,1); }
    .dp-hero-metrics { padding:0; display:grid; grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr; }
    .dp-hm { padding:20px; border-bottom:1px solid rgba(255,255,255,.05); position:relative; }
    .dp-hm:nth-child(odd) { border-right:1px solid rgba(255,255,255,.05); }
    .dp-hm:nth-child(3),.dp-hm:nth-child(4) { border-bottom:none; }
    .dp-hm-val { font-family:'Cinzel',serif; font-size:1.6rem; font-weight:700; line-height:1; margin-bottom:4px; }
    .dp-hm-lbl { font-size:.65rem; color:var(--text-3); letter-spacing:.06em; text-transform:uppercase; }
    .dp-hm-sub { font-size:.7rem; color:var(--text-3); margin-top:3px; }
    .dp-tabs { display:flex; gap:4px; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.07); border-radius:calc(var(--radius) + 2px); padding:4px; }
    .dp-tab { flex:1; padding:9px 12px; border-radius:var(--radius); border:none; background:transparent; color:var(--text-3); font-size:.78rem; font-weight:600; cursor:pointer; transition:all .2s; display:flex; align-items:center; justify-content:center; gap:7px; letter-spacing:.03em; }
    .dp-tab:hover { color:var(--text-1); background:rgba(255,255,255,.04); }
    .dp-tab.active { background:linear-gradient(135deg,rgba(201,168,76,.18),rgba(201,168,76,.08)); color:var(--gold); border:1px solid rgba(201,168,76,.25); }
    .dp-sec-header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:16px; flex-wrap:wrap; }
    .dp-sec-title { font-family:'Cinzel',serif; font-size:.85rem; font-weight:700; color:var(--text-1); letter-spacing:.06em; text-transform:uppercase; display:flex; align-items:center; gap:10px; }
    .dp-sec-title-icon { width:30px; height:30px; border-radius:7px; display:flex; align-items:center; justify-content:center; font-size:.8rem; }
    .dp-members-grid { display:flex; flex-direction:column; gap:8px; }
    .dp-member-row { background:linear-gradient(135deg,#0f0f14,#0b0b0f); border:1px solid rgba(255,255,255,.07); border-radius:10px; padding:14px 18px; display:grid; grid-template-columns:44px 1fr auto; align-items:center; gap:14px; transition:all .2s; cursor:pointer; position:relative; overflow:hidden; }
    .dp-member-row::before { content:''; position:absolute; left:0; top:0; bottom:0; width:3px; border-radius:10px 0 0 10px; transition:background .2s; }
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
    .dp-tag { font-size:.6rem; padding:2px 6px; border-radius:4px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; }
    .dp-tag.good   { background:rgba(16,185,129,.14); color:#10b981; }
    .dp-tag.warn   { background:rgba(245,158,11,.14);  color:#f59e0b; }
    .dp-tag.danger { background:rgba(239,68,68,.14);   color:#ef4444; }
    .dp-tag.info   { background:rgba(96,165,250,.14);  color:#60a5fa; }
    .dp-member-tags { display:flex; gap:4px; flex-wrap:wrap; }
    .dp-alerts-grid { display:flex; flex-direction:column; gap:8px; }
    .dp-alert { display:flex; align-items:flex-start; gap:12px; padding:13px 16px; border-radius:9px; border-left:3px solid transparent; transition:all .15s; }
    .dp-alert:hover { filter:brightness(1.07); transform:translateX(3px); }
    .dp-alert.danger  { background:linear-gradient(135deg,rgba(127,29,29,.2),rgba(127,29,29,.07)); border:1px solid rgba(239,68,68,.22); border-left-color:#ef4444; }
    .dp-alert.warning { background:linear-gradient(135deg,rgba(120,53,15,.16),rgba(120,53,15,.06)); border:1px solid rgba(245,158,11,.2);  border-left-color:#f59e0b; }
    .dp-alert.info    { background:linear-gradient(135deg,rgba(30,58,95,.16),rgba(30,58,95,.06));   border:1px solid rgba(96,165,250,.18); border-left-color:#60a5fa; }
    .dp-alert-icon { width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:.85rem; flex-shrink:0; }
    .dp-alert-icon.danger  { background:rgba(239,68,68,.15);  color:#ef4444; }
    .dp-alert-icon.warning { background:rgba(245,158,11,.15); color:#f59e0b; }
    .dp-alert-icon.info    { background:rgba(96,165,250,.15); color:#60a5fa; }
    .dp-alert-body { flex:1; min-width:0; }
    .dp-alert-tag { display:inline-block; padding:1px 7px; border-radius:20px; margin-bottom:4px; font-size:.58rem; font-weight:700; letter-spacing:.07em; text-transform:uppercase; }
    .dp-alert-tag.danger  { background:rgba(239,68,68,.18);  color:#ef4444; }
    .dp-alert-tag.warning { background:rgba(245,158,11,.18); color:#f59e0b; }
    .dp-alert-tag.info    { background:rgba(96,165,250,.18); color:#60a5fa; }
    .dp-alert-title  { font-size:.84rem; font-weight:700; color:var(--text-1); margin-bottom:3px; }
    .dp-alert-detail { font-size:.73rem; color:var(--text-3); line-height:1.5; }
    .dp-alert-members { display:flex; gap:4px; flex-wrap:wrap; margin-top:8px; }
    .dp-alert-chip { display:inline-flex; align-items:center; gap:5px; padding:3px 8px; background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.09); border-radius:20px; font-size:.72rem; color:var(--text-2); }
    .dp-alert-chip .avatar { width:18px; height:18px; font-size:.45rem; flex-shrink:0; }
    .dp-month-sel { display:flex; align-items:center; gap:8px; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08); border-radius:8px; padding:6px 12px; font-size:.78rem; color:var(--text-2); }
    .dp-month-sel select { background:transparent; border:none; color:var(--text-1); font-size:.8rem; outline:none; cursor:pointer; font-weight:600; }
    .dp-month-sel option { background:#1a1a22; }
    .dp-detail-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    .dp-detail-stat { background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.07); border-radius:8px; padding:14px; text-align:center; }
    .dp-detail-stat-val { font-family:'Cinzel',serif; font-size:1.5rem; font-weight:700; margin-bottom:4px; }
    .dp-detail-stat-lbl { font-size:.65rem; color:var(--text-3); text-transform:uppercase; letter-spacing:.06em; }
    .dp-empty { display:flex; align-items:center; justify-content:center; flex-direction:column; gap:12px; padding:40px 20px; color:var(--text-3); }
    @media (max-width:640px) {
      .dp-hero-inner { grid-template-columns:1fr; }
      .dp-hero-score { border-right:none; border-bottom:1px solid rgba(255,255,255,.06); }
      .dp-hero-metrics { grid-template-columns:repeat(2,1fr); }
      .dp-member-right { min-width:90px; }
      .dp-detail-grid { grid-template-columns:1fr; }
    }
  `;
  document.head.appendChild(s);
})();

/* ============================================================
   NORMALIZAÇÃO DE NOMES
   Resolve: "PH" → "Pedro Henrique", "Naira" → "Naíra", etc.
   ============================================================ */
function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildNameMap(membros) {
  const map = {};
  membros.forEach(m => {
    const full  = normalizeName(m.name);
    map[full]   = m.id;

    const parts = full.split(' ').filter(Boolean);
    if (parts[0] && !map[parts[0]]) map[parts[0]] = m.id;

    // Iniciais (ex: "Pedro Henrique" → "ph")
    if (parts.length >= 2) {
      const initials = parts.map(p => p[0]).join('');
      if (!map[initials]) map[initials] = m.id;
    }

    // Primeiro + último nome
    if (parts.length >= 3) {
      const fl = `${parts[0]} ${parts[parts.length - 1]}`;
      if (!map[fl]) map[fl] = m.id;
    }
  });
  return map;
}

function resolveNameToId(rawName, nameMap) {
  if (!rawName) return null;
  const norm = normalizeName(rawName);
  if (nameMap[norm]) return nameMap[norm];
  for (const [key, id] of Object.entries(nameMap)) {
    if (key.length >= 3 && (norm.includes(key) || key.includes(norm))) return id;
  }
  return null;
}

/* ============================================================
   SCORING ENGINE v3
   Pesos fixos: Mensagens 50% · Atividades 40% · Presenças 10%
   Pesos redistribuídos proporcionalmente se faltarem dados.
   ============================================================ */
const SCORE_WEIGHTS = { msgs: 50, acts: 40, pres: 10 };

function calcScore(d, ev_publicos, msgs_media) {
  const comps = {};

  if (msgs_media > 0 && d.msgs > 0)
    comps.msgs = Math.min(100, (d.msgs / msgs_media) * 100);

  if (d.acts_total > 0)
    comps.acts = Math.round((d.concluidas / d.acts_total) * 100);

  if (ev_publicos > 0)
    comps.pres = Math.round((d.pres_conf / ev_publicos) * 100);

  const keys = Object.keys(comps);
  if (!keys.length) return 0;

  const totalBase = keys.reduce((s, k) => s + SCORE_WEIGHTS[k], 0);
  const score = keys.reduce((s, k) => s + (comps[k] * SCORE_WEIGHTS[k] / totalBase), 0);
  return Math.round(Math.min(100, Math.max(0, score)));
}

function scoreColor(s) {
  return s >= 80 ? '#10b981' : s >= 60 ? '#c9a84c' : s >= 35 ? '#f59e0b' : '#ef4444';
}
function scoreLabel(s) {
  return s >= 80 ? 'Excelente' : s >= 60 ? 'Bom' : s >= 35 ? 'Regular' : s > 0 ? 'Crítico' : 'Sem dados';
}

/* ============================================================
   ORDENAÇÃO — desempate por dados brutos
   ============================================================ */
function sortMembros(membros) {
  return [...membros].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.msgs  !== a.msgs)  return b.msgs  - a.msgs;
    if (b.acts.concluidas !== a.acts.concluidas) return b.acts.concluidas - a.acts.concluidas;
    return b.pres.conf - a.pres.conf;
  });
}

/* ============================================================
   PAGE: DESEMPENHO
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

  const now = new Date();
  let selectedMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  let activeTab = 'membros';

  const months = [];
  for (let i = 0; i < 6; i++) {
    const d   = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const lbl = d.toLocaleDateString('pt-BR', { month:'long', year:'numeric' });
    months.push({ val, lbl: lbl.charAt(0).toUpperCase() + lbl.slice(1) });
  }

  async function fetchAll(month) {
    const [y, mo] = month.split('-').map(Number);
    const mStart  = `${month}-01`;
    const mEnd    = `${month}-${String(new Date(y, mo, 0).getDate()).padStart(2,'0')}`;

    const [r1,r2,r3,r4,r5,r6] = await Promise.all([
      db.from('profiles').select('id,name,role,initials,color,avatar_url,tier,join_date,created_at').eq('status','ativo').order('name'),
      db.from('activities').select('id,assigned_to,status,title,deadline,closes_at'),
      db.from('events').select('id,title,event_date,event_time,type,mandatory,created_by,helper_id,is_private,description,performance_weight').gte('event_date',mStart).lte('event_date',mEnd).order('event_date',{ascending:false}),
      db.from('event_presencas').select('event_id,membro_id,status'),
      db.from('weekly_rankings').select('week_start,week_end,entries').gte('week_start',mStart).lte('week_end',mEnd).order('week_start',{ascending:true}),
      db.from('premiacoes').select('user_id,created_at').gte('created_at',`${mStart}T00:00:00`).lte('created_at',`${mEnd}T23:59:59`),
    ]);

    return {
      membros:    r1.data || [],
      atividades: r2.data || [],
      eventosMes: r3.data || [],
      presencas:  r4.data || [],
      rankings:   r5.data || [],
      premiacoes: r6.data || [],
    };
  }

  function aggregateMsgs(rankings, membros) {
    const byId   = {};
    const nameMap = buildNameMap(membros);
    rankings.forEach(rk => {
      (rk.entries || []).forEach(e => {
        const uid = resolveNameToId(e.name || '', nameMap);
        if (uid) byId[uid] = (byId[uid] || 0) + (parseInt(e.messages) || 0);
      });
    });
    return byId;
  }

  async function render() {
    Utils.showLoading(content, 'Calculando desempenho...');
    let data;
    try { data = await fetchAll(selectedMonth); }
    catch(e) { content.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-3)">Erro: ${e.message}</div>`; return; }

    const { membros, atividades, eventosMes, presencas, rankings, premiacoes } = data;
    const evPub = eventosMes.filter(e => !e.is_private);

    const presByM = {};
    presencas.forEach(p => {
      if (!presByM[p.membro_id]) presByM[p.membro_id] = { conf:0, aus:0, just:0 };
      if      (p.status === 'confirmado') presByM[p.membro_id].conf++;
      else if (p.status === 'ausente')    presByM[p.membro_id].aus++;
      else                                presByM[p.membro_id].just++;
    });

    const actsByM = {};
    atividades.forEach(a => {
      if (!actsByM[a.assigned_to]) actsByM[a.assigned_to] = { total:0, concluidas:0, atrasadas:0, pendentes:0, andamento:0 };
      actsByM[a.assigned_to].total++;
      if      (a.status === 'Concluída')    actsByM[a.assigned_to].concluidas++;
      else if (a.status === 'Pendente')     actsByM[a.assigned_to].pendentes++;
      else if (a.status === 'Em andamento') actsByM[a.assigned_to].andamento++;
      if (new Date(a.closes_at || (a.deadline + 'T23:59:59')) < new Date() && a.status !== 'Concluída' && a.status !== 'Cancelada')
        actsByM[a.assigned_to].atrasadas++;
    });

    const msgsById = aggregateMsgs(rankings, membros);
    const msgVals  = Object.values(msgsById).filter(v => v > 0);
    const msgMedia = msgVals.length ? msgVals.reduce((s, v) => s + v, 0) / msgVals.length : 0;

    // Contrib de eventos — para tags visuais apenas, não entra no score
    const evContrib = {};
    eventosMes.forEach(ev => {
      if (ev.created_by) { if (!evContrib[ev.created_by]) evContrib[ev.created_by] = { criou:0, ajudou:0 }; evContrib[ev.created_by].criou++; }
      if (ev.helper_id)  { if (!evContrib[ev.helper_id])  evContrib[ev.helper_id]  = { criou:0, ajudou:0 }; evContrib[ev.helper_id].ajudou++; }
    });

    const premByM = {};
    premiacoes.forEach(p => { premByM[p.user_id] = (premByM[p.user_id] || 0) + 1; });

    const membrosScored = membros.map(m => {
      const acts    = actsByM[m.id] || { total:0, concluidas:0, atrasadas:0, pendentes:0, andamento:0 };
      const pres    = presByM[m.id] || { conf:0, aus:0, just:0 };
      const contrib = evContrib[m.id] || { criou:0, ajudou:0 };
      const msgs    = msgsById[m.id] || 0;
      const score   = calcScore({ acts_total:acts.total, concluidas:acts.concluidas, pres_conf:pres.conf, msgs }, evPub.length, msgMedia);
      const taxaActs = acts.total > 0    ? Math.round((acts.concluidas / acts.total) * 100)          : null;
      const taxaPres = evPub.length > 0  ? Math.round((pres.conf / evPub.length) * 100)              : null;
      const taxaMsgs = msgMedia > 0 && msgs > 0 ? Math.round(Math.min(100, (msgs / msgMedia) * 100)) : null;
      return { ...m, acts, pres, contrib, msgs, score, taxaActs, taxaPres, taxaMsgs, premiacoes: premByM[m.id] || 0 };
    });

    const membrosOrdenados = sortMembros(membrosScored);
    const withData   = membrosOrdenados.filter(m => m.score > 0);
    const scoreOrdem = withData.length ? Math.round(withData.reduce((s, m) => s + m.score, 0) / withData.length) : 0;
    const clrOrdem   = scoreColor(scoreOrdem);
    const lblOrdem   = scoreLabel(scoreOrdem);
    const semDados   = membrosOrdenados.filter(m => m.score === 0).length;

    const totalActs  = atividades.length;
    const concl      = atividades.filter(a => a.status === 'Concluída').length;
    const taxaGeral  = totalActs > 0 ? Math.round((concl / totalActs) * 100) : 0;
    const presConf   = presencas.filter(p => p.status === 'confirmado').length;
    const taxaPres   = evPub.length > 0 && membros.length > 0 ? Math.round((presConf / (evPub.length * membros.length)) * 100) : 0;
    const alertas    = buildAlertas(membrosOrdenados, atividades, eventosMes, presencas, evPub, msgsById, msgMedia, rankings);
    const curMonth   = months.find(m => m.val === selectedMonth) || { lbl: selectedMonth };
    const nDanger    = alertas.filter(a => a.level === 'danger').length;

    content.innerHTML = `
      <div class="dp-page">
        <div class="page-header" style="margin-bottom:0">
          <div>
            <div class="page-header-title">Painel de Desempenho</div>
            <div class="page-header-sub">Análise mensal · ${curMonth.lbl}</div>
          </div>
          <div class="dp-month-sel">
            <i class="fa-regular fa-calendar" style="color:var(--gold)"></i>
            <select id="dpMonthSel">
              ${months.map(m => `<option value="${m.val}" ${m.val===selectedMonth?'selected':''}>${m.lbl}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="dp-hero card-enter">
          <div class="dp-hero-inner">
            <div class="dp-hero-score">
              <div class="dp-hero-label"><i class="fa-solid fa-chart-line"></i> Desempenho da Ordem</div>
              <div class="dp-score-display">
                <div class="dp-score-num" id="dpScoreNum" style="color:${clrOrdem}">0</div>
                <div class="dp-score-denom">/ 100</div>
              </div>
              <div class="dp-score-label-text" style="background:${clrOrdem}18;color:${clrOrdem};border:1px solid ${clrOrdem}35">${lblOrdem}</div>
              <div class="dp-score-track" style="height:12px;margin-top:14px">
                <div class="dp-score-fill" id="dpScoreFill" style="width:0%;background:linear-gradient(90deg,${clrOrdem}55,${clrOrdem})"></div>
              </div>
              <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:.65rem;color:var(--text-3)">
                <span>Msgs 50% · Atividades 40% · Presenças 10%</span>
                <span>${withData.length} / ${membros.length} com dados</span>
              </div>
            </div>
            <div class="dp-hero-metrics">
              <div class="dp-hm">
                <div class="dp-hm-val" style="color:var(--gold)">${membros.length}</div>
                <div class="dp-hm-lbl">Membros Ativos</div>
                <div class="dp-hm-sub">${semDados > 0 ? `${semDados} sem dados` : 'Todos com dados'}</div>
              </div>
              <div class="dp-hm">
                <div class="dp-hm-val" style="color:${taxaGeral>=70?'#10b981':taxaGeral>=40?'#c9a84c':'#ef4444'}">${taxaGeral}%</div>
                <div class="dp-hm-lbl">Conclusão Geral</div>
                <div class="dp-hm-sub">${concl} de ${totalActs} atividades</div>
              </div>
              <div class="dp-hm">
                <div class="dp-hm-val" style="color:${taxaPres>=70?'#10b981':taxaPres>=40?'#c9a84c':'#ef4444'}">${taxaPres}%</div>
                <div class="dp-hm-lbl">Taxa de Presença</div>
                <div class="dp-hm-sub">${evPub.length} ev. públicos · ${presConf} conf.</div>
              </div>
              <div class="dp-hm">
                <div class="dp-hm-val" style="color:${nDanger>0?'#ef4444':'#10b981'}">${alertas.length}</div>
                <div class="dp-hm-lbl">Alertas</div>
                <div class="dp-hm-sub">${nDanger} crítico${nDanger!==1?'s':''}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="dp-tabs card-enter">
          <button class="dp-tab active" data-tab="membros"><i class="fa-solid fa-users"></i> Membros</button>
          <button class="dp-tab" data-tab="alertas">
            <i class="fa-solid fa-triangle-exclamation"></i> Alertas
            ${nDanger > 0 ? `<span style="background:#ef4444;color:#fff;font-size:.58rem;padding:1px 6px;border-radius:20px;font-weight:700;margin-left:2px">${nDanger}</span>` : ''}
          </button>
        </div>

        <div id="dpTabContent" class="card-enter"></div>
      </div>

      <div class="modal-overlay" id="dpMemberModal">
        <div class="modal" style="max-width:580px">
          <div class="modal-header">
            <div class="modal-title" id="dpMemberModalTitle">Desempenho</div>
            <button class="modal-close" id="dpMemberModalClose"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="modal-body" id="dpMemberModalBody" style="padding:0"></div>
        </div>
      </div>`;

    setTimeout(() => {
      const fill = document.getElementById('dpScoreFill');
      const num  = document.getElementById('dpScoreNum');
      if (fill) fill.style.width = scoreOrdem + '%';
      if (num) {
        let cur = 0; const step = Math.max(1, Math.ceil(scoreOrdem/30));
        const t = setInterval(() => { cur = Math.min(scoreOrdem, cur+step); num.textContent = cur; if (cur >= scoreOrdem) clearInterval(t); }, 30);
      }
    }, 150);

    const mModal = document.getElementById('dpMemberModal');
    // Mover modal para body (position:fixed correto)
    if (mModal && mModal.parentElement !== document.body) document.body.appendChild(mModal);
    document.getElementById('dpMemberModalClose')?.addEventListener('click', () => mModal?.classList.remove('open'));
    mModal?.addEventListener('click', e => { if (e.target === mModal) mModal.classList.remove('open'); });
    document.getElementById('dpMonthSel')?.addEventListener('change', e => { selectedMonth = e.target.value; render(); });

    function renderTab(tab) {
      activeTab = tab;
      document.querySelectorAll('.dp-tab').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));
      const tc = document.getElementById('dpTabContent'); if (!tc) return;
      if (tab === 'membros') renderMembros(tc, membrosOrdenados, evPub.length, msgMedia);
      if (tab === 'alertas') renderAlertas(tc, alertas);
    }
    content.querySelectorAll('.dp-tab').forEach(btn => btn.addEventListener('click', () => renderTab(btn.dataset.tab)));
    renderTab(activeTab);

    /* ── MEMBROS ── */
    function renderMembros(el, scored, evCount, msgAvg) {
      el.innerHTML = `
        <div class="dp-sec-header">
          <div class="dp-sec-title">
            <div class="dp-sec-title-icon" style="background:rgba(201,168,76,.1);border:1px solid rgba(201,168,76,.2);color:var(--gold)"><i class="fa-solid fa-ranking-star"></i></div>
            Desempenho Individual
          </div>
          <input type="text" id="dpMSearch" class="form-input" placeholder="Buscar membro..." style="width:190px;padding:7px 12px;font-size:.8rem">
        </div>
        <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:14px;padding:10px 14px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:8px">
          <span style="font-size:.67rem;color:var(--text-3)"><i class="fa-solid fa-circle-info" style="color:var(--gold)"></i> Composição:</span>
          <span style="font-size:.67rem;color:var(--text-3)"><span style="color:#60a5fa">●</span> Mensagens 50%</span>
          <span style="font-size:.67rem;color:var(--text-3)"><span style="color:var(--gold)">●</span> Atividades 40%</span>
          <span style="font-size:.67rem;color:var(--text-3)"><span style="color:#10b981">●</span> Presença 10%</span>
          <span style="font-size:.67rem;color:var(--text-3);font-style:italic">Pesos redistribuídos se faltarem dados</span>
        </div>
        <div class="dp-members-grid" id="dpMGrid">
          ${scored.map((m,i) => memberRow(m,i)).join('')}
        </div>`;

      document.getElementById('dpMSearch')?.addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        el.querySelectorAll('.dp-member-row').forEach(r => { r.style.display = (r.dataset.name||'').includes(q) ? '' : 'none'; });
      });
      el.querySelectorAll('.dp-member-row').forEach(row => {
        row.addEventListener('click', () => { const m = scored.find(x => x.id === row.dataset.id); if (m) openMemberModal(m, evCount, msgAvg); });
      });
    }

    function memberRow(m, idx) {
      const clr  = scoreColor(m.score);
      const lbl  = scoreLabel(m.score);
      const ac   = m.avatar_url ? `<img src="${m.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : (m.initials || Utils.getInitials(m.name));
      const rCls = idx===0?'rank-1':idx===1?'rank-2':idx===2?'rank-3':m.score<35?'rank-low':'';
      const rBdg = idx===0?'🥇':idx===1?'🥈':idx===2?'🥉':`${idx+1}º`;
      const tags = [];
      if (m.score===0)           tags.push('<span class="dp-tag danger">Sem dados</span>');
      if (m.acts.atrasadas>0)    tags.push(`<span class="dp-tag danger">${m.acts.atrasadas} atrasada${m.acts.atrasadas>1?'s':''}</span>`);
      if (m.contrib.criou>0)     tags.push(`<span class="dp-tag info">Criou ${m.contrib.criou} ev.</span>`);
      if (m.premiacoes>0)        tags.push(`<span class="dp-tag good">🏆 ${m.premiacoes}</span>`);

      const bars = [
        m.taxaMsgs!==null ? {lbl:'Msgs', val:m.taxaMsgs, clr:'#60a5fa'}       : null,
        m.taxaActs!==null ? {lbl:'Ativ.', val:m.taxaActs, clr:'var(--gold)'}  : null,
        m.taxaPres!==null ? {lbl:'Pres.', val:m.taxaPres, clr:'#10b981'}       : null,
      ].filter(Boolean);

      return `
        <div class="dp-member-row ${rCls} card-enter" data-id="${m.id}" data-name="${(m.name||'').toLowerCase()}">
          <div class="avatar" style="width:44px;height:44px;font-size:.8rem;background:linear-gradient(135deg,${m.color||'#7f1d1d'},#1a1a1a)">${ac}</div>
          <div class="dp-member-info">
            <div class="dp-member-name">${Utils.escapeHtml(m.name)}</div>
            <div class="dp-member-role">${Utils.escapeHtml(m.role)}</div>
            ${bars.length ? `
              <div style="display:flex;gap:10px;margin-top:7px;flex-wrap:wrap">
                ${bars.map(b => `
                  <div style="display:flex;align-items:center;gap:4px">
                    <span style="font-size:.58rem;color:var(--text-3);width:26px">${b.lbl}</span>
                    <div style="width:60px;height:5px;background:rgba(255,255,255,.07);border-radius:99px;overflow:hidden">
                      <div style="width:${b.val}%;height:100%;background:${b.clr};border-radius:99px"></div>
                    </div>
                    <span style="font-size:.6rem;color:${b.clr};font-weight:700;min-width:26px">${b.val}%</span>
                  </div>`).join('')}
              </div>`
            : `<div style="font-size:.68rem;color:var(--text-3);margin-top:5px;font-style:italic">Sem dados no período</div>`}
            ${tags.length ? `<div class="dp-member-tags" style="margin-top:5px">${tags.join('')}</div>` : ''}
          </div>
          <div class="dp-member-right">
            <div style="font-size:.62rem;color:var(--text-3);margin-bottom:4px;text-align:right">${rBdg}</div>
            <div class="dp-member-score-val" style="color:${clr}">${m.score}<span style="font-size:.6rem;color:var(--text-3);font-weight:400">/100</span></div>
            <div style="width:100%;margin-top:8px">
              <div style="height:10px;background:rgba(255,255,255,.07);border-radius:99px;overflow:hidden">
                <div style="width:${m.score}%;height:100%;background:linear-gradient(90deg,${clr}55,${clr});border-radius:99px;transition:width 1s cubic-bezier(.4,0,.2,1)"></div>
              </div>
            </div>
            <div style="font-size:.63rem;color:${clr};font-weight:700;margin-top:4px;text-align:right">${lbl}</div>
          </div>
        </div>`;
    }

    function openMemberModal(m, evCount, msgAvg) {
      const modal = document.getElementById('dpMemberModal');
      const body  = document.getElementById('dpMemberModalBody');
      const title = document.getElementById('dpMemberModalTitle');
      if (!modal || !body) return;
      const clr = scoreColor(m.score);
      title.innerHTML = `<i class="fa-solid fa-chart-line" style="color:${clr}"></i> ${Utils.escapeHtml(m.name)}`;

      const comps = [];
      if (m.taxaMsgs !== null)  comps.push({ key:'msgs', lbl:'Mensagens (50%)',  val:m.taxaMsgs, clr:'#60a5fa',     detail:`${m.msgs} msgs · média ${Math.round(msgAvg)}` });
      if (m.acts.total > 0)     comps.push({ key:'acts', lbl:'Atividades (40%)', val:m.taxaActs, clr:'var(--gold)', detail:`${m.acts.concluidas} feitas / ${m.acts.total} atribuídas` });
      if (evCount > 0)          comps.push({ key:'pres', lbl:'Presença (10%)',   val:m.taxaPres, clr:'#10b981',     detail:`${m.pres.conf} confirmadas / ${evCount} eventos` });
      const totalBase = comps.reduce((s,c) => s + SCORE_WEIGHTS[c.key], 0) || 1;

      body.innerHTML = `
        <div style="padding:18px 24px 14px;background:linear-gradient(135deg,${m.color||'#7f1d1d'}18,transparent);border-bottom:1px solid rgba(255,255,255,.07)">
          <div style="display:flex;align-items:center;gap:14px">
            <div class="avatar" style="width:52px;height:52px;font-size:.9rem;background:linear-gradient(135deg,${m.color||'#7f1d1d'},#1a1a1a);border:2px solid ${clr}44">
              ${m.avatar_url?`<img src="${m.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:(m.initials||Utils.getInitials(m.name))}
            </div>
            <div>
              <div style="font-weight:700;font-size:.95rem">${Utils.escapeHtml(m.name)}</div>
              <div style="font-size:.72rem;color:var(--text-3)">${Utils.escapeHtml(m.role)}</div>
            </div>
            <div style="margin-left:auto;text-align:right">
              <div style="font-family:'Cinzel',serif;font-size:2.4rem;font-weight:700;color:${clr};line-height:1" id="dmNum">0</div>
              <div style="font-size:.68rem;color:${clr};font-weight:700">${scoreLabel(m.score)}</div>
            </div>
          </div>
          <div style="margin-top:12px;height:10px;background:rgba(255,255,255,.07);border-radius:99px;overflow:hidden">
            <div id="dmBar" style="width:0%;height:100%;background:linear-gradient(90deg,${clr}55,${clr});border-radius:99px;transition:width 1s cubic-bezier(.4,0,.2,1)"></div>
          </div>
        </div>
        ${m.score===0?`<div style="padding:14px 24px"><div style="padding:12px 14px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:8px;font-size:.8rem;color:#ef4444;display:flex;gap:10px"><i class="fa-solid fa-circle-info" style="margin-top:2px;flex-shrink:0"></i><div><div style="font-weight:700;margin-bottom:2px">Sem dados no período</div><div style="opacity:.75">Sem atividades, rankings semanais ou presenças vinculados.</div></div></div></div>`:''}
        <div style="padding:14px 24px;border-bottom:1px solid rgba(255,255,255,.07)">
          <div style="font-size:.67rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.1em;font-weight:700;margin-bottom:12px">Composição do Score</div>
          ${comps.length===0?`<div style="color:var(--text-3);font-size:.82rem">Nenhum dado disponível.</div>`:
            comps.map(c => {
              const w       = Math.round(SCORE_WEIGHTS[c.key] / totalBase * 100);
              const contrib = Math.round((c.val||0) * SCORE_WEIGHTS[c.key] / totalBase);
              return `<div style="margin-bottom:12px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
                  <div><span style="font-size:.78rem;font-weight:600;color:var(--text-1)">${c.lbl}</span><span style="font-size:.65rem;color:var(--text-3);margin-left:6px">(peso real: ${w}%)</span></div>
                  <div><span style="font-size:.8rem;font-weight:700;color:${c.clr}">${Math.round(c.val||0)}%</span><span style="font-size:.65rem;color:var(--text-3);margin-left:4px">→ +${contrib}pts</span></div>
                </div>
                <div style="height:8px;background:rgba(255,255,255,.06);border-radius:99px;overflow:hidden">
                  <div style="width:${c.val||0}%;height:100%;background:${c.clr};border-radius:99px;opacity:.85"></div>
                </div>
                <div style="font-size:.65rem;color:var(--text-3);margin-top:3px">${c.detail}</div>
              </div>`;
            }).join('')}
          ${comps.length>0?`<div style="display:flex;justify-content:space-between;padding-top:10px;border-top:1px solid rgba(255,255,255,.06)">
            <span style="font-size:.78rem;color:var(--text-3)">Score Total</span>
            <span style="font-family:'Cinzel',serif;font-size:1.1rem;font-weight:700;color:${clr}">${m.score} / 100</span>
          </div>`:''}
        </div>
        <div class="dp-detail-grid" style="padding:14px 24px 20px">
          <div class="dp-detail-stat">
            <div class="dp-detail-stat-val" style="color:#10b981">${m.acts.total>0?m.acts.concluidas:'—'}</div>
            <div class="dp-detail-stat-lbl">Atividades Feitas</div>
            <div style="font-size:.67rem;color:var(--text-3);margin-top:3px">${m.acts.total>0?`de ${m.acts.total} atribuídas`:'Nenhuma atribuída'}</div>
          </div>
          <div class="dp-detail-stat">
            <div class="dp-detail-stat-val" style="color:#60a5fa">${m.msgs>0?m.msgs:'—'}</div>
            <div class="dp-detail-stat-lbl">Msgs no Mês</div>
            <div style="font-size:.67rem;color:var(--text-3);margin-top:3px">${msgAvg>0?`Média: ${Math.round(msgAvg)}`:'Sem ranking'}</div>
          </div>
          <div class="dp-detail-stat">
            <div class="dp-detail-stat-val" style="color:#10b981">${evCount>0?m.pres.conf:'—'}</div>
            <div class="dp-detail-stat-lbl">Presenças</div>
            <div style="font-size:.67rem;color:var(--text-3);margin-top:3px">${evCount>0?`${m.pres.aus} ausências`:'Sem eventos'}</div>
          </div>
          <div class="dp-detail-stat">
            <div class="dp-detail-stat-val" style="color:#ef4444">${m.acts.atrasadas>0?m.acts.atrasadas:'—'}</div>
            <div class="dp-detail-stat-lbl">Atrasadas</div>
            <div style="font-size:.67rem;color:var(--text-3);margin-top:3px">${m.acts.pendentes}P · ${m.acts.andamento}A</div>
          </div>
        </div>`;

      modal.classList.add('open');
      setTimeout(() => {
        const bar = document.getElementById('dmBar'); const num = document.getElementById('dmNum');
        if (bar) bar.style.width = m.score + '%';
        if (num) { let c=0; const s=Math.max(1,Math.ceil(m.score/25)); const t=setInterval(()=>{ c=Math.min(m.score,c+s); num.textContent=c; if(c>=m.score) clearInterval(t); },40); }
      }, 100);
    }

    /* ── ALERTAS ── */
    function renderAlertas(el, alertas) {
      if (!alertas.length) {
        el.innerHTML = `<div class="dp-empty"><i class="fa-solid fa-shield-check" style="color:#10b981;font-size:2rem;opacity:.7"></i><span>Nenhum alerta neste período</span></div>`;
        return;
      }
      const CATS = {};
      alertas.forEach(a => { if (!CATS[a.cat]) CATS[a.cat] = { icon:a.catIcon, color:a.catColor, items:[] }; CATS[a.cat].items.push(a); });
      el.innerHTML = `
        <div class="dp-sec-header">
          <div class="dp-sec-title">
            <div class="dp-sec-title-icon" style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);color:#ef4444"><i class="fa-solid fa-triangle-exclamation"></i></div>
            ${alertas.length} Alerta${alertas.length>1?'s':''} · ${curMonth.lbl}
          </div>
        </div>
        <div class="dp-alerts-grid">
          ${Object.entries(CATS).map(([cat,meta]) => `
            <div style="margin-bottom:10px">
              <div style="font-size:.64rem;color:${meta.color};text-transform:uppercase;letter-spacing:.1em;font-weight:700;margin-bottom:8px;display:flex;align-items:center;gap:7px">
                <i class="fa-solid ${meta.icon}"></i> ${cat} <span style="color:var(--text-3);font-weight:400">(${meta.items.length})</span>
              </div>
              ${meta.items.map(a => `
                <div class="dp-alert ${a.level}">
                  <div class="dp-alert-icon ${a.level}"><i class="fa-solid ${a.icon}"></i></div>
                  <div class="dp-alert-body">
                    <div class="dp-alert-tag ${a.level}">${a.tag}</div>
                    <div class="dp-alert-title">${a.title}</div>
                    ${a.detail?`<div class="dp-alert-detail">${a.detail}</div>`:''}
                    ${a.members&&a.members.length?`
                      <div class="dp-alert-members">
                        ${a.members.slice(0,5).map(mm=>`
                          <span class="dp-alert-chip">
                            <div class="avatar" style="background:linear-gradient(135deg,${mm.color||'#7f1d1d'},#1a1a1a);width:18px;height:18px;font-size:.45rem">${mm.initials||Utils.getInitials(mm.name)}</div>
                            ${Utils.escapeHtml(mm.name)}
                            ${a.showScore?` <span style="color:${scoreColor(mm.score)};font-weight:700;font-size:.65rem">${mm.score}pts</span>`:''}
                          </span>`).join('')}
                        ${a.members.length>5?`<span class="dp-alert-chip" style="color:var(--text-3)">+${a.members.length-5} mais</span>`:''}
                      </div>`:''}
                  </div>
                </div>`).join('')}
            </div>`).join('')}
        </div>`;
    }
  }

  await render();
}

/* ============================================================
   ALERTAS — dados reais, categorias expandidas
   ============================================================ */
function buildAlertas(membrosScored, atividades, eventosMes, presencas, evPublicos, msgsById, msgMedia, rankings) {
  const alertas = [];
  const today   = new Date();

  /* ── MEMBROS ── */
  const semDados = membrosScored.filter(m => m.score === 0);
  if (semDados.length > 0) alertas.push({
    level:'danger', cat:'Membros', catIcon:'fa-users', catColor:'#a78bfa',
    icon:'fa-user-slash', tag:'Sem dados',
    title:`${semDados.length} membro${semDados.length>1?'s':''} sem dados no período`,
    detail:'Sem atividades, rankings semanais ou presenças vinculados.',
    members: semDados,
  });

  const criticos = membrosScored.filter(m => m.score > 0 && m.score < 35);
  if (criticos.length > 0) alertas.push({
    level:'danger', cat:'Membros', catIcon:'fa-users', catColor:'#a78bfa',
    icon:'fa-chart-line-down', tag:'Crítico',
    title:`${criticos.length} membro${criticos.length>1?'s':''} com score abaixo de 35`,
    detail: criticos.map(m => `${m.name} (${m.score}pts)`).join(', '),
    members: criticos, showScore: true,
  });

  const baixoDesempenho = membrosScored.filter(m => m.score >= 35 && m.score < 60);
  if (baixoDesempenho.length > 0) alertas.push({
    level:'warning', cat:'Membros', catIcon:'fa-users', catColor:'#a78bfa',
    icon:'fa-arrow-trend-down', tag:'Performance baixa',
    title:`${baixoDesempenho.length} membro${baixoDesempenho.length>1?'s':''} com desempenho Regular`,
    detail:'Score entre 35 e 59. Atenção necessária.',
    members: baixoDesempenho, showScore: true,
  });

  const semPres = membrosScored.filter(m => evPublicos.length > 0 && m.pres.conf === 0 && m.score > 0);
  if (semPres.length > 0) alertas.push({
    level:'warning', cat:'Membros', catIcon:'fa-users', catColor:'#a78bfa',
    icon:'fa-calendar-xmark', tag:'Ausente',
    title:`${semPres.length} membro${semPres.length>1?'s':''} sem presença confirmada`,
    detail:`De ${evPublicos.length} evento${evPublicos.length>1?'s':''} disponíveis.`,
    members: semPres,
  });

  const semMsgs = membrosScored.filter(m => (msgsById[m.id] || 0) === 0);
  if (semMsgs.length > 0) alertas.push({
    level:'warning', cat:'Membros', catIcon:'fa-users', catColor:'#a78bfa',
    icon:'fa-message-slash', tag:'Sem mensagens',
    title:`${semMsgs.length} membro${semMsgs.length>1?'s':''} sem registro de mensagens no mês`,
    detail:'Não apareceram em nenhum ranking semanal.',
    members: semMsgs,
  });

  const msgsBaixas = membrosScored.filter(m => { const msgs = msgsById[m.id]||0; return msgMedia>0 && msgs>0 && msgs < msgMedia*0.3; });
  if (msgsBaixas.length > 0) alertas.push({
    level:'info', cat:'Membros', catIcon:'fa-users', catColor:'#a78bfa',
    icon:'fa-comment-slash', tag:'Baixa participação',
    title:`${msgsBaixas.length} membro${msgsBaixas.length>1?'s':''} com menos de 30% da média de msgs`,
    detail:`Média do grupo: ${Math.round(msgMedia)} msgs`,
    members: msgsBaixas,
  });

  /* ── ATIVIDADES ── */
  const atrasadas = atividades.filter(a => {
    const d = new Date(a.closes_at || (a.deadline+'T23:59:59'));
    return d < today && a.status !== 'Concluída' && a.status !== 'Cancelada';
  });
  if (atrasadas.length > 0) alertas.push({
    level:'danger', cat:'Atividades', catIcon:'fa-list-check', catColor:'#f59e0b',
    icon:'fa-clock', tag:'Atrasado',
    title:`${atrasadas.length} atividade${atrasadas.length>1?'s':''} com prazo vencido`,
    detail: atrasadas.slice(0,3).map(a => a.title).join(', ') + (atrasadas.length>3?` +${atrasadas.length-3}`:''),
  });

  const vencendo = atividades.filter(a => {
    const d = new Date(a.closes_at || (a.deadline+'T23:59:59'));
    const diff = (d - today) / 86400000;
    return diff >= 0 && diff <= 3 && a.status !== 'Concluída';
  });
  if (vencendo.length > 0) alertas.push({
    level:'warning', cat:'Atividades', catIcon:'fa-list-check', catColor:'#f59e0b',
    icon:'fa-hourglass-half', tag:'Urgente',
    title:`${vencendo.length} atividade${vencendo.length>1?'s':''} vencendo em até 3 dias`,
    detail: vencendo.map(a => a.title).join(', '),
  });

  const semAtividade = membrosScored.filter(m => m.acts.total === 0);
  if (semAtividade.length > 0) alertas.push({
    level:'warning', cat:'Atividades', catIcon:'fa-list-check', catColor:'#f59e0b',
    icon:'fa-inbox', tag:'Sem atividades',
    title:`${semAtividade.length} membro${semAtividade.length>1?'s':''} sem atividades atribuídas`,
    detail:'Nenhuma tarefa no período selecionado.',
    members: semAtividade,
  });

  /* ── EVENTOS ── */
  const evSemCriador = eventosMes.filter(e => !e.created_by && !e.is_private);
  if (evSemCriador.length > 0) alertas.push({
    level:'warning', cat:'Eventos', catIcon:'fa-calendar-days', catColor:'#60a5fa',
    icon:'fa-user-xmark', tag:'Sem responsável',
    title:`${evSemCriador.length} evento${evSemCriador.length>1?'s':''} sem criador identificado`,
    detail: evSemCriador.map(e => e.title).join(', '),
  });

  const evSemPres = eventosMes.filter(e => {
    if (e.is_private) return false;
    const diff = (new Date(e.event_date+'T00:00:00') - today) / 86400000;
    return diff >= -1 && diff <= 7 && !presencas.some(p => p.event_id === e.id);
  });
  if (evSemPres.length > 0) alertas.push({
    level:'warning', cat:'Eventos', catIcon:'fa-calendar-days', catColor:'#60a5fa',
    icon:'fa-calendar-exclamation', tag:'Sem presença',
    title:`${evSemPres.length} evento${evSemPres.length>1?'s':''} próximo${evSemPres.length>1?'s':''} sem controle de presença`,
    detail: evSemPres.map(e => e.title).join(', '),
  });

  const evSemDesc = eventosMes.filter(e => !e.is_private && (!e.description || e.description.trim().length < 15));
  if (evSemDesc.length > 0) alertas.push({
    level:'info', cat:'Eventos', catIcon:'fa-calendar-days', catColor:'#60a5fa',
    icon:'fa-file-circle-exclamation', tag:'Incompleto',
    title:`${evSemDesc.length} evento${evSemDesc.length>1?'s':''} sem descrição adequada`,
    detail: evSemDesc.slice(0,3).map(e => e.title).join(', '),
  });

  if (eventosMes.filter(e => !e.is_private).length === 0) alertas.push({
    level:'info', cat:'Eventos', catIcon:'fa-calendar-days', catColor:'#60a5fa',
    icon:'fa-calendar-xmark', tag:'Sem eventos',
    title:'Nenhum evento público registrado no período',
    detail:'Considere criar eventos para engajar os membros.',
  });

  /* ── RELATÓRIOS ── */
  if (!rankings || rankings.length === 0) alertas.push({
    level:'danger', cat:'Relatórios', catIcon:'fa-file-chart-column', catColor:'#ef4444',
    icon:'fa-file-slash', tag:'Sem relatório',
    title:'Nenhum ranking semanal cadastrado no mês',
    detail:'Sem dados de mensagens, o desempenho não pode ser calculado corretamente.',
  });

  if (rankings && rankings.length > 0 && rankings.length < 4) alertas.push({
    level:'warning', cat:'Relatórios', catIcon:'fa-file-chart-column', catColor:'#ef4444',
    icon:'fa-calendar-minus', tag:'Relatório incompleto',
    title:`Apenas ${rankings.length} de ~4 rankings semanais cadastrados`,
    detail:'O desempenho mensal pode estar subestimado.',
  });

  return alertas;
}

/* ============================================================
   ROUTER
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'desempenho') initDesempenho();
});
