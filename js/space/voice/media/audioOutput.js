// Portado de Masayoshi-Plataforma/src/features/voice/media/audioOutput.ts (TS -> JS automático). Ver docs/msy-space/README.md
/** Volume máximo aceito (300%). */
export const MAX_VOLUME = 3;
export class AudioOutput {
    onBlockedChange;
    entries = new Map();
    deafened = false;
    sinkId;
    ctx = null;
    blocked = false;
    constructor(onBlockedChange) {
        this.onBlockedChange = onBlockedChange;
    }
    attach(key, stream, volume) {
        const existing = this.entries.get(key);
        if (existing && existing.stream === stream) {
            this.setVolume(key, volume);
            return;
        }
        this.detach(key);
        const el = new Audio();
        el.autoplay = true;
        el.srcObject = stream;
        if (this.sinkId && typeof el.setSinkId === 'function')
            void el.setSinkId(this.sinkId).catch(() => undefined);
        const entry = { el, stream, volume: clamp(volume), boost: null };
        this.entries.set(key, entry);
        this.apply(entry);
        this.play(el);
    }
    detach(key) {
        const e = this.entries.get(key);
        if (!e)
            return;
        this.dropBoost(e);
        e.el.pause();
        e.el.srcObject = null;
        this.entries.delete(key);
    }
    setVolume(key, volume) {
        const e = this.entries.get(key);
        if (!e)
            return;
        e.volume = clamp(volume);
        this.apply(e);
    }
    setDeafened(deafened) {
        this.deafened = deafened;
        for (const e of this.entries.values())
            this.apply(e);
    }
    async setSink(deviceId) {
        this.sinkId = deviceId;
        const jobs = [...this.entries.values()].map((e) => {
            const el = e.el;
            return typeof el.setSinkId === 'function' && deviceId !== undefined ? el.setSinkId(deviceId).catch(() => undefined) : Promise.resolve();
        });
        if (this.ctx && typeof this.ctx.setSinkId === 'function' && deviceId !== undefined) {
            jobs.push(this.ctx.setSinkId(deviceId).catch(() => undefined));
        }
        await Promise.all(jobs);
    }
    /** Chamado a partir de um clique do usuário quando o navegador bloqueou o autoplay. */
    resume() {
        for (const e of this.entries.values())
            this.play(e.el);
        void this.ctx?.resume().catch(() => undefined);
    }
    dispose() {
        for (const key of [...this.entries.keys()])
            this.detach(key);
        void this.ctx?.close().catch(() => undefined);
        this.ctx = null;
    }
    apply(e) {
        if (e.volume > 1) {
            if (!e.boost) {
                const ctx = this.context();
                if (!ctx) {
                    // sem Web Audio: fica no máximo do <audio>
                    e.el.volume = 1;
                    e.el.muted = this.deafened;
                    return;
                }
                const src = ctx.createMediaStreamSource(e.stream);
                const gain = ctx.createGain();
                src.connect(gain).connect(ctx.destination);
                e.boost = { src, gain };
            }
            e.boost.gain.gain.value = this.deafened ? 0 : e.volume;
            e.el.volume = 1;
            e.el.muted = true;
        }
        else {
            this.dropBoost(e);
            e.el.volume = e.volume;
            e.el.muted = this.deafened;
        }
    }
    dropBoost(e) {
        if (!e.boost)
            return;
        e.boost.src.disconnect();
        e.boost.gain.disconnect();
        e.boost = null;
    }
    context() {
        if (this.ctx) {
            void this.ctx.resume().catch(() => undefined);
            return this.ctx;
        }
        if (typeof AudioContext === 'undefined')
            return null;
        const ctx = new AudioContext();
        if (this.sinkId && typeof ctx.setSinkId === 'function')
            void ctx.setSinkId(this.sinkId).catch(() => undefined);
        void ctx.resume().catch(() => undefined);
        this.ctx = ctx;
        return ctx;
    }
    play(el) {
        el.play().then(() => {
            if (this.blocked) {
                this.blocked = false;
                this.onBlockedChange(false);
            }
        }, (err) => {
            if (err instanceof DOMException && err.name === 'NotAllowedError' && !this.blocked) {
                this.blocked = true;
                this.onBlockedChange(true);
            }
        });
    }
}
function clamp(v) {
    return Math.min(MAX_VOLUME, Math.max(0, v));
}
