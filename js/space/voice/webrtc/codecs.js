/**
 * Prefere H.264 no vídeo (câmera e tela).
 *
 * O padrão do navegador é VP8, codificado e decodificado por software. No mesh
 * quem transmite a tela codifica uma cópia por espectador, e o celular de quem
 * assiste decodifica tudo na CPU: os dois travam. H.264 tem codificação na placa
 * de vídeo do PC e decodificação por hardware em praticamente todo celular.
 * Se algum lado não suportar H.264, a negociação cai sozinha para VP8/VP9.
 * Precisa ser chamado antes de criar a oferta (iniciador) ou a resposta (respondedor):
 * a ordem dos codecs na resposta decide o que os dois lados enviam.
 */
const PREFERRED_PROFILES = ['42e01f', '42001f']; // constrained baseline / baseline: os que o hardware sempre aceita

export function preferHardwareCodecs(transceiver) {
    if (typeof transceiver?.setCodecPreferences !== 'function')
        return;
    try {
        const recv = RTCRtpReceiver.getCapabilities?.('video')?.codecs ?? [];
        const canSend = (RTCRtpSender.getCapabilities?.('video')?.codecs ?? []).some((c) => isH264(c));
        if (!canSend || !recv.some((c) => isH264(c)))
            return;
        transceiver.setCodecPreferences(orderCodecs(recv));
    }
    catch (e) {
        console.warn('[MSY][space] Preferência de codec ignorada:', e);
    }
}

/** H.264 com packetization-mode=1 primeiro (perfis de hardware antes), depois o resto na ordem original. */
export function orderCodecs(codecs) {
    const rank = (c) => {
        if (!isH264(c) || !/packetization-mode=1/.test(c.sdpFmtpLine ?? ''))
            return Infinity;
        const profile = /profile-level-id=([0-9a-f]{6})/i.exec(c.sdpFmtpLine ?? '')?.[1]?.toLowerCase();
        const i = PREFERRED_PROFILES.indexOf(profile);
        return i === -1 ? PREFERRED_PROFILES.length : i;
    };
    return codecs
        .map((c, i) => ({ c, i, r: rank(c) }))
        .sort((a, b) => a.r - b.r || a.i - b.i)
        .map(({ c }) => c);
}

function isH264(c) {
    return c.mimeType?.toLowerCase() === 'video/h264';
}
