/* ============================================================
   MSY PORTAL — PÁGINA PROGRESSO
   Membro: vê o próprio progresso (mensagens + desempenho no cargo).
   Diretoria: lista de membros com mensagens e nota da última semana
   fechada; escolhe um membro para ver e avaliar.
   ============================================================ */

import {
  renderProgresso, notasDaSemana, semanasFechadas, rotuloSemana, fmtNota,
  carregarGrupo, mensagensRecentes, advertenciasAtivas, ADV_LIMITE,
} from '../core/progresso.js?v=20261122-progresso8';

const { db, Utils, renderSidebar, renderTopBar } = window.MSY;
const esc = value => Utils.escapeHtml(String(value ?? ''));

function avatar(m) {
  return `<span class="prog-avatar" style="--c:${esc(m.color || '#c9a84c')}">${m.avatar_url
    ? `<img src="${esc(m.avatar_url)}" alt="" loading="lazy">`
    : esc(m.initials || Utils.getInitials(m.name))}</span>`;
}

function msgsChip({ passada, anterior }) {
  if (passada === null || passada === undefined) return '<span class="prog-dir-msgs">– msgs</span>';
  const tipo = anterior === null || anterior === undefined ? 'same' : passada > anterior ? 'up' : passada < anterior ? 'down' : 'same';
  const icone = tipo === 'up' ? 'fa-arrow-up' : tipo === 'down' ? 'fa-arrow-down' : 'fa-minus';
  const titulo = anterior === null || anterior === undefined ? '' : ` title="Semana anterior: ${anterior}"`;
  return `<span class="prog-dir-msgs ${tipo}"${titulo}><i class="fa-solid ${icone}"></i> ${Number(passada).toLocaleString('pt-BR')} msgs</span>`;
}

async function initProgresso() {
  const profile = await renderSidebar('progresso');
  if (!profile) return;
  await renderTopBar('Progresso', profile);

  const content = document.getElementById('pageContent');
  const ehDiretoria = profile.tier === 'diretoria';
  const semana = semanasFechadas(1)[0];

  content.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-header-title">Progresso</div>
        <div class="page-header-sub">${ehDiretoria
          ? 'Como cada membro está indo na Masayoshi. Escolha um membro para ver o progresso e avaliar o desempenho no cargo.'
          : 'Como você está indo na Masayoshi: mensagens no grupo e a avaliação da Diretoria no seu cargo.'}</div>
      </div>
    </div>
    ${ehDiretoria ? `
      <div class="prog-dir">
        <div class="prog-dir-head">
          <div class="prog-card-title"><i class="fa-solid fa-clipboard-check"></i> Semana ${esc(rotuloSemana(semana))}</div>
          <span class="prog-dir-count" id="progDirCount"></span>
        </div>
        <div class="prog-dir-list" id="progDirList"><div class="prog-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Carregando membros...</div></div>
      </div>` : ''}
    <div id="progAlvo"></div>`;

  const alvo = document.getElementById('progAlvo');
  if (!ehDiretoria) {
    await renderProgresso(alvo, { db, Utils, membro: profile, viewer: profile, titulo: false });
    return;
  }

  let membros = [];
  let selecionado = profile.id;

  async function carregarLista() {
    const lista = document.getElementById('progDirList');
    try {
      const [grupo, notas, advs] = await Promise.all([
        carregarGrupo(db),
        notasDaSemana(db, semana.inicio),
        advertenciasAtivas(db).catch(err => {
          console.error('[MSY][progresso] Erro ao carregar advertências:', err);
          return new Map();
        }),
      ]);
      membros = grupo.perfis
        .filter(m => m.status === 'ativo')
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      const avaliados = membros.filter(m => notas.has(m.id)).length;
      document.getElementById('progDirCount').textContent = `${avaliados} de ${membros.length} avaliados`;
      lista.innerHTML = membros.map(m => {
        const nota = notas.get(m.id);
        const adv = advs.get(m.id) || 0;
        const advChip = adv
          ? `<span class="prog-dir-adv${adv >= ADV_LIMITE ? ' alto' : ''}" title="Advertências nos últimos 3 meses"><i class="fa-solid fa-triangle-exclamation"></i> ${adv}</span>`
          : '';
        return `<button type="button" class="prog-dir-item${m.id === selecionado ? ' active' : ''}" data-id="${m.id}">
          ${avatar(m)}
          <span class="prog-dir-info">
            <span class="prog-dir-name">${esc(m.name)}</span>
            <span class="prog-dir-linha">${msgsChip(mensagensRecentes(grupo, m.id))}${advChip}</span>
          </span>
          ${nota === undefined
            ? '<span class="prog-dir-status pendente" title="Sem avaliação nesta semana">Pendente</span>'
            : `<span class="prog-dir-status ok" title="Nota no cargo">${fmtNota(nota)}</span>`}
        </button>`;
      }).join('');
      // No celular a lista é uma faixa horizontal: começa mostrando o membro selecionado
      const ativo = lista.querySelector('.prog-dir-item.active');
      if (ativo && lista.scrollWidth > lista.clientWidth) lista.scrollLeft += ativo.getBoundingClientRect().left - lista.getBoundingClientRect().left - 14;
      lista.querySelectorAll('.prog-dir-item').forEach(btn => btn.addEventListener('click', () => {
        selecionado = btn.dataset.id;
        lista.querySelectorAll('.prog-dir-item').forEach(b => b.classList.toggle('active', b === btn));
        mostrar();
        alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }));
    } catch (err) {
      console.error('[MSY][progresso] Erro ao carregar membros:', err);
      lista.innerHTML = '<div class="prog-vazio">Erro ao carregar os membros. Tente recarregar a página.</div>';
    }
  }

  function mostrar() {
    const membro = membros.find(m => m.id === selecionado) || profile;
    alvo.innerHTML = `<div class="prog-alvo-nome">${avatar(membro)} ${esc(membro.name)}${membro.role ? ` <small>· ${esc(membro.role)}</small>` : ''}</div><div id="progAlvoBloco"></div>`;
    renderProgresso(document.getElementById('progAlvoBloco'), { db, Utils, membro, viewer: profile, titulo: false, onAlterado: carregarLista });
  }

  await carregarLista();
  mostrar();
}

initProgresso().catch(err => {
  console.error('[MSY][progresso] Erro ao inicializar:', err);
  const content = document.getElementById('pageContent');
  if (content) content.innerHTML = '<div class="empty-state">Erro ao carregar. Tente recarregar a página.</div>';
});
