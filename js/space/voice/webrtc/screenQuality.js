/**
 * Qualidade da tela por espectador.
 *
 * No mesh cada espectador tem a própria conexão (e o próprio encoder) com quem
 * transmite, então dá para aliviar só quem está sofrendo: o espectador mede o
 * vídeo que recebe (quadros descartados, tempo de decodificação, congelamentos),
 * pede um nível mais leve e quem transmite reduz só aquela conexão.
 * Os outros continuam recebendo a qualidade cheia.
 */

/** Nível 0 = qualidade do preset. Cada nível limita altura, fps e bitrate. */
export const SCREEN_LEVELS = [
  null,
  { height: 720, fps: 20, maxBitrate: 1_500_000 },
  { height: 540, fps: 15, maxBitrate: 900_000 },
  { height: 360, fps: 10, maxBitrate: 500_000 },
];
export const MAX_SCREEN_LEVEL = SCREEN_LEVELS.length - 1;

const MIN_FRAMES = 10; // tela parada manda poucos quadros: sem amostra suficiente, não decide
const DROPPED_RATIO = 0.15;
const DECODE_MS = 35;
const FREEZE_S = 0.6;

/** Encoding da tela para um espectador no nível pedido (nunca acima do orçamento base). */
export function screenLevelEncoding(base, level, sourceHeight) {
  const l = SCREEN_LEVELS[level];
  if (!l) return base;
  const height = sourceHeight || l.height;
  return {
    ...base,
    maxBitrate: Math.min(base.maxBitrate ?? Infinity, l.maxBitrate),
    maxFramerate: Math.min(base.maxFramerate ?? Infinity, l.fps),
    scaleResolutionDownBy: Math.max(base.scaleResolutionDownBy ?? 1, Math.round((height / l.height) * 100) / 100),
  };
}

/**
 * Compara duas leituras acumuladas do inbound-rtp da tela.
 * @returns {{ bad: boolean, reasons: string[], decodeMs: number } | null} null = sem dados para decidir
 */
export function screenHealth(prev, cur) {
  if (!prev || !cur || cur.framesReceived < prev.framesReceived) return null;
  const received = cur.framesReceived - prev.framesReceived;
  if (received < MIN_FRAMES) return null;
  const decoded = cur.framesDecoded - prev.framesDecoded;
  const dropped = Math.max(0, cur.framesDropped - prev.framesDropped);
  const decodeMs = decoded > 0 ? ((cur.totalDecodeTime - prev.totalDecodeTime) * 1000) / decoded : 0;
  const frozen = cur.totalFreezesDuration - prev.totalFreezesDuration;
  const reasons = [];
  if (dropped / received > DROPPED_RATIO) reasons.push('descartando quadros');
  if (decodeMs > DECODE_MS) reasons.push('decodificação lenta');
  if (frozen > FREEZE_S) reasons.push('congelando');
  return { bad: reasons.length > 0, reasons, decodeMs: Math.round(decodeMs) };
}

/**
 * Decide o nível a partir das amostras (uma a cada 2 s).
 * Desce rápido (2 amostras ruins seguidas) e sobe devagar (30 s bons). Se piorar
 * logo depois de subir (menos de 1 min), a espera para a próxima subida dobra,
 * para não ficar oscilando.
 */
export class ScreenQualityController {
  level = 0;
  badStreak = 0;
  goodStreak = 0;
  hold = 0;
  upAfter = 15;
  sinceUp = Infinity;

  /** @returns {number|null} novo nível, ou null se não mudou */
  sample(health) {
    if (!health) return null;
    this.sinceUp++;
    // Depois de uma troca, espera o encoder se ajustar antes de julgar de novo.
    if (this.hold > 0) { this.hold--; return null; }
    if (health.bad) {
      this.goodStreak = 0;
      if (++this.badStreak >= 2 && this.level < MAX_SCREEN_LEVEL) {
        this.level++;
        this.badStreak = 0;
        this.hold = 2;
        if (this.sinceUp < 30)
          this.upAfter = Math.min(60, this.upAfter * 2);
        return this.level;
      }
      return null;
    }
    this.badStreak = 0;
    if (this.level > 0 && ++this.goodStreak >= this.upAfter) {
      this.level--;
      this.goodStreak = 0;
      this.hold = 2;
      this.sinceUp = 0;
      return this.level;
    }
    return null;
  }
}
