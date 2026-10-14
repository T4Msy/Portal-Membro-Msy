// Portado de Masayoshi-Plataforma/src/features/chat/mergeMessages.ts (TS -> JS automático). Ver docs/msy-space/README.md
/** Junta listas sem duplicar (por id e por nonce do cliente) e mantém ordem cronológica.
 *  A versão confirmada pelo servidor sempre vence a otimista de mesmo nonce. */
export function mergeMessages(current, incoming) {
    const byId = new Map(current.map((m) => [m.id, m]));
    for (const m of incoming) {
        const sameNonce = [...byId.values()].filter((x) => x.client_nonce === m.client_nonce && x.id !== m.id);
        if (m.status) {
            if (sameNonce.some((x) => !x.status))
                continue; // já confirmada
        }
        else {
            for (const x of sameNonce)
                if (x.status)
                    byId.delete(x.id);
        }
        byId.set(m.id, m);
    }
    return [...byId.values()].sort((a, b) => a.created_at === b.created_at ? a.id.localeCompare(b.id) : a.created_at < b.created_at ? -1 : 1);
}
