// Presença global do MSY Space ('space:online'): quem está no Space e em qual sala de voz.
// Portado do OnlineProvider da Plataforma. Presença com freio de 15 s (limite do Supabase,
// decisão D18) — a lista de quem está na sala de voz em tempo real vem da própria sala.
import { supabase } from './lib/supabase.js';
import { PresenceThrottle } from './lib/presenceThrottle.js';

export class OnlinePresence extends EventTarget {
  constructor(userId) {
    super();
    this.tabId = crypto.randomUUID();
    this.meta = { tabId: this.tabId, userId, voice: null };
    this.metas = [];
    this.connected = false;
    this.channel = null;
    this.throttle = null;
  }

  start() {
    const ch = supabase.channel('space:online', { config: { private: true, presence: { key: this.tabId } } });
    this.channel = ch;
    this.throttle = new PresenceThrottle(15_000, (m) => ch.track(m));
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState();
      this.metas = Object.values(state).flatMap((list) => list.slice(-1));
      this.emit();
    }).subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        this.connected = true;
        this.throttle.push(this.meta, true);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        this.connected = false;
      }
      this.emit();
    });
  }

  /** Chamado pela sessão de voz: { channelId, muted, deafened, screen, camera } ou null. */
  setVoice(voice) {
    this.meta = { ...this.meta, voice };
    this.throttle?.push(this.meta);
  }

  onlineUserIds() { return new Set(this.metas.map((m) => m.userId)); }

  /** channelId -> [{ userId, muted, deafened, screen, camera }] (sem repetir a mesma pessoa). */
  voiceByChannel() {
    const map = new Map();
    for (const m of this.metas) {
      if (!m.voice) continue;
      const list = map.get(m.voice.channelId) || [];
      if (!list.some((x) => x.userId === m.userId)) list.push({ ...m.voice, userId: m.userId });
      map.set(m.voice.channelId, list);
    }
    return map;
  }

  stop() {
    this.throttle?.cancel();
    if (this.channel) supabase.removeChannel(this.channel);
    this.channel = null;
  }

  emit() { this.dispatchEvent(new Event('change')); }
}
