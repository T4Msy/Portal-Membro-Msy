/**
 * Orçamento de envio por conexão na topologia mesh.
 *
 * No mesh cada participante codifica e envia uma cópia de cada mídia para cada
 * outro participante: o upload (e a CPU) cresce com o tamanho da sala. Sem
 * teto, cada RTCPeerConnection estima a banda sozinha, todas disputam o mesmo
 * link e a voz — que passa pelo mesmo caminho — perde pacotes (chiado, gente
 * que some). Aqui a câmera e a tela dividem um orçamento fixo pelo número de
 * conexões, e o microfone fica sempre com prioridade máxima.
 */

/** Upload total que a tela pode usar, somando todos os espectadores. */
export const SCREEN_UPLOAD_BUDGET = 6_000_000;
const SCREEN_MIN_PER_VIEWER = 400_000;

// [até N conexões, bitrate, reduzir resolução por, fps] — 720p na origem.
const CAMERA_TIERS = [
  [2, 1_200_000, 1, 30],
  [4, 700_000, 1.5, 24],
  [6, 400_000, 2, 20],
  [9, 250_000, 3, 15],
  [Infinity, 150_000, 4, 12],
];

/**
 * @param {{ peers: number, screenViewers: number, sharingScreen: boolean,
 *           screenPreset: { maxBitrate: number, frameRate: number } }} input
 * @returns {Record<'mic'|'camera'|'screen'|'screenAudio', object>} encodings por slot
 */
export function planEncodings({ peers, screenViewers, sharingScreen, screenPreset }) {
  const n = Math.max(1, peers);
  const viewers = Math.max(1, screenViewers);

  const [, camBitrate, camScale, camFps] = CAMERA_TIERS.find(([max]) => n <= max);
  // Transmitindo tela ao mesmo tempo: a câmera cede metade para a tela.
  const camera = {
    maxBitrate: sharingScreen ? Math.round(camBitrate / 2) : camBitrate,
    scaleResolutionDownBy: camScale,
    maxFramerate: sharingScreen ? Math.min(camFps, 15) : camFps,
    priority: 'low',
    networkPriority: 'low',
  };

  const screenFps = viewers >= 9 ? 15 : viewers >= 5 ? 20 : screenPreset.frameRate;
  const screen = {
    maxBitrate: Math.min(screenPreset.maxBitrate, Math.max(SCREEN_MIN_PER_VIEWER, Math.floor(SCREEN_UPLOAD_BUDGET / viewers))),
    scaleResolutionDownBy: 1,
    maxFramerate: Math.min(screenPreset.frameRate, screenFps),
    priority: 'medium',
    networkPriority: 'medium',
  };

  return {
    mic: { maxBitrate: n <= 5 ? 48_000 : 32_000, priority: 'high', networkPriority: 'high' },
    camera,
    screen,
    screenAudio: { maxBitrate: viewers <= 4 ? 128_000 : 64_000, priority: 'medium', networkPriority: 'medium' },
  };
}
