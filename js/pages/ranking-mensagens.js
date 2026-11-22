/**
 * Aba "Mensagens" do Ranking: mensagens por membro no grupo da Masayoshi.
 *
 * Os números vêm de group_message_daily, que o bot Corvus preenche todo dia
 * à 1h com o dia anterior (migration 20261121_group_message_daily.sql).
 * Cada período é lido numa consulta só e somado aqui no navegador.
 *
 *   Semana  → colunas Dom a Sáb (semana fixa, setas para trocar)
 *   Mês     → uma coluna por semana (Dom–Sáb) dentro do mês. Semana que o bot
 *             não cobre inteira usa o ranking semanal importado (weekly_rankings)
 *             daquela mesma semana, se existir — é o histórico de antes do bot.
 *   Período → datas livres: até 7 dias, um dia por coluna; acima, uma por semana
 *   Média   → total ÷ dias do período que já fecharam (até ontem)
 */

const GROUP_ID = '553493181512-1629215863@g.us'; // Masayoshi.🍷 (grupo padrão do bot)
const DIAS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/* ── Datas (strings YYYY-MM-DD, contas em UTC para não sofrer com fuso) ── */

const toDate = s => new Date(`${s}T00:00:00Z`);
const toKey = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return toKey(d); };
const weekday = s => toDate(s).getUTCDay();
const startOfWeek = s => addDays(s, -weekday(s));
const fmtDia = s => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
const fmtCurto = s => { const [, m, d] = s.split('-'); return `${d}/${m}`; };
const diasEntre = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000) + 1;

function hojeLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Colunas do período: um dia por coluna na semana e em períodos de até 7 dias;
 * acima disso, semanas Dom–Sáb cortadas no período.
 */
function colunasDo(modo, inicio, fim) {
  if (modo === 'semana' || (modo === 'livre' && diasEntre(inicio, fim) <= 7)) {
    const cols = [];
    for (let dia = inicio; dia <= fim; dia = addDays(dia, 1)) {
      cols.push({ rotulo: DIAS[weekday(dia)], sub: fmtCurto(dia), de: dia, ate: dia });
    }
    return cols;
  }
  const cols = [];
  let de = inicio;
  while (de <= fim) {
    const sabado = addDays(de, 6 - weekday(de));
    const ate = sabado < fim ? sabado : fim;
    cols.push({ rotulo: `SEM ${cols.length + 1}`, sub: `${fmtCurto(de)}–${fmtCurto(ate)}`, de, ate });
    de = addDays(ate, 1);
  }
  return cols;
}

/**
 * Monta as linhas da tabela a partir das linhas do banco. `importados` troca
 * colunas inteiras (índice → entries do ranking semanal) pelo total importado.
 */
function montarTabela(registros, colunas, diasFechados, importados = new Map(), perfis = new Map()) {
  const porMembro = new Map();
  const membro = (id, perfil) => {
    let m = porMembro.get(id);
    if (!m) {
      m = { id, perfil, valores: colunas.map(() => 0), total: 0 };
      porMembro.set(id, m);
    }
    return m;
  };
  for (const r of registros) {
    if (!r.profile) continue;
    const i = colunas.findIndex(c => r.day >= c.de && r.day <= c.ate);
    if (i < 0 || importados.has(i)) continue;
    const m = membro(r.user_id, r.profile);
    m.valores[i] += r.messages;
    m.total += r.messages;
  }
  for (const [i, entries] of importados) {
    for (const e of entries) {
      const perfil = perfis.get(e.user_id);
      const n = Number(e.messages) || 0;
      if (!perfil) continue;
      const m = membro(e.user_id, perfil);
      m.valores[i] += n;
      m.total += n;
    }
  }
  const membros = [...porMembro.values()].sort((a, b) =>
    b.total - a.total || a.perfil.name.localeCompare(b.perfil.name, 'pt-BR'));
  const totais = colunas.map((_, i) => membros.reduce((s, m) => s + m.valores[i], 0));
  const total = totais.reduce((s, n) => s + n, 0);
  const media = n => (diasFechados > 0 ? Math.round(n / diasFechados) : 0);
  return { membros, totais, total, media };
}

/**
 * Total de mensagens de cada membro entre `inicio` e `fim` (YYYY-MM-DD, inclusive),
 * do maior para o menor. Usado para preencher o "Novo Ranking" sem print.
 * Devolve { linhas: [{ user_id, messages }], ultimoDia } — ultimoDia é o dia mais
 * recente que o bot já contou no período (null se não há nada).
 */
export async function somarMensagensDoPeriodo(db, inicio, fim) {
  const { data, error } = await db.from('group_message_daily')
    .select('day,user_id,messages')
    .eq('group_id', GROUP_ID)
    .gte('day', inicio)
    .lte('day', fim)
    .limit(5000);
  if (error) throw error;
  const porMembro = new Map();
  let ultimoDia = null;
  for (const r of data || []) {
    if (!r.user_id) continue;
    porMembro.set(r.user_id, (porMembro.get(r.user_id) || 0) + (Number(r.messages) || 0));
    if (!ultimoDia || r.day > ultimoDia) ultimoDia = r.day;
  }
  const linhas = [...porMembro.entries()]
    .map(([user_id, messages]) => ({ user_id, messages }))
    .sort((a, b) => b.messages - a.messages);
  return { linhas, ultimoDia };
}

/** Última semana Dom–Sáb que já fechou (até ontem). */
export function ultimaSemanaFechada() {
  const ontem = addDays(hojeLocal(), -1);
  const sabado = weekday(ontem) === 6 ? ontem : addDays(startOfWeek(ontem), -1);
  return { inicio: addDays(sabado, -6), fim: sabado };
}

/** Último mês que já fechou (até ontem). */
export function ultimoMesFechado() {
  const ontem = addDays(hojeLocal(), -1);
  const [y, m] = ontem.split('-').map(Number);
  const fimDoMes = toKey(new Date(Date.UTC(y, m, 0)));
  const ref = fimDoMes === ontem ? ontem : toKey(new Date(Date.UTC(y, m - 1, 0)));
  return { inicio: `${ref.slice(0, 7)}-01`, fim: ref };
}

/* ── Componente ── */

export function createMensagensTab({ db, Utils }) {
  const ontem = addDays(hojeLocal(), -1);
  const estado = {
    modo: 'semana',
    semana: startOfWeek(ontem),
    mes: ontem.slice(0, 7),
    livreDe: startOfWeek(ontem),
    livreAte: ontem
  };
  let container = null;
  let ultimo = null; // { titulo, periodo, colunas, tabela } para Copiar/PDF
  let pedido = 0;

  function periodo() {
    if (estado.modo === 'semana') return { inicio: estado.semana, fim: addDays(estado.semana, 6) };
    if (estado.modo === 'mes') {
      const inicio = `${estado.mes}-01`;
      const [y, m] = estado.mes.split('-').map(Number);
      const fim = toKey(new Date(Date.UTC(y, m, 0)));
      return { inicio, fim };
    }
    return estado.livreDe <= estado.livreAte
      ? { inicio: estado.livreDe, fim: estado.livreAte }
      : { inicio: estado.livreAte, fim: estado.livreDe };
  }

  function rotuloNavegacao() {
    if (estado.modo === 'mes') {
      const [y, m] = estado.mes.split('-').map(Number);
      return `${MESES[m - 1]} de ${y}`;
    }
    const { inicio, fim } = periodo();
    return `${fmtDia(inicio)} a ${fmtDia(fim)}`;
  }

  function mover(passo) {
    if (estado.modo === 'semana') estado.semana = addDays(estado.semana, 7 * passo);
    if (estado.modo === 'mes') {
      const [y, m] = estado.mes.split('-').map(Number);
      const d = new Date(Date.UTC(y, m - 1 + passo, 1));
      estado.mes = toKey(d).slice(0, 7);
    }
    carregar();
  }

  function htmlControles() {
    const modos = [['semana', 'Semana'], ['mes', 'Mês'], ['livre', 'Período']];
    const nav = estado.modo === 'livre'
      ? `<div class="rmsg-datas">
          <label>De <input type="date" id="rmsgDe" value="${estado.livreDe}" max="${ontem}"></label>
          <label>até <input type="date" id="rmsgAte" value="${estado.livreAte}" max="${ontem}"></label>
        </div>`
      : `<div class="rmsg-nav">
          <button class="rmsg-seta" data-passo="-1" aria-label="Anterior"><i class="fa-solid fa-chevron-left"></i></button>
          <span class="rmsg-nav-label">${Utils.escapeHtml(rotuloNavegacao())}</span>
          <button class="rmsg-seta" data-passo="1" aria-label="Próximo"><i class="fa-solid fa-chevron-right"></i></button>
        </div>`;
    return `
      <div class="rmsg-head">
        <div>
          <div class="rmsg-title">Mensagens por participante</div>
          <div class="rmsg-sub">Grupo Masayoshi · atualizado todo dia à 1h, com os números até ontem</div>
        </div>
        <div class="rmsg-acoes">
          <button class="btn btn-ghost btn-sm" id="rmsgCopiar"><i class="fa-regular fa-copy"></i> Copiar</button>
          <button class="btn btn-primary btn-sm" id="rmsgPdf"><i class="fa-solid fa-file-pdf"></i> Baixar PDF</button>
        </div>
      </div>
      <div class="rmsg-filtros">
        <div class="rmsg-modos" role="tablist">
          ${modos.map(([k, l]) => `<button class="rmsg-modo${estado.modo === k ? ' active' : ''}" data-modo="${k}" role="tab" aria-selected="${estado.modo === k}">${l}</button>`).join('')}
        </div>
        ${nav}
      </div>
      <div id="rmsgTabela"><div class="loading-container"><i class="fa-solid fa-circle-notch fa-spin"></i> Carregando...</div></div>`;
  }

  function avatar(p) {
    return `<span class="rmsg-avatar" style="--c:${Utils.escapeHtml(p.color || '#c9a84c')}">${p.avatar_url
      ? `<img src="${Utils.escapeHtml(p.avatar_url)}" alt="" loading="lazy">`
      : Utils.escapeHtml(p.initials || Utils.getInitials(p.name))}</span>`;
  }

  function htmlTabela(colunas, tabela) {
    if (!tabela.membros.length) {
      return '<div class="empty-state">Ainda não há mensagens contadas neste período.</div>';
    }
    // Coluna que começa hoje ou depois ainda não tem números (o bot manda à 1h do dia seguinte).
    const celula = (v, i) => `<td>${colunas[i].de > ontem ? '<span class="rmsg-pendente">–</span>' : v}</td>`;
    const cabecalho = colunas.map(c => `<th${c.importado ? ' class="rmsg-importado" title="Total do ranking semanal importado"' : ''}><span>${c.rotulo}</span><small>${c.sub}</small>${c.importado ? '<small>importado</small>' : ''}</th>`).join('');
    const linhas = tabela.membros.map(m => `
      <tr class="${m.total ? '' : 'rmsg-zerado'}">
        <td class="rmsg-membro"><div class="rmsg-membro-in">${avatar(m.perfil)}<span>${Utils.escapeHtml(m.perfil.name)}</span></div></td>
        ${m.valores.map(celula).join('')}
        <td class="rmsg-total">${m.total}</td>
        <td class="rmsg-media">${tabela.media(m.total)}</td>
      </tr>`).join('');
    return `
      <div class="rmsg-card">
        <div class="rmsg-scroll">
          <table class="rmsg-table">
            <thead><tr><th class="rmsg-membro">Membros</th>${cabecalho}<th>Total</th><th>Média</th></tr></thead>
            <tbody>${linhas}</tbody>
            <tfoot><tr>
              <td class="rmsg-membro">Total do grupo</td>
              ${tabela.totais.map(celula).join('')}
              <td>${tabela.total}</td>
              <td>${tabela.media(tabela.total)}</td>
            </tr></tfoot>
          </table>
        </div>
      </div>`;
  }

  async function carregar() {
    if (!container) return;
    const meu = ++pedido;
    container.innerHTML = htmlControles();
    ligarControles();
    const alvo = container.querySelector('#rmsgTabela');
    const { inicio, fim } = periodo();
    const colunas = colunasDo(estado.modo, inicio, fim);
    const fechadoAte = fim < ontem ? fim : ontem;
    const diasFechados = inicio <= fechadoAte ? diasEntre(inicio, fechadoAte) : 0;

    try {
      const [diario, semanais] = await Promise.all([
        db.from('group_message_daily')
          .select('day,user_id,messages,profile:user_id(name,initials,color,avatar_url)')
          .eq('group_id', GROUP_ID)
          .gte('day', inicio)
          .lte('day', fim),
        estado.modo === 'mes'
          ? db.from('weekly_rankings')
            .select('week_start,week_end,entries')
            .or('tipo.is.null,tipo.eq.semanal')
            .gte('week_start', inicio)
            .lte('week_end', fim)
          : Promise.resolve({ data: [] })
      ]);
      if (diario.error) throw diario.error;
      if (semanais.error) throw semanais.error;
      const data = diario.data || [];

      // Semana que o bot não cobre inteira (até ontem) usa o ranking semanal importado.
      const diasDoBot = new Set(data.map(r => r.day));
      const importados = new Map();
      colunas.forEach((c, i) => {
        const ranking = (semanais.data || []).find(r => r.week_start === c.de && r.week_end === c.ate);
        if (!ranking || c.de > ontem) return;
        const ate = c.ate < ontem ? c.ate : ontem;
        let completa = true;
        for (let d = c.de; d <= ate; d = addDays(d, 1)) if (!diasDoBot.has(d)) completa = false;
        if (completa) return;
        importados.set(i, Array.isArray(ranking.entries) ? ranking.entries : []);
        c.importado = true;
      });

      const perfis = new Map(data.filter(r => r.profile).map(r => [r.user_id, r.profile]));
      const faltando = [...new Set([...importados.values()].flat().map(e => e.user_id))]
        .filter(id => id && !perfis.has(id));
      if (faltando.length) {
        const { data: extras, error: errPerfis } = await db.from('profiles')
          .select('id,name,initials,color,avatar_url')
          .in('id', faltando);
        if (errPerfis) throw errPerfis;
        for (const p of extras || []) perfis.set(p.id, p);
      }
      if (meu !== pedido) return;
      const tabela = montarTabela(data, colunas, diasFechados, importados, perfis);
      ultimo = { periodo: `${fmtDia(inicio)} a ${fmtDia(fim)}`, colunas, tabela };
      alvo.innerHTML = htmlTabela(colunas, tabela);
    } catch (err) {
      console.error('[MSY][ranking-mensagens]', err);
      if (meu !== pedido) return;
      ultimo = null;
      alvo.innerHTML = '<div class="empty-state">Erro ao carregar. Tente recarregar a página.</div>';
    }
  }

  function textoParaCopiar() {
    const { periodo: p, colunas, tabela } = ultimo;
    const linhas = tabela.membros.map((m, i) => `${i + 1}. ${m.perfil.name} — ${m.total} (média ${tabela.media(m.total)}/dia)`);
    const porColuna = colunas.map((c, i) => `${c.rotulo} ${tabela.totais[i]}`).join(' · ');
    return [
      '*MENSAGENS POR PARTICIPANTE*',
      `_${p}_`,
      '',
      ...linhas,
      '',
      `*Total do grupo:* ${tabela.total} (média ${tabela.media(tabela.total)}/dia)`,
      porColuna
    ].join('\n');
  }

  async function copiar() {
    if (!ultimo?.tabela.membros.length) { Utils.showToast('Nada para copiar neste período.', 'error'); return; }
    try {
      await navigator.clipboard.writeText(textoParaCopiar());
      Utils.showToast('Tabela copiada! É só colar no WhatsApp.');
    } catch (err) {
      console.error('[MSY][ranking-mensagens] copiar', err);
      Utils.showToast('Não consegui copiar. Tente de novo.', 'error');
    }
  }

  function baixarPdf() {
    if (!ultimo?.tabela.membros.length) { Utils.showToast('Nada para exportar neste período.', 'error'); return; }
    if (!window.jspdf) { Utils.showToast('Biblioteca de PDF não carregou. Recarregue a página.', 'error'); return; }
    const { periodo: p, colunas, tabela } = ultimo;
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const W = 297, M = 14;
    const nomeW = 62;
    const colW = (W - 2 * M - nomeW) / (colunas.length + 2);
    const xCol = i => M + nomeW + colW * i + colW / 2;

    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15);
    pdf.text('Mensagens por participante — Masayoshi', M, 18);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(110);
    pdf.text(p, M, 25);

    let y = 36;
    const linha = (valores, { bold = false, fundo = null } = {}) => {
      if (fundo) { pdf.setFillColor(...fundo); pdf.rect(M, y - 5, W - 2 * M, 8, 'F'); }
      pdf.setFont('helvetica', bold ? 'bold' : 'normal');
      pdf.text(String(valores[0]), M + 2, y);
      valores.slice(1).forEach((v, i) => pdf.text(String(v), xCol(i), y, { align: 'center' }));
      y += 8;
    };

    pdf.setFontSize(9); pdf.setTextColor(40);
    linha(['MEMBROS', ...colunas.map(c => c.rotulo), 'TOTAL', 'MÉDIA'], { bold: true, fundo: [235, 228, 210] });
    tabela.membros.forEach((m, i) => {
      if (y > 195) { pdf.addPage(); y = 20; }
      linha([m.perfil.name, ...m.valores, m.total, tabela.media(m.total)], { fundo: i % 2 ? [247, 247, 247] : null });
    });
    linha(['TOTAL DO GRUPO', ...tabela.totais, tabela.total, tabela.media(tabela.total)], { bold: true, fundo: [235, 228, 210] });

    pdf.save(`mensagens-${p.replace(/\//g, '-').replace(/ a /, '_a_')}.pdf`);
  }

  function ligarControles() {
    container.querySelectorAll('.rmsg-modo').forEach(b => b.addEventListener('click', () => {
      estado.modo = b.dataset.modo;
      carregar();
    }));
    container.querySelectorAll('.rmsg-seta').forEach(b => b.addEventListener('click', () => mover(Number(b.dataset.passo))));
    const de = container.querySelector('#rmsgDe');
    const ate = container.querySelector('#rmsgAte');
    de?.addEventListener('change', () => { if (de.value) { estado.livreDe = de.value; carregar(); } });
    ate?.addEventListener('change', () => { if (ate.value) { estado.livreAte = ate.value; carregar(); } });
    container.querySelector('#rmsgCopiar').addEventListener('click', copiar);
    container.querySelector('#rmsgPdf').addEventListener('click', baixarPdf);
  }

  return {
    render(el) {
      container = el;
      carregar();
    }
  };
}
