/* ============================================================
   MSY PORTAL — MENSALIDADE.JS
   Sistema de Mensalidades | Masayoshi Order
   ============================================================ */

'use strict';

async function initMensalidade() {
  try {
    const profile = await renderSidebar('mensalidade');
    if (!profile) return;
    await renderTopBar('Mensalidade', profile);

  const content     = document.getElementById('pageContent');
  const isDiretoria = profile.tier === 'diretoria';
  const mesAtual    = Payments.getMesAtual();

  Utils.showLoading(content);

  /* ── 1. Processa retorno do Mercado Pago (se houver) ─── */
  const retorno = await Payments.processarRetorno(profile);

  /* ── 2. Carrega tudo ─────────────────────────────────── */
  const [meuStatus, todosMembros] = await Promise.all([
    Payments.getStatusAtual(profile.id),
    isDiretoria ? Payments.getStatusTodos() : Promise.resolve([]),
  ]);

  const statusPagamento = meuStatus?.status || 'pendente';
  const pago            = statusPagamento === 'pago';
  const pendente        = statusPagamento === 'pendente';

  /* ── 3. Constrói HTML ────────────────────────────────── */
  content.innerHTML = `
    <!-- Alerta global (só se pendente e não acabou de retornar de um sucesso) -->
    ${pendente && retorno !== 'success' ? `
    <div class="mens-alerta card-enter">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <span><strong>Sua mensalidade está pendente.</strong> Contribua agora para manter a Ordem forte.</span>
    </div>` : ''}

    <!-- Hero -->
    <div class="mens-hero card-enter">
      <div class="mens-hero-eyebrow">Masayoshi Order — Dever de Membro</div>
      <h1 class="mens-hero-title">A Ordem <span>exige</span> compromisso.</h1>
      <p class="mens-hero-desc">
        Não somos um grupo. Somos uma estrutura. Cada membro que honra a mensalidade
        fortalece o coletivo, financia automações, projetos e ferramentas que ampliam
        o poder da Ordem. <strong style="color:var(--text-1)">R$10,00 por mês. Sem exceções.</strong>
      </p>
    </div>

    <!-- Status do usuário -->
    <div class="mens-status-card status-${pendente ? 'pendente' : pago ? 'pago' : 'atrasado'} card-enter">
      <div class="mens-status-icon ${pago ? 'verde' : pendente ? 'vermelho' : 'amarelo'}">
        <i class="fa-solid fa-${pago ? 'circle-check' : pendente ? 'circle-xmark' : 'clock'}"></i>
      </div>
      <div class="mens-status-info">
        <div class="mens-status-label">Seu status — ${Payments.formatMes(mesAtual)}</div>
        <div class="mens-status-value ${pago ? 'verde' : pendente ? 'vermelho' : 'amarelo'}">
          ${pago ? 'Mensalidade Quitada' : pendente ? 'Não Pago' : 'Em Análise'}
        </div>
        <div class="mens-status-sub">
          ${pago
            ? `Pago em ${Utils.formatDate(meuStatus.data_pagamento)} · Referência: ${Payments.formatMes(mesAtual)}`
            : pendente
              ? 'Nenhum pagamento registrado para este mês.'
              : 'Pagamento identificado. Aguardando confirmação.'}
        </div>
      </div>
      ${!pago ? `
      <button class="btn" id="btnPagarMensalidade">
        <i class="fa-solid fa-credit-card"></i> Pagar — R$10,00
      </button>` : `
      <div style="display:flex;align-items:center;gap:8px;color:#22c55e;font-weight:700;font-size:0.85rem">
        <i class="fa-solid fa-shield-check" style="font-size:1.2rem"></i> Em dia
      </div>`}
    </div>

    <!-- Manifesto / Pilares -->
    <div class="mens-manifesto card-enter">
      <div class="mens-manifesto-title">
        <i class="fa-solid fa-crown" style="color:var(--gold)"></i>
        Por que a mensalidade importa
      </div>
      <p style="color:var(--text-2);font-size:0.88rem;line-height:1.75;margin-bottom:4px">
        A Masayoshi Order não depende de favores. Dependemos de membros que entendem que
        poder coletivo é construído com comprometimento individual.
        Cada real contribuído retorna multiplicado em infraestrutura, automações e projetos reais.
      </p>
      <div class="mens-pillars">
        <div class="mens-pillar">
          <div class="mens-pillar-icon"><i class="fa-solid fa-bolt"></i></div>
          <div class="mens-pillar-title">Automações</div>
          <div class="mens-pillar-desc">Financiamos ferramentas e workflows que aumentam a produtividade de todos.</div>
        </div>
        <div class="mens-pillar">
          <div class="mens-pillar-icon"><i class="fa-solid fa-server"></i></div>
          <div class="mens-pillar-title">Infraestrutura</div>
          <div class="mens-pillar-desc">Servidores, domínios e APIs que mantêm o portal e os projetos no ar.</div>
        </div>
        <div class="mens-pillar">
          <div class="mens-pillar-icon"><i class="fa-solid fa-chart-line"></i></div>
          <div class="mens-pillar-title">Projetos</div>
          <div class="mens-pillar-desc">Investimento direto em iniciativas que expandem a influência da Ordem.</div>
        </div>
        <div class="mens-pillar">
          <div class="mens-pillar-icon"><i class="fa-solid fa-users"></i></div>
          <div class="mens-pillar-title">Benefício Coletivo</div>
          <div class="mens-pillar-desc">O que fortalece a Ordem, fortalece cada membro individualmente.</div>
        </div>
      </div>
    </div>

    <!-- Painel da Ordem (visível a todos) -->
    <div class="mens-ordem-section card-enter">
      <div class="mens-ordem-header">
        <div class="mens-ordem-title">
          <i class="fa-solid fa-shield-halved" style="color:var(--gold)"></i>
          Status da Ordem — ${Payments.formatMes(mesAtual)}
        </div>
        <div class="mens-ordem-stats" id="ordeSummary">
          <div class="mens-stat-pill gold"><i class="fa-solid fa-circle-notch fa-spin"></i> Carregando...</div>
        </div>
      </div>
      <div id="membrosLista">
        ${[1,2,3,4].map(() => `<div class="mens-skeleton"></div>`).join('')}
      </div>
    </div>
  `;

  /* ── 4. Botão de pagamento ───────────────────────────── */
  document.getElementById('btnPagarMensalidade')?.addEventListener('click', () => {
    Payments.iniciarPagamento(profile);
  });

  /* ── 5. Carrega membros ──────────────────────────────── */
  await renderMembros(isDiretoria, profile, todosM => {
    // callback depois do render para atualizar pills
    const pagos    = todosM.filter(m => m.status_mensalidade === 'pago').length;
    const total    = todosM.length;
    const pendentes = total - pagos;

    document.getElementById('ordeSummary').innerHTML = `
      <div class="mens-stat-pill verde"><i class="fa-solid fa-check"></i> ${pagos} pagos</div>
      <div class="mens-stat-pill vermelho"><i class="fa-solid fa-xmark"></i> ${pendentes} pendentes</div>
      <div class="mens-stat-pill gold"><i class="fa-solid fa-users"></i> ${total} membros</div>
    `;
    });
  } catch (err) {
    console.error('[MSY][mensalidade] Erro ao inicializar mensalidade:', err);
    const content = document.getElementById('pageContent');
    if (content) {
      content.innerHTML = '<div class="empty-state"><div class="empty-state-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><div class="empty-state-text">Erro ao carregar mensalidade. Tente recarregar.</div></div>';
    }
    Utils.showToast?.('Erro ao carregar mensalidade.', 'error');
  }
}

/* ── Renderiza lista de membros ──────────────────────────── */
async function renderMembros(isDiretoria, meProfile, onDone) {
  const lista = document.getElementById('membrosLista');

  // Se não for diretoria, ainda mostramos mas SEM revelar status alheio
  // (apenas o próprio usuário e o status geral)
  let membros = [];
  try {
    membros = await Payments.getStatusTodos();
    onDone(membros);
  } catch (err) {
    console.error('[MSY][mensalidade] Erro ao carregar membros:', err);
    Utils.showToast?.('Erro ao carregar membros.', 'error');
    lista.innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--text-3)">
        <i class="fa-solid fa-triangle-exclamation" style="font-size:2rem;opacity:0.3;display:block;margin-bottom:12px"></i>
        Erro ao carregar membros.
      </div>`;
    return;
  }

  if (!membros || membros.length === 0) {
    lista.innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--text-3)">
        <i class="fa-solid fa-users" style="font-size:2rem;opacity:0.3;display:block;margin-bottom:12px"></i>
        Nenhum membro ativo encontrado.
      </div>`;
    return;
  }

  lista.innerHTML = membros.map(m => {
    // Membros comuns só veem o próprio status + status anônimo dos demais
    const isMe       = m.id === meProfile.id;
    const mostraStatus = isDiretoria || isMe;
    const statusVal   = m.status_mensalidade;
    const badgeClass  = statusVal === 'pago' ? 'pago' : statusVal === 'atrasado' ? 'atrasado' : 'pendente';
    const badgeLabel  = statusVal === 'pago' ? '✓ Pago' : statusVal === 'atrasado' ? '⚠ Atrasado' : '✗ Pendente';
    const badgeIcon   = mostraStatus ? `<span class="mens-badge ${badgeClass}">${badgeLabel}</span>` :
                        (isMe ? `<span class="mens-badge ${badgeClass}">${badgeLabel}</span>` : '');

    const btnMarcar = isDiretoria && statusVal !== 'pago'
      ? `<button class="btn btn-ghost btn-sm mens-marcar-pago" data-id="${m.id}" data-name="${Utils.escapeHtml(m.name)}"
           style="font-size:.72rem;color:#22c55e;border-color:rgba(34,197,94,.3);margin-left:6px;white-space:nowrap">
           <i class="fa-solid fa-check"></i> Marcar pago
         </button>`
      : '';

    return `
      <div class="mens-membro-item" data-member-id="${m.id}">
        <div class="avatar" style="background:linear-gradient(135deg,${m.color||'#7f1d1d'},#1a1a1a);flex-shrink:0">
          ${m.avatar_url ? `<img src="${m.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` :
            (m.initials || Utils.getInitials(m.name))}
        </div>
        <div class="mens-membro-info">
          <div class="mens-membro-name">${Utils.escapeHtml(m.name)}${isMe ? ' <span style="color:var(--gold);font-size:0.7rem">(você)</span>' : ''}</div>
          <div class="mens-membro-role">${Utils.escapeHtml(m.role || '')} · ${Utils.tierBadge(m.tier)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
          ${mostraStatus ? badgeIcon : `<span class="mens-badge pendente" style="opacity:0.35">—</span>`}
          ${btnMarcar}
        </div>
      </div>
    `;
  }).join('');

  // Bind botões "Marcar como pago"
  lista.querySelectorAll('.mens-marcar-pago').forEach(btn => {
    btn.addEventListener('click', async () => {
      const memberId = btn.dataset.id;
      const memberName = btn.dataset.name;
      if (!confirm(`Marcar ${memberName} como pago no mês atual?`)) return;

      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';

      try {
        await Payments.confirmarPagamento(memberId, 'manual-diretoria', Payments.getMesAtual());

        // Atualiza a linha na tela sem recarregar tudo
        const item = lista.querySelector(`[data-member-id="${memberId}"]`);
        if (item) {
          const badgeEl = item.querySelector('.mens-badge');
          if (badgeEl) { badgeEl.className = 'mens-badge pago'; badgeEl.textContent = '✓ Pago'; }
          btn.remove();
        }

        Utils.showToast(`✅ ${memberName} marcado como pago!`, 'success');

        // Atualiza pills de resumo
        const pagosNow = lista.querySelectorAll('.mens-badge.pago').length;
        const totalNow = lista.querySelectorAll('.mens-membro-item').length;
        document.getElementById('ordeSummary').innerHTML = `
          <div class="mens-stat-pill verde"><i class="fa-solid fa-check"></i> ${pagosNow} pagos</div>
          <div class="mens-stat-pill vermelho"><i class="fa-solid fa-xmark"></i> ${totalNow - pagosNow} pendentes</div>
          <div class="mens-stat-pill gold"><i class="fa-solid fa-users"></i> ${totalNow} membros</div>
        `;
      } catch (err) {
        console.error('[MSY][mensalidade] Erro ao confirmar pagamento manual:', err);
        Utils.showToast?.('Erro ao confirmar pagamento.', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Marcar pago';
      }
    });
  });

/* ── Boot ─────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if (page === 'mensalidade') initMensalidade();
});
}
