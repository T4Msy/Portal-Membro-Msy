import { esc, icon } from './dom.js';
import { supabase } from '../lib/supabase.js';

/** Menu compartilhado da lista de voz e dos quadros da chamada. */
export class MemberMenu {
  constructor({ workspace, voice, me, onDirectMessage }) {
    this.workspace = workspace;
    this.voice = voice;
    this.me = me;
    this.onDirectMessage = onDirectMessage;
    this.el = null;
    this.previousFocus = null;
    this.outside = (e) => { if (this.el && !this.el.contains(e.target)) this.close(); };
    this.focusOutside = (e) => { if (this.el && !this.el.contains(e.target)) this.close(); };
    this.keys = (e) => {
      if (e.key === 'Escape' && this.el) { e.preventDefault(); this.close(true); }
      if ((e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) && e.target.closest?.('[data-space-user]')) {
        e.preventDefault();
        const target = e.target.closest('[data-space-user]');
        this.open(target.dataset.spaceUser, target, target.getBoundingClientRect().left, target.getBoundingClientRect().bottom);
      }
    };
  }

  mount() {
    this.onContext = (e) => {
      const target = e.target.closest('[data-space-user], .sp-tile[data-remote]');
      const userId = target?.dataset.spaceUser || target?.dataset.user;
      if (!target || !userId || userId === this.me.id || target.closest('.sp-profile-modal')) return;
      e.preventDefault(); this.open(userId, target, e.clientX, e.clientY);
    };
    this.onTrigger = (e) => {
      const trigger = e.target.closest('[data-member-menu]');
      if (trigger) {
        e.preventDefault(); e.stopPropagation();
        this.open(trigger.dataset.user, trigger, trigger.getBoundingClientRect().left, trigger.getBoundingClientRect().bottom);
      }
    };
    document.addEventListener('contextmenu', this.onContext);
    document.addEventListener('click', this.onTrigger, true);
    document.addEventListener('keydown', this.keys);
    document.addEventListener('pointerdown', this.outside, true);
    document.addEventListener('focusin', this.focusOutside, true);
    this.voice.addEventListener('change', this.onVoiceChange = () => this.refreshVolume());
    this.onAuth = supabase.auth.onAuthStateChange?.(() => this.close());
  }

  open(userId, anchor, x, y) {
    if (!userId || userId === this.me.id) return;
    const profile = this.workspace.profile(userId);
    if (!profile) return;
    this.close();
    this.previousFocus = anchor;
    const hasAudio = this.voice.hasRemoteAudio(userId);
    const hasScreenAudio = this.voice.hasRemoteScreenAudio(userId);
    const volume = this.voice.prefs.get().userVolumes?.[userId] ?? 1;
    const streamVolume = this.voice.prefs.get().userVolumes?.[`${userId}:stream`] ?? 1;
    const menu = document.createElement('div');
    menu.className = 'sp-member-menu'; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', `Ações para ${profile.name || 'membro'}`);
    menu.dataset.user = userId;
    menu.innerHTML = `
      <div class="sp-member-menu-person">${esc(profile.name || 'Membro')}</div>
      <button role="menuitem" data-action="profile">${icon('fa-user')} Ver perfil</button>
      <button role="menuitem" data-action="dm">${icon('fa-message')} Enviar mensagem</button>
      ${hasAudio ? `<label class="sp-member-volume"><span>Volume do usuário <output>${Math.round(volume * 100)}%</output></span>
        <input type="range" min="0" max="2" step="0.01" value="${volume}" aria-label="Volume de ${esc(profile.name || 'membro')}" data-volume="voice"></label>` : ''}
      ${hasScreenAudio ? `<label class="sp-member-volume"><span>Áudio compartilhado <output>${Math.round(streamVolume * 100)}%</output></span>
        <input type="range" min="0" max="3" step="0.01" value="${streamVolume}" aria-label="Áudio compartilhado de ${esc(profile.name || 'membro')}" data-volume="stream"></label>` : ''}`;
    menu.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'profile') { this.close(); document.dispatchEvent(new CustomEvent('space:open-profile', { detail: { userId } })); }
      if (action === 'dm') { this.close(); this.onDirectMessage?.(userId); }
    });
    menu.addEventListener('input', (e) => {
      if (!e.target.matches('[data-volume]')) return;
      const value = Number(e.target.value);
      const kind = e.target.dataset.volume;
      this.voice.setUserVolume(userId, value, kind);
      e.target.parentElement.querySelector('output').textContent = `${Math.round(value * 100)}%`;
    });
    menu.addEventListener('keydown', (e) => {
      if (!e.target.matches('button[role="menuitem"]')) return;
      const items = [...menu.querySelectorAll('button,[data-volume]')];
      const index = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); items[(index + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
      }
    });
    document.body.appendChild(menu); this.el = menu;
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, innerWidth - rect.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, innerHeight - rect.height - 8))}px`;
    menu.querySelector('button')?.focus();
  }

  refreshVolume() {
    if (!this.el) return;
    const userId = this.el.dataset.user;
    if ((this.el.querySelector('[data-volume="voice"]') && !this.voice.hasRemoteAudio(userId))
      || (this.el.querySelector('[data-volume="stream"]') && !this.voice.hasRemoteScreenAudio(userId))) this.close();
  }

  close(restore = false) {
    if (!this.el) return;
    this.el.remove(); this.el = null;
    if (restore && this.previousFocus?.isConnected) this.previousFocus.focus();
    this.previousFocus = null;
  }

  destroy() {
    this.close(); document.removeEventListener('contextmenu', this.onContext);
    document.removeEventListener('click', this.onTrigger, true); document.removeEventListener('keydown', this.keys);
    document.removeEventListener('pointerdown', this.outside, true);
    document.removeEventListener('focusin', this.focusOutside, true);
    this.voice.removeEventListener('change', this.onVoiceChange);
    this.onAuth?.data?.subscription?.unsubscribe?.();
  }
}
