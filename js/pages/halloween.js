/* ============================================================
   HALLOWEEN MASAYOSHI 2026 — liga o convite (halloween.html) ao portal.
   Exige login do portal, registra até onde cada membro chegou
   (halloween_track) e mostra à diretoria o atalho para o painel.
   O convite avisa cada passo com o evento "msy-hw" (ver msyTrack no HTML).
   ============================================================ */
(function initHalloween() {
  'use strict';

  const sent = new Set();
  const pending = [];
  let ready = false;
  let chain = Promise.resolve();

  function send(event, value) {
    // Em fila: o "open" sempre chega antes dos passos seguintes.
    chain = chain.then(async () => {
      try {
        const { error } = await db.rpc('halloween_track', {
          p_event: event,
          p_value: value === undefined || value === null ? null : String(value),
        });
        if (error) throw error;
      } catch (err) {
        console.error('[MSY][halloween] falha ao registrar', event, err);
      }
    });
  }

  function track(event, value) {
    const key = `${event}:${value ?? ''}`;
    if (sent.has(key)) return;
    sent.add(key);
    if (ready) send(event, value);
    else pending.push([event, value]);
  }

  window.addEventListener('msy-hw', (e) => track(e.detail?.type, e.detail?.value));

  function addPanelButton() {
    const bar = document.querySelector('.topbtns');
    if (!bar || document.getElementById('msyHwPanel')) return;
    const link = document.createElement('a');
    link.className = 'hbtn';
    link.id = 'msyHwPanel';
    link.href = 'halloween-painel.html';
    link.setAttribute('aria-label', 'Quem viu o convite');
    link.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg><span class="t">QUEM VIU</span>';
    bar.insertBefore(link, document.getElementById('msyPortal')?.nextSibling || bar.firstChild);
  }

  async function start() {
    const profile = await Auth.requireAuth();
    if (!profile) return; // sem sessão: o portal já mandou para o login
    if (profile.tier === 'diretoria') addPanelButton();
    ready = true;
    send('open');
    pending.splice(0).forEach(([event, value]) => send(event, value));
  }

  start().catch((err) => console.error('[MSY][halloween] erro ao iniciar', err));
})();
