// Portado de Masayoshi-Plataforma/src/features/voice/webrtc/PeerLink.ts (TS -> JS automático). Ver docs/msy-space/README.md
import { enableOpusStereo } from './sdp.js';
import { SLOTS, SLOT_KIND } from './types.js';
const MAX_ICE_RESTARTS = 3;
const CONNECT_WATCHDOG_MS = 25_000;
const DISCONNECT_GRACE_MS = 3_000;
const OFFER_TIMEOUT_MS = 8_000;
/**
 * Uma RTCPeerConnection com um participante remoto.
 *
 * Modelo "um lado oferece": o INICIADOR (quem não é "polite") cria os 4
 * transceivers (mic, câmera, tela, áudio da tela) como sendrecv e faz a oferta;
 * o RESPONDEDOR não cria nada — reaproveita esses mesmos transceivers ao
 * responder. Assim não há colisão de ofertas na entrada (o modelo anterior,
 * com os dois lados criando transceivers, falhava entre o site e o app Android:
 * a biblioteca nativa atualiza o signalingState com atraso e reordenava m-lines).
 * O slot de cada track é identificado pelo "mid" (0..3 na ordem de SLOTS).
 * Renegociações posteriores (ICE restart) seguem "perfect negotiation".
 * Ligar/desligar mídia usa replaceTrack, sem renegociar.
 */
export class PeerLink {
    remoteId;
    epoch;
    polite;
    encodings;
    cb;
    pc;
    senders = {};
    tracks;
    makingOffer = false;
    ignoreOffer = false;
    queue = Promise.resolve();
    pendingRemoteCandidates = [];
    outCandidates = [];
    flushTimer = null;
    disconnectTimer = null;
    watchdog = null;
    offerTimer = null;
    encodingsDirty = false;
    restarts = 0;
    lastBytes = { out: 0, in: 0, at: 0 };
    state = 'new';
    closed = false;
    constructor(remoteId, epoch, polite, iceServers, localStreams, tracks, encodings, cb) {
        this.remoteId = remoteId;
        this.epoch = epoch;
        this.polite = polite;
        this.encodings = encodings;
        this.cb = cb;
        this.pc = new RTCPeerConnection({ iceServers, bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require' });
        this.tracks = { ...tracks };
        if (!polite) {
            // Iniciador: cria os transceivers na ordem fixa dos slots (mids 0..3).
            for (const slot of SLOTS) {
                const track = tracks[slot];
                const t = this.pc.addTransceiver(track ?? SLOT_KIND[slot], {
                    direction: 'sendrecv',
                    streams: [localStreams[slot]],
                    sendEncodings: [toEncoding(encodings[slot])],
                });
                this.senders[slot] = t.sender;
            }
        }
        this.pc.onnegotiationneeded = () => void this.negotiate();
        this.pc.onicecandidate = ({ candidate }) => {
            if (!candidate)
                return;
            this.outCandidates.push(candidate.toJSON());
            if (this.flushTimer === null)
                this.flushTimer = window.setTimeout(() => this.flushCandidates(), 60);
        };
        this.pc.ontrack = (ev) => {
            const slot = slotForMid(ev.transceiver?.mid ?? null);
            if (!slot)
                return;
            const stream = ev.streams[0] ?? new MediaStream([ev.track]);
            this.cb.onTrack(slot, ev.track, stream);
        };
        this.pc.onconnectionstatechange = () => this.onConnectionState();
        this.pc.oniceconnectionstatechange = () => this.onConnectionState();
        this.pc.onsignalingstatechange = () => {
            if (this.pc.signalingState === 'stable' && this.encodingsDirty) {
                window.setTimeout(() => this.applyAllEncodingsWhenStable(), 0);
            }
        };
        // Sem callback aqui: quem cria o link ainda não terminou de registrá-lo.
        this.state = 'connecting';
        this.armWatchdog();
    }
    /** Mensagens são processadas em ordem (oferta antes dos candidatos). */
    handle(env) {
        this.queue = this.queue.then(() => this.process(env)).catch((e) => console.warn('[webrtc] sinal', this.remoteId, e));
    }
    async setTrack(slot, track) {
        if (this.closed)
            return;
        this.tracks[slot] = track;
        const sender = this.senders[slot];
        if (!sender || sender.track === track)
            return; // respondedor: aplicado ao receber a oferta
        await sender.replaceTrack(track);
        if (track)
            void this.applyEncoding(slot);
    }
    /**
     * Ajusta bitrate/fps do envio. Nunca é aguardado dentro da fila de sinalização:
     * no Chrome, setParameters durante uma renegociação pode não resolver e
     * travaria a fila (detectado no laboratório). Só roda com sinalização estável.
     */
    async applyEncoding(slot) {
        if (this.closed)
            return;
        if (this.pc.signalingState !== 'stable' || this.makingOffer) {
            this.encodingsDirty = true;
            return;
        }
        const sender = this.senders[slot];
        if (!sender)
            return;
        const params = sender.getParameters();
        const first = params.encodings?.[0];
        if (!first)
            return;
        const enc = this.encodings[slot];
        Object.assign(first, toEncoding(enc));
        if (enc.maxBitrate === undefined)
            delete first.maxBitrate;
        try {
            await Promise.race([sender.setParameters(params), new Promise((r) => window.setTimeout(r, 3000))]);
        }
        catch (e) {
            console.warn('[webrtc] setParameters', slot, e);
        }
    }
    applyAllEncodingsWhenStable() {
        if (this.pc.signalingState !== 'stable' || this.makingOffer) {
            this.encodingsDirty = true;
            return;
        }
        this.encodingsDirty = false;
        for (const slot of SLOTS)
            if (this.senders[slot]?.track)
                void this.applyEncoding(slot);
    }
    async stats() {
        const report = await this.pc.getStats();
        let rttMs = null;
        let outBytes = 0;
        let inBytes = 0;
        let relayed = false;
        let inFps = null;
        let limitation = null;
        const candidates = new Map();
        report.forEach((s) => {
            if (s.type === 'local-candidate')
                candidates.set(s.id, s);
        });
        report.forEach((s) => {
            const r = s;
            if (s.type === 'candidate-pair' && r.state === 'succeeded' && (r.nominated || r.selected)) {
                if (typeof r.currentRoundTripTime === 'number')
                    rttMs = Math.round(r.currentRoundTripTime * 1000);
                const local = candidates.get(String(r.localCandidateId));
                if (local?.candidateType === 'relay')
                    relayed = true;
            }
            if (s.type === 'outbound-rtp' && typeof r.bytesSent === 'number') {
                outBytes += r.bytesSent;
                if (r.kind === 'video' && typeof r.qualityLimitationReason === 'string' && r.qualityLimitationReason !== 'none') {
                    limitation = r.qualityLimitationReason;
                }
            }
            if (s.type === 'inbound-rtp' && typeof r.bytesReceived === 'number') {
                inBytes += r.bytesReceived;
                if (r.kind === 'video' && typeof r.framesPerSecond === 'number')
                    inFps = Math.max(inFps ?? 0, r.framesPerSecond);
            }
        });
        const now = performance.now();
        const dt = (now - this.lastBytes.at) / 1000;
        const outKbps = this.lastBytes.at && dt > 0 ? Math.max(0, ((outBytes - this.lastBytes.out) * 8) / 1000 / dt) : 0;
        const inKbps = this.lastBytes.at && dt > 0 ? Math.max(0, ((inBytes - this.lastBytes.in) * 8) / 1000 / dt) : 0;
        this.lastBytes = { out: outBytes, in: inBytes, at: now };
        return { rttMs, outKbps: Math.round(outKbps), inKbps: Math.round(inKbps), relayed, inFps, limitation };
    }
    close() {
        if (this.closed)
            return;
        this.closed = true;
        this.clearTimers();
        this.pc.onnegotiationneeded = null;
        this.pc.onicecandidate = null;
        this.pc.ontrack = null;
        this.pc.onconnectionstatechange = null;
        this.pc.oniceconnectionstatechange = null;
        this.pc.onsignalingstatechange = null;
        this.pc.close();
        this.setState('closed');
    }
    // ---------------------------------------------------------------------------
    async negotiate() {
        if (this.closed || this.makingOffer)
            return;
        try {
            this.makingOffer = true;
            await this.pc.setLocalDescription();
            if (this.pc.localDescription)
                this.cb.send({ description: this.pc.localDescription.toJSON() });
            this.armOfferTimeout();
        }
        catch (e) {
            console.warn('[webrtc] oferta', e);
        }
        finally {
            this.makingOffer = false;
        }
    }
    async process(env) {
        if (this.closed)
            return;
        const pc = this.pc;
        if (env.description) {
            const d = env.description;
            const collision = d.type === 'offer' && (this.makingOffer || pc.signalingState !== 'stable');
            this.ignoreOffer = !this.polite && collision;
            if (this.ignoreOffer)
                return;
            await pc.setRemoteDescription({ type: d.type, sdp: enableOpusStereo(d.sdp ?? '') });
            if (d.type === 'offer') {
                await this.adoptTransceivers();
                await pc.setLocalDescription();
                if (pc.localDescription)
                    this.cb.send({ description: pc.localDescription.toJSON() });
            }
            const pending = this.pendingRemoteCandidates;
            this.pendingRemoteCandidates = [];
            for (const c of pending)
                await this.addCandidate(c);
            this.applyAllEncodingsWhenStable();
        }
        if (env.candidates) {
            for (const c of env.candidates) {
                if (!pc.remoteDescription)
                    this.pendingRemoteCandidates.push(c);
                else
                    await this.addCandidate(c);
            }
        }
    }
    /** Respondedor: assume os transceivers criados pela oferta e passa a enviar por eles. */
    async adoptTransceivers() {
        for (const t of this.pc.getTransceivers()) {
            const slot = slotForMid(t.mid);
            if (!slot || this.senders[slot])
                continue;
            this.senders[slot] = t.sender;
            t.direction = 'sendrecv';
            const track = this.tracks[slot];
            if (track)
                await t.sender.replaceTrack(track);
        }
    }
    /**
     * Oferta sem resposta (mensagem perdida): reenvia a MESMA oferta, sem desfazer.
     * (Desfazer e reofertar criava transceivers novos — mids 4..7 — e o outro lado
     * recusava por ordem de m-lines diferente.) Depois de 3 tentativas, recria o link.
     */
    armOfferTimeout(attempt = 1) {
        if (this.offerTimer !== null)
            window.clearTimeout(this.offerTimer);
        this.offerTimer = window.setTimeout(() => {
            this.offerTimer = null;
            if (this.closed || this.pc.signalingState !== 'have-local-offer')
                return;
            if (attempt >= 3) {
                this.setState('failed');
                this.cb.onFatal();
                return;
            }
            if (this.pc.localDescription)
                this.cb.send({ description: this.pc.localDescription.toJSON() });
            this.armOfferTimeout(attempt + 1);
        }, OFFER_TIMEOUT_MS);
    }
    async addCandidate(c) {
        try {
            await this.pc.addIceCandidate(c);
        }
        catch (e) {
            if (!this.ignoreOffer)
                console.warn('[webrtc] candidato', e);
        }
    }
    flushCandidates() {
        this.flushTimer = null;
        if (this.closed || this.outCandidates.length === 0)
            return;
        const batch = this.outCandidates;
        this.outCandidates = [];
        this.cb.send({ candidates: batch });
    }
    /**
     * Estado efetivo da conexão, combinando connectionState e
     * iceConnectionState: conectado se QUALQUER um disser que a mídia
     * está passando: entre o Chrome e o app Android, o connectionState ficava
     * parado em "connecting" com o áudio funcionando (o watchdog recriava a
     * conexão a cada 25 s e a interface mostrava "Conectando").
     */
    effectiveState() {
        const conn = this.pc.connectionState;
        const ice = this.pc.iceConnectionState;
        if (conn === 'closed' || ice === 'closed')
            return 'closed';
        if (conn === 'connected' || ice === 'connected' || ice === 'completed')
            return 'connected';
        if (conn === 'failed' || ice === 'failed')
            return 'failed';
        if (conn === 'disconnected' || ice === 'disconnected')
            return 'disconnected';
        return conn;
    }
    isMediaConnected() {
        return this.effectiveState() === 'connected';
    }
    onConnectionState() {
        switch (this.effectiveState()) {
            case 'connected':
                this.restarts = 0;
                if (this.disconnectTimer !== null)
                    window.clearTimeout(this.disconnectTimer);
                this.disconnectTimer = null;
                if (this.watchdog !== null)
                    window.clearTimeout(this.watchdog);
                this.watchdog = null;
                this.setState('connected');
                break;
            case 'disconnected':
                this.setState('reconnecting');
                if (this.disconnectTimer === null) {
                    this.disconnectTimer = window.setTimeout(() => {
                        this.disconnectTimer = null;
                        if (this.effectiveState() === 'disconnected')
                            this.restartIce();
                    }, DISCONNECT_GRACE_MS);
                }
                break;
            case 'failed':
                this.setState('reconnecting');
                this.restartIce();
                break;
            case 'closed':
                this.setState('closed');
                break;
            default:
                break;
        }
    }
    restartIce() {
        if (this.closed)
            return;
        this.restarts += 1;
        if (this.restarts > MAX_ICE_RESTARTS) {
            this.setState('failed');
            this.cb.onFatal();
            return;
        }
        this.armWatchdog();
        this.pc.restartIce();
    }
    armWatchdog() {
        if (this.watchdog !== null)
            window.clearTimeout(this.watchdog);
        this.watchdog = window.setTimeout(() => {
            this.watchdog = null;
            if (!this.closed && !this.isMediaConnected()) {
                this.setState('failed');
                this.cb.onFatal();
            }
        }, CONNECT_WATCHDOG_MS);
    }
    setState(s) {
        if (this.state === s)
            return;
        this.state = s;
        this.cb.onState(s);
    }
    clearTimers() {
        for (const t of [this.flushTimer, this.disconnectTimer, this.watchdog, this.offerTimer])
            if (t !== null)
                window.clearTimeout(t);
        this.flushTimer = this.disconnectTimer = this.watchdog = this.offerTimer = null;
    }
}
function slotForMid(mid) {
    if (mid === null)
        return null;
    const i = Number(mid);
    return Number.isInteger(i) && i >= 0 && i < SLOTS.length ? (SLOTS[i] ?? null) : null;
}
function toEncoding(enc) {
    const out = {};
    if (enc.maxBitrate !== undefined)
        out.maxBitrate = enc.maxBitrate;
    if (enc.maxFramerate !== undefined)
        out.maxFramerate = enc.maxFramerate;
    if (enc.scaleResolutionDownBy !== undefined)
        out.scaleResolutionDownBy = enc.scaleResolutionDownBy;
    if (enc.priority)
        out.priority = enc.priority;
    if (enc.networkPriority)
        out.networkPriority = enc.networkPriority;
    return out;
}
