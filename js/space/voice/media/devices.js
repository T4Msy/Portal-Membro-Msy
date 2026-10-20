// Portado de Masayoshi-Plataforma/src/features/voice/media/devices.ts (TS -> JS automático). Ver docs/msy-space/README.md
export async function listDevices() {
    if (!navigator.mediaDevices?.enumerateDevices)
        return { inputs: [], outputs: [], cameras: [] };
    const all = await navigator.mediaDevices.enumerateDevices();
    return {
        inputs: all.filter((d) => d.kind === 'audioinput'),
        outputs: all.filter((d) => d.kind === 'audiooutput'),
        cameras: all.filter((d) => d.kind === 'videoinput'),
    };
}
export function micConstraints(prefs) {
    return {
        deviceId: prefs.inputDeviceId ? { ideal: prefs.inputDeviceId } : undefined,
        echoCancellation: prefs.echoCancellation ?? true,
        noiseSuppression: prefs.noiseSuppression ?? true,
        autoGainControl: prefs.autoGainControl ?? true,
        channelCount: 1,
    };
}
export async function getMicTrack(prefs) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: micConstraints(prefs), video: false });
    const track = stream.getAudioTracks()[0];
    if (!track)
        throw new DOMException('Nenhum microfone', 'NotFoundError');
    return track;
}
export async function getCameraTrack(deviceId) {
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
            deviceId: deviceId ? { ideal: deviceId } : undefined,
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 30 },
        },
    });
    const track = stream.getVideoTracks()[0];
    if (!track)
        throw new DOMException('Nenhuma câmera', 'NotFoundError');
    return track;
}
/** Mensagem clara para cada falha de captura do navegador. */
export function mediaErrorMessage(err, device) {
    const name = err instanceof DOMException || err instanceof Error ? err.name : '';
    switch (name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
            return device === 'tela'
                ? 'Compartilhamento cancelado ou bloqueado pelo navegador/sistema.'
                : `Permissão de ${device} negada. Libere o acesso no ícone de cadeado da barra de endereço e tente de novo.`;
        case 'NotFoundError':
        case 'DevicesNotFoundError':
            return `Nenhum(a) ${device} encontrado(a) neste dispositivo.`;
        case 'NotReadableError':
        case 'TrackStartError':
            return `O(a) ${device} está em uso por outro aplicativo ou não pôde ser iniciado(a).`;
        case 'OverconstrainedError':
            return `O(a) ${device} selecionado(a) não está mais disponível. Escolha outro nas configurações.`;
        case 'SecurityError':
            return 'O navegador bloqueou o acesso por segurança (é necessário HTTPS).';
        case 'AbortError':
            return `A captura de ${device} foi interrompida.`;
        default:
            return `Não foi possível acessar o(a) ${device}.`;
    }
}
