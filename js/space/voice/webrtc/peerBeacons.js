// Portado de Masayoshi-Plataforma/src/features/voice/webrtc/peerBeacons.ts (TS -> JS automático). Ver docs/msy-space/README.md
/**
 * Participantes anunciados por broadcast ("beacon"), usado quando a Presença do
 * Supabase está fora do ar (incidente real: o servidor dava timeout no `track`
 * e derrubava o canal da pessoa, que nunca aparecia na sala).
 *
 * Cada anúncio vale por `ttlMs`; quem para de anunciar some sozinho.
 */
export class PeerBeacons {
    ttlMs;
    entries = new Map();
    constructor(ttlMs) {
        this.ttlMs = ttlMs;
    }
    /** Guarda o anúncio. Retorna true se mudou algo visível (participante novo ou estado novo). */
    put(meta, now = Date.now()) {
        const prev = this.entries.get(meta.sessionId);
        this.entries.set(meta.sessionId, { meta, at: now });
        return !prev || (meta.rev ?? 0) !== (prev.meta.rev ?? 0) || JSON.stringify(prev.meta) !== JSON.stringify(meta);
    }
    remove(sessionId) {
        return this.entries.delete(sessionId);
    }
    /** Remove anúncios vencidos. Retorna true se alguém saiu. */
    prune(now = Date.now()) {
        let changed = false;
        for (const [id, e] of this.entries) {
            if (now - e.at > this.ttlMs) {
                this.entries.delete(id);
                changed = true;
            }
        }
        return changed;
    }
    clear() {
        this.entries.clear();
    }
    /** Junta a presença com os anúncios (o estado com `rev` maior vence) e ordena por entrada. */
    merge(presence, now = Date.now()) {
        const out = new Map();
        for (const m of presence)
            out.set(m.sessionId, m);
        for (const { meta, at } of this.entries.values()) {
            if (now - at > this.ttlMs)
                continue;
            const p = out.get(meta.sessionId);
            if (!p || (meta.rev ?? 0) >= (p.rev ?? 0))
                out.set(meta.sessionId, meta);
        }
        return [...out.values()].sort((a, b) => a.joinedAt - b.joinedAt);
    }
}
