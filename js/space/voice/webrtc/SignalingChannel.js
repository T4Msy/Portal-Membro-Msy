// Portado de Masayoshi-Plataforma/src/features/voice/webrtc/SignalingChannel.ts (TS -> JS automático). Ver docs/msy-space/README.md
import { PresenceThrottle } from '../../lib/presenceThrottle.js';
import { supabase } from '../../lib/supabase.js';
import { PeerBeacons } from './peerBeacons.js';
const JOIN_TIMEOUT_MS = 12_000;
/** Modo sem presença: cada um se anuncia a cada 10 s; quem some por 30 s sai da lista. */
const BEACON_MS = 10_000;
const BEACON_TTL_MS = 30_000;
/** Canal caiu até 15 s depois de um `track`: a Presença do servidor está quebrada. */
const TRACK_CRASH_WINDOW_MS = 15_000;
/**
 * Canal privado do Supabase Realtime para uma sala de voz ('voice:<id>').
 * - Presença: quem está na sala e o estado de cada um.
 * - Broadcast: SDP/ICE (WebRTC), reações e pedidos de "assistir tela".
 * A autorização do tópico é feita por RLS em realtime.messages: conhecer o id
 * de uma sala privada não basta para entrar nela.
 *
 * Plano B (Presença do Supabase fora do ar): se o `track` falha ou derruba o
 * canal, paramos de usar presença e cada um se anuncia por broadcast (`beacon`).
 * Quem recebe um anúncio também passa a anunciar — assim todos se enxergam.
 * Em dias normais nada disso roda (economiza a cota de mensagens do plano grátis).
 */
export class SignalingChannel {
    channelId;
    h;
    channel = null;
    meta;
    everJoined = false;
    closed = false;
    /** Presença: no máximo 1 atualização a cada 10 s (limite do Supabase: 5 por 30 s por cliente). */
    presence = new PresenceThrottle(10_000, (m) => this.track(m));
    presenceBroken = false;
    lastTrackAt = 0;
    beacons = new PeerBeacons(BEACON_TTL_MS);
    beaconTimer = null;
    constructor(channelId, initialMeta, h) {
        this.channelId = channelId;
        this.h = h;
        this.meta = initialMeta;
    }
    join() {
        return new Promise((resolve, reject) => {
            const ch = supabase.channel(`space:voice:${this.channelId}`, {
                config: {
                    private: true,
                    presence: { key: this.meta.sessionId },
                    broadcast: { self: false, ack: false },
                },
            });
            this.channel = ch;
            ch.on('presence', { event: 'sync' }, () => this.h.onPeers(this.peers()))
                .on('broadcast', { event: 'beacon' }, ({ payload }) => this.onBeacon(payload))
                .on('broadcast', { event: 'bye' }, ({ payload }) => {
                if (this.beacons.remove(payload.sessionId))
                    this.h.onPeers(this.peers());
            })
                .on('broadcast', { event: 'signal' }, ({ payload }) => this.h.onSignal(payload))
                .on('broadcast', { event: 'reaction' }, ({ payload }) => this.h.onReaction(payload))
                .on('broadcast', { event: 'watch' }, ({ payload }) => this.h.onWatch(payload))
                .on('broadcast', { event: 'meta' }, ({ payload }) => this.h.onMeta?.(payload));
            const timeout = window.setTimeout(() => {
                if (!this.everJoined) {
                    this.leave();
                    reject(new Error('Tempo esgotado ao conectar na sala. Verifique sua internet.'));
                }
            }, JOIN_TIMEOUT_MS);
            ch.subscribe(async (status, err) => {
                if (this.closed)
                    return;
                if (status === 'SUBSCRIBED') {
                    // (Re)entrou: o servidor não tem nossa presença — envia (respeitando o freio),
                    // ou, com a Presença quebrada, anuncia por broadcast pedindo resposta.
                    if (this.presenceBroken)
                        this.sendBeacon(true);
                    else
                        this.presence.push(this.meta, true);
                    if (!this.everJoined) {
                        this.everJoined = true;
                        window.clearTimeout(timeout);
                        resolve();
                    }
                    this.h.onStatus('connected');
                }
                else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    this.checkTrackCrash();
                    if (!this.everJoined) {
                        window.clearTimeout(timeout);
                        this.leave();
                        const unauthorized = /unauthori|denied|forbidden/i.test(err?.message ?? '');
                        reject(new Error(unauthorized ? 'Você não tem acesso a esta sala.' : 'Não foi possível conectar na sala.'));
                    }
                    else {
                        // supabase-js tenta reentrar sozinho; ao voltar, a presença é reenviada.
                        this.h.onStatus('reconnecting');
                    }
                }
                else if (status === 'CLOSED' && this.everJoined) {
                    this.checkTrackCrash();
                    this.h.onStatus('reconnecting');
                }
            });
        });
    }
    peers() {
        if (!this.channel)
            return [];
        const state = this.channel.presenceState();
        const out = [];
        for (const metas of Object.values(state)) {
            const last = metas[metas.length - 1];
            if (last)
                out.push(last);
        }
        return this.beacons.merge(out);
    }
    async track(m) {
        if (!this.channel || this.presenceBroken)
            return;
        this.lastTrackAt = Date.now();
        const res = await this.channel.track(m);
        if (res !== 'ok' && !this.closed)
            this.markPresenceBroken();
    }
    checkTrackCrash() {
        if (this.lastTrackAt && Date.now() - this.lastTrackAt < TRACK_CRASH_WINDOW_MS)
            this.markPresenceBroken();
    }
    markPresenceBroken() {
        if (this.presenceBroken)
            return;
        this.presenceBroken = true;
        this.presence.cancel();
        this.startBeacons(true);
    }
    startBeacons(want) {
        if (this.beaconTimer === null) {
            this.beaconTimer = setInterval(() => {
                this.sendBeacon(false);
                if (this.beacons.prune())
                    this.h.onPeers(this.peers());
            }, BEACON_MS);
        }
        this.sendBeacon(want);
    }
    sendBeacon(want) {
        if (!this.channel || !this.everJoined || this.closed)
            return;
        void this.channel.send({ type: 'broadcast', event: 'beacon', payload: { meta: this.meta, want } });
    }
    onBeacon({ meta, want }) {
        if (!meta?.sessionId || meta.sessionId === this.meta.sessionId)
            return;
        const changed = this.beacons.put(meta);
        // Alguém está sem presença: passo a me anunciar também (senão ele não me vê).
        if (this.beaconTimer === null)
            this.startBeacons(false);
        else if (want)
            this.sendBeacon(false);
        if (changed)
            this.h.onPeers(this.peers());
    }
    async updateMeta(patch) {
        const merged = { ...this.meta, ...patch, rev: this.meta.rev };
        const changed = JSON.stringify(merged) !== JSON.stringify(this.meta);
        const next = changed ? { ...merged, rev: (this.meta.rev ?? 0) + 1 } : merged;
        this.meta = next;
        if (!changed || !this.channel || !this.everJoined || this.closed)
            return;
        // Imediato para quem está na sala (broadcast não tem esse limite)…
        void this.channel.send({ type: 'broadcast', event: 'meta', payload: next });
        // …e a presença (fonte da verdade para quem entra depois) com freio.
        this.presence.push(next);
    }
    sendSignal(env) {
        void this.channel?.send({ type: 'broadcast', event: 'signal', payload: env });
    }
    sendReaction(ev) {
        void this.channel?.send({ type: 'broadcast', event: 'reaction', payload: ev });
    }
    sendWatch(ev) {
        void this.channel?.send({ type: 'broadcast', event: 'watch', payload: ev });
    }
    leave() {
        if (this.closed)
            return;
        this.closed = true;
        this.presence.cancel();
        if (this.beaconTimer !== null)
            clearInterval(this.beaconTimer);
        this.beaconTimer = null;
        this.beacons.clear();
        const ch = this.channel;
        this.channel = null;
        if (ch) {
            if (this.everJoined)
                void ch.send({ type: 'broadcast', event: 'bye', payload: { sessionId: this.meta.sessionId } });
            void ch.untrack().catch(() => undefined);
            void supabase.removeChannel(ch);
        }
        this.h.onStatus('closed');
    }
}
