/* ============================================================
   MSY PORTAL — PROGRESSO DO MEMBRO
   Bloco usado na página Progresso, no Meu Perfil e no perfil dos membros.

   Mensagens → automático. Últimas 12 semanas fechadas (Dom–Sáb). Semana que o
               bot Corvus cobre inteira usa group_message_daily; semana que ele
               não cobre usa o ranking semanal importado (weekly_rankings), igual
               à aba Mensagens do Ranking. Daí saem total, posição no ranking,
               média do grupo, recorde, fatia do grupo e dia mais ativo.
   Advertências → member_warnings (migration 20261122_member_warnings.sql): só o
               motivo, a data e quem aplicou. Só o membro e a Diretoria veem;
               com 3 nos últimos 3 meses aparece "Sujeito a suspensão".
   Cargo     → avaliação semanal da Diretoria em member_progress_reviews
               (migration 20261122_member_progress_reviews.sql):
               Autonomia e Inovação 20% · Atividades 40% · Presença 40%, notas 0–10.
               O membro só vê as dele (RLS); a Diretoria vê e edita todas.
               Ao avaliar, a Diretoria vê as atividades e os eventos da semana
               como referência (a nota continua sendo dada na mão).
   ============================================================ */

import { GROUP_ID } from '../pages/ranking-mensagens.js?v=20261122-progresso7';

export const CRITERIOS = [
  { key: 'autonomia',  label: 'Autonomia e Inovação', curto: 'Aut.',  peso: 0.2 },
  { key: 'atividades', label: 'Atividades',           curto: 'Ativ.', peso: 0.4 },
  { key: 'presenca',   label: 'Presença',             curto: 'Pres.', peso: 0.4 },
];

const N_SEMANAS = 12;
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/* ── Datas (YYYY-MM-DD, contas em UTC) ── */
const toDate = s => new Date(`${s}T00:00:00Z`);
const toKey = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return toKey(d); };
const fmtCurto = s => { const [, m, d] = s.split('-'); return `${d}/${m}`; };

function hojeLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Semanas Dom–Sáb já fechadas (até ontem), da mais recente para a mais antiga. */
export function semanasFechadas(n) {
  const ontem = addDays(hojeLocal(), -1);
  const dow = toDate(ontem).getUTCDay();
  let sabado = dow === 6 ? ontem : addDays(ontem, -(dow + 1));
  const lista = [];
  for (let i = 0; i < n; i++) {
    lista.push({ inicio: addDays(sabado, -6), fim: sabado });
    sabado = addDays(sabado, -7);
  }
  return lista;
}

export const rotuloSemana = s => `${fmtCurto(s.inicio)} – ${fmtCurto(s.fim)}`;
const rotuloInicio = inicio => rotuloSemana({ inicio, fim: addDays(inicio, 6) });

/** Nota final ponderada (0–10, 1 casa). */
export function notaFinal(r) {
  if (!r) return null;
  const total = CRITERIOS.reduce((s, c) => s + (Number(r[c.key]) || 0) * c.peso, 0);
  return Math.round(total * 10) / 10;
}

export const fmtNota = n => (n === null || n === undefined ? '–' : Number(n).toFixed(1).replace('.', ','));
const fmtInt = n => Number(n || 0).toLocaleString('pt-BR');
const fmtSinal = (n, fmt = fmtInt) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(Math.abs(n))}` : fmt(0));

/* ── Dados do grupo (cache curto, compartilhado entre lista e bloco) ── */

let cacheGrupo = null;
let cacheGrupoTs = 0;

async function lerDiarioDoGrupo(db, de, ate) {
  const todas = [];
  const PAGINA = 1000;
  for (let offset = 0; ; offset += PAGINA) {
    const { data, error } = await db.from('group_message_daily')
      .select('day,user_id,messages')
      .eq('group_id', GROUP_ID)
      .gte('day', de)
      .lte('day', ate)
      .order('day', { ascending: true })
      .order('user_id', { ascending: true })
      .range(offset, offset + PAGINA - 1);
    if (error) throw error;
    todas.push(...(data || []));
    if (!data || data.length < PAGINA) break;
  }
  return todas;
}

/**
 * Totais de mensagens por semana para o grupo todo.
 * Devolve { semanas: [{ inicio, fim, fonte, totais: Map userId→n, ranking: [userId...] }], perfis, diario }
 * (semanas da mais recente para a mais antiga; fonte = 'bot' | 'importado' | 'parcial' | null).
 */
export async function carregarGrupo(db, { forcar = false } = {}) {
  if (!forcar && cacheGrupo && Date.now() - cacheGrupoTs < 60_000) return cacheGrupo;
  const semanas = semanasFechadas(N_SEMANAS);
  const de = semanas[semanas.length - 1].inicio;
  const ate = semanas[0].fim;

  const [perfisRes, rankingsRes, diario] = await Promise.all([
    db.from('profiles').select('id,name,role,initials,color,avatar_url,tier,status,join_date'),
    db.from('weekly_rankings').select('week_start,week_end,entries,tipo')
      .or('tipo.is.null,tipo.eq.semanal')
      .gte('week_start', de)
      .lte('week_end', ate),
    lerDiarioDoGrupo(db, de, ate),
  ]);
  if (perfisRes.error) throw perfisRes.error;
  if (rankingsRes.error) throw rankingsRes.error;
  const perfis = perfisRes.data || [];
  const resolver = window.MSYBadges?.makeRankingResolver
    ? window.MSYBadges.makeRankingResolver(perfis)
    : (e => perfis.find(p => p.id === e.user_id) || null);

  const diasDoBot = new Set(diario.map(r => r.day));
  const resultado = semanas.map(s => {
    let diasCobertos = 0;
    for (let d = s.inicio; d <= s.fim; d = addDays(d, 1)) if (diasDoBot.has(d)) diasCobertos++;
    const importado = (rankingsRes.data || []).find(r => r.week_start === s.inicio && r.week_end === s.fim);
    const totais = new Map();
    let fonte = null;
    if (diasCobertos === 7 || (diasCobertos > 0 && !importado)) {
      fonte = diasCobertos === 7 ? 'bot' : 'parcial';
      for (const r of diario) {
        if (r.day < s.inicio || r.day > s.fim || !r.user_id) continue;
        totais.set(r.user_id, (totais.get(r.user_id) || 0) + (Number(r.messages) || 0));
      }
    } else if (importado) {
      fonte = 'importado';
      for (const e of (Array.isArray(importado.entries) ? importado.entries : [])) {
        const p = resolver(e);
        if (!p) continue;
        const n = parseInt(e.messages ?? e.mensagens, 10) || 0;
        totais.set(p.id, Math.max(totais.get(p.id) || 0, n));
      }
    }
    const ranking = [...totais.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    return { ...s, fonte, totais, ranking, relatorio: !!importado };
  });

  cacheGrupo = { semanas: resultado, perfis, diario };
  cacheGrupoTs = Date.now();
  return cacheGrupo;
}

/** Série de um membro: [{ inicio, fim, fonte, total, posicao, participantes, mediaGrupo, totalGrupo }] (mais recente primeiro). */
function serieDoMembro(grupo, userId) {
  return grupo.semanas.map(s => {
    const valores = [...s.totais.values()];
    const totalGrupo = valores.reduce((a, b) => a + b, 0);
    const tem = s.totais.has(userId);
    const total = s.totais.get(userId) || 0;
    // Posição: quantos tiveram mais mensagens + 1 (empates dividem a posição)
    const posicao = s.fonte && tem ? valores.filter(v => v > total).length + 1 : null;
    return {
      inicio: s.inicio,
      fim: s.fim,
      fonte: s.fonte,
      relatorio: s.relatorio,
      total: s.fonte ? total : null,
      posicao,
      participantes: s.totais.size,
      mediaGrupo: valores.length ? Math.round(totalGrupo / valores.length) : null,
      totalGrupo,
    };
  });
}

async function carregarAvaliacoes(db, userId) {
  const { data, error } = await db.from('member_progress_reviews')
    .select('id,user_id,week_start,autonomia,atividades,presenca,comentario,updated_at')
    .eq('user_id', userId)
    .order('week_start', { ascending: false })
    .limit(N_SEMANAS);
  if (error) throw error;
  return data || [];
}

/** Notas da semana para a lista da Diretoria: Map user_id → nota final. */
export async function notasDaSemana(db, weekStart) {
  const { data, error } = await db.from('member_progress_reviews')
    .select('user_id,autonomia,atividades,presenca')
    .eq('week_start', weekStart);
  if (error) throw error;
  return new Map((data || []).map(r => [r.user_id, notaFinal(r)]));
}

/** Mensagens da semana passada e da anterior de cada membro (para a lista da Diretoria). */
export function mensagensRecentes(grupo, userId) {
  const [passada, anterior] = serieDoMembro(grupo, userId);
  return { passada: passada?.total, anterior: anterior?.total };
}

/* ── Gráficos (SVG à mão; hover com tooltip) ── */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Colunas das semanas (mais antiga → mais recente), destaque na última,
 * linha de referência com a média do grupo e tooltip por coluna.
 */
function svgColunas(serie, esc, largura = 560) {
  const pontos = serie.slice().reverse();
  const W = largura, H = 190, padL = 36, padR = 8, padT = 22, padB = 26;
  const maxV = Math.max(1, ...pontos.map(p => Math.max(p.total || 0, p.mediaGrupo || 0)));
  const passo = maxV <= 50 ? 10 : maxV <= 200 ? 50 : maxV <= 1000 ? 250 : maxV <= 2500 ? 500 : 1000;
  const topo = Math.ceil(maxV / passo) * passo;
  const y = v => padT + (H - padT - padB) * (1 - v / topo);
  const banda = (W - padL - padR) / pontos.length;
  const larg = Math.min(24, banda * 0.6);
  // Datas alternadas quando a coluna é estreita demais para "dd/mm" (sempre mostra a última)
  const cadaData = banda < 34 ? 2 : 1;
  // Valor em cima de cada coluna; abreviado (1,3k) quando a coluna é estreita
  const fmtValor = banda < 40
    ? n => (n >= 1000 ? `${(Math.round(n / 100) / 10).toString().replace('.', ',')}k` : String(n))
    : fmtInt;
  const ticks = [];
  for (let v = 0; v <= topo; v += passo) ticks.push(v);

  const grade = ticks.map(v => `
    <line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" class="prog-svg-grid"/>
    <text x="${padL - 6}" y="${y(v) + 3}" class="prog-svg-tick" text-anchor="end">${fmtInt(v)}</text>`).join('');

  const colunas = pontos.map((p, i) => {
    const cx = padL + banda * i + banda / 2;
    const ultimo = i === pontos.length - 1;
    const rotulo = (pontos.length - 1 - i) % cadaData ? '' : `<text x="${cx}" y="${H - 8}" class="prog-svg-tick" text-anchor="middle">${esc(fmtCurto(p.inicio))}</text>`;
    const dica = encodeURIComponent(JSON.stringify({
      t: rotuloSemana(p),
      v: p.total === null ? 'Sem dados' : `${fmtInt(p.total)} mensagens`,
      p: p.posicao ? `${p.posicao}º de ${p.participantes} no ranking` : '',
      m: p.mediaGrupo !== null && p.fonte ? `Média do grupo: ${fmtInt(p.mediaGrupo)}` : '',
      f: p.fonte === 'importado' ? 'Ranking importado' : p.fonte === 'parcial' ? 'Bot (semana parcial)' : p.fonte === 'bot' ? 'Contado pelo Corvus' : '',
    }));
    // Clique abre o relatório semanal cadastrado; sem relatório, a aba Mensagens (contagem automática)
    const link = p.relatorio
      ? ` data-link="ranking.html?aba=semanal&amp;semana=${p.inicio}" data-destino="o relatório semanal"`
      : p.fonte ? ` data-link="ranking.html?aba=mensagens&amp;semana=${p.inicio}" data-destino="a contagem automática"` : '';
    const alvo = `<rect x="${padL + banda * i}" y="${padT}" width="${banda}" height="${H - padT - padB}" class="prog-svg-hit${link ? ' prog-svg-link' : ''}" data-dica="${dica}"${link}/>`;
    if (p.total === null) {
      return `${rotulo}<line x1="${cx - larg / 2}" x2="${cx + larg / 2}" y1="${y(0)}" y2="${y(0)}" class="prog-svg-vazio"/>${alvo}`;
    }
    const topoBarra = y(p.total);
    const alt = Math.max(0, y(0) - topoBarra);
    const r = Math.min(4, alt);
    const x0 = cx - larg / 2, x1 = cx + larg / 2, yb = y(0);
    // Coluna com topo arredondado (4px) e base reta
    const d = alt > 0
      ? `M${x0},${yb} L${x0},${topoBarra + r} Q${x0},${topoBarra} ${x0 + r},${topoBarra} L${x1 - r},${topoBarra} Q${x1},${topoBarra} ${x1},${topoBarra + r} L${x1},${yb} Z`
      : '';
    const valor = `<text x="${cx}" y="${topoBarra - 6}" class="prog-svg-valor${ultimo ? ' atual' : ''}" text-anchor="middle">${fmtValor(p.total)}</text>`;
    return `${rotulo}${d ? `<path d="${d}" class="prog-svg-col${ultimo ? ' atual' : ''}${p.fonte === 'importado' ? ' importado' : ''}"/>` : ''}${valor}${alvo}`;
  }).join('');

  // Média do grupo: linha fina em degraus, uma por semana com dados
  const media = pontos.map((p, i) => (p.mediaGrupo !== null && p.fonte
    ? `<line x1="${padL + banda * i + 2}" x2="${padL + banda * (i + 1) - 2}" y1="${y(p.mediaGrupo)}" y2="${y(p.mediaGrupo)}" class="prog-svg-media"/>`
    : '')).join('');

  return `<svg viewBox="0 0 ${W} ${H}" class="prog-svg" role="img" aria-label="Mensagens por semana nas últimas ${pontos.length} semanas">
    ${grade}${media}${colunas}
  </svg>`;
}

/** Linha da nota final por semana avaliada (0–10), com marcadores e tooltip. */
function svgNotas(avaliacoes, esc, largura = 560) {
  const pontos = avaliacoes.slice().reverse();
  const W = largura, H = 170, padL = 28, padR = 14, padT = 18, padB = 26;
  const y = v => padT + (H - padT - padB) * (1 - v / 10);
  const x = i => (pontos.length === 1 ? (padL + W - padR) / 2 : padL + ((W - padL - padR) * i) / (pontos.length - 1));
  const grade = [0, 5, 10].map(v => `
    <line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" class="prog-svg-grid"/>
    <text x="${padL - 6}" y="${y(v) + 3}" class="prog-svg-tick" text-anchor="end">${v}</text>`).join('');
  const linha = pontos.length > 1
    ? `<polyline points="${pontos.map((p, i) => `${x(i)},${y(notaFinal(p))}`).join(' ')}" class="prog-svg-linha"/>`
    : '';
  const area = pontos.length > 1
    ? `<polygon points="${x(0)},${y(0)} ${pontos.map((p, i) => `${x(i)},${y(notaFinal(p))}`).join(' ')} ${x(pontos.length - 1)},${y(0)}" class="prog-svg-area"/>`
    : '';
  const marcas = pontos.map((p, i) => {
    const n = notaFinal(p);
    const ultimo = i === pontos.length - 1;
    const dica = encodeURIComponent(JSON.stringify({
      t: `Semana ${rotuloInicio(p.week_start)}`,
      v: `Nota ${fmtNota(n)}`,
      p: CRITERIOS.map(c => `${c.label}: ${fmtNota(p[c.key])}`).join(' · '),
    }));
    const espaco = (W - padL - padR) / Math.max(1, pontos.length - 1);
    const cada = espaco < 40 ? Math.ceil(40 / espaco) : 1;
    const mostrarData = (pontos.length - 1 - i) % cada === 0;
    return `${mostrarData ? `<text x="${x(i)}" y="${H - 8}" class="prog-svg-tick" text-anchor="middle">${esc(fmtCurto(p.week_start))}</text>` : ''}
      <circle cx="${x(i)}" cy="${y(n)}" r="${ultimo ? 5 : 4}" class="prog-svg-ponto${ultimo ? ' atual' : ''}"/>
      ${ultimo ? `<text x="${x(i)}" y="${y(n) - 10}" class="prog-svg-valor" text-anchor="middle">${fmtNota(n)}</text>` : ''}
      <circle cx="${x(i)}" cy="${y(n)}" r="14" class="prog-svg-hit" data-dica="${dica}"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="prog-svg" role="img" aria-label="Nota no cargo por semana avaliada">
    ${grade}${area}${linha}${marcas}
  </svg>`;
}

/** Liga o tooltip dos gráficos de um container. */
function ligarDicas(container) {
  const semMouse = window.matchMedia?.('(hover: none)').matches;
  let dica = container.querySelector('.prog-dica');
  if (!dica) {
    dica = document.createElement('div');
    dica.className = 'prog-dica';
    dica.hidden = true;
    container.appendChild(dica);
  }
  const mostrar = (alvo, ev) => {
    let info;
    try { info = JSON.parse(decodeURIComponent(alvo.dataset.dica)); } catch { return; }
    dica.replaceChildren();
    const acao = alvo.dataset.link
      ? `${semMouse ? 'Toque de novo' : 'Clique'} para abrir ${alvo.dataset.destino || 'o Ranking'}`
      : '';
    const linhas = [['prog-dica-t', info.t], ['prog-dica-v', info.v], ['', info.p], ['', info.m], ['prog-dica-f', info.f], ['prog-dica-a', acao]];
    for (const [cls, texto] of linhas) {
      if (!texto) continue;
      const el = document.createElement('div');
      if (cls) el.className = cls;
      el.textContent = texto;
      dica.appendChild(el);
    }
    dica.hidden = false;
    const caixa = container.getBoundingClientRect();
    const px = (ev?.clientX ?? alvo.getBoundingClientRect().left) - caixa.left;
    const py = (ev?.clientY ?? alvo.getBoundingClientRect().top) - caixa.top;
    const larg = dica.offsetWidth;
    dica.style.left = `${Math.max(4, Math.min(px + 12, caixa.width - larg - 4))}px`;
    dica.style.top = `${Math.max(4, py - dica.offsetHeight - 10)}px`;
  };
  let tocado = null; // no celular: 1º toque mostra a dica, 2º toque na mesma coluna abre o Ranking
  container.querySelectorAll('.prog-svg-hit').forEach(alvo => {
    alvo.addEventListener('mousemove', ev => mostrar(alvo, ev));
    alvo.addEventListener('mouseleave', () => { dica.hidden = true; });
    alvo.addEventListener('click', ev => {
      const link = alvo.dataset.link;
      if (link && (!semMouse || tocado === alvo)) { window.location.href = link; return; }
      tocado = alvo;
      mostrar(alvo, ev);
    });
  });
}

/* ── HTML ── */

function tile({ label, valor, sufixo = '', delta = '', deltaTipo = 'same', nota = '' }) {
  return `<div class="prog-tile">
    <div class="prog-tile-label">${label}</div>
    <div class="prog-tile-valor">${valor}${sufixo ? `<small>${sufixo}</small>` : ''}</div>
    ${delta ? `<div class="prog-trend ${deltaTipo}">${delta}</div>` : ''}
    ${nota ? `<div class="prog-tile-nota">${nota}</div>` : ''}
  </div>`;
}

const seta = tipo => (tipo === 'up' ? '<i class="fa-solid fa-arrow-trend-up"></i>' : tipo === 'down' ? '<i class="fa-solid fa-arrow-trend-down"></i>' : '<i class="fa-solid fa-equals"></i>');

function tilesTopo(serie, avaliacoes, veCargo, esc) {
  const [passada, anterior] = serie;
  const tiles = [];

  // 1. Mensagens
  if (passada.total === null) {
    tiles.push(tile({ label: 'Mensagens na semana passada', valor: '–', nota: 'Sem dados dessa semana' }));
  } else {
    let delta = '', tipo = 'same';
    if (anterior?.total !== null && anterior?.total !== undefined) {
      const d = passada.total - anterior.total;
      tipo = d > 0 ? 'up' : d < 0 ? 'down' : 'same';
      const pct = anterior.total > 0 ? ` (${fmtSinal(Math.round((d / anterior.total) * 100))}%)` : '';
      delta = `${seta(tipo)} ${fmtSinal(d)}${pct} vs semana anterior`;
    }
    tiles.push(tile({ label: 'Mensagens na semana passada', valor: fmtInt(passada.total), delta, deltaTipo: tipo, nota: esc(rotuloSemana(passada)) }));
  }

  // 2. Posição no ranking
  if (passada.posicao) {
    let delta = '', tipo = 'same';
    if (anterior?.posicao) {
      const d = anterior.posicao - passada.posicao;
      tipo = d > 0 ? 'up' : d < 0 ? 'down' : 'same';
      delta = d > 0 ? `${seta('up')} subiu ${d} ${d === 1 ? 'posição' : 'posições'}`
        : d < 0 ? `${seta('down')} caiu ${-d} ${d === -1 ? 'posição' : 'posições'}`
        : `${seta('same')} mesma posição`;
    }
    tiles.push(tile({ label: 'Posição no ranking semanal', valor: `${passada.posicao}º`, sufixo: ` de ${passada.participantes}`, delta, deltaTipo: tipo }));
  } else {
    tiles.push(tile({ label: 'Posição no ranking semanal', valor: '–', nota: 'Fora do ranking da semana' }));
  }

  // 3. Nota no cargo (só para quem pode ver)
  if (veCargo) {
    const [ultima, ant] = avaliacoes;
    if (!ultima) {
      tiles.push(tile({ label: 'Nota no cargo', valor: '–', nota: 'Ainda sem avaliação' }));
    } else {
      const n = notaFinal(ultima);
      let delta = '', tipo = 'same';
      if (ant) {
        const d = Math.round((n - notaFinal(ant)) * 10) / 10;
        tipo = d > 0 ? 'up' : d < 0 ? 'down' : 'same';
        delta = `${seta(tipo)} ${fmtSinal(d, fmtNota)} vs avaliação anterior`;
      }
      tiles.push(tile({ label: 'Nota no cargo', valor: fmtNota(n), sufixo: '/10', delta, deltaTipo: tipo, nota: `semana ${esc(rotuloInicio(ultima.week_start))}` }));
    }
  }

  // 4. Recorde pessoal (nas 12 semanas)
  const comDados = serie.filter(s => s.total !== null);
  const recorde = comDados.reduce((m, s) => (!m || s.total > m.total ? s : m), null);
  if (recorde && recorde.total > 0) {
    const ehAgora = recorde === passada;
    tiles.push(tile({
      label: `Recorde nas últimas ${serie.length} semanas`,
      valor: fmtInt(recorde.total),
      delta: ehAgora ? `${seta('up')} batido na semana passada` : '',
      deltaTipo: 'up',
      nota: ehAgora ? '' : `semana ${esc(rotuloSemana(recorde))}`,
    }));
  }
  return `<div class="prog-tiles">${tiles.join('')}</div>`;
}

function htmlMensagens(serie, diarioMembro, esc, largura) {
  if (!serie.some(s => s.total !== null)) {
    return `<div class="prog-card">
      <div class="prog-card-title"><i class="fa-solid fa-comments"></i> Mensagens no grupo</div>
      <div class="prog-vazio">Ainda não há mensagens registradas nas últimas semanas.</div>
    </div>`;
  }
  const [passada] = serie;
  const fatos = [];
  if (passada.total !== null && passada.totalGrupo > 0) {
    const pct = Math.round((passada.total / passada.totalGrupo) * 100);
    fatos.push(`<div class="prog-fato"><strong>${pct}%</strong><span>das mensagens do grupo na semana passada</span></div>`);
  }
  if (passada.total !== null && passada.mediaGrupo !== null) {
    const d = passada.total - passada.mediaGrupo;
    fatos.push(`<div class="prog-fato"><strong>${d >= 0 ? 'Acima' : 'Abaixo'}</strong><span>da média do grupo (${fmtInt(passada.mediaGrupo)} por membro)</span></div>`);
  }
  let alta = 0;
  for (let i = 0; i < serie.length - 1; i++) {
    if (serie[i].total === null || serie[i + 1].total === null || serie[i].total <= serie[i + 1].total) break;
    alta++;
  }
  if (alta >= 1) fatos.push(`<div class="prog-fato"><strong>${alta} ${alta === 1 ? 'semana' : 'semanas'}</strong><span>seguidas em alta</span></div>`);
  // Dia mais ativo: só com dados diários do bot (pelo menos 7 dias)
  if (diarioMembro.length >= 7) {
    const porDia = Array(7).fill(0);
    diarioMembro.forEach(r => { porDia[toDate(r.day).getUTCDay()] += Number(r.messages) || 0; });
    const melhor = porDia.indexOf(Math.max(...porDia));
    if (porDia[melhor] > 0) fatos.push(`<div class="prog-fato"><strong>${DIAS[melhor].replace(/^./, c => c.toUpperCase())}</strong><span>é o dia em que mais fala no grupo</span></div>`);
  }

  return `<div class="prog-card prog-card--chart">
    <div class="prog-card-title"><i class="fa-solid fa-comments"></i> Mensagens por semana <span class="prog-auto">automático</span></div>
    <div class="prog-legenda">
      <span><i class="prog-key prog-key--col"></i> mensagens do membro</span>
      <span><i class="prog-key prog-key--media"></i> média do grupo</span>
      <span class="prog-legenda-nota">clique numa coluna para abrir o relatório da semana</span>
    </div>
    <div class="prog-chart">${svgColunas(serie, esc, largura)}</div>
    ${fatos.length ? `<div class="prog-fatos">${fatos.join('')}</div>` : ''}
  </div>`;
}

function htmlCargo(avaliacoes, { esc, podeAvaliar, semanaAlvo, compacto, largura }) {
  const ultima = avaliacoes[0] || null;
  const anterior = avaliacoes[1] || null;
  const existeAlvo = avaliacoes.find(a => a.week_start === semanaAlvo.inicio);
  const acaoAlvo = podeAvaliar
    ? `<button class="btn btn-sm ${existeAlvo ? 'btn-ghost' : 'btn-gold'} prog-avaliar-btn" type="button" data-week="${semanaAlvo.inicio}">
        <i class="fa-solid ${existeAlvo ? 'fa-pen' : 'fa-star-half-stroke'}"></i> ${existeAlvo ? 'Editar' : 'Avaliar'} semana ${esc(rotuloSemana(semanaAlvo))}
      </button>`
    : '';
  const titulo = `<div class="prog-card-title"><i class="fa-solid fa-briefcase"></i> Desempenho no cargo <span class="prog-auto prog-auto--dir">avaliado pela Diretoria</span>
    ${acaoAlvo ? `<span class="prog-card-acao">${acaoAlvo}</span>` : ''}</div>`;
  if (!ultima) {
    return `<div class="prog-card">${titulo}
      <div class="prog-vazio">${podeAvaliar ? 'Este membro ainda não foi avaliado pela Diretoria.' : 'Você ainda não foi avaliado pela Diretoria.'}</div>
      <div class="prog-pesos">${CRITERIOS.map(c => `<span>${esc(c.label)} <strong>${Math.round(c.peso * 100)}%</strong></span>`).join('')}</div>
    </div>`;
  }
  const criterios = CRITERIOS.map(c => {
    const v = Number(ultima[c.key]) || 0;
    let delta = '';
    if (anterior) {
      const d = Math.round((v - Number(anterior[c.key])) * 10) / 10;
      const tipo = d > 0 ? 'up' : d < 0 ? 'down' : 'same';
      delta = `<span class="prog-crit-delta ${tipo}">${d === 0 ? '=' : fmtSinal(d, fmtNota)}</span>`;
    }
    return `<div class="prog-crit">
      <div class="prog-crit-head"><span>${esc(c.label)} <small>${Math.round(c.peso * 100)}%</small></span><span><strong>${fmtNota(v)}</strong>${delta}</span></div>
      <div class="prog-crit-track"><div class="prog-crit-fill" style="width:${v * 10}%"></div></div>
    </div>`;
  }).join('');
  const media4 = avaliacoes.slice(0, 4);
  const mediaNota = media4.length > 1
    ? Math.round((media4.reduce((s, a) => s + notaFinal(a), 0) / media4.length) * 10) / 10
    : null;

  const grafico = !compacto && avaliacoes.length > 1
    ? `<div class="prog-subtitulo">Nota por semana</div><div class="prog-chart">${svgNotas(avaliacoes, esc, largura)}</div>`
    : '';
  const historico = !compacto && avaliacoes.length
    ? `<div class="prog-subtitulo">Histórico</div>
      <div class="prog-tabela-wrap"><table class="prog-tabela">
        <thead><tr><th>Semana</th>${CRITERIOS.map(c => `<th title="${esc(c.label)}"><span class="prog-th-longo">${esc(c.label.split(' ')[0])}</span><span class="prog-th-curto">${esc(c.curto)}</span></th>`).join('')}<th>Nota</th>${podeAvaliar ? '<th class="prog-th-acao"></th>' : ''}</tr></thead>
        <tbody>${avaliacoes.map(a => `<tr>
          <td>${esc(rotuloInicio(a.week_start))}</td>
          ${CRITERIOS.map(c => `<td>${fmtNota(a[c.key])}</td>`).join('')}
          <td><strong>${fmtNota(notaFinal(a))}</strong></td>
          ${podeAvaliar ? `<td><button class="prog-hist-edit prog-avaliar-btn" type="button" data-week="${a.week_start}" title="Editar avaliação" aria-label="Editar avaliação da semana ${esc(rotuloInicio(a.week_start))}"><i class="fa-solid fa-pen"></i></button></td>` : ''}
        </tr>`).join('')}</tbody>
      </table></div>`
    : '';

  return `<div class="prog-card prog-card--chart">${titulo}
    <div class="prog-cargo-row">
      <div class="prog-crits">${criterios}</div>
      ${mediaNota !== null ? `<div class="prog-fato prog-fato--lado"><strong>${fmtNota(mediaNota)}</strong><span>média das últimas ${media4.length} avaliações</span></div>` : ''}
    </div>
    ${ultima.comentario ? `<div class="prog-comentario"><i class="fa-solid fa-quote-left"></i> ${esc(ultima.comentario)}<div class="prog-comentario-sem">Comentário da semana ${esc(rotuloInicio(ultima.week_start))}</div></div>` : ''}
    ${grafico}
    ${historico}
  </div>`;
}

/* ── Modal de avaliação (Diretoria) ── */

async function referenciaDaSemana(db, Utils, membro, inicio) {
  const fim = addDays(inicio, 6);
  const esc = Utils.escapeHtml;
  try {
    const [atvRes, evRes] = await Promise.all([
      db.from('activities').select('id,title,status,deadline,deadline_time,extended_deadline')
        .eq('assigned_to', membro.id)
        .or(`and(deadline.gte.${inicio},deadline.lte.${fim}),and(extended_deadline.gte.${inicio},extended_deadline.lte.${fim})`)
        .order('deadline', { ascending: true }),
      db.from('events').select('id,title,event_date,status,is_private,mandatory')
        .gte('event_date', inicio).lte('event_date', fim)
        .order('event_date', { ascending: true }),
    ]);
    if (atvRes.error) throw atvRes.error;
    if (evRes.error) throw evRes.error;
    const eventos = (evRes.data || []).filter(e => !e.is_private && e.status !== 'cancelado');
    let presencas = [];
    if (eventos.length) {
      const { data, error } = await db.from('event_presencas')
        .select('event_id,user_id,membro_id,status,response_status,attendance_status,justificativa_status')
        .in('event_id', eventos.map(e => e.id))
        .or(`user_id.eq.${membro.id},membro_id.eq.${membro.id}`);
      if (error) throw error;
      presencas = data || [];
    }
    const atividades = atvRes.data || [];
    const linhaAtv = a => {
      const st = String(a.status || '');
      const fechada = Utils.isActivityFinished?.(st);
      const cls = st === 'Concluída' ? 'ok' : st === 'Incompleta' ? 'meio' : st === 'Cancelada' ? 'neutro' : fechada ? 'ok' : 'pend';
      return `<li><span class="prog-ref-st ${cls}">${esc(st || '—')}</span> ${esc(a.title)} <small>prazo ${esc(fmtCurto(a.extended_deadline || a.deadline))}</small></li>`;
    };
    const linhaEv = e => {
      const p = presencas.find(x => x.event_id === e.id);
      let st = 'Sem registro', cls = 'neutro';
      if (p?.attendance_status === 'presente') { st = 'Presente'; cls = 'ok'; }
      else if (p?.attendance_status === 'ausente') {
        st = p.justificativa_status === 'aceita' ? 'Ausente (justificativa aceita)' : 'Ausente'; cls = p.justificativa_status === 'aceita' ? 'meio' : 'pend';
      } else if (p?.response_status === 'nao_participar') { st = 'Avisou que não iria'; cls = 'meio'; }
      else if (p?.response_status === 'participar') { st = 'Confirmou'; cls = 'neutro'; }
      return `<li><span class="prog-ref-st ${cls}">${esc(st)}</span> ${esc(e.title)} <small>${esc(fmtCurto(e.event_date))}${e.mandatory ? ' · obrigatório' : ''}</small></li>`;
    };
    return `<div class="prog-ref">
      <div class="prog-ref-col">
        <div class="prog-ref-title"><i class="fa-solid fa-list-check"></i> Atividades com prazo na semana</div>
        ${atividades.length ? `<ul>${atividades.map(linhaAtv).join('')}</ul>` : '<div class="prog-ref-vazio">Nenhuma atividade com prazo nessa semana.</div>'}
      </div>
      <div class="prog-ref-col">
        <div class="prog-ref-title"><i class="fa-solid fa-calendar-check"></i> Eventos da semana</div>
        ${eventos.length ? `<ul>${eventos.map(linhaEv).join('')}</ul>` : '<div class="prog-ref-vazio">Nenhum evento nessa semana.</div>'}
      </div>
    </div>`;
  } catch (err) {
    console.error('[MSY][progresso] Erro ao carregar referência da semana:', err);
    return '<div class="prog-ref-vazio">Não foi possível carregar as atividades e eventos da semana.</div>';
  }
}

function abrirAvaliacao({ db, Utils, membro, weekStart, existente, onSalvo }) {
  const esc = Utils.escapeHtml;
  const semanas = semanasFechadas(8);
  if (!semanas.some(s => s.inicio === weekStart)) semanas.push({ inicio: weekStart, fim: addDays(weekStart, 6) });
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open prog-modal';
  const valor = k => (existente ? Number(existente[k]) : '');
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="progModalTitle">
      <div class="modal-header">
        <div>
          <div class="modal-title font-cinzel" id="progModalTitle"><i class="fa-solid fa-star-half-stroke" style="color:var(--gold)"></i> Avaliar desempenho no cargo</div>
          <div class="prog-modal-sub">${esc(membro.name)}${membro.role ? ` · ${esc(membro.role)}` : ''}</div>
        </div>
        <button class="modal-close" type="button" data-fechar aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label" for="progSemana">Semana</label>
          <select class="form-input" id="progSemana">
            ${semanas.map(s => `<option value="${s.inicio}"${s.inicio === weekStart ? ' selected' : ''}>${esc(rotuloSemana(s))}</option>`).join('')}
          </select>
        </div>
        <div class="prog-ref-wrap" id="progRef"><div class="prog-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Carregando atividades e eventos da semana...</div></div>
        <div class="prog-form-crits">
          ${CRITERIOS.map(c => `
            <label class="prog-form-crit">
              <span>${esc(c.label)} <small>${Math.round(c.peso * 100)}%</small></span>
              <input type="number" class="form-input" data-crit="${c.key}" min="0" max="10" step="0.5" inputmode="decimal" placeholder="0 a 10" value="${valor(c.key)}">
            </label>`).join('')}
        </div>
        <div class="prog-form-final">Nota final: <strong id="progNotaFinal">–</strong></div>
        <div class="form-group">
          <label class="form-label" for="progComentario">Comentário para o membro <small>(opcional)</small></label>
          <textarea class="form-input" id="progComentario" rows="3" maxlength="1000" placeholder="O que foi bem, o que melhorar...">${esc(existente?.comentario || '')}</textarea>
        </div>
      </div>
      <div class="modal-footer">
        ${existente ? '<button class="btn btn-ghost prog-apagar" type="button" id="progApagar"><i class="fa-solid fa-trash"></i> Apagar</button>' : ''}
        <button class="btn btn-ghost" type="button" data-fechar>Cancelar</button>
        <button class="btn btn-gold" type="button" id="progSalvar"><i class="fa-solid fa-floppy-disk"></i> Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  referenciaDaSemana(db, Utils, membro, weekStart).then(html => {
    const ref = overlay.querySelector('#progRef');
    if (ref) ref.innerHTML = html;
  });

  const fechar = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay || e.target.closest('[data-fechar]')) fechar(); });
  const inputs = [...overlay.querySelectorAll('[data-crit]')];
  const ler = () => {
    const r = {};
    for (const i of inputs) r[i.dataset.crit] = i.value === '' ? NaN : Number(String(i.value).replace(',', '.'));
    return r;
  };
  const valido = r => CRITERIOS.every(c => Number.isFinite(r[c.key]) && r[c.key] >= 0 && r[c.key] <= 10);
  const atualizar = () => {
    const r = ler();
    overlay.querySelector('#progNotaFinal').textContent = valido(r) ? fmtNota(notaFinal(r)) : '–';
  };
  inputs.forEach(i => i.addEventListener('input', atualizar));
  atualizar();

  // Trocar a semana carrega a avaliação dela, se existir
  const semanaSel = overlay.querySelector('#progSemana');
  semanaSel.addEventListener('change', async () => {
    try {
      const { data, error } = await db.from('member_progress_reviews')
        .select('id,week_start,autonomia,atividades,presenca,comentario')
        .eq('user_id', membro.id).eq('week_start', semanaSel.value).maybeSingle();
      if (error) throw error;
      fechar();
      abrirAvaliacao({ db, Utils, membro, weekStart: semanaSel.value, existente: data || null, onSalvo });
    } catch (err) {
      console.error('[MSY][progresso] Erro ao carregar avaliação da semana:', err);
      Utils.showToast('Erro ao carregar a avaliação dessa semana.', 'error');
    }
  });

  overlay.querySelector('#progSalvar').addEventListener('click', async e => {
    const r = ler();
    if (!valido(r)) { Utils.showToast('Dê uma nota de 0 a 10 para os três critérios.', 'error'); return; }
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const { error } = await db.from('member_progress_reviews').upsert({
        user_id: membro.id,
        week_start: semanaSel.value,
        autonomia: r.autonomia,
        atividades: r.atividades,
        presenca: r.presenca,
        comentario: overlay.querySelector('#progComentario').value.trim() || null,
      }, { onConflict: 'user_id,week_start' });
      if (error) throw error;
      Utils.showToast('Avaliação salva.');
      fechar();
      onSalvo?.();
    } catch (err) {
      console.error('[MSY][progresso] Erro ao salvar avaliação:', err);
      Utils.showToast('Erro ao salvar a avaliação.', 'error');
      btn.disabled = false;
    }
  });

  overlay.querySelector('#progApagar')?.addEventListener('click', async () => {
    const ok = typeof MSYConfirm !== 'undefined'
      ? await MSYConfirm.show(`Apagar a avaliação de ${membro.name} da semana ${rotuloInicio(existente.week_start)}?`, { title: 'Apagar avaliação' })
      : window.confirm('Apagar esta avaliação?');
    if (!ok) return;
    try {
      const { error } = await db.from('member_progress_reviews').delete().eq('id', existente.id);
      if (error) throw error;
      Utils.showToast('Avaliação apagada.');
      fechar();
      onSalvo?.();
    } catch (err) {
      console.error('[MSY][progresso] Erro ao apagar avaliação:', err);
      Utils.showToast('Erro ao apagar a avaliação.', 'error');
    }
  });
}

/* ── Advertências (member_warnings, migration 20261122_member_warnings.sql) ──
   Só o próprio membro e a Diretoria veem. Contam para o limite as dos
   últimos 3 meses; com 3 ou mais aparece "Sujeito a suspensão". */

export const ADV_LIMITE = 3;
const ADV_MESES = 3;
const ADV_ALERTA = 'Sujeito a suspensão';

/** Primeiro dia que ainda conta para o limite (hoje − 3 meses). */
export function inicioContagemAdv() {
  const [y, m, d] = hojeLocal().split('-').map(Number);
  const ref = new Date(Date.UTC(y, m - 1 - ADV_MESES, d));
  return toKey(ref);
}

const fmtData = s => { const [y, m, d] = String(s).split('-'); return `${d}/${m}/${y}`; };

async function carregarAdvertencias(db, userId) {
  const { data, error } = await db.from('member_warnings')
    .select('id,user_id,motivo,applied_at,created_at,autor:profiles!member_warnings_created_by_fkey(name)')
    .eq('user_id', userId)
    .order('applied_at', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Advertências que contam (últimos 3 meses) por membro: Map user_id → n. Só a Diretoria lê todas. */
export async function advertenciasAtivas(db) {
  const { data, error } = await db.from('member_warnings')
    .select('user_id')
    .gte('applied_at', inicioContagemAdv());
  if (error) throw error;
  const mapa = new Map();
  (data || []).forEach(r => mapa.set(r.user_id, (mapa.get(r.user_id) || 0) + 1));
  return mapa;
}

function alertaAdv(ativas, { esc, proprio }) {
  if (ativas < ADV_LIMITE) return '';
  return `<div class="prog-alerta" role="alert">
    <i class="fa-solid fa-triangle-exclamation"></i>
    <div><strong>${esc(ADV_ALERTA)}</strong>
      <span>${proprio ? 'Você tem' : 'Este membro tem'} ${ativas} advertências nos últimos ${ADV_MESES} meses.</span></div>
  </div>`;
}

function htmlAdvertencias(lista, { esc, podeGerenciar, proprio }) {
  const corte = inicioContagemAdv();
  const ativas = lista.filter(a => a.applied_at >= corte).length;
  const nova = podeGerenciar
    ? `<span class="prog-card-acao"><button class="btn btn-sm btn-ghost prog-adv-nova" type="button"><i class="fa-solid fa-plus"></i> Nova advertência</button></span>`
    : '';
  const contador = `<span class="prog-adv-contador${ativas >= ADV_LIMITE ? ' alto' : ativas ? ' medio' : ''}">${ativas} de ${ADV_LIMITE} nos últimos ${ADV_MESES} meses</span>`;
  const itens = lista.map(a => {
    const conta = a.applied_at >= corte;
    return `<li class="prog-adv-item${conta ? '' : ' antiga'}">
      <div class="prog-adv-head">
        <span class="prog-adv-data"><i class="fa-regular fa-calendar"></i> ${esc(fmtData(a.applied_at))}</span>
        ${conta ? '' : '<span class="prog-adv-tag">fora da contagem</span>'}
        ${podeGerenciar ? `<span class="prog-adv-acoes">
          <button class="prog-hist-edit prog-adv-editar" type="button" data-id="${a.id}" title="Editar advertência" aria-label="Editar advertência de ${esc(fmtData(a.applied_at))}"><i class="fa-solid fa-pen"></i></button>
        </span>` : ''}
      </div>
      <div class="prog-adv-motivo">${esc(a.motivo)}</div>
      ${a.autor?.name ? `<div class="prog-adv-autor">Aplicada por ${esc(a.autor.name)}</div>` : ''}
    </li>`;
  }).join('');
  return `<div class="prog-card prog-card--largo">
    <div class="prog-card-title"><i class="fa-solid fa-triangle-exclamation"></i> Advertências ${contador}${nova}</div>
    ${lista.length
      ? `<ul class="prog-adv-lista">${itens}</ul>`
      : `<div class="prog-vazio">${proprio ? 'Você não tem advertências.' : 'Nenhuma advertência registrada.'}</div>`}
  </div>`;
}

function abrirAdvertencia({ db, Utils, membro, existente, onSalvo }) {
  const esc = Utils.escapeHtml;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open prog-modal';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="progAdvTitle">
      <div class="modal-header">
        <div>
          <div class="modal-title font-cinzel" id="progAdvTitle"><i class="fa-solid fa-triangle-exclamation" style="color:var(--red-bright)"></i> ${existente ? 'Editar advertência' : 'Nova advertência'}</div>
          <div class="prog-modal-sub">${esc(membro.name)}${membro.role ? ` · ${esc(membro.role)}` : ''}</div>
        </div>
        <button class="modal-close" type="button" data-fechar aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label" for="progAdvData">Data</label>
          <input type="date" class="form-input" id="progAdvData" max="${hojeLocal()}" value="${existente?.applied_at || hojeLocal()}">
        </div>
        <div class="form-group">
          <label class="form-label" for="progAdvMotivo">Motivo</label>
          <textarea class="form-input" id="progAdvMotivo" rows="4" maxlength="1000" placeholder="O que aconteceu e por que a advertência foi aplicada">${esc(existente?.motivo || '')}</textarea>
        </div>
        <div class="prog-adv-regra"><i class="fa-solid fa-circle-info"></i> O membro vê a advertência na página Progresso. Com ${ADV_LIMITE} nos últimos ${ADV_MESES} meses aparece "${esc(ADV_ALERTA)}".</div>
      </div>
      <div class="modal-footer">
        ${existente ? '<button class="btn btn-ghost prog-apagar" type="button" id="progAdvApagar"><i class="fa-solid fa-trash"></i> Apagar</button>' : ''}
        <button class="btn btn-ghost" type="button" data-fechar>Cancelar</button>
        <button class="btn btn-primary" type="button" id="progAdvSalvar"><i class="fa-solid fa-floppy-disk"></i> Salvar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const fechar = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay || e.target.closest('[data-fechar]')) fechar(); });
  overlay.querySelector('#progAdvMotivo').focus();

  overlay.querySelector('#progAdvSalvar').addEventListener('click', async e => {
    const motivo = overlay.querySelector('#progAdvMotivo').value.trim();
    const data = overlay.querySelector('#progAdvData').value;
    if (motivo.length < 3) { Utils.showToast('Escreva o motivo da advertência.', 'error'); return; }
    if (!data || data > hojeLocal()) { Utils.showToast('Escolha uma data até hoje.', 'error'); return; }
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const { error } = existente
        ? await db.from('member_warnings').update({ motivo, applied_at: data }).eq('id', existente.id)
        : await db.from('member_warnings').insert({ user_id: membro.id, motivo, applied_at: data });
      if (error) throw error;
      Utils.showToast(existente ? 'Advertência atualizada.' : 'Advertência registrada.');
      fechar();
      onSalvo?.();
    } catch (err) {
      console.error('[MSY][progresso] Erro ao salvar advertência:', err);
      Utils.showToast('Erro ao salvar a advertência.', 'error');
      btn.disabled = false;
    }
  });

  overlay.querySelector('#progAdvApagar')?.addEventListener('click', async () => {
    const ok = typeof MSYConfirm !== 'undefined'
      ? await MSYConfirm.show(`Apagar a advertência de ${membro.name} de ${fmtData(existente.applied_at)}?`, { title: 'Apagar advertência' })
      : window.confirm('Apagar esta advertência?');
    if (!ok) return;
    try {
      const { error } = await db.from('member_warnings').delete().eq('id', existente.id);
      if (error) throw error;
      Utils.showToast('Advertência apagada.');
      fechar();
      onSalvo?.();
    } catch (err) {
      console.error('[MSY][progresso] Erro ao apagar advertência:', err);
      Utils.showToast('Erro ao apagar a advertência.', 'error');
    }
  });
}

/**
 * Desenha o progresso de `membro` em `container`.
 * viewer: perfil de quem está vendo. O cargo só aparece para o próprio membro
 * e para a Diretoria (que também pode avaliar).
 * compacto: versão do modal de Membros (sem gráfico de notas nem histórico).
 */
export async function renderProgresso(container, { db, Utils, membro, viewer, titulo = true, compacto = false, onAlterado = null }) {
  if (!container || !membro?.id) return;
  const esc = Utils.escapeHtml;
  const ehDiretoria = viewer?.tier === 'diretoria';
  const veCargo = ehDiretoria || viewer?.id === membro.id;
  const semanaAlvo = semanasFechadas(1)[0];
  const opcoes = { db, Utils, membro, viewer, titulo, compacto, onAlterado };

  container.classList.add('prog-wrap');
  container.innerHTML = '<div class="prog-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Carregando progresso...</div>';
  try {
    let erroCargo = false;
    let erroAdv = false;
    const [grupo, avaliacoes, advertencias] = await Promise.all([
      carregarGrupo(db),
      veCargo
        ? carregarAvaliacoes(db, membro.id).catch(err => {
            console.error('[MSY][progresso] Erro ao carregar avaliações:', err);
            erroCargo = true;
            return [];
          })
        : Promise.resolve([]),
      veCargo
        ? carregarAdvertencias(db, membro.id).catch(err => {
            console.error('[MSY][progresso] Erro ao carregar advertências:', err);
            erroAdv = true;
            return [];
          })
        : Promise.resolve([]),
    ]);
    // Gráficos desenhados na largura real do card: o texto fica no tamanho certo no celular
    const duasColunas = !compacto && window.innerWidth >= 1200;
    const larguraCard = duasColunas ? (container.clientWidth - 14) / 2 : container.clientWidth;
    const largura = Math.round(Math.max(260, Math.min(900, larguraCard - 38)));
    const proprio = viewer?.id === membro.id;
    const advAtivas = advertencias.filter(a => a.applied_at >= inicioContagemAdv()).length;
    const advHtml = !veCargo ? ''
      : erroAdv
        ? `<div class="prog-card prog-card--largo">
            <div class="prog-card-title"><i class="fa-solid fa-triangle-exclamation"></i> Advertências</div>
            <div class="prog-vazio">Não foi possível carregar as advertências agora.</div>
          </div>`
        : htmlAdvertencias(advertencias, { esc, podeGerenciar: ehDiretoria, proprio });
    const serie = serieDoMembro(grupo, membro.id);
    const quatroSemanas = semanasFechadas(4);
    const diarioMembro = grupo.diario.filter(r => r.user_id === membro.id && r.day >= quatroSemanas[3].inicio);

    const cargoHtml = !veCargo ? ''
      : erroCargo
        ? `<div class="prog-card">
            <div class="prog-card-title"><i class="fa-solid fa-briefcase"></i> Desempenho no cargo</div>
            <div class="prog-vazio">Não foi possível carregar as avaliações agora.</div>
          </div>`
        : htmlCargo(avaliacoes, { esc, podeAvaliar: ehDiretoria, semanaAlvo, compacto, largura });

    container.innerHTML = `
      ${titulo ? `<div class="prog-title"><i class="fa-solid fa-chart-line"></i> Progresso na Masayoshi</div>` : ''}
      ${veCargo ? alertaAdv(advAtivas, { esc, proprio }) : ''}
      ${tilesTopo(serie, avaliacoes, veCargo && !erroCargo, esc)}
      <div class="prog-grid${compacto ? ' prog-grid--compacto' : ''}">
        ${htmlMensagens(serie, diarioMembro, esc, largura)}
        ${cargoHtml}
        ${advHtml}
      </div>`;
    ligarDicas(container);
    // Redesenha quando a largura muda bastante (girar o celular, redimensionar a janela)
    if (!container._progResize) {
      let larguraAntes = container.clientWidth;
      let timer = null;
      container._progResize = () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          if (!container.isConnected) { window.removeEventListener('resize', container._progResize); return; }
          if (Math.abs(container.clientWidth - larguraAntes) < 60) return;
          larguraAntes = container.clientWidth;
          renderProgresso(container, container._progOpcoes);
        }, 250);
      };
      window.addEventListener('resize', container._progResize);
    }
    container._progOpcoes = opcoes;
    const aposAlterar = () => {
      renderProgresso(container, opcoes);
      onAlterado?.();
    };
    container.querySelector('.prog-adv-nova')?.addEventListener('click', () =>
      abrirAdvertencia({ db, Utils, membro, existente: null, onSalvo: aposAlterar }));
    container.querySelectorAll('.prog-adv-editar').forEach(btn => btn.addEventListener('click', () =>
      abrirAdvertencia({ db, Utils, membro, existente: advertencias.find(a => a.id === btn.dataset.id), onSalvo: aposAlterar })));
    container.querySelectorAll('.prog-avaliar-btn').forEach(btn => btn.addEventListener('click', () => {
      const weekStart = btn.dataset.week;
      abrirAvaliacao({
        db, Utils, membro, weekStart,
        existente: avaliacoes.find(a => a.week_start === weekStart) || null,
        onSalvo: () => {
          renderProgresso(container, opcoes);
          onAlterado?.();
        },
      });
    }));
  } catch (err) {
    console.error('[MSY][progresso]', err);
    container.innerHTML = '<div class="prog-vazio">Erro ao carregar o progresso. Tente recarregar a página.</div>';
  }
}

export { abrirAvaliacao };
