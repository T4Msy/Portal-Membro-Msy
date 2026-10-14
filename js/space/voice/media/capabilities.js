// Portado de Masayoshi-Plataforma/src/features/voice/media/capabilities.ts (TS -> JS automático). Ver docs/msy-space/README.md
let cached = null;
export function getCapabilities() {
    if (cached)
        return cached;
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    const ua = nav?.userAgent ?? '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && (nav?.maxTouchPoints ?? 0) > 1);
    const isMobile = isIOS || /Android|Mobi/i.test(ua);
    const md = nav?.mediaDevices;
    const isChromium = /Chrome|Chromium|Edg\//.test(ua) && !/OPR|SamsungBrowser/.test(ua);
    cached = {
        microphone: Boolean(md?.getUserMedia),
        camera: Boolean(md?.getUserMedia),
        screenShare: Boolean(md && 'getDisplayMedia' in md) && !isMobile,
        outputSelection: typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype,
        isMobile,
        isIOS,
        screenAudioLikely: isChromium && !isMobile,
        secureContext: typeof window !== 'undefined' ? window.isSecureContext : false,
    };
    return cached;
}
export function screenShareUnsupportedReason() {
    const c = getCapabilities();
    if (!c.secureContext)
        return 'O compartilhamento de tela exige conexão segura (HTTPS).';
    if (c.isMobile)
        return c.isIOS
            ? 'O iPhone não permite transmitir a tela pelo navegador (e o app para iPhone exige conta paga da Apple). Você pode falar e assistir.'
            : 'O navegador do celular não transmite a tela. Use o app Android da Masayoshi (Configurações → Baixar app Android).';
    if (!c.screenShare)
        return 'Este navegador não suporta compartilhamento de tela. Use Chrome, Edge, Brave ou Firefox no computador.';
    return null;
}
