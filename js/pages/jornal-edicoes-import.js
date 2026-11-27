/* ============================================================
   MSY PORTAL — Jornal · Edições: importação automática de PDF
   Lê o PDF no navegador (pdf.js) e devolve a edição já separada em quadros:
     • texto real das páginas → subtítulos e parágrafos
     • fotos soltas da página → imagens do quadro
     • páginas que são só arte (gibi, capas, artes do Canva) → imagem da página inteira
     • quadro detectado pelo cabeçalho ("PLANTÃO MASAYOSHI", "GIBI OFICIAL"…)
   OCR opcional (tesseract.js) para ler o texto de páginas que são só imagem.
   Tudo vira rascunho no editor: a redação revisa antes de salvar.
   ============================================================ */

const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
const PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js';

const ART_WIDTH = 1600;        // página inteira (arte)
const PAGE_WIDTH = 2000;       // modo páginas: cada página do PDF em alta resolução
const PAGE_QUALITY = 0.9;
const PHOTO_MAX = 1400;        // foto recortada da página
const MIN_PHOTO_COVER = 0.025; // menor que isso é ícone/logo
const BACKGROUND_COVER = 0.9;  // maior que isso é fundo da página
const ART_IMAGE_COVER = 0.45;  // imagem grande assim + pouco texto = página de arte

/* Ordem importa: o primeiro que casar no cabeçalho vence. */
const QUADRO_KEYWORDS = [
  ['corvinho-entrevista', ['CORVINHOENTREVISTA']],
  ['plantao', ['PLANTAOMASAYOSHI', 'PLANTAO']],
  ['voce-sabia', ['VOCESABIA']],
  ['conhecendo-membros', ['CONHECENDOOSMEMBROS']],
  ['meme', ['MEMEDOMES']],
  ['noticias', ['NOTICIASQUENINGUEMPEDIU']],
  ['tunel', ['TUNELDOTEMPO']],
  ['corvinho', ['TURMADOCORVINHO', 'GIBIOFICIAL', 'GIBIDAMASAYOSHI']],
  ['especial', ['EDICAOESPECIAL']],
];

let pdfjsPromise = null;

export async function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(PDFJS_URL).then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      return lib;
    }).catch((err) => {
      pdfjsPromise = null;
      throw err;
    });
  }
  return pdfjsPromise;
}

/**
 * @param {File} file PDF
 * @param {{ ocr?: boolean, onProgress?: (text: string, ratio: number) => void }} options
 * @returns {Promise<{ pageCount: number, quadros: Array<{ quadro: string|null, items: Array<object> }> }>}
 *   itens: { type:'heading'|'paragraph', text } | { type:'image', blob, w, h, full, alt }
 */
/* mode 'pages' (padrão): cada página do PDF vira uma imagem em alta resolução, do jeito que foi
   diagramada; o texto da página fica guardado (busca, "texto da página") e serve para achar o quadro.
   mode 'extract': separa texto e fotos de cada página (montagem em texto corrido). */
export async function importEditionPdf(file, { ocr = false, mode = 'pages', onProgress = () => {} } = {}) {
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const total = pdf.numPages;
  let ocrWorker = null;

  try {
    // 1ª passada: texto e posição das imagens de cada página.
    const pages = [];
    for (let n = 1; n <= total; n += 1) {
      onProgress(`Lendo a página ${n} de ${total}...`, (n - 1) / (total * 3));
      const page = await pdf.getPage(n);
      const [x0, y0, x1, y1] = page.view;
      const size = { x0, y0, w: x1 - x0, h: y1 - y0 };
      const text = await page.getTextContent();
      const lines = buildLines(text.items);
      const images = mode === 'pages' ? [] : await findImages(pdfjs, page, size);
      pages.push({ n, page, size, lines, images });
    }

    // O que se repete em várias páginas é cabeçalho/rodapé: sai do texto.
    const repeated = findRepeatedLines(pages);
    const bodySize = medianBodySize(pages);

    // 2ª passada: classifica e monta os itens de cada página.
    const seenImages = new Set();
    const results = [];
    for (const info of pages) {
      onProgress(`${mode === 'pages' ? 'Gerando' : 'Separando o conteúdo d'}a página ${info.n} de ${total}...`, (total + info.n - 1) / (total * 3));
      const header = headerText(info.lines, bodySize);
      const kept = info.lines.filter((line) => !line.spaced && !repeated.has(line.key) && !isNoise(line.text));
      const keptChars = kept.reduce((sum, line) => sum + line.text.length, 0);
      if (mode === 'pages') {
        const canvas = await renderPage(info.page, PAGE_WIDTH);
        let alt = kept.map((line) => line.text).join('\n').trim();
        let quadro = detectQuadro(header) || detectQuadro(collapse(info.lines.map((l) => l.text).join(' ')));
        if (!alt && ocr) {
          onProgress(`Lendo o texto da página ${info.n} (OCR)...`, (total + info.n - 1) / (total * 3));
          ocrWorker = ocrWorker || await createOcrWorker();
          alt = await runOcr(ocrWorker, canvas);
          quadro = quadro || detectQuadro(collapse(alt));
        }
        const blob = await canvasToBlob(canvas, PAGE_QUALITY);
        results.push({ n: info.n, quadro, isArt: true, items: [{ type: 'image', blob, w: canvas.width, h: canvas.height, full: true, alt: alt.slice(0, 4000), page: info.n }] });
        releaseCanvas(canvas);
        info.page.cleanup();
        continue;
      }
      const bigImage = info.images.some((img) => img.cover >= ART_IMAGE_COVER && img.cover < 0.999);
      const isArt = keptChars < 60 || (bigImage && keptChars < 400);

      let quadro = detectQuadro(header) || detectQuadro(collapse(info.lines.map((l) => l.text).join(' ')));
      const items = [];

      if (isArt) {
        const canvas = await renderPage(info.page, ART_WIDTH);
        let alt = kept.map((line) => line.text).join('\n').trim();
        if (!alt && ocr) {
          onProgress(`Lendo o texto da imagem da página ${info.n} (OCR)...`, (total * 2 + info.n - 1) / (total * 3));
          ocrWorker = ocrWorker || await createOcrWorker();
          alt = await runOcr(ocrWorker, canvas);
          quadro = quadro || detectQuadro(collapse(alt));
        }
        items.push({ type: 'image', blob: await canvasToBlob(canvas, 0.86), w: canvas.width, h: canvas.height, full: true, alt: alt.slice(0, 4000), page: info.n });
        releaseCanvas(canvas);
      } else {
        const flow = [];
        buildBlocks(kept, bodySize).forEach((block) => flow.push({ top: block.top, left: block.left, item: block.item }));
        for (const img of info.images) {
          if (img.cover < MIN_PHOTO_COVER || img.cover >= BACKGROUND_COVER) continue;
          const photo = await extractImage(info.page, img, info.size);
          if (!photo) continue;
          if (seenImages.has(photo.hash)) continue; // mesma ilustração repetida: fica só a primeira
          seenImages.add(photo.hash);
          flow.push({ top: img.top, left: img.left, item: { type: 'image', blob: photo.blob, w: photo.w, h: photo.h, full: false, alt: '', page: info.n } });
        }
        flow.sort((a, b) => (a.top - b.top) || (a.left - b.left));
        flow.forEach((entry) => items.push(entry.item));
      }
      info.page.cleanup();
      results.push({ n: info.n, quadro, isArt, items });
    }

    onProgress('Organizando os quadros...', 1);
    return { pageCount: total, quadros: groupIntoQuadros(results) };
  } finally {
    if (ocrWorker) await ocrWorker.terminate().catch(() => null);
    pdf.destroy().catch(() => null);
  }
}

/* ── Texto ───────────────────────────────────────────────── */

function buildLines(items) {
  const lines = [];
  let current = null;
  for (const item of items) {
    const str = item.str || '';
    if (!str.trim()) {
      if (current && item.hasEOL) current.closed = true;
      continue;
    }
    const [a, b, , , x, y] = item.transform;
    const size = Math.hypot(a, b) || item.height || 10;
    const sameLine = current && !current.closed
      && Math.abs(current.y - y) < size * 0.5
      && x >= current.right - size * 1.5
      && Math.abs(current.size - size) < size * 0.25;
    if (sameLine) {
      const gap = x - current.right;
      const needsSpace = gap > size * 0.18 && !current.text.endsWith(' ') && !str.startsWith(' ');
      current.text += (needsSpace ? ' ' : '') + str;
      current.right = x + (item.width || 0);
    } else {
      current = { text: str, x, y, size, right: x + (item.width || 0), closed: false };
      lines.push(current);
    }
    if (item.hasEOL) current.closed = true;
  }
  return lines.map((line) => {
    const text = line.text.replace(/\s+/g, ' ').trim();
    const tokens = text.split(' ');
    const singles = tokens.filter((token) => token.length === 1).length;
    const spaced = tokens.length >= 4 && singles / tokens.length >= 0.7;
    return { text, x: line.x, y: line.y, size: line.size, spaced, key: normalizeKey(text) };
  }).filter((line) => line.text);
}

function normalizeKey(text) {
  return collapse(text).replace(/\d+/g, '#');
}

function collapse(text) {
  return String(text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function isNoise(text) {
  const t = text.trim();
  if (/^\d{1,3}$/.test(t)) return true;
  if (/^(p|pag|pág)\.?\s*\d+(\s*[-–]\s*\d+)?$/i.test(t)) return true;
  if (/^\d{1,3}\s*\/\s*\d{1,3}$/.test(t)) return true;
  return false;
}

function findRepeatedLines(pages) {
  const counts = new Map();
  pages.forEach((info) => {
    new Set(info.lines.map((line) => line.key)).forEach((key) => {
      if (key.length >= 4) counts.set(key, (counts.get(key) || 0) + 1);
    });
  });
  const limit = Math.max(3, Math.ceil(pages.length * 0.2));
  return new Set([...counts].filter(([, count]) => count >= limit).map(([key]) => key));
}

function medianBodySize(pages) {
  const sizes = [];
  pages.forEach((info) => info.lines.forEach((line) => {
    if (line.spaced) return;
    for (let i = 0; i < Math.min(line.text.length, 200); i += 10) sizes.push(line.size);
  }));
  if (!sizes.length) return 12;
  sizes.sort((a, b) => a - b);
  return sizes[Math.floor(sizes.length / 2)];
}

/* Cabeçalho = letras espaçadas (kickers) e textos grandes: é onde o nome do quadro aparece. */
function headerText(lines, bodySize) {
  return collapse(lines.filter((line) => line.spaced || line.size >= bodySize * 1.3).map((line) => line.text).join(' '));
}

function detectQuadro(collapsed) {
  if (!collapsed) return null;
  for (const [quadro, words] of QUADRO_KEYWORDS) {
    if (words.some((word) => collapsed.includes(word))) return quadro;
  }
  return null;
}

/* Junta linhas vizinhas do mesmo tamanho em blocos (parágrafos/subtítulos), na ordem do PDF. */
function buildBlocks(lines, bodySize) {
  const blocks = [];
  let current = null;
  for (const line of lines) {
    const continues = current
      && Math.abs(current.size - line.size) <= current.size * 0.18
      && current.lastY - line.y > -line.size * 0.3
      && current.lastY - line.y < line.size * 1.9
      && Math.abs(current.x - line.x) < line.size * 12;
    if (continues) {
      if (current.lines[current.lines.length - 1] !== line.text) current.lines.push(line.text);
      current.lastY = line.y;
    } else {
      current = { size: line.size, x: line.x, firstY: line.y, lastY: line.y, lines: [line.text] };
      blocks.push(current);
    }
  }
  return blocks.map((block) => {
    const text = block.lines.reduce((acc, part) => {
      if (!acc) return part;
      if (/[A-Za-zÀ-ÿ]-$/.test(acc)) return acc.slice(0, -1) + part;
      return `${acc} ${part}`;
    }, '').replace(/\s+/g, ' ').trim();
    const letters = text.replace(/[^A-Za-zÀ-ÿ]/g, '');
    const upper = letters.replace(/[^A-ZÀ-Þ]/g, '').length;
    const shoutLabel = text.length <= 60 && letters.length >= 4 && upper / letters.length >= 0.8;
    const heading = (block.size >= bodySize * 1.35 && text.length <= 140) || shoutLabel;
    return {
      top: -block.firstY,
      left: block.x,
      item: { type: heading ? 'heading' : 'paragraph', text },
    };
  }).filter((block) => block.item.text.length > 1);
}

/* ── Imagens ─────────────────────────────────────────────── */

/* Percorre a lista de operações da página acompanhando a matriz de transformação,
   para saber onde (e de que tamanho) cada imagem é desenhada. */
async function findImages(pdfjs, page, size) {
  const OPS = pdfjs.OPS;
  const list = await page.getOperatorList();
  const found = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  for (let i = 0; i < list.fnArray.length; i += 1) {
    const fn = list.fnArray[i];
    const args = list.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) ctm = multiply(ctm, args);
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      if (Array.isArray(args?.[0]) && args[0].length === 6) ctm = multiply(ctm, args[0]);
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.paintImageXObject || fn === OPS.paintImageXObjectRepeat) {
      const objId = args?.[0];
      if (typeof objId !== 'string') continue;
      const box = unitBox(ctm, size);
      if (!box) continue;
      found.push({ objId, ...box });
    }
  }
  // A mesma imagem desenhada várias vezes na página (Canva faz isso): fica a maior.
  const byId = new Map();
  found.forEach((img) => {
    const prev = byId.get(img.objId);
    if (!prev || img.cover > prev.cover) byId.set(img.objId, img);
  });
  return [...byId.values()];
}

function multiply(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function unitBox(ctm, size) {
  const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const left = Math.max(size.x0, Math.min(...xs));
  const right = Math.min(size.x0 + size.w, Math.max(...xs));
  const bottom = Math.max(size.y0, Math.min(...ys));
  const topY = Math.min(size.y0 + size.h, Math.max(...ys));
  if (right <= left || topY <= bottom) return null;
  return {
    cover: ((right - left) * (topY - bottom)) / (size.w * size.h),
    top: (size.y0 + size.h - topY) / size.h,
    left: (left - size.x0) / size.w,
    box: { left, right, bottom, top: topY },
  };
}

function getPdfObject(page, objId) {
  const store = objId.startsWith('g_') ? page.commonObjs : page.objs;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 4000);
    try {
      store.get(objId, (data) => { clearTimeout(timer); resolve(data || null); });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/* Tenta a imagem original (com transparência); se não der, recorta da página renderizada. */
async function extractImage(page, img, size) {
  let canvas = null;
  try {
    const data = await getPdfObject(page, img.objId);
    if (data?.bitmap) {
      canvas = drawToCanvas(data.bitmap, data.bitmap.width, data.bitmap.height);
    } else if (data?.data && data.width && data.height && (data.kind === 2 || data.kind === 3)) {
      canvas = rawToCanvas(data);
    }
  } catch (err) {
    console.warn('[MSY][jornal-edicoes] Imagem original indisponível, recortando da página:', err);
  }
  if (!canvas) canvas = await cropFromPage(page, img.box, size);
  if (!canvas || canvas.width < 40 || canvas.height < 40) return null;
  if (canvas.width > PHOTO_MAX || canvas.height > PHOTO_MAX) {
    const ratio = Math.min(PHOTO_MAX / canvas.width, PHOTO_MAX / canvas.height);
    const scaled = scaleCanvas(canvas, Math.round(canvas.width * ratio), true);
    releaseCanvas(canvas);
    canvas = scaled;
  }
  const hash = imageHash(canvas);
  const blob = await canvasToBlob(canvas, 0.86, true);
  const result = { blob, w: canvas.width, h: canvas.height, hash };
  releaseCanvas(canvas);
  return result;
}

function drawToCanvas(source, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(source, 0, 0);
  return canvas;
}

function rawToCanvas({ data, width, height, kind }) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const out = context.createImageData(width, height);
  if (kind === 3) {
    out.data.set(data.subarray ? data.subarray(0, out.data.length) : data);
  } else {
    for (let i = 0, j = 0; i < width * height; i += 1, j += 3) {
      out.data[i * 4] = data[j];
      out.data[i * 4 + 1] = data[j + 1];
      out.data[i * 4 + 2] = data[j + 2];
      out.data[i * 4 + 3] = 255;
    }
  }
  context.putImageData(out, 0, 0);
  return canvas;
}

async function cropFromPage(page, box, size) {
  const scale = 2.5;
  const full = await renderPage(page, Math.round(size.w * scale));
  const k = full.width / size.w;
  const sx = Math.round((box.left - size.x0) * k);
  const sy = Math.round((size.y0 + size.h - box.top) * k);
  const sw = Math.round((box.right - box.left) * k);
  const sh = Math.round((box.top - box.bottom) * k);
  if (sw < 2 || sh < 2) { releaseCanvas(full); return null; }
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  canvas.getContext('2d').drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
  releaseCanvas(full);
  return canvas;
}

function imageHash(canvas) {
  const tiny = document.createElement('canvas');
  tiny.width = 8;
  tiny.height = 8;
  const context = tiny.getContext('2d', { willReadFrequently: true });
  context.drawImage(canvas, 0, 0, 8, 8);
  const px = context.getImageData(0, 0, 8, 8).data;
  let out = `${Math.round((canvas.width / canvas.height) * 20)}:`;
  for (let i = 0; i < px.length; i += 4) out += ((px[i] >> 5) * 64 + (px[i + 1] >> 5) * 8 + (px[i + 2] >> 5)).toString(36);
  return out;
}

/* ── Página inteira e OCR ────────────────────────────────── */

export async function renderPage(page, width) {
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / base.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const context = canvas.getContext('2d', { alpha: false });
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}

async function createOcrWorker() {
  const lib = await import(TESSERACT_URL);
  const createWorker = lib.createWorker || lib.default?.createWorker;
  return createWorker('por');
}

async function runOcr(worker, canvas) {
  try {
    const { data } = await worker.recognize(canvas);
    return String(data?.text || '')
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter((line) => line.length > 2 && /[A-Za-zÀ-ÿ]{2}/.test(line))
      .join('\n');
  } catch (err) {
    console.warn('[MSY][jornal-edicoes] OCR falhou nesta página:', err);
    return '';
  }
}

/* ── Agrupamento ─────────────────────────────────────────── */

/* Páginas seguidas do mesmo quadro viram um quadro só. Páginas sem quadro reconhecido
   ficam em "geral", separando arte de texto. */
function groupIntoQuadros(pages) {
  const quadros = [];
  let current = null;
  pages.forEach((page) => {
    const key = page.quadro || 'geral';
    const startNew = !current
      || current.key !== key
      || (key === 'geral' && current.isArt !== page.isArt)
      || (page.n === 1);
    if (startNew) {
      current = { key, isArt: page.isArt, quadro: page.quadro, firstPage: page.n, lastPage: page.n, items: [] };
      quadros.push(current);
    }
    current.lastPage = page.n;
    current.items.push(...page.items);
  });
  return quadros
    .filter((group) => group.items.length)
    .map((group) => ({
      quadro: group.quadro || 'geral',
      title: group.firstPage === 1 && !group.quadro ? 'Capa' : '',
      pages: [group.firstPage, group.lastPage],
      items: group.items,
    }));
}

/* ── Canvas ──────────────────────────────────────────────── */

export function releaseCanvas(canvas) {
  canvas.width = 0;
  canvas.height = 0;
}

export function scaleCanvas(source, width, keepAlpha = false) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.max(1, Math.round(source.height * (width / source.width)));
  const context = canvas.getContext('2d', { alpha: keepAlpha });
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function canvasToBlob(canvas, quality, keepAlpha = false) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((webp) => {
      if (webp && webp.type === 'image/webp') return resolve(webp);
      // Safari antigo não gera WebP: PNG se tiver transparência, senão JPEG.
      const type = keepAlpha ? 'image/png' : 'image/jpeg';
      canvas.toBlob((other) => (other ? resolve(other) : reject(new Error('Falha ao gerar a imagem.'))), type, quality);
    }, 'image/webp', quality);
  });
}
