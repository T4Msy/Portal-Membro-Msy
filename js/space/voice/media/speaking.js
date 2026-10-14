// Portado de Masayoshi-Plataforma/src/features/voice/media/speaking.ts (TS -> JS automático). Ver docs/msy-space/README.md
const THRESHOLD = 0.02; // RMS
const HOLD_MS = 350;
export class SpeakingDetector {
    ctx = null;
    watches = new Map();
    timer = null;
    context() {
        if (!this.ctx)
            this.ctx = new AudioContext();
        if (this.ctx.state === 'suspended')
            void this.ctx.resume();
        return this.ctx;
    }
    watch(id, stream, cb) {
        this.unwatch(id);
        if (stream.getAudioTracks().length === 0)
            return;
        const ctx = this.context();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        this.watches.set(id, { source, analyser, buffer: new Float32Array(analyser.fftSize), cb, speaking: false, lastLoud: 0 });
        this.ensureLoop();
    }
    unwatch(id) {
        const w = this.watches.get(id);
        if (!w)
            return;
        w.source.disconnect();
        this.watches.delete(id);
        if (w.speaking)
            w.cb(false, 0);
    }
    ensureLoop() {
        if (this.timer !== null)
            return;
        this.timer = window.setInterval(() => this.tick(), 100);
    }
    tick() {
        const now = performance.now();
        for (const w of this.watches.values()) {
            w.analyser.getFloatTimeDomainData(w.buffer);
            let sum = 0;
            for (let i = 0; i < w.buffer.length; i++)
                sum += (w.buffer[i] ?? 0) ** 2;
            const rms = Math.sqrt(sum / w.buffer.length);
            if (rms > THRESHOLD)
                w.lastLoud = now;
            const speaking = now - w.lastLoud < HOLD_MS;
            if (speaking !== w.speaking) {
                w.speaking = speaking;
                w.cb(speaking, rms);
            }
        }
    }
    dispose() {
        for (const id of [...this.watches.keys()])
            this.unwatch(id);
        if (this.timer !== null)
            window.clearInterval(this.timer);
        this.timer = null;
        void this.ctx?.close();
        this.ctx = null;
    }
}
