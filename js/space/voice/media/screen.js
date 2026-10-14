// Portado de Masayoshi-Plataforma/src/features/voice/media/screen.ts (TS -> JS automático). Ver docs/msy-space/README.md
export const SCREEN_PRESETS = {
    detail: {
        id: 'detail',
        label: 'Texto e reunião',
        description: 'Prioriza nitidez (até 1080p, 15 fps). Ideal para documentos e código.',
        width: 1920,
        height: 1080,
        frameRate: 15,
        maxBitrate: 1_500_000,
        contentHint: 'detail',
        degradation: 'maintain-resolution',
    },
    motion: {
        id: 'motion',
        label: 'Jogos e filmes',
        description: 'Prioriza fluidez (720p, 30 fps). Bom equilíbrio para muitos espectadores.',
        width: 1280,
        height: 720,
        frameRate: 30,
        maxBitrate: 2_500_000,
        contentHint: 'motion',
        degradation: 'maintain-framerate',
    },
    high: {
        id: 'high',
        label: 'Alta qualidade (experimental)',
        description: 'Tenta 1080p a até 60 fps. Depende do processador, da placa de vídeo e do upload; não é garantido.',
        width: 1920,
        height: 1080,
        frameRate: 60,
        maxBitrate: 4_500_000,
        contentHint: 'motion',
        degradation: 'balanced',
    },
};
/** Abre o seletor do navegador (tela inteira, janela ou aba). */
export async function captureScreen(preset, withAudio) {
    // Opções extras (systemAudio, surfaceSwitching…) são dicas do Chromium; outros navegadores ignoram.
    const options = {
        video: {
            width: { ideal: preset.width, max: preset.width },
            height: { ideal: preset.height, max: preset.height },
            frameRate: { ideal: preset.frameRate, max: preset.frameRate },
        },
        audio: withAudio
            ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false, suppressLocalAudioPlayback: false }
            : false,
        systemAudio: withAudio ? 'include' : 'exclude',
        surfaceSwitching: 'include',
        selfBrowserSurface: 'exclude',
        monitorTypeSurfaces: 'include',
    };
    const stream = await navigator.mediaDevices.getDisplayMedia(options);
    const video = stream.getVideoTracks()[0];
    if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        throw new DOMException('Sem vídeo', 'NotFoundError');
    }
    video.contentHint = preset.contentHint;
    const audio = stream.getAudioTracks()[0] ?? null;
    if (audio)
        audio.contentHint = 'music';
    const surface = video.getSettings().displaySurface;
    return { stream, video, audio, surface };
}
export async function applyPresetToTrack(track, preset) {
    track.contentHint = preset.contentHint;
    try {
        await track.applyConstraints({
            width: { ideal: preset.width, max: preset.width },
            height: { ideal: preset.height, max: preset.height },
            frameRate: { ideal: preset.frameRate, max: preset.frameRate },
        });
    }
    catch {
        // Alguns navegadores não permitem reconfigurar a captura: mantém a atual.
    }
}
export function surfaceLabel(surface) {
    switch (surface) {
        case 'monitor':
            return 'Tela inteira';
        case 'window':
            return 'Janela';
        case 'browser':
            return 'Aba do navegador';
        default:
            return 'Tela';
    }
}
