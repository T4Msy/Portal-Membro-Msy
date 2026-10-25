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
 * A tela também limita resolução e fps: cada espectador custa uma codificação
 * inteira no PC de quem transmite (e uma decodificação no celular de quem assiste).
 * [até N espectadores, altura máxima, fps máximo]
 */
const SCREEN_TIERS = [
  [1, Infinity, Infinity],
  [3, 1080, 30],
  [6, 720, 20],
  [Infinity, 540, 15],
];

/**
 * @param {{ peers: number, screenViewers: number, sharingScreen: boolean,
 *           screenPreset: { maxBitrate: number, frameRate: number, height?: number },
 *           screenHeight?: number }} input  screenHeight = altura real da captura
 * @returns {Record<'mic'|'camera'|'screen'|'screenAudio', object>} encodings por slot
 */
export function planEncodings({ peers, screenViewers, sharingScreen, screenPreset, screenHeight }) {
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

  const [, maxHeight, maxFps] = SCREEN_TIERS.find(([max]) => viewers <= max);
  const sourceHeight = screenHeight || screenPreset.height || 720;
  const screen = {
    maxBitrate: Math.min(screenPreset.maxBitrate, Math.max(SCREEN_MIN_PER_VIEWER, Math.floor(SCREEN_UPLOAD_BUDGET / viewers))),
    scaleResolutionDownBy: Math.max(1, Math.round((sourceHeight / maxHeight) * 100) / 100),
    maxFramerate: Math.min(screenPreset.frameRate, maxFps),
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
