// Portado de Masayoshi-Plataforma/src/features/voice/VoiceSession.ts (TS -> JS automático). Ver docs/msy-space/README.md
import { AudioOutput } from './media/audioOutput.js';
import { getCameraTrack, getMicTrack, mediaErrorMessage } from './media/devices.js';
import { applyPresetToTrack, captureScreen, SCREEN_PRESETS, surfaceLabel } from './media/screen.js';
import { SpeakingDetector } from './media/speaking.js';
import { planEncodings } from './webrtc/budget.js';
import { getIceServers, hasTurn } from './webrtc/iceServers.js';
import { MeshTransport } from './webrtc/MeshTransport.js';
import { SignalingChannel } from './webrtc/SignalingChannel.js';
import { SLOTS } from './webrtc/types.js';
export const REACTIONS = ['👍', '😂', '🔥', '👏', '😮', '❤️', '💀', '🎉'];
let reactionSeq = 1;
/**
 * Sessão de voz: estado local (mic, câmera, tela), sinalização, transporte de
 * mídia e reprodução. A UI só lê o snapshot e chama os métodos públicos.
 */
export class VoiceSession {
    deps;
    sessionId = crypto.randomUUID();
    listeners = new Set();
    snapshot;
    signaling = null;
    transport = null;
    audio;
    speaking = new SpeakingDetector();
    localStreams;
    micTrack = null;
    cameraTrack = null;
    screenTracks = null;
    peers = new Map();
    remoteStreams = new Map();
    watchedMic = new Map();
    userLimit = 15;
    lastReactionAt = 0;
    encodingKeys = {};
    disposed = false;
    constructor(deps) {
        this.deps = deps;
        this.localStreams = { mic: new MediaStream(), camera: new MediaStream(), screen: new MediaStream(), screenAudio: new MediaStream() };
        this.audio = new AudioOutput((blocked) => this.patch({ audioBlocked: blocked }));
        this.snapshot = {
            status: 'idle',
            channelId: null,
            error: null,
            local: {
                sessionId: this.sessionId,
                muted: false,
                deafened: false,
                micAvailable: false,
                micError: null,
                speaking: false,
                camera: null,
                screen: null,
                screenLabel: null,
                screenHasAudio: false,
            },
            participants: [],
            reactions: [],
            screenPreset: deps.prefs().screenPreset ?? 'motion',
            notWatching: [],
            audioBlocked: false,
            turnAvailable: false,
            uploadKbps: 0,
        };
    }
    // ---- Store para React --------------------------------------------------------
    subscribe = (l) => {
        this.listeners.add(l);
        return () => this.listeners.delete(l);
    };
    getSnapshot = () => this.snapshot;
    patch(p) {
        this.snapshot = { ...this.snapshot, ...p };
        this.listeners.forEach((l) => l());
    }
    patchLocal(p) {
        this.patch({ local: { ...this.snapshot.local, ...p } });
    }
    // ---- Entrar / sair --------------------------------------------------------------
    async join(channelId, userLimit) {
        this.userLimit = userLimit;
        this.patch({ status: 'joining', channelId, error: null });
        const outputId = this.deps.prefs().outputDeviceId;
        if (outputId)
            void this.audio.setSink(outputId);
        // 1) Microfone (sem ele, entra só para ouvir).
        await this.acquireMic();
        if (this.disposed)
            return;
        // 2) Servidores ICE e transporte.
        const ice = await getIceServers();
        if (this.disposed)
            return;
        this.patch({ turnAvailable: hasTurn(ice) });
        const meta = this.buildMeta();
        const initialEncodings = this.planEncodings();
        this.signaling = new SignalingChannel(channelId, meta, {
            onPeers: (peers) => this.onPeers(peers),
            onSignal: (env) => this.transport?.handleSignal(env),
            onMeta: (meta) => this.onRemoteMeta(meta),
            onReaction: (ev) => this.showReaction(ev.from, ev.emoji),
            onWatch: (ev) => {
                if (ev.to !== this.sessionId)
                    return;
                this.transport?.setPeerWatching(ev.from, ev.watching);
                this.rebalance();
            },
            onStatus: (s) => this.onSignalingStatus(s),
        });
        this.transport = new MeshTransport(this.sessionId, this.localStreams, ice, (env) => this.signaling?.sendSignal(env), {
            onRemoteTrack: (peerId, slot, track, stream) => this.onRemoteTrack(peerId, slot, track, stream),
            onPeerState: (peerId, state) => this.onPeerState(peerId, state),
            onStats: (peerId, stats) => this.onStats(peerId, stats),
        }, initialEncodings);
        this.rememberEncodings(initialEncodings);
        if (this.micTrack)
            await this.transport.setTrack('mic', this.micTrack);
        try {
            await this.signaling.join();
        }
        catch (e) {
            this.fail(e instanceof Error ? e.message : 'Não foi possível entrar na sala.');
            return;
        }
        if (this.disposed)
            return;
        // Limite de pessoas (verificação no cliente, ver docs/WEBRTC.md).
        const count = this.signaling.peers().length;
        if (count > this.userLimit) {
            this.fail(`A sala está cheia (limite de ${this.userLimit} pessoas).`);
            return;
        }
        this.patch({ status: 'connected' });
        this.publishVoiceState();
    }
    leave() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.signaling?.leave();
        this.transport?.close();
        this.micTrack?.stop();
        this.cameraTrack?.stop();
        this.screenTracks?.video.stop();
        this.screenTracks?.audio?.stop();
        this.audio.dispose();
        this.speaking.dispose();
        this.deps.onVoiceState(null);
        this.patch({ status: 'idle', participants: [], channelId: null });
    }
    fail(message) {
        this.leave();
        this.patch({ status: 'error', error: message });
    }
    // ---- Microfone ---------------------------------------------------------------
    async acquireMic() {
        try {
            const track = await getMicTrack(this.deps.prefs());
            this.setMicTrack(track);
            this.patchLocal({ micAvailable: true, micError: null });
        }
        catch (e) {
            this.patchLocal({ micAvailable: false, micError: mediaErrorMessage(e, 'microfone'), muted: true });
        }
    }
    setMicTrack(track) {
        const old = this.micTrack;
        this.micTrack = track;
        track.enabled = !this.snapshot.local.muted && !this.snapshot.local.deafened;
        track.onended = () => {
            if (this.micTrack === track)
                this.patchLocal({ micAvailable: false, micError: 'O microfone foi desconectado.' });
        };
        for (const t of this.localStreams.mic.getTracks())
            this.localStreams.mic.removeTrack(t);
        this.localStreams.mic.addTrack(track);
        this.speaking.watch('local', new MediaStream([track]), (s) => this.patchLocal({ speaking: s }));
        if (old && old !== track)
            old.stop();
    }
    async toggleMute() {
        const local = this.snapshot.local;
        if (!local.micAvailable) {
            // Tenta de novo (ex.: o usuário liberou a permissão).
            await this.acquireMic();
            if (this.micTrack && this.transport)
                await this.transport.setTrack('mic', this.micTrack);
            if (!this.snapshot.local.micAvailable)
                return;
            this.patchLocal({ muted: false });
        }
        else {
            this.patchLocal({ muted: !local.muted });
        }
        if (this.micTrack)
            this.micTrack.enabled = !this.snapshot.local.muted && !this.snapshot.local.deafened;
        this.publishVoiceState();
    }
    toggleDeafen() {
        const deafened = !this.snapshot.local.deafened;
        this.patchLocal({ deafened });
        this.audio.setDeafened(deafened);
        if (this.micTrack)
            this.micTrack.enabled = !this.snapshot.local.muted && !deafened;
        this.publishVoiceState();
    }
    async changeInputDevice(prefs = this.deps.prefs()) {
        if (this.snapshot.status === 'idle')
            return;
        try {
            const track = await getMicTrack(prefs);
            this.setMicTrack(track);
            await this.transport?.setTrack('mic', track);
            this.patchLocal({ micAvailable: true, micError: null });
        }
        catch (e) {
            throw new Error(mediaErrorMessage(e, 'microfone'), { cause: e });
        }
    }
    async changeOutputDevice(deviceId) {
        await this.audio.setSink(deviceId ?? '');
    }
    resumeAudio() {
        this.audio.resume();
    }
    setUserVolume(userId, volume, kind = 'voice') {
        for (const p of this.peers.values()) {
            if (p.userId !== userId)
                continue;
            this.audio.setVolume(`${p.sessionId}:${kind === 'voice' ? 'mic' : 'screenAudio'}`, volume);
        }
    }
    // ---- Câmera -------------------------------------------------------------------
    async toggleCamera() {
        if (this.cameraTrack) {
            const t = this.cameraTrack;
            this.cameraTrack = null;
            await this.transport?.setTrack('camera', null);
            t.stop();
            this.patchLocal({ camera: null });
            this.publishVoiceState();
            return;
        }
        const track = await getCameraTrack(this.deps.prefs().cameraDeviceId).catch((e) => {
            throw new Error(mediaErrorMessage(e, 'câmera'), { cause: e });
        });
        if (this.disposed) {
            track.stop();
            return;
        }
        this.cameraTrack = track;
        track.onended = () => {
            if (this.cameraTrack === track)
                void this.toggleCamera();
        };
        for (const t of this.localStreams.camera.getTracks())
            this.localStreams.camera.removeTrack(t);
        this.localStreams.camera.addTrack(track);
        await this.transport?.setTrack('camera', track);
        this.patchLocal({ camera: new MediaStream([track]) });
        this.publishVoiceState();
    }
    // ---- Compartilhamento de tela ----------------------------------------------------
    async startScreen(withAudio) {
        if (this.screenTracks)
            return;
        const preset = SCREEN_PRESETS[this.snapshot.screenPreset];
        let cap;
        try {
            cap = await captureScreen(preset, withAudio);
        }
        catch (e) {
            throw new Error(mediaErrorMessage(e, 'tela'), { cause: e });
        }
        if (this.disposed) {
            cap.stream.getTracks().forEach((t) => t.stop());
            return;
        }
        this.screenTracks = { video: cap.video, audio: cap.audio };
        // Botão "Parar de compartilhar" do próprio navegador.
        cap.video.onended = () => void this.stopScreen();
        for (const t of this.localStreams.screen.getTracks())
            this.localStreams.screen.removeTrack(t);
        for (const t of this.localStreams.screenAudio.getTracks())
            this.localStreams.screenAudio.removeTrack(t);
        this.localStreams.screen.addTrack(cap.video);
        if (cap.audio)
            this.localStreams.screenAudio.addTrack(cap.audio);
        this.rebalance();
        await this.transport?.setTrack('screen', cap.video);
        await this.transport?.setTrack('screenAudio', cap.audio);
        this.patchLocal({ screen: new MediaStream([cap.video]), screenLabel: surfaceLabel(cap.surface), screenHasAudio: Boolean(cap.audio) });
        this.publishVoiceState();
    }
    async stopScreen() {
        const s = this.screenTracks;
        if (!s)
            return;
        this.screenTracks = null;
        await this.transport?.setTrack('screen', null);
        await this.transport?.setTrack('screenAudio', null);
        s.video.onended = null;
        s.video.stop();
        s.audio?.stop();
        this.patchLocal({ screen: null, screenLabel: null, screenHasAudio: false });
        this.rebalance();
        this.publishVoiceState();
    }
    async setScreenPreset(id) {
        const preset = SCREEN_PRESETS[id];
        this.patch({ screenPreset: id });
        this.rebalance();
        if (this.screenTracks)
            await applyPresetToTrack(this.screenTracks.video, preset);
    }
    /** Espectador escolhe não receber a tela de alguém (economiza banda dos dois lados). */
    setWatching(sharerSessionId, watching) {
        const set = new Set(this.snapshot.notWatching);
        if (watching)
            set.delete(sharerSessionId);
        else
            set.add(sharerSessionId);
        this.patch({ notWatching: [...set] });
        this.signaling?.sendWatch({ from: this.sessionId, to: sharerSessionId, watching });
    }
    // ---- Reações ------------------------------------------------------------------------
    react(emoji) {
        const now = Date.now();
        if (now - this.lastReactionAt < 400)
            return;
        this.lastReactionAt = now;
        this.signaling?.sendReaction({ from: this.sessionId, emoji });
        this.showReaction(this.sessionId, emoji);
    }
    showReaction(sessionId, emoji) {
        if (!REACTIONS.includes(emoji))
            return;
        const r = { id: reactionSeq++, sessionId, emoji };
        this.patch({ reactions: [...this.snapshot.reactions, r].slice(-20) });
        window.setTimeout(() => this.patch({ reactions: this.snapshot.reactions.filter((x) => x.id !== r.id) }), 2700);
    }
    // ---- Eventos remotos -------------------------------------------------------------------
    /** Estado novo vindo por broadcast (mais rápido que a presença, que tem freio). */
    onRemoteMeta(meta) {
        const p = this.peers.get(meta.sessionId);
        if (!p || (meta.rev ?? 0) < (p.meta.rev ?? 0))
            return;
        if (!p.meta.screen && meta.screen && this.snapshot.notWatching.includes(meta.sessionId)) {
            this.patch({ notWatching: this.snapshot.notWatching.filter((id) => id !== meta.sessionId) });
        }
        p.meta = meta;
        this.bindStreams(meta.sessionId);
        this.emitParticipants();
    }
    onPeers(metas) {
        const others = metas.filter((m) => m.sessionId !== this.sessionId);
        const seen = new Set();
        for (const incoming of others) {
            seen.add(incoming.sessionId);
            const prev = this.peers.get(incoming.sessionId);
            // Presença atrasada não desfaz um estado mais novo recebido por broadcast.
            const meta = prev && (prev.meta.rev ?? 0) > (incoming.rev ?? 0) ? prev.meta : incoming;
            // Nova transmissão de tela: volta a assistir por padrão.
            if (prev && !prev.meta.screen && meta.screen && this.snapshot.notWatching.includes(meta.sessionId)) {
                this.patch({ notWatching: this.snapshot.notWatching.filter((id) => id !== meta.sessionId) });
            }
            this.peers.set(meta.sessionId, {
                sessionId: meta.sessionId,
                userId: meta.userId,
                meta,
                // A oferta do outro lado pode ter chegado (e conectado) antes da presença.
                link: this.transport?.linkState(meta.sessionId) ?? prev?.link ?? 'connecting',
                speaking: prev?.speaking ?? false,
                stats: prev?.stats ?? null,
                mic: null,
                camera: null,
                screen: null,
            });
            this.bindStreams(meta.sessionId);
        }
        for (const id of [...this.peers.keys()]) {
            // Sumiu da presença mas a mídia segue ativa: mantém (o transporte decide quando encerrar).
            if (!seen.has(id) && this.peers.get(id)?.link !== 'connected')
                this.removePeer(id);
        }
        this.transport?.syncPeers(metas);
        this.emitParticipants();
    }
    onRemoteTrack(peerId, slot, track, stream) {
        const map = this.remoteStreams.get(peerId) ?? {};
        map[slot] = stream;
        this.remoteStreams.set(peerId, map);
        track.addEventListener('unmute', () => this.emitParticipants());
        track.addEventListener('mute', () => this.emitParticipants());
        this.bindStreams(peerId);
        this.emitParticipants();
    }
    /** Associa streams recebidos aos slots anunciados na presença do participante. */
    bindStreams(peerId) {
        const p = this.peers.get(peerId);
        const map = this.remoteStreams.get(peerId);
        if (!p || !map)
            return;
        const vol = this.deps.prefs().userVolumes ?? {};
        for (const slot of SLOTS) {
            const stream = map[slot] ?? null;
            if (slot === 'mic') {
                p.mic = stream;
                if (stream && this.watchedMic.get(peerId) !== stream) {
                    this.watchedMic.set(peerId, stream);
                    this.audio.attach(`${peerId}:mic`, stream, vol[p.userId] ?? 1);
                    this.speaking.watch(peerId, stream, (s) => {
                        const cur = this.peers.get(peerId);
                        if (cur) {
                            cur.speaking = s;
                            this.emitParticipants();
                        }
                    });
                }
            }
            else if (slot === 'screenAudio') {
                if (stream && p.meta.screenAudio)
                    this.audio.attach(`${peerId}:screenAudio`, stream, vol[`${p.userId}:stream`] ?? 1);
                else
                    this.audio.detach(`${peerId}:screenAudio`);
            }
            else if (slot === 'camera') {
                p.camera = p.meta.camera ? stream : null;
            }
            else {
                p.screen = p.meta.screen ? stream : null;
            }
        }
    }
    removePeer(id) {
        this.peers.delete(id);
        this.remoteStreams.delete(id);
        this.watchedMic.delete(id);
        this.audio.detach(`${id}:mic`);
        this.audio.detach(`${id}:screenAudio`);
        this.speaking.unwatch(id);
    }
    onPeerState(peerId, state) {
        this.rebalance();
        const p = this.peers.get(peerId);
        if (!p)
            return;
        if (state === 'closed') {
            this.removePeer(peerId);
            this.emitParticipants();
            return;
        }
        p.link = state;
        this.emitParticipants();
    }
    onStats(peerId, stats) {
        const p = this.peers.get(peerId);
        if (!p)
            return;
        p.stats = stats;
        let up = 0;
        for (const x of this.peers.values())
            up += x.stats?.outKbps ?? 0;
        this.patch({ uploadKbps: up });
        this.emitParticipants();
    }
    // ---- Orçamento de envio (ver webrtc/budget.js) -------------------------------------
    planEncodings() {
        return planEncodings({
            peers: this.transport?.peerCount() ?? 0,
            screenViewers: this.transport?.screenViewers() ?? 0,
            sharingScreen: Boolean(this.screenTracks),
            screenPreset: SCREEN_PRESETS[this.snapshot.screenPreset] ?? SCREEN_PRESETS.motion,
        });
    }
    /** Recalcula bitrate/fps/resolução quando a sala muda; só reaplica o que mudou. */
    rebalance() {
        if (!this.transport || this.disposed)
            return;
        const plan = this.planEncodings();
        for (const slot of SLOTS) {
            const key = JSON.stringify(plan[slot]);
            if (this.encodingKeys[slot] === key)
                continue;
            this.encodingKeys[slot] = key;
            this.transport.setEncoding(slot, plan[slot]);
        }
    }
    rememberEncodings(plan) {
        for (const slot of SLOTS)
            this.encodingKeys[slot] = JSON.stringify(plan[slot]);
    }
    onSignalingStatus(s) {
        if (this.disposed || this.snapshot.status === 'joining' || this.snapshot.status === 'error')
            return;
        if (s === 'reconnecting')
            this.patch({ status: 'reconnecting' });
        if (s === 'connected')
            this.patch({ status: 'connected' });
    }
    emitParticipants() {
        this.patch({ participants: [...this.peers.values()].map((p) => ({ ...p })) });
    }
    // ---- Presença --------------------------------------------------------------------------
    buildMeta() {
        const l = this.snapshot.local;
        return {
            sessionId: this.sessionId,
            userId: this.deps.userId,
            muted: l.muted || !l.micAvailable,
            deafened: l.deafened,
            camera: Boolean(l.camera),
            screen: Boolean(l.screen),
            screenAudio: l.screenHasAudio,
            screenLabel: l.screenLabel,
            streams: {
                mic: this.localStreams.mic.id,
                camera: this.localStreams.camera.id,
                screen: this.localStreams.screen.id,
                screenAudio: this.localStreams.screenAudio.id,
            },
            joinedAt: Date.now(),
        };
    }
    publishVoiceState() {
        if (this.disposed || !this.snapshot.channelId)
            return;
        const meta = this.buildMeta();
        const { joinedAt: _j, ...rest } = meta;
        void this.signaling?.updateMeta(rest);
        this.deps.onVoiceState({
            channelId: this.snapshot.channelId,
            muted: meta.muted,
            deafened: meta.deafened,
            screen: meta.screen,
            camera: meta.camera,
        });
    }
}
