// Controlador da chamada do MSY Space (equivalente ao VoiceProvider da Plataforma).
// Uma única sessão de voz por janela. A interface escuta o evento 'change' e lê `snapshot`.
import { supabase } from './lib/supabase.js';
import { VoiceSession } from './voice/VoiceSession.js';

const ACTIVE = new Set(['joining', 'connected', 'reconnecting']);

export class VoiceController extends EventTarget {
  constructor({ me, prefs, online, workspace, toast }) {
    super();
    this.me = me;
    this.prefs = prefs;
    this.online = online;
    this.workspace = workspace;
    this.toast = toast;
    this.session = null;
    this.unsubscribe = null;
    this.snapshot = null;
    this.touchTimer = null;
    window.addEventListener('pagehide', () => this.session?.leave());
  }

  /** Há chamada em andamento (ou entrando)? */
  get active() { return Boolean(this.snapshot && ACTIVE.has(this.snapshot.status)); }
  get channelId() { return this.active ? this.snapshot.channelId : null; }
  get channel() { return this.channelId ? this.workspace.getChannel(this.channelId) : null; }

  async join(channel) {
    const current = this.session;
    if (current && current.getSnapshot().channelId === channel.id && current.getSnapshot().status !== 'error') return;
    if (current) this.leave();

    const session = new VoiceSession({
      userId: this.me.id,
      prefs: () => this.prefs.get(),
      onVoiceState: (state) => this.online.setVoice(state),
    });
    this.session = session;
    this.unsubscribe = session.subscribe(() => this.onSnapshot(session));
    this.onSnapshot(session);
    await session.join(channel.id, channel.user_limit);
    // Como no Discord: se já estava mutado/ensurdecido fora da chamada, entra assim.
    if (session === this.session && session.getSnapshot().status === 'connected') {
      const p = this.prefs.get();
      if (p.selfMute && !session.getSnapshot().local.muted && session.getSnapshot().local.micAvailable) await session.toggleMute();
      if (p.selfDeaf && !session.getSnapshot().local.deafened) session.toggleDeafen();
    }

    const snap = session.getSnapshot();
    if (snap.local.micError && snap.status === 'connected') {
      this.toast(`${snap.local.micError} Você entrou apenas para ouvir.`, 'warning');
    }
  }

  leave() {
    const session = this.session;
    if (!session) return;
    const snap = session.getSnapshot();
    // Último a sair de uma sala com código: ela será removida em breve.
    const channel = snap.channelId ? this.workspace.getChannel(snap.channelId) : null;
    if (channel?.is_temporary && snap.participants.length === 0) {
      supabase.rpc('space_mark_room_empty', { p_channel: channel.id }).then(({ error }) => {
        if (error) console.warn('[MSY][space] Falha ao marcar sala vazia:', error);
      });
    }
    this.unsubscribe?.();
    this.unsubscribe = null;
    session.leave();
    this.session = null;
    this.snapshot = null;
    this.syncRoomHeartbeat();
    this.emit();
  }

  onSnapshot(session) {
    if (session !== this.session) return;
    const snap = session.getSnapshot();
    const prevStatus = this.snapshot?.status;
    this.snapshot = snap;
    if (snap.status === 'error') {
      if (snap.error) this.toast(snap.error, 'error');
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.session = null;
      this.snapshot = null;
    }
    if (prevStatus !== this.snapshot?.status) this.syncRoomHeartbeat();
    this.emit();
  }

  /** Sala com código: sinal de vida a cada 5 min enquanto estou nela (senão ela é limpa). */
  syncRoomHeartbeat() {
    clearInterval(this.touchTimer);
    this.touchTimer = null;
    const channel = this.snapshot && ['connected', 'reconnecting'].includes(this.snapshot.status) ? this.channel : null;
    if (!channel?.is_temporary) return;
    const touch = () => supabase.rpc('space_touch_room', { p_channel: channel.id }).then(({ error }) => {
      if (error) console.warn('[MSY][space] Falha no sinal de vida da sala:', error);
    });
    touch();
    this.touchTimer = setInterval(touch, 5 * 60_000);
  }

  /** Executa uma ação na sessão mostrando o erro como aviso (padrão do VoiceProvider). */
  run(fn) {
    const s = this.session;
    if (!s) return;
    Promise.resolve().then(() => fn(s)).catch((e) => {
      console.error('[MSY][space] Ação de voz falhou:', e);
      this.toast(e instanceof Error ? e.message : 'Falha na operação.', 'error');
    });
  }

  /** Mutar/ensurdecer valem dentro e fora da chamada (fora, fica guardado para a próxima). */
  get selfMuted() { return this.snapshot ? this.snapshot.local.muted : Boolean(this.prefs.get().selfMute); }
  get selfDeafened() { return this.snapshot ? this.snapshot.local.deafened : Boolean(this.prefs.get().selfDeaf); }

  toggleMute() {
    if (!this.session) { this.prefs.update({ selfMute: !this.prefs.get().selfMute }); this.emit(); return; }
    this.run(async (s) => { await s.toggleMute(); this.prefs.update({ selfMute: s.getSnapshot().local.muted }); });
  }

  toggleDeafen() {
    if (!this.session) { this.prefs.update({ selfDeaf: !this.prefs.get().selfDeaf }); this.emit(); return; }
    this.run((s) => { s.toggleDeafen(); this.prefs.update({ selfDeaf: s.getSnapshot().local.deafened }); });
  }
  toggleCamera() { this.run((s) => s.toggleCamera()); }
  startScreen(withAudio) { this.run((s) => s.startScreen(withAudio)); }
  stopScreen() { this.run((s) => s.stopScreen()); }
  setWatching(sessionId, watching) { this.run((s) => s.setWatching(sessionId, watching)); }
  react(emoji) { this.run((s) => s.react(emoji)); }
  resumeAudio() { this.run((s) => s.resumeAudio()); }

  setScreenPreset(id) {
    this.run((s) => s.setScreenPreset(id));
    this.prefs.update({ screenPreset: id });
  }

  /** kind: 'voice' (até 200%) ou 'stream' (áudio da transmissão, até 300%). */
  setUserVolume(userId, volume, kind) {
    this.run((s) => s.setUserVolume(userId, volume, kind));
    const key = kind === 'voice' ? userId : `${userId}:stream`;
    this.prefs.update({ userVolumes: { ...(this.prefs.get().userVolumes || {}), [key]: volume } });
  }

  async changeInputDevice(prefs) { await this.session?.changeInputDevice(prefs); }
  async changeOutputDevice(deviceId) { await this.session?.changeOutputDevice(deviceId); }

  emit() { this.dispatchEvent(new Event('change')); }
}
