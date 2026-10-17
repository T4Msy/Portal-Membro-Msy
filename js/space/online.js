// Presença global do MSY Space ('space:online'): quem está no Space e em qual sala de voz.
// Portado do OnlineProvider da Plataforma. Presença com freio de 15 s (limite do Supabase,
// decisão D18) — a lista de quem está na sala de voz em tempo real vem da própria sala.
//
// Plano B (decisão D20, igual ao D19 das salas): se a Presença do Supabase falha no `track`
// ou derruba o canal logo depois dele, cada aba passa a se anunciar por broadcast ("beacon")
// a cada 10 s; quem recebe um anúncio também anuncia. Assim a lista de canais e a tela de
// entrada da sala continuam mostrando quem está onde. Em dias normais nada disso roda.
import { supabase } from './lib/supabase.js';
import { PresenceThrottle } from './lib/presenceThrottle.js';
import { PeerBeacons } from './voice/webrtc/peerBeacons.js';

const BEACON_MS = 10_000;
const BEACON_TTL_MS = 30_000;
const TRACK_CRASH_WINDOW_MS = 15_000;

export class OnlinePresence extends EventTarget {
  constructor(userId) {
    super();
    this.tabId = crypto.randomUUID();
    this.meta = { tabId: this.tabId, sessionId: this.tabId, userId, voice: null, joinedAt: Date.now() };
    this.metas = [];
    this.connected = false;
    this.channel = null;
    this.throttle = null;
    this.presenceBroken = false;
    this.lastTrackAt = 0;
    this.beacons = new PeerBeacons(BEACON_TTL_MS);
    this.beaconTimer = null;
  }

  start() {
    const ch = supabase.channel('space:online', { config: { private: true, presence: { key: this.tabId }, broadcast: { self: false, ack: false } } });
    this.channel = ch;
    this.throttle = new PresenceThrottle(15_000, (m) => this.track(m));
    ch.on('presence', { event: 'sync' }, () => this.refresh())
      .on('broadcast', { event: 'beacon' }, ({ payload }) => this.onBeacon(payload))
      .on('broadcast', { event: 'bye' }, ({ payload }) => { if (this.beacons.remove(payload?.sessionId)) this.refresh(); })
      .subscribe((status) => {
        if (ch !== this.channel) return;
        if (status === 'SUBSCRIBED') {
          this.connected = true;
          // (Re)conectou: o servidor não tem nossa presença — envia de novo (ou anuncia, no plano B).
          if (this.presenceBroken) this.sendBeacon(true);
          else this.throttle.push(this.meta, true);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          this.connected = false;
          this.checkTrackCrash();
        }
        this.emit();
      });
  }

  async track(m) {
    if (!this.channel || this.presenceBroken) return;
    this.lastTrackAt = Date.now();
    const res = await this.channel.track(m);
    if (res !== 'ok' && this.channel) this.markPresenceBroken();
  }

  /** Canal caiu logo depois de um `track`: a Presença do servidor está quebrada. */
  checkTrackCrash() {
    if (this.channel && this.lastTrackAt && Date.now() - this.lastTrackAt < TRACK_CRASH_WINDOW_MS) this.markPresenceBroken();
  }

  markPresenceBroken() {
    if (this.presenceBroken) return;
    console.warn('[MSY][space] Presença do Supabase instável: usando anúncios por broadcast.');
    this.presenceBroken = true;
    this.throttle?.cancel();
    this.startBeacons(true);
  }

  startBeacons(want) {
    if (this.beaconTimer === null) {
      this.beaconTimer = setInterval(() => {
        this.sendBeacon(false);
        if (this.beacons.prune()) this.refresh();
      }, BEACON_MS);
    }
    this.sendBeacon(want);
  }

  sendBeacon(want) {
    if (!this.channel || !this.connected) return;
    void this.channel.send({ type: 'broadcast', event: 'beacon', payload: { meta: this.meta, want } });
  }

  onBeacon(payload) {
    const meta = payload?.meta;
    if (!meta?.sessionId || meta.sessionId === this.tabId || !meta.userId) return;
    const changed = this.beacons.put(meta);
    // Alguém está sem presença: passo a me anunciar também (senão ele não me vê).
    if (this.beaconTimer === null) this.startBeacons(false);
    else if (payload.want) this.sendBeacon(false);
    if (changed) this.refresh();
  }

  refresh() {
    const state = this.channel ? this.channel.presenceState() : {};
    const fromPresence = Object.values(state).flatMap((list) => list.slice(-1))
      .map((m) => ({ ...m, sessionId: m.sessionId || m.tabId, joinedAt: m.joinedAt || 0 }));
    this.metas = this.beacons.merge(fromPresence);
    this.emit();
  }

  /** Chamado pela sessão de voz: { channelId, muted, deafened, screen, camera } ou null. */
  setVoice(voice) {
    this.meta = { ...this.meta, voice, rev: (this.meta.rev || 0) + 1 };
    if (this.presenceBroken || this.beaconTimer !== null) this.sendBeacon(false);
    if (!this.presenceBroken) this.throttle?.push(this.meta);
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
    if (this.beaconTimer !== null) clearInterval(this.beaconTimer);
    this.beaconTimer = null;
    this.beacons.clear();
    const ch = this.channel;
    this.channel = null;
    if (ch) {
      if (this.connected) void ch.send({ type: 'broadcast', event: 'bye', payload: { sessionId: this.tabId } });
      supabase.removeChannel(ch);
    }
    this.connected = false;
  }

  emit() { this.dispatchEvent(new Event('change')); }
}
