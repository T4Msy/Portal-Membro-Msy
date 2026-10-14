// Portado de Masayoshi-Plataforma/src/lib/presenceThrottle.ts (TS -> JS automático). Ver docs/msy-space/README.md
/**
 * Freio para `channel.track()` do Supabase Realtime.
 *
 * O Realtime aceita no máximo 5 atualizações de presença por cliente a cada 30 s
 * (`ClientPresenceRateLimitReached`). Acima disso, o servidor FECHA o canal daquele
 * cliente — foi o que tirou uma participante da sala num teste real (celular, que
 * reconecta e alterna estado com frequência).
 *
 * Regras: envia no máximo 1 vez a cada `minMs`, sempre o estado mais recente
 * (coalescendo rajadas), e não reenvia um estado idêntico ao último enviado —
 * exceto com `force` (após reconectar, o servidor perdeu a presença).
 */
export class PresenceThrottle {
    minMs;
    send;
    lastAt = 0;
    lastSent = null;
    pending = null;
    timer = null;
    constructor(minMs, send) {
        this.minMs = minMs;
        this.send = send;
    }
    push(value, force = false) {
        const key = JSON.stringify(value);
        if (!force && this.pending === null && key === this.lastSent)
            return;
        if (force)
            this.lastSent = null;
        this.pending = value;
        if (this.timer !== null)
            return;
        const wait = Math.max(0, this.lastAt + this.minMs - Date.now());
        this.timer = setTimeout(() => this.flush(), wait);
    }
    cancel() {
        if (this.timer !== null)
            clearTimeout(this.timer);
        this.timer = null;
        this.pending = null;
    }
    flush() {
        this.timer = null;
        const value = this.pending;
        if (value === null)
            return;
        this.pending = null;
        const key = JSON.stringify(value);
        if (key === this.lastSent)
            return;
        this.lastAt = Date.now();
        this.lastSent = key;
        void this.send(value).catch(() => {
            // falhou: permite reenviar o mesmo estado depois
            this.lastSent = null;
        });
    }
}
