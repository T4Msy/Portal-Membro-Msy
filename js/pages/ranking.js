/* ============================================================
   MSY PORTAL — PAGES/RANKING.JS
   Módulo ES — Ranking de Mensagens + Trono dos Recordes.
   Depende de window.MSY (bridge populado por app.js).
   MSYPerms: const global de modules3.js, acessível pelo escopo global.
   Helpers _tron*: module-privados (não mais globals implícitos).
   ============================================================ */

const { db, Utils, renderSidebar, renderTopBar } = window.MSY;

/* Paginator copiado inline para tornar o módulo auto-contido. */
const Paginator = {
  render(containerId, total, page, perPage, onPage) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const totalPages = Math.ceil(total / perPage);
    if (totalPages <= 1) { container.innerHTML = ''; return; }
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) pages.push(i);
      else if (pages[pages.length - 1] !== '...') pages.push('...');
    }
    container.innerHTML = `
      <div class="paginator">
        <button class="pag-btn${page===1?' disabled':''}" data-page="${page-1}" ${page===1?'disabled':''}>
          <i class="fa-solid fa-chevron-left"></i>
        </button>
        ${pages.map(p => p==='...'
          ? `<span class="pag-ellipsis">…</span>`
          : `<button class="pag-btn${p===page?' active':''}" data-page="${p}">${p}</button>`
        ).join('')}
        <button class="pag-btn${page===totalPages?' disabled':''}" data-page="${page+1}" ${page===totalPages?'disabled':''}>
          <i class="fa-solid fa-chevron-right"></i>
        </button>
        <span class="pag-info">${((page-1)*perPage)+1}–${Math.min(page*perPage,total)} de ${total}</span>
      </div>`;
    container.querySelectorAll('.pag-btn:not(.disabled)').forEach(btn => {
      btn.addEventListener('click', () => onPage(parseInt(btn.dataset.page)));
    });
  },
  slice(arr, page, perPage) {
    return arr.slice((page-1)*perPage, page*perPage);
  }
};

/* ============================================================
   TRONO DOS RECORDES — Engine (module-privado)
   ============================================================ */

function _tronNormalize(name) {
  return (name||'').toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/\s+/g,' ');
}

function _tronCalcTop3FromRankings(todos) {
  const candidatos = { semanal: [], mensal: [] };

  for (const r of todos) {
    const tipo = (!r.tipo || r.tipo === 'semanal') ? 'semanal' : 'mensal';
    for (const e of (r.entries || [])) {
      const msgs = parseInt(e.messages) || 0;
      if (!msgs || !e.name) continue;
      const periodoStr = r.week_start && r.week_end
        ? `${r.week_start.split('-').reverse().join('/')} a ${r.week_end.split('-').reverse().join('/')}`
        : '';
      candidatos[tipo].push({
        nome: e.name,
        mensagens: msgs,
        periodo: periodoStr,
        data_ref: r.week_start || null,
      });
    }
  }

  function top3(lista) {
    const melhorPorMembro = new Map();
    for (const item of lista) {
      const nomeKey = _tronNormalize(item.nome);
      const atual = melhorPorMembro.get(nomeKey);
      if (!atual || item.mensagens > atual.mensagens ||
          (item.mensagens === atual.mensagens && item.data_ref && atual.data_ref && item.data_ref < atual.data_ref)) {
        melhorPorMembro.set(nomeKey, item);
      }
    }
    const dedup = Array.from(melhorPorMembro.values());
    const sorted = dedup.slice().sort((a, b) => {
      if (b.mensagens !== a.mensagens) return b.mensagens - a.mensagens;
      if (a.data_ref && b.data_ref) return a.data_ref.localeCompare(b.data_ref);
      return 0;
    });
    return sorted.slice(0, 3).map((item, i) => ({ ...item, posicao: i + 1 }));
  }

  return {
    semanal: top3(candidatos.semanal),
    mensal:  top3(candidatos.mensal),
  };
}

async function _tronLerTop3Banco() {
  try {
    const { data, error } = await db.from('msy_recordes_top3').select('*').order('tipo').order('posicao');
    if (error) throw error;
    if (!data) return { semanal: [], mensal: [], diario: [] };
    const result = { semanal: [], mensal: [], diario: [] };
    for (const row of data) {
      if (result[row.tipo]) result[row.tipo].push(row);
    }
    return result;
  } catch (err) {
    console.error('[MSY][ranking] Erro ao ler Top 3 do banco:', err);
    return { semanal: [], mensal: [], diario: [] };
  }
}

async function _tronGravarTop3(novoTop3, tiposAtualizar, profileId) {
  try {
    for (const tipo of tiposAtualizar) {
      const lista = novoTop3[tipo] || [];
      for (const item of lista) {
        const { error } = await db.from('msy_recordes_top3').upsert({
          tipo,
          posicao:    item.posicao,
          nome:       item.nome,
          mensagens:  item.mensagens,
          periodo:    item.periodo || null,
          data_ref:   item.data_ref || null,
          updated_by: profileId,
        }, { onConflict: 'tipo,posicao' });
        if (error) throw error;
      }
      if (lista.length < 3) {
        for (let pos = lista.length + 1; pos <= 3; pos++) {
          const { error } = await db.from('msy_recordes_top3').delete().eq('tipo', tipo).eq('posicao', pos);
          if (error) throw error;
        }
      }
    }
  } catch (err) {
    console.error('[MSY][ranking] Erro ao gravar Top 3:', err);
    throw err;
  }
}

function _tronDetectarEventos(anterior, novo, categoriaTipo) {
  const eventos = [];

  const CATEGORIA_LABEL = {
    semanal: 'Soberania Semanal ⚡',
    mensal:  'Domínio Mensal 🩸',
    diario:  'Marca Perpétua Diária 🔱',
  };
  const label = CATEGORIA_LABEL[categoriaTipo] || categoriaTipo;

  const antMap = {};
  for (const item of (anterior || [])) {
    antMap[_tronNormalize(item.nome)] = { posicao: item.posicao, mensagens: item.mensagens };
  }

  for (const item of (novo || [])) {
    const normNome = _tronNormalize(item.nome);
    const ant = antMap[normNome];

    if (!ant) {
      if (item.posicao === 1) {
        eventos.push({ tipo: 'novo_top1', prioridade: 6, nome: item.nome, mensagens: item.mensagens, categoria: label, categoriaTipo });
      } else if (item.posicao === 2) {
        eventos.push({ tipo: 'subida_top2', prioridade: 3, nome: item.nome, mensagens: item.mensagens, categoria: label, categoriaTipo });
      } else if (item.posicao === 3) {
        eventos.push({ tipo: 'entrada_top3', prioridade: 1, nome: item.nome, mensagens: item.mensagens, categoria: label, categoriaTipo });
      }
    } else {
      const autoRecorde = item.mensagens > ant.mensagens;

      if (item.posicao === 1 && ant.posicao !== 1) {
        eventos.push({ tipo: 'novo_top1', prioridade: 6, nome: item.nome, mensagens: item.mensagens, categoria: label, categoriaTipo });
      } else if (item.posicao === 1 && autoRecorde) {
        eventos.push({ tipo: 'auto_recorde_top1', prioridade: 5, nome: item.nome, mensagens: item.mensagens, categoria: label, categoriaTipo });
      } else if (item.posicao === 2 && ant.posicao !== 2 && ant.posicao > 2) {
        eventos.push({ tipo: 'subida_top2', prioridade: 3, nome: item.nome, mensagens: item.mensagens, categoria: label, categoriaTipo });
      } else if (item.posicao === 2 && autoRecorde) {
        eventos.push({ tipo: 'auto_recorde_top2', prioridade: 4, nome: item.nome, mensagens: item.mensagens, categoria: label, categoriaTipo });
      } else if (item.posicao === 3 && autoRecorde) {
        eventos.push({ tipo: 'auto_recorde_top3', prioridade: 2, nome: item.nome, mensagens: item.mensagens, categoria: label, categoriaTipo });
      }
    }
  }

  eventos.sort((a, b) => b.prioridade - a.prioridade);
  return eventos;
}

function _tronMensagemEvento(evento) {
  const { tipo, nome, mensagens, categoria, categoriaTipo } = evento;
  const prep = (categoriaTipo === 'mensal') ? { em: 'no', de: 'do' } : { em: 'na', de: 'da' };

  switch (tipo) {
    case 'entrada_top3':
      return `${nome} entrou para o Trono dos Recordes ao alcançar a 3ª posição ${prep.em} ${categoria} com ${mensagens} mensagens`;
    case 'subida_top2':
      return `${nome} superou um antigo recorde e avançou para a 2ª posição ${prep.em} ${categoria} com ${mensagens} mensagens`;
    case 'novo_top1':
      return `${nome} conquistou o topo ${prep.de} ${categoria} e estabeleceu um novo recorde histórico com ${mensagens} mensagens`;
    case 'auto_recorde_top1':
    case 'auto_recorde_top2':
    case 'auto_recorde_top3':
      return `${nome} superou o próprio recorde ${prep.em} ${categoria} e ampliou ainda mais seu domínio com ${mensagens} mensagens`;
    default:
      return `${nome} marcou ${mensagens} mensagens ${prep.em} ${categoria}`;
  }
}

async function _tronPublicarJornal(eventos, profileId) {
  try {
    if (!eventos || !eventos.length) return;

    const cutoff = new Date(Date.now() - 2 * 86400000).toISOString();
    const { data: recentes, error: recentesError } = await db.from('jornal_avisos')
      .select('mensagem')
      .eq('ativo', true)
      .gte('created_at', cutoff);
    if (recentesError) throw recentesError;

    const mensagensExistentes = new Set((recentes || []).map(a => a.mensagem));

    for (const evento of eventos) {
      const mensagem = _tronMensagemEvento(evento);
      if (mensagensExistentes.has(mensagem)) continue;

      let prioridade = 0;
      if (evento.tipo === 'novo_top1' || evento.tipo === 'auto_recorde_top1') prioridade = 2;
      else if (evento.tipo === 'auto_recorde_top2' || evento.tipo === 'subida_top2') prioridade = 1;

      const icones = {
        novo_top1:         '🏆',
        auto_recorde_top1: '🔥',
        auto_recorde_top2: '🔥',
        subida_top2:       '🥈',
        auto_recorde_top3: '🔥',
        entrada_top3:      '🥉',
      };

      const { error } = await db.from('jornal_avisos').insert({
        mensagem,
        icone:      icones[evento.tipo] || '🏆',
        prioridade,
        ativo:      true,
        autor_id:   profileId,
        autor_nome: 'Sistema — Trono dos Recordes',
        expira_em:  null,
      });
      if (error) throw error;
    }
  } catch (err) {
    console.error('[MSY][ranking] Erro ao publicar eventos no Jornal:', err);
    throw err;
  }
}

async function _tronAtualizarTop3(todos, profileId) {
  try {
    const novoCalc = _tronCalcTop3FromRankings(todos);
    const bancAtual = await _tronLerTop3Banco();

    const eventosSem = _tronDetectarEventos(bancAtual.semanal, novoCalc.semanal, 'semanal');
    const eventosMen = _tronDetectarEventos(bancAtual.mensal,  novoCalc.mensal,  'mensal');
    const todosEventos = [...eventosSem, ...eventosMen].sort((a, b) => b.prioridade - a.prioridade);

    await _tronGravarTop3(
      { semanal: novoCalc.semanal, mensal: novoCalc.mensal },
      ['semanal', 'mensal'],
      profileId
    );

    window._msyRecordesCache   = null;
    window._msyRecordesCacheTs = 0;

    if (todosEventos.length > 0) {
      await _tronPublicarJornal(todosEventos, profileId);
    }

    return { novoCalc, eventos: todosEventos };
  } catch (err) {
    console.warn('[Trono] Erro ao atualizar Top 3:', err);
    return { novoCalc: null, eventos: [] };
  }
}

/* ============================================================
   PAGE: RANKING
   ============================================================ */

async function initRanking() {
  const profile = await renderSidebar('ranking');
  if (!profile) return;
  await renderTopBar('Ranking', profile);
  const content     = document.getElementById('pageContent');
  const isDiretoria = profile.tier === 'diretoria';
  const canGerenciarRanking = isDiretoria || await MSYPerms.check(profile.id, profile.tier, 'gerenciar_ranking');
  const PER_PAGE    = 5;

  let abaAtiva  = 'trono';
  let pageSem   = 1, pageMen = 1;
  let semanais  = [], mensais = [];
  let tronoBanco = { semanal: [], mensal: [], diario: [] };

  if (!document.getElementById('msy-trono-css')) {
    const s = document.createElement('style');
    s.id = 'msy-trono-css';
    s.textContent = `
      /* ── Trono dos Recordes — Pódio Premium ── */
      .trono-wrap { display: flex; flex-direction: column; gap: 40px; }

      .trono-categoria {
        border-radius: 24px; overflow: visible;
        border: 1px solid rgba(255,255,255,.07);
        background: linear-gradient(170deg, #0f0d15 0%, #09070e 100%);
        position: relative;
      }
      .trono-categoria::before {
        content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
        border-radius: 24px 24px 0 0;
        background: linear-gradient(90deg, transparent 0%, var(--trono-color, #c9a84c) 30%, #fffc 50%, var(--trono-color, #c9a84c) 70%, transparent 100%);
      }
      .trono-categoria::after {
        content: ''; position: absolute; inset: 0; border-radius: 24px;
        box-shadow: 0 0 80px var(--trono-shadow, rgba(201,168,76,.07)), 0 32px 64px rgba(0,0,0,.6);
        pointer-events: none;
      }

      .trono-cat-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 26px 36px 22px;
        border-bottom: 1px solid rgba(255,255,255,.04);
      }
      .trono-cat-title {
        font-family: 'Cinzel', serif; font-size: 1.05rem; font-weight: 700;
        color: var(--trono-color, #c9a84c); letter-spacing: .12em; text-transform: uppercase;
        display: flex; align-items: center; gap: 12px;
      }
      .trono-cat-badge {
        font-size: .54rem; padding: 3px 10px; border-radius: 20px;
        background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1);
        color: rgba(255,255,255,.4); letter-spacing: .08em; font-weight: 700;
        text-transform: uppercase;
      }
      .trono-cat-label {
        font-size: .66rem; color: rgba(255,255,255,.25); text-transform: uppercase;
        letter-spacing: .1em; margin-top: 5px;
      }

      .trono-podio {
        display: flex; align-items: flex-end; justify-content: center;
        gap: 16px; padding: 56px 32px 44px;
        position: relative;
      }
      .trono-podio::before {
        content: ''; position: absolute; bottom: 44px; left: 8%; right: 8%; height: 1px;
        background: linear-gradient(90deg, transparent, var(--trono-color, #c9a84c) 15%, var(--trono-color, #c9a84c) 85%, transparent);
        opacity: .15;
      }
      .trono-podio::after {
        content: ''; position: absolute; bottom: 20px; left: 20%; right: 20%; height: 30px;
        background: radial-gradient(ellipse, var(--trono-color, #c9a84c) 0%, transparent 70%);
        opacity: .06; filter: blur(8px);
      }

      .trono-podio-item {
        display: flex; flex-direction: column; align-items: center;
        text-align: center; position: relative;
        transition: transform .35s cubic-bezier(.34,1.56,.64,1);
      }
      .trono-podio-item:hover { transform: translateY(-8px); }

      .trono-card {
        display: flex; flex-direction: column; align-items: center;
        padding: 24px 20px 20px; border-radius: 18px;
        position: relative; width: 100%;
        transition: box-shadow .3s;
      }

      .trono-degrau {
        width: 100%; border-radius: 0 0 12px 12px;
        display: flex; align-items: center; justify-content: center;
        font-family: 'Cinzel', serif; font-weight: 900;
        letter-spacing: .1em; color: rgba(255,255,255,.3);
        font-size: .66rem; text-transform: uppercase;
      }

      .trono-pos1 { order: 2; flex: 0 0 260px; z-index: 2; }
      .trono-pos1 .trono-card {
        background: linear-gradient(150deg, rgba(201,168,76,.2) 0%, rgba(201,168,76,.07) 55%, transparent 100%);
        border: 1px solid rgba(201,168,76,.5);
        box-shadow: 0 0 0 1px rgba(201,168,76,.1), 0 0 50px rgba(201,168,76,.15), 0 20px 60px rgba(0,0,0,.5), inset 0 1px 0 rgba(201,168,76,.3);
        padding: 36px 28px 28px;
      }
      .trono-pos1 .trono-card:hover {
        box-shadow: 0 0 0 1px rgba(201,168,76,.2), 0 0 80px rgba(201,168,76,.25), 0 20px 60px rgba(0,0,0,.5), inset 0 1px 0 rgba(201,168,76,.4);
      }
      .trono-pos1 .trono-degrau {
        height: 62px; margin-top: 12px;
        background: linear-gradient(180deg, rgba(201,168,76,.24) 0%, rgba(201,168,76,.07) 100%);
        border: 1px solid rgba(201,168,76,.32); border-top: none;
        color: rgba(201,168,76,.75); font-size: .76rem;
      }

      .trono-pos2 { order: 1; flex: 0 0 218px; z-index: 1; }
      .trono-pos2 .trono-card {
        background: linear-gradient(155deg, rgba(148,163,184,.12) 0%, rgba(100,116,139,.04) 100%);
        border: 1px solid rgba(148,163,184,.25);
        box-shadow: 0 0 40px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.07);
        padding: 24px 20px 20px;
      }
      .trono-pos2 .trono-degrau {
        height: 46px; margin-top: 10px;
        background: linear-gradient(180deg, rgba(148,163,184,.14) 0%, rgba(100,116,139,.04) 100%);
        border: 1px solid rgba(148,163,184,.2); border-top: none;
        color: rgba(148,163,184,.6); font-size: .66rem;
      }

      .trono-pos3 { order: 3; flex: 0 0 218px; z-index: 1; }
      .trono-pos3 .trono-card {
        background: linear-gradient(155deg, rgba(180,110,60,.12) 0%, rgba(120,60,20,.04) 100%);
        border: 1px solid rgba(180,110,60,.25);
        box-shadow: 0 0 40px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.05);
        padding: 24px 20px 20px;
      }
      .trono-pos3 .trono-degrau {
        height: 46px; margin-top: 10px;
        background: linear-gradient(180deg, rgba(180,110,60,.14) 0%, rgba(120,60,20,.04) 100%);
        border: 1px solid rgba(180,110,60,.2); border-top: none;
        color: rgba(200,130,70,.6); font-size: .66rem;
      }

      .trono-medal {
        font-size: 2.8rem; line-height: 1; margin-bottom: 12px;
        filter: drop-shadow(0 4px 14px rgba(0,0,0,.7));
        animation: medal-appear .65s cubic-bezier(.34,1.56,.64,1) both;
      }
      .trono-pos1 .trono-medal { font-size: 3.8rem; filter: drop-shadow(0 8px 24px rgba(201,168,76,.4)); }
      @keyframes medal-appear {
        from { transform: scale(0) rotate(-20deg); opacity: 0; }
        to   { transform: scale(1) rotate(0deg);   opacity: 1; }
      }

      .trono-coroa {
        position: absolute; top: -28px; left: 50%; transform: translateX(-50%);
        font-size: 1.8rem; animation: coroa-float 3.2s ease-in-out infinite;
        filter: drop-shadow(0 4px 16px rgba(201,168,76,.6));
      }
      @keyframes coroa-float {
        0%,100% { transform: translateX(-50%) translateY(0) rotate(-6deg); }
        50%      { transform: translateX(-50%) translateY(-8px) rotate(6deg); }
      }

      .trono-avatar {
        width: 58px; height: 58px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-family: 'Cinzel', serif; font-weight: 700; font-size: 1.15rem;
        margin-bottom: 12px; position: relative; flex-shrink: 0;
      }
      .trono-pos1 .trono-avatar {
        width: 82px; height: 82px; font-size: 1.7rem;
        background: radial-gradient(135deg, rgba(201,168,76,.32) 0%, rgba(201,168,76,.08) 100%);
        border: 2px solid rgba(201,168,76,.65);
        box-shadow: 0 0 32px rgba(201,168,76,.3), 0 0 0 5px rgba(201,168,76,.08);
        color: #c9a84c;
      }
      .trono-pos2 .trono-avatar {
        background: radial-gradient(135deg, rgba(148,163,184,.2) 0%, rgba(100,116,139,.06) 100%);
        border: 2px solid rgba(148,163,184,.4); color: #94a3b8;
      }
      .trono-pos3 .trono-avatar {
        background: radial-gradient(135deg, rgba(180,110,60,.2) 0%, rgba(120,60,20,.06) 100%);
        border: 2px solid rgba(180,110,60,.4); color: #cd7f32;
      }
      .trono-pos1 .trono-avatar::after {
        content: ''; position: absolute; inset: -8px; border-radius: 50%;
        border: 1px solid rgba(201,168,76,.22);
        animation: avatar-pulse 2.8s ease-in-out infinite;
      }
      @keyframes avatar-pulse {
        0%,100% { opacity: .6; transform: scale(1); }
        50%      { opacity: 0; transform: scale(1.2); }
      }

      .trono-nome {
        font-family: 'Cinzel', serif; font-weight: 700; font-size: .84rem;
        color: rgba(255,255,255,.72); line-height: 1.25;
        margin-bottom: 6px; word-break: break-word; letter-spacing: .04em;
      }
      .trono-pos1 .trono-nome {
        font-size: 1.08rem; color: #fff; margin-bottom: 8px;
        text-shadow: 0 0 24px rgba(201,168,76,.45), 0 2px 10px rgba(0,0,0,.7);
      }

      .trono-msgs { font-size: .75rem; font-weight: 800; letter-spacing: .07em; color: rgba(255,255,255,.28); }
      .trono-pos1 .trono-msgs { font-size: 1rem; color: #c9a84c; letter-spacing: .05em; text-shadow: 0 0 16px rgba(201,168,76,.45); }
      .trono-pos2 .trono-msgs { color: rgba(148,163,184,.68); font-size: .8rem; }
      .trono-pos3 .trono-msgs { color: rgba(180,110,60,.78); font-size: .8rem; }

      .trono-periodo { font-size: .6rem; color: rgba(255,255,255,.2); margin-top: 5px; letter-spacing: .05em; }
      .trono-pos1 .trono-periodo { color: rgba(201,168,76,.5); }

      .trono-vazio { padding: 50px; text-align: center; color: rgba(255,255,255,.18); font-size: .84rem; font-style: italic; }

      .trono-diario-btn {
        display: block; margin: 0 28px 24px; padding: 10px 16px;
        border-radius: 10px; border: 1px dashed rgba(201,168,76,.2);
        background: rgba(201,168,76,.03); color: rgba(201,168,76,.55); font-size: .73rem;
        font-weight: 600; letter-spacing: .06em; text-align: center;
        cursor: pointer; transition: all .2s; width: calc(100% - 56px);
      }
      .trono-diario-btn:hover { background: rgba(201,168,76,.08); border-color: rgba(201,168,76,.38); color: var(--gold); }

      .rank-main-tabs {
        display: flex; gap: 0; border-radius: 12px; overflow: hidden;
        background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.07);
        margin-bottom: 24px;
      }
      .rank-main-tab {
        flex: 1; padding: 11px 14px; background: none; border: none;
        color: var(--text-3); font-size: .78rem; font-weight: 600;
        letter-spacing: .05em; cursor: pointer; transition: all .2s;
        display: flex; align-items: center; justify-content: center; gap: 7px;
        text-transform: uppercase; font-family: 'Cinzel', serif;
        border-right: 1px solid rgba(255,255,255,.06);
        position: relative;
      }
      .rank-main-tab:last-child { border-right: none; }
      .rank-main-tab.active { color: var(--gold); background: linear-gradient(180deg, rgba(201,168,76,.12) 0%, rgba(201,168,76,.04) 100%); }
      .rank-main-tab.active::after {
        content: ''; position: absolute; bottom: 0; left: 10%; right: 10%; height: 2px;
        background: var(--gold); border-radius: 2px 2px 0 0;
      }
      .rank-tab-count {
        background: rgba(201,168,76,.2); color: var(--gold);
        font-size: .6rem; padding: 1px 6px; border-radius: 20px;
        font-family: sans-serif;
      }

      .trono-diario-lista { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
      .trono-diario-row {
        display: flex; align-items: center; gap: 10px; padding: 10px 14px;
        border-radius: 8px; background: rgba(255,255,255,.03);
        border: 1px solid rgba(255,255,255,.06);
      }
      .trono-diario-pos { font-size: 1.1rem; flex-shrink: 0; }
      .trono-diario-nome { flex: 1; font-weight: 600; font-size: .88rem; color: var(--text-1); }
      .trono-diario-msgs { font-size: .8rem; color: var(--gold); font-weight: 700; }

      @media (max-width: 640px) {
        .trono-cat-header { padding: 18px 18px 14px; flex-direction: column; align-items: flex-start; gap: 10px; }
        .trono-cat-title { font-size: .85rem; letter-spacing: .08em; }
        .trono-cat-label { font-size: .6rem; }
        .trono-podio { flex-direction: column; align-items: stretch; gap: 14px; padding: 22px 16px 20px; }
        .trono-podio::before, .trono-podio::after { display: none; }
        .trono-pos1 { order: 1; flex: none; width: 100%; }
        .trono-pos2 { order: 2; flex: none; width: 100%; }
        .trono-pos3 { order: 3; flex: none; width: 100%; }
        .trono-podio-item { flex-direction: row; align-items: center; text-align: left; gap: 0; }
        .trono-podio-item:hover { transform: none; }
        .trono-card { flex-direction: row; align-items: center; padding: 14px 16px !important; border-radius: 14px !important; gap: 14px; width: 100%; text-align: left; }
        .trono-coroa { position: static; transform: none; font-size: 1.2rem; animation: none; align-self: flex-start; margin-right: -8px; margin-top: -4px; }
        .trono-pos1 .trono-avatar { width: 54px !important; height: 54px !important; font-size: 1.1rem !important; flex-shrink: 0; box-shadow: 0 0 18px rgba(201,168,76,.25), 0 0 0 3px rgba(201,168,76,.08); }
        .trono-avatar { width: 46px !important; height: 46px !important; font-size: .95rem !important; flex-shrink: 0; margin-bottom: 0 !important; }
        .trono-pos1 .trono-avatar::after { display: none; }
        .trono-medal { font-size: 1.6rem !important; margin-bottom: 0 !important; flex-shrink: 0; filter: none; animation: none; }
        .trono-pos1 .trono-medal { font-size: 2rem !important; }
        .trono-nome { font-size: .82rem !important; margin-bottom: 2px !important; color: rgba(255,255,255,.85) !important; text-shadow: none !important; }
        .trono-pos1 .trono-nome { font-size: .92rem !important; text-shadow: none !important; }
        .trono-msgs { font-size: .72rem !important; font-weight: 700; }
        .trono-pos1 .trono-msgs { font-size: .82rem !important; }
        .trono-periodo { font-size: .6rem; display: block; margin-top: 3px !important; }
        .trono-degrau { display: none; }
        .trono-card { display: flex !important; flex-direction: row !important; flex-wrap: nowrap !important; }
        .trono-wrap { gap: 18px; }
        .trono-categoria { border-radius: 16px; }
      }

      @media (min-width: 641px) and (max-width: 900px) {
        .trono-pos1 { flex: 0 0 200px; }
        .trono-pos2, .trono-pos3 { flex: 0 0 168px; }
        .trono-podio { padding: 40px 20px 34px; gap: 12px; }
        .trono-cat-header { padding: 20px 24px 16px; }
        .trono-pos1 .trono-avatar { width: 68px; height: 68px; font-size: 1.4rem; }
        .trono-pos1 .trono-nome { font-size: .94rem; }
        .trono-pos1 .trono-card { padding: 28px 22px 22px; }
      }
    `;
    document.head.appendChild(s);
  }

  Utils.showLoading(content, 'Carregando rankings...');

  const [rankRes, tronoDB] = await Promise.all([
    db.from('weekly_rankings')
      .select('*, creator:created_by(name,initials)')
      .order('week_start', { ascending: false }),
    _tronLerTop3Banco(),
  ]);

  if (rankRes.error) {
    content.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-3)">Erro: ${rankRes.error.message}</div>`;
    return;
  }

  const todos = rankRes.data || [];
  semanais = todos.filter(r => !r.tipo || r.tipo === 'semanal');
  mensais  = todos.filter(r => r.tipo === 'mensal');
  tronoBanco = tronoDB;

  const tronoBancoVazio = !tronoBanco.semanal.length && !tronoBanco.mensal.length;
  if (tronoBancoVazio && todos.length > 0) {
    const novoCalc = _tronCalcTop3FromRankings(todos);
    await _tronGravarTop3(
      { semanal: novoCalc.semanal, mensal: novoCalc.mensal },
      ['semanal', 'mensal'],
      profile.id
    );
    tronoBanco.semanal = novoCalc.semanal;
    tronoBanco.mensal  = novoCalc.mensal;
    window._msyRecordesCache   = null;
    window._msyRecordesCacheTs = 0;
  }

  const medals = ['🥇', '🥈', '🥉'];

  function renderTrono() {
    const el = document.getElementById('rankContent');
    if (!el) return;

    const CATS = [
      { tipo: 'mensal',  emoji: '🩸', titulo: 'Domínio Mensal',         label: 'Maior número de mensagens em um único mês da história',    color: '#9f1239', shadow: 'rgba(159,18,57,.15)' },
      { tipo: 'semanal', emoji: '⚡', titulo: 'Soberania Semanal',       label: 'Maior número de mensagens em uma única semana da história', color: '#b45309', shadow: 'rgba(180,83,9,.15)'  },
      { tipo: 'diario',  emoji: '🔱', titulo: 'Marca Perpétua Diária',   label: 'Maior número de mensagens em um único dia da história',     color: '#4c1d95', shadow: 'rgba(76,29,149,.15)' },
    ];

    const tronoPosEmojis = ['🥇', '🥈', '🥉'];
    const tronoPosLabels = ['1º Lugar', '2º Lugar', '3º Lugar'];

    el.innerHTML = `<div class="trono-wrap">
      ${CATS.map(cat => {
        const top3 = tronoBanco[cat.tipo] || [];
        const ordered = top3.length > 0 ? [top3[1], top3[0], top3[2]].filter(Boolean) : [];
        const posClasses = top3.length > 0 ? [top3[1] ? 'trono-pos2' : null, 'trono-pos1', top3[2] ? 'trono-pos3' : null].filter(Boolean) : [];
        const posIdxs = top3.length > 0 ? [top3[1] ? 1 : null, 0, top3[2] ? 2 : null].filter(v => v !== null) : [];

        return `
          <div class="trono-categoria" style="--trono-color:${cat.color};--trono-shadow:${cat.shadow}">
            <div class="trono-cat-header">
              <div>
                <div class="trono-cat-title">
                  ${cat.emoji} ${cat.titulo}
                  <span class="trono-cat-badge">Top 3 Histórico</span>
                </div>
                <div class="trono-cat-label">${cat.label}</div>
              </div>
              ${canGerenciarRanking && cat.tipo === 'diario'
                ? `<button class="btn btn-ghost btn-sm trono-diario-add-btn" style="font-size:.72rem;color:${cat.color};border-color:${cat.color}44">
                    <i class="fa-solid fa-plus"></i> Adicionar
                  </button>`
                : ''}
            </div>
            ${top3.length === 0
              ? `<div class="trono-vazio"><i class="fa-solid fa-hourglass" style="opacity:.3;font-size:1.5rem;display:block;margin-bottom:8px"></i>Nenhum recorde registrado ainda.</div>`
              : `<div class="trono-podio">
                  ${ordered.map((item, renderIdx) => {
                    const origIdx = posIdxs[renderIdx];
                    const posClass = posClasses[renderIdx];
                    const isFirst = origIdx === 0;
                    return `
                    <div class="trono-podio-item ${posClass}">
                      <div class="trono-card">
                        ${isFirst ? '<span class="trono-coroa">👑</span>' : ''}
                        <div class="trono-medal">${tronoPosEmojis[origIdx]}</div>
                        <div class="trono-avatar">${Utils.getInitials(item.nome)}</div>
                        <div class="trono-nome">${Utils.escapeHtml(item.nome)}</div>
                        <div class="trono-msgs">${Number(item.mensagens).toLocaleString('pt-BR')} msgs</div>
                        ${item.periodo ? `<div class="trono-periodo">${Utils.escapeHtml(item.periodo)}</div>` : ''}
                      </div>
                      <div class="trono-degrau">${tronoPosLabels[origIdx]}</div>
                    </div>`;
                  }).join('')}
                </div>`}
          </div>`;
      }).join('')}
    </div>`;

    el.querySelectorAll('.trono-diario-add-btn').forEach(btn => {
      btn.addEventListener('click', () => abrirModalDiario());
    });
  }

  function rankCard(r, idx, offset) {
    const entries  = r.entries || [];
    const top3C    = entries.slice(0, 3);
    const rest     = entries.slice(3);
    const isRecente = offset === 0 && idx === 0;
    return `
      <div class="ranking-card card${isRecente ? ' ranking-card-destaque' : ''}">
        ${isRecente ? '<div class="ranking-card-tag">🔥 Mais Recente</div>' : ''}
        <div class="ranking-card-header">
          <div>
            <div class="ranking-card-periodo">${Utils.formatDate(r.week_start)} — ${Utils.formatDate(r.week_end)}</div>
            ${r.creator ? `<div style="font-size:.7rem;color:var(--text-3);margin-top:2px">por ${Utils.escapeHtml(r.creator.name)}</div>` : ''}
          </div>
          ${canGerenciarRanking ? `<button class="btn btn-ghost btn-sm ranking-del-btn" data-id="${r.id}" title="Excluir"><i class="fa-solid fa-trash" style="color:var(--red-bright);font-size:.75rem"></i></button>` : ''}
        </div>
        ${!entries.length
          ? `<div style="color:var(--text-3);text-align:center;padding:20px;font-size:.82rem">Nenhuma entrada.</div>`
          : `<div class="ranking-podio">
              ${top3C.map((e, i) => `
                <div class="ranking-podio-item${i === 0 ? ' destaque' : ''}">
                  <div class="ranking-podio-medal">${medals[i]}</div>
                  <div class="ranking-podio-nome">${Utils.escapeHtml(e.name)}</div>
                  <div class="ranking-podio-msgs">${e.messages}<span style="font-size:.6rem;opacity:.7"> msgs</span></div>
                </div>`).join('')}
            </div>
            ${rest.length ? `<div class="ranking-lista">${rest.map((e, i) => `
              <div class="ranking-lista-row">
                <span class="ranking-lista-pos">${i + 4}°</span>
                <span class="ranking-lista-nome">${Utils.escapeHtml(e.name)}</span>
                <span class="ranking-lista-msgs">${e.messages}</span>
              </div>`).join('')}</div>` : ''}`}
      </div>`;
  }

  function renderListaRanking() {
    const lista = abaAtiva === 'semanal' ? semanais : mensais;
    const page  = abaAtiva === 'semanal' ? pageSem  : pageMen;
    const paginated = Paginator.slice(lista, page, PER_PAGE);
    const offset    = (page - 1) * PER_PAGE;

    const el = document.getElementById('rankContent');
    if (!el) return;

    el.innerHTML = paginated.length
      ? paginated.map((r, i) => rankCard(r, i, offset)).join('') + '<div id="rankPaginator"></div>'
      : `<div style="text-align:center;padding:60px;color:var(--text-3)">
          <i class="fa-solid fa-ranking-star" style="font-size:2.5rem;opacity:.3;margin-bottom:14px;display:block"></i>
          Nenhum ranking cadastrado.
        </div><div id="rankPaginator"></div>`;

    Paginator.render('rankPaginator', lista.length, page, PER_PAGE, p => {
      if (abaAtiva === 'semanal') pageSem = p; else pageMen = p;
      renderListaRanking();
    });

    el.querySelectorAll('.ranking-del-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!(await MSYConfirm.show('Excluir este ranking?', { title: 'Excluir ranking' }))) return;
        const { error } = await db.from('weekly_rankings').delete().eq('id', btn.dataset.id);
        if (!error) {
          if (abaAtiva === 'semanal') semanais = semanais.filter(r => r.id !== btn.dataset.id);
          else mensais = mensais.filter(r => r.id !== btn.dataset.id);
          Utils.showToast('Ranking removido.');
          renderListaRanking();
        } else {
          Utils.showToast('Erro.', 'error');
        }
      });
    });
  }

  function ativarAba(tipo) {
    abaAtiva = tipo;
    document.querySelectorAll('.rank-main-tab').forEach(b => b.classList.toggle('active', b.dataset.aba === tipo));
    if (tipo === 'trono') renderTrono();
    else renderListaRanking();
  }

  function abrirModal(tipo) {
    let modal = document.getElementById('rankModal');
    if (!modal) { modal = document.createElement('div'); modal.id = 'rankModal'; modal.className = 'modal-overlay'; document.body.appendChild(modal); }

    modal.innerHTML = `
      <div class="modal-box" style="max-width:520px">
        <div class="modal-header">
          <h3 class="font-cinzel"><i class="fa-solid fa-plus" style="color:var(--gold);margin-right:8px"></i>Novo Ranking ${tipo === 'semanal' ? 'Semanal' : 'Mensal'}</h3>
          <button class="modal-close" id="rankModalClose"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body" style="padding:24px;display:flex;flex-direction:column;gap:14px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="form-group"><label class="form-label">Início</label><input type="date" class="form-input" id="rankStart"></div>
            <div class="form-group"><label class="form-label">Fim</label><input type="date" class="form-input" id="rankEnd"></div>
          </div>
          <div>
            <label class="form-label" style="margin-bottom:6px;display:block">Participantes</label>
            <div id="rankEntries" style="display:flex;flex-direction:column;gap:6px"></div>
            <button class="btn btn-ghost btn-sm" id="rankAddRow" style="margin-top:8px"><i class="fa-solid fa-plus"></i> Linha</button>
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end">
            <button class="btn btn-ghost" id="rankCancelBtn">Cancelar</button>
            <button class="btn btn-gold" id="rankSaveBtn"><i class="fa-solid fa-floppy-disk"></i> Salvar</button>
          </div>
        </div>
      </div>`;

    requestAnimationFrame(() => modal.classList.add('open'));
    const close = () => modal.classList.remove('open');
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    document.getElementById('rankModalClose').addEventListener('click', close);
    document.getElementById('rankCancelBtn').addEventListener('click', close);

    const addRow = (n = '', m = '') => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;align-items:center';
      row.innerHTML = `<input type="text" class="form-input rank-name" placeholder="Nome" value="${Utils.escapeHtml(n)}" style="flex:2;padding:8px 10px;font-size:.85rem">
        <input type="number" class="form-input rank-msgs" placeholder="Msgs" value="${m}" min="0" style="flex:1;padding:8px 10px;font-size:.85rem">
        <button class="btn btn-ghost btn-sm" style="padding:8px;flex-shrink:0"><i class="fa-solid fa-times" style="color:var(--red-bright)"></i></button>`;
      row.querySelector('button').addEventListener('click', () => row.remove());
      document.getElementById('rankEntries').appendChild(row);
    };
    for (let i = 0; i < 5; i++) addRow();
    document.getElementById('rankAddRow').addEventListener('click', () => addRow());

    document.getElementById('rankSaveBtn').addEventListener('click', async () => {
      const start = document.getElementById('rankStart').value;
      const end   = document.getElementById('rankEnd').value;
      if (!start || !end) { Utils.showToast('Informe as datas.', 'error'); return; }

      const entries = [...document.querySelectorAll('#rankEntries > div')]
        .map(r => ({ name: r.querySelector('.rank-name').value.trim(), messages: parseInt(r.querySelector('.rank-msgs').value) || 0 }))
        .filter(e => e.name)
        .sort((a, b) => b.messages - a.messages);

      if (!entries.length) { Utils.showToast('Adicione participantes.', 'error'); return; }

      const btn = document.getElementById('rankSaveBtn');
      btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Salvando...';

      const { error } = await db.from('weekly_rankings').insert({
        week_start: start, week_end: end, entries, tipo, created_by: profile.id
      });

      if (error) {
        Utils.showToast('Erro ao salvar.', 'error');
        btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar';
        return;
      }

      Utils.showToast('Ranking salvo!');
      close();

      const { data: fresh } = await db.from('weekly_rankings')
        .select('*, creator:created_by(name,initials)')
        .order('week_start', { ascending: false });

      const t = fresh || [];
      semanais = t.filter(r => !r.tipo || r.tipo === 'semanal');
      mensais  = t.filter(r => r.tipo === 'mensal');

      const { novoCalc, eventos } = await _tronAtualizarTop3(t, profile.id);
      if (novoCalc) {
        tronoBanco.semanal = novoCalc.semanal;
        tronoBanco.mensal  = novoCalc.mensal;
      }
      if (eventos.length > 0) {
        Utils.showToast(`🏆 Trono dos Recordes atualizado!`);
      }

      document.querySelectorAll('.rank-main-tab').forEach(t2 => {
        const cnt = t2.querySelector('.rank-tab-count');
        if (!cnt) return;
        if (t2.dataset.aba === 'semanal') cnt.textContent = semanais.length;
        if (t2.dataset.aba === 'mensal')  cnt.textContent = mensais.length;
      });

      abaAtiva = tipo;
      if (tipo === 'semanal') pageSem = 1; else pageMen = 1;
      ativarAba(tipo);
    });
  }

  function abrirModalDiario() {
    let modal = document.getElementById('tronoDiarioModal');
    if (!modal) { modal = document.createElement('div'); modal.id = 'tronoDiarioModal'; modal.className = 'modal-overlay'; document.body.appendChild(modal); }

    const top3Atual = (tronoBanco.diario || []).slice().sort((a, b) => a.posicao - b.posicao);

    modal.innerHTML = `
      <div class="modal-box" style="max-width:500px">
        <div class="modal-header">
          <h3 class="font-cinzel" style="display:flex;align-items:center;gap:8px">
            <span style="color:#7c3aed">🔱</span> Marca Perpétua Diária
          </h3>
          <button class="modal-close" id="tronoDiarioClose"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body" style="padding:20px;display:flex;flex-direction:column;gap:16px">
          ${top3Atual.length ? `
            <div>
              <div style="font-size:.68rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">Recordes Atuais</div>
              <div class="trono-diario-lista">
                ${top3Atual.map(r => `
                  <div class="trono-diario-row">
                    <div class="trono-diario-pos">${['🥇','🥈','🥉'][r.posicao - 1]}</div>
                    <div class="trono-diario-nome">${Utils.escapeHtml(r.nome)}</div>
                    <div class="trono-diario-msgs">${Number(r.mensagens).toLocaleString('pt-BR')} msgs</div>
                    ${canGerenciarRanking ? `<button class="btn btn-ghost btn-sm trono-del-diario" data-pos="${r.posicao}" style="padding:4px 8px;color:var(--red-bright)"><i class="fa-solid fa-trash" style="font-size:.65rem"></i></button>` : ''}
                  </div>`).join('')}
              </div>
            </div>` : ''}
          <div style="border-top:1px solid var(--border-faint);padding-top:14px">
            <div style="font-size:.68rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">Adicionar Registro</div>
            <div style="display:flex;flex-direction:column;gap:10px">
              <div class="form-group">
                <label class="form-label">Nome do Membro *</label>
                <input type="text" class="form-input" id="tronoDiarioNome" placeholder="Nome exato do membro">
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div class="form-group">
                  <label class="form-label">Mensagens *</label>
                  <input type="number" class="form-input" id="tronoDiarioMsgs" placeholder="Ex: 850" min="1">
                </div>
                <div class="form-group">
                  <label class="form-label">Data</label>
                  <input type="date" class="form-input" id="tronoDiarioData" value="${new Date().toISOString().split('T')[0]}">
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Observação <span style="color:var(--text-3);font-weight:400">(opcional)</span></label>
                <input type="text" class="form-input" id="tronoDiarioObs" placeholder="Ex: Dia de maratona de mensagens">
              </div>
            </div>
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end">
            <button class="btn btn-ghost" id="tronoDiarioCancelar">Cancelar</button>
            <button class="btn btn-gold" id="tronoDiarioSalvar"><i class="fa-solid fa-floppy-disk"></i> Salvar</button>
          </div>
        </div>
      </div>`;

    requestAnimationFrame(() => modal.classList.add('open'));
    const close = () => modal.classList.remove('open');
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    document.getElementById('tronoDiarioClose').addEventListener('click', close);
    document.getElementById('tronoDiarioCancelar').addEventListener('click', close);

    modal.querySelectorAll('.trono-del-diario').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pos = parseInt(btn.dataset.pos);
        if (!(await MSYConfirm.show(`Remover o ${pos}º lugar do Trono Diário?`, { title: 'Remover registro' }))) return;
        const { error } = await db.from('msy_recordes_top3').delete().eq('tipo', 'diario').eq('posicao', pos);
        if (!error) {
          tronoBanco.diario = tronoBanco.diario.filter(r => r.posicao !== pos);
          tronoBanco.diario.forEach((r, i) => r.posicao = i + 1);
          Utils.showToast('Registro removido.');
          close();
          renderTrono();
          abrirModalDiario();
        } else {
          Utils.showToast('Erro ao remover.', 'error');
        }
      });
    });

    document.getElementById('tronoDiarioSalvar').addEventListener('click', async () => {
      const nome   = document.getElementById('tronoDiarioNome').value.trim();
      const msgs   = parseInt(document.getElementById('tronoDiarioMsgs').value) || 0;
      const dataV  = document.getElementById('tronoDiarioData').value;
      const obs    = document.getElementById('tronoDiarioObs').value.trim() || null;

      if (!nome) { Utils.showToast('Informe o nome do membro.', 'error'); return; }
      if (!msgs) { Utils.showToast('Informe a quantidade de mensagens.', 'error'); return; }

      const novoEntry = { nome, mensagens: msgs, periodo: dataV || null, data_ref: dataV || null, observacao: obs };
      const listaAtual = (tronoBanco.diario || []).slice();

      const normNome = _tronNormalize(nome);
      const idxExistente = listaAtual.findIndex(r => _tronNormalize(r.nome) === normNome);
      if (idxExistente >= 0) {
        if (msgs <= listaAtual[idxExistente].mensagens) {
          Utils.showToast('Este membro já possui um recorde maior ou igual.', 'error');
          return;
        }
        listaAtual.splice(idxExistente, 1);
      }

      listaAtual.push(novoEntry);
      listaAtual.sort((a, b) => {
        if (b.mensagens !== a.mensagens) return b.mensagens - a.mensagens;
        if (a.data_ref && b.data_ref) return a.data_ref.localeCompare(b.data_ref);
        return 0;
      });
      const novoTop3 = listaAtual.slice(0, 3).map((item, i) => ({ ...item, posicao: i + 1 }));

      const btn = document.getElementById('tronoDiarioSalvar');
      btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';

      const eventosAntes = _tronDetectarEventos(tronoBanco.diario, novoTop3, 'diario');

      await _tronGravarTop3({ diario: novoTop3 }, ['diario'], profile.id);

      if (eventosAntes.length > 0) {
        await _tronPublicarJornal(eventosAntes, profile.id);
        Utils.showToast('🏆 Recorde registrado e Jornal atualizado!');
      } else {
        Utils.showToast('Registro adicionado ao Trono!');
      }

      window._msyRecordesCache = null;
      window._msyRecordesCacheTs = 0;

      tronoBanco.diario = novoTop3;
      close();
      renderTrono();
    });
  }

  content.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-header-title">Ranking de Mensagens</div>
        <div class="page-header-sub">Histórico e Trono dos Recordes da Masayoshi Order</div>
      </div>
      ${canGerenciarRanking ? `<div class="ranking-add-btns">
        <button class="btn btn-ghost btn-sm" id="newRankMenBtn"><i class="fa-solid fa-plus"></i> Mensal</button>
        <button class="btn btn-gold btn-sm" id="newRankSemBtn"><i class="fa-solid fa-plus"></i> Semanal</button>
      </div>` : ''}
    </div>

    <div class="rank-main-tabs">
      <button class="rank-main-tab active" data-aba="trono">
        🏆 Trono dos Recordes
      </button>
      <button class="rank-main-tab" data-aba="mensal">
        <i class="fa-solid fa-calendar-days"></i> Mensal
        <span class="rank-tab-count">${mensais.length}</span>
      </button>
      <button class="rank-main-tab" data-aba="semanal">
        <i class="fa-solid fa-calendar-week"></i> Semanal
        <span class="rank-tab-count">${semanais.length}</span>
      </button>
    </div>

    <div id="rankContent"></div>`;

  document.querySelectorAll('.rank-main-tab').forEach(btn => {
    btn.addEventListener('click', () => ativarAba(btn.dataset.aba));
  });
  document.getElementById('newRankSemBtn')?.addEventListener('click', () => abrirModal('semanal'));
  document.getElementById('newRankMenBtn')?.addEventListener('click', () => abrirModal('mensal'));

  ativarAba('trono');
}

initRanking().catch(err => {
  console.error('[MSY][ranking] Erro ao inicializar página:', err);
  window.MSY.Utils.showToast?.('Erro ao carregar ranking.', 'error');
});
