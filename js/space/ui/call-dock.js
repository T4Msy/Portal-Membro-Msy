// Cartão flutuante da chamada (sobreposição). Aparece quando há chamada e a sala não está
// na tela: ao navegar pelo portal (moldura) ou ao abrir outro canal do Space.
import { avatarHtml, displayName, esc, icon } from './dom.js';

export class CallDock {
  constructor({ voice, workspace, pip, me, isRoomVisible, onOpenRoom }) {
    this.voice = voice;
    this.pip = pip;
    this.workspace = workspace;
    this.me = me;
    this.isRoomVisible = isRoomVisible;
    this.onOpenRoom = onOpenRoom;
    this.minimized = false;
    this.el = document.createElement('aside');
    this.el.className = 'sp-dock';
    this.el.setAttribute('aria-label', 'Chamada do MSY Space');
    this.el.hidden = true;
    document.body.appendChild(this.el);
    this.el.addEventListener('click', (e) => this.onClick(e));
    voice.addEventListener('change', () => this.render());
  }

  render() {
    const snap = this.voice.snapshot;
    const show = this.voice.active && !this.isRoomVisible();
    this.el.hidden = !show;
    if (!show) return;

    const channel = this.voice.channel;
    const people = [
      { userId: this.me.id, speaking: snap.local.speaking && !snap.local.muted, muted: snap.local.muted || !snap.local.micAvailable },
      ...snap.participants.map((p) => ({ userId: p.userId, speaking: p.speaking && !p.meta.muted, muted: p.meta.muted })),
    ];
    const sharing = snap.participants.find((p) => p.meta.screen);
    const micOff = snap.local.muted || !snap.local.micAvailable;
    const status = snap.status === 'connected' ? 'Voz conectada' : snap.status === 'reconnecting' ? 'Reconectando…' : 'Conectando…';

    const html = this.minimized
      ? `<button class="sp-dock-mini" data-act="expand" title="Mostrar chamada">${icon('fa-satellite-dish')}<span class="sp-dock-dot is-${esc(snap.status)}"></span>
          ${people.some((p) => p.speaking) ? '<span class="sp-dock-wave"></span>' : ''}</button>`
      : `<div class="sp-dock-head">
          <span class="sp-dock-dot is-${esc(snap.status)}"></span>
          <div class="sp-dock-title"><small>${esc(status)}</small><b>${esc(channel?.name || 'Sala de voz')}</b></div>
          <button class="sp-icon-btn" data-act="minimize" title="Minimizar">${icon('fa-minus')}</button>
        </div>
        <div class="sp-dock-people">${people.slice(0, 8).map((p) => {
          const prof = this.workspace.profile(p.userId);
          return `<span class="sp-dock-person ${p.speaking ? 'is-speaking' : ''}" title="${esc(displayName(prof))}">${avatarHtml(prof, 30)}${p.muted ? `<i class="fa-solid fa-microphone-slash"></i>` : ''}</span>`;
        }).join('')}${people.length > 8 ? `<span class="sp-dock-more">+${people.length - 8}</span>` : ''}</div>
        ${sharing ? `<button class="sp-dock-live" data-act="open">${icon('fa-display')} ${esc(displayName(this.workspace.profile(sharing.userId)))} está transmitindo</button>` : ''}
        <div class="sp-dock-controls">
          <button class="sp-ctl sp-ctl-sm ${micOff ? 'is-off' : ''}" data-act="mute" title="${micOff ? 'Ativar microfone' : 'Desativar microfone'}">${icon(micOff ? 'fa-microphone-slash' : 'fa-microphone')}</button>
          <button class="sp-ctl sp-ctl-sm ${snap.local.deafened ? 'is-off' : ''}" data-act="deafen" title="${snap.local.deafened ? 'Ativar som' : 'Desativar som'}">${icon(snap.local.deafened ? 'fa-volume-xmark' : 'fa-headphones')}</button>
          ${snap.local.screen ? `<button class="sp-ctl sp-ctl-sm is-on" data-act="stop-screen" title="Parar transmissão">${icon('fa-display')}</button>` : ''}
          ${this.pip?.supported ? `<button class="sp-ctl sp-ctl-sm" data-act="pip" title="Janela flutuante (fica por cima de outros apps)">${icon('fa-clone')}</button>` : ''}
          <button class="sp-ctl sp-ctl-sm" data-act="open" title="Abrir a sala">${icon('fa-up-right-and-down-left-from-center')}</button>
          <button class="sp-ctl sp-ctl-sm is-danger" data-act="leave" title="Sair da chamada">${icon('fa-phone-slash')}</button>
        </div>`;
    if (html !== this.lastHtml) {
      this.el.innerHTML = html;
      this.lastHtml = html;
    }
    this.el.classList.toggle('is-mini', this.minimized);
  }

  onClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'mute') this.voice.toggleMute();
    if (act === 'deafen') this.voice.toggleDeafen();
    if (act === 'stop-screen') this.voice.stopScreen();
    if (act === 'leave') this.voice.leave();
    if (act === 'open') this.onOpenRoom();
    if (act === 'pip') this.pip?.toggle();
    if (act === 'minimize') { this.minimized = true; this.render(); }
    if (act === 'expand') { this.minimized = false; this.render(); }
  }
}
