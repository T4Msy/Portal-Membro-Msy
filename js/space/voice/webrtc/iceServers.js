// Portado de Masayoshi-Plataforma/src/features/voice/webrtc/iceServers.ts (TS -> JS automático). Ver docs/msy-space/README.md
import { supabase } from '../../lib/supabase.js';
/** STUN públicos: ajudam a descobrir o IP público, mas NÃO garantem conexão
 *  (NAT simétrico / CGNAT / firewall corporativo precisam de TURN). */
const STUN = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
let cache = null;
/**
 * Tenta obter credenciais TURN temporárias da Edge Function 'turn-credentials'
 * (que guarda o segredo no servidor). Se não estiver configurada, usa só STUN.
 */
export async function getIceServers() {
    if (cache && cache.expiresAt > Date.now())
        return cache.servers;
    try {
        const { data, error } = await supabase.functions.invoke('turn-credentials', { method: 'POST' });
        if (!error && data?.iceServers?.length) {
            const servers = [...STUN, ...data.iceServers];
            cache = { servers, expiresAt: Date.now() + Math.max(60, (data.ttl ?? 3600) - 300) * 1000 };
            return servers;
        }
    }
    catch {
        // Sem TURN configurado: segue apenas com STUN.
    }
    cache = { servers: STUN, expiresAt: Date.now() + 30 * 1000 };
    return STUN;
}
export function hasTurn(servers) {
    return servers.some((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]).some((u) => u.startsWith('turn')));
}
