// Portado de Masayoshi-Plataforma/src/features/voice/webrtc/sdp.ts (TS -> JS automático). Ver docs/msy-space/README.md
/**
 * Habilita Opus estéreo com bitrate maior. Aplicado na descrição REMOTA antes
 * de setRemoteDescription: assim o nosso encoder entende que o outro lado
 * aceita estéreo (útil para áudio de filme/jogo na transmissão de tela).
 * O microfone continua limitado por maxBitrate no sender.
 * Também liga DTX (não envia pacotes no silêncio — com muita gente quase todos
 * estão calados) e FEC (recupera pacote perdido em vez de chiar).
 * Os parâmetros valem para todas as m-lines: com BUNDLE, o mesmo payload type
 * com parâmetros diferentes é recusado pelo Chrome ("codec collision").
 */
export function enableOpusStereo(sdp) {
    const match = /a=rtpmap:(\d+) opus\/48000\/2/i.exec(sdp);
    if (!match)
        return sdp;
    const pt = match[1];
    const fmtpRe = new RegExp(`a=fmtp:${pt} ([^\\r\\n]*)`, 'g');
    return sdp.replace(fmtpRe, (_line, params) => {
        const parts = params
            .split(';')
            .map((p) => p.trim())
            .filter((p) => p && !/^(stereo|sprop-stereo|maxaveragebitrate|usedtx|useinbandfec)=/.test(p));
        parts.push('stereo=1', 'sprop-stereo=1', 'maxaveragebitrate=128000', 'useinbandfec=1', 'usedtx=1');
        return `a=fmtp:${pt} ${parts.join(';')}`;
    });
}
