// Portado de Masayoshi-Plataforma/src/features/voice/webrtc/MeshTransport.ts (TS -> JS automático). Ver docs/msy-space/README.md
import { PeerLink } from './PeerLink.js';
import { SLOTS, } from './types.js';
/**
 * Alguém que some da presença NÃO é desconectado enquanto a mídia P2P estiver
 * passando: a sinalização (Supabase) pode cair sem derrubar o áudio — ex.: app
 * Android em segundo plano, onde os timers do JS param e o servidor fecha o
 * WebSocket em ~60 s (diagnosticado no teste real). A conexão só é encerrada
 * quando a própria mídia cai (ou após um teto de segurança).
 */
const LEAVE_GRACE_OTHER_MS = 5_000;
const ABSENT_MEDIA_DOWN_GRACE_MS = 8_000;
const ABSENT_MAX_MS = 30 * 60_000;
/**
 * Topologia mesh: uma conexão P2P com cada participante.
 * Upload de cada um cresce linearmente com o número de pessoas — ver docs/WEBRTC.md.
 */
export class MeshTransport {
    selfId;
    localStreams;
    iceServers;
    send;
    events;
    links = new Map();
    leaveTimers = new Map();
    absent = new Set();
    tracks = { mic: null, camera: null, screen: null, screenAudio: null };
    encodings;
    notWatching = new Set();
    statsTimer;
    closed = false;
    constructor(selfId, localStreams, iceServers, send, events, initialEncodings) {
        this.selfId = selfId;
        this.localStreams = localStreams;
        this.iceServers = iceServers;
        this.send = send;
        this.events = events;
        this.encodings = { ...initialEncodings };
        this.statsTimer = window.setInterval(() => void this.collectStats(), 2000);
    }
    setIceServers(servers) {
        this.iceServers = servers;
    }
    async setTrack(slot, track) {
        this.tracks[slot] = track;
        await Promise.all([...this.links.values()].map((l) => l.setTrack(slot, this.effectiveTrack(slot, l.remoteId))));
    }
    setEncoding(slot, enc) {
        this.encodings[slot] = { ...enc };
        for (const l of this.links.values())
            void l.applyEncoding(slot);
    }
    setPeerWatching(peerSessionId, watching) {
        if (watching)
            this.notWatching.delete(peerSessionId);
        else
            this.notWatching.add(peerSessionId);
        const link = this.links.get(peerSessionId);
        if (link) {
            void link.setTrack('screen', this.effectiveTrack('screen', peerSessionId));
            void link.setTrack('screenAudio', this.effectiveTrack('screenAudio', peerSessionId));
        }
    }
    syncPeers(peers) {
        if (this.closed)
            return;
        const present = new Set(peers.map((p) => p.sessionId).filter((id) => id !== this.selfId));
        for (const id of present) {
            this.absent.delete(id);
            this.clearLeaveTimer(id);
            if (!this.links.has(id))
                this.createLink(id, 0);
        }
        for (const [id, link] of this.links) {
            if (present.has(id) || this.absent.has(id))
                continue;
            this.absent.add(id);
            this.scheduleDrop(id, link.state === 'connected' ? ABSENT_MAX_MS : LEAVE_GRACE_OTHER_MS);
        }
    }
    /** Estado atual da conexão com um participante (a sinalização pode chegar antes da presença). */
    linkState(peerSessionId) {
        return this.links.get(peerSessionId)?.state ?? null;
    }
    /** Participante ausente da presença mas com mídia ativa? (a interface o mantém visível) */
    isAbsentButConnected(peerSessionId) {
        return this.absent.has(peerSessionId) && this.links.get(peerSessionId)?.state === 'connected';
    }
    scheduleDrop(id, ms) {
        this.clearLeaveTimer(id);
        this.leaveTimers.set(id, window.setTimeout(() => {
            this.leaveTimers.delete(id);
            this.absent.delete(id);
            this.dropLink(id);
        }, ms));
    }
    clearLeaveTimer(id) {
        const t = this.leaveTimers.get(id);
        if (t !== undefined)
            window.clearTimeout(t);
        this.leaveTimers.delete(id);
    }
    handleSignal(env) {
        if (this.closed || env.to !== this.selfId || env.from === this.selfId)
            return;
        let link = this.links.get(env.from);
        if (link && env.epoch < link.epoch)
            return; // mensagem de uma conexão antiga
        if (!link || env.epoch > link.epoch) {
            link?.close();
            link = this.createLink(env.from, env.epoch);
        }
        if (env.description || env.candidates)
            link.handle(env);
    }
    close() {
        this.closed = true;
        window.clearInterval(this.statsTimer);
        this.leaveTimers.forEach((t) => window.clearTimeout(t));
        this.leaveTimers.clear();
        for (const id of [...this.links.keys()])
            this.dropLink(id);
    }
    peerCount() {
        return this.links.size;
    }
    /** Quantos participantes estão recebendo minha tela (para estimar upload). */
    screenViewers() {
        let n = 0;
        for (const id of this.links.keys())
            if (!this.notWatching.has(id))
                n++;
        return n;
    }
    // ---------------------------------------------------------------------------
    effectiveTrack(slot, peerId) {
        if ((slot === 'screen' || slot === 'screenAudio') && this.notWatching.has(peerId))
            return null;
        return this.tracks[slot];
    }
    createLink(remoteId, epoch) {
        const tracks = {};
        for (const slot of SLOTS)
            tracks[slot] = this.effectiveTrack(slot, remoteId);
        const link = new PeerLink(remoteId, epoch, this.selfId < remoteId, this.iceServers, this.localStreams, tracks, this.encodings, {
            send: (sig) => this.send({ ...sig, from: this.selfId, to: remoteId, epoch }),
            onTrack: (slot, track, stream) => this.events.onRemoteTrack(remoteId, slot, track, stream),
            onState: (state) => {
                if (this.links.get(remoteId) !== link)
                    return;
                // Ausente da presença e a mídia caiu: aí sim encerra (com uma pequena tolerância).
                if (this.absent.has(remoteId)) {
                    if (state === 'connected')
                        this.scheduleDrop(remoteId, ABSENT_MAX_MS);
                    else
                        this.scheduleDrop(remoteId, ABSENT_MEDIA_DOWN_GRACE_MS);
                }
                this.events.onPeerState(remoteId, state);
            },
            onFatal: () => this.recreate(remoteId, link),
        });
        this.links.set(remoteId, link);
        this.events.onPeerState(remoteId, link.state);
        return link;
    }
    recreate(remoteId, old) {
        if (this.closed || this.links.get(remoteId) !== old)
            return;
        old.close();
        const next = this.createLink(remoteId, old.epoch + 1);
        this.send({ from: this.selfId, to: remoteId, epoch: next.epoch, reset: true });
    }
    dropLink(id) {
        const link = this.links.get(id);
        if (!link)
            return;
        this.absent.delete(id);
        this.links.delete(id);
        link.close();
        this.notWatching.delete(id);
        this.events.onPeerState(id, 'closed');
    }
    async collectStats() {
        if (!this.events.onStats)
            return;
        for (const [id, link] of this.links) {
            if (link.state !== 'connected')
                continue;
            try {
                const s = await link.stats();
                this.events.onStats(id, s);
            }
            catch {
                /* conexão fechando */
            }
        }
    }
}
