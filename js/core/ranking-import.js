/* ============================================================
   MSY PORTAL — IMPORTAR RANKING DE IMAGEM (OCR no navegador)
   Lê o print da tabela de pontuação (Membro | Semana 1..N | TOTAL | MÉDIA)
   e devolve [{ lido, total, userId, status, conferir }] para preencher o modal do ranking.
   O OCR roda no próprio navegador com Tesseract.js (CDN jsDelivr), sem custo
   e sem segredo no frontend; nada é salvo aqui, a Diretoria confere e salva.

   A fonte da tabela tem zero cortado (Ø), que o OCR às vezes lê como 8/9/6.
   Por isso a imagem é lida em 3 escalas e, em cada linha, vale a leitura em que
   as semanas somam o TOTAL e TOTAL / semanas ≈ MÉDIA (trocando 8/9/6 por 0 se
   for isso que fecha a conta). Linha que não fecha em nenhuma leitura vem marcada
   como "conferir".
   ============================================================ */

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.esm.min.js';
const ALIAS_KEY = 'msy_rank_ocr_alias';
const ESCALAS = [2.5, 5, 3];
const CONFUNDE_COM_ZERO = new Set(['8', '9', '6']);

/* Linhas de cabeçalho/rodapé que não são membros. */
const IGNORAR = /^(membros?|semana|total|media|total do grupo)\b/;

let tesseractPromise = null;

function carregarTesseract() {
  if (!tesseractPromise) {
    tesseractPromise = import(TESSERACT_URL)
      .then(mod => mod.default || mod)
      .catch(err => { tesseractPromise = null; throw err; });
  }
  return tesseractPromise;
}

/** Minúsculas, sem acento e só letras/espaço. */
export function normalizarNome(nome) {
  return String(nome || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Token do OCR → string de dígitos (aceita O/Ø/@ como 0), ou null. */
function tokenDigitos(token) {
  if (!/\d/.test(token) && token.length > 1) return null; // "Oo" não é número
  const t = token.replace(/[.,]/g, '').replace(/[OoØø@Q]/g, '0').replace(/[Il|]/g, '1');
  return /^\d+$/.test(t) ? t : null;
}

/* Variações de um número trocando 8/9/6 por 0: [{ valor, trocas }]. */
function variacoes(digitos) {
  const pos = [...digitos].map((c, i) => (CONFUNDE_COM_ZERO.has(c) ? i : -1)).filter(i => i >= 0).slice(0, 4);
  const lista = [];
  for (let mask = 0; mask < (1 << pos.length); mask++) {
    const chars = [...digitos];
    let trocas = 0;
    pos.forEach((p, b) => { if (mask & (1 << b)) { chars[p] = '0'; trocas++; } });
    lista.push({ valor: parseInt(chars.join(''), 10), trocas });
  }
  return lista;
}

/* Semanas + TOTAL + MÉDIA batem? Devolve { total, trocas } com o menor número de trocas. */
function resolverConta(semanas, total, media) {
  // menor nº de trocas para cada soma possível das semanas
  let somas = new Map([[0, 0]]);
  for (const s of semanas) {
    const prox = new Map();
    for (const [soma, tr] of somas) {
      for (const v of variacoes(s)) {
        const k = soma + v.valor, t = tr + v.trocas;
        if (!prox.has(k) || prox.get(k) > t) prox.set(k, t);
      }
    }
    somas = prox;
  }
  let melhor = null;
  for (const t of variacoes(total)) {
    if (!somas.has(t.valor) || t.valor <= 0) continue;
    const mediaOk = variacoes(media).find(m => Math.abs(t.valor / semanas.length - m.valor) < 1);
    if (!mediaOk) continue;
    const trocas = somas.get(t.valor) + t.trocas + mediaOk.trocas;
    if (!melhor || trocas < melhor.trocas) melhor = { total: t.valor, trocas };
  }
  return melhor;
}

/* Números da linha → TOTAL. Tenta N semanas (do cabeçalho primeiro) antes de cair na penúltima coluna. */
function lerTotal(nums, semanasCabecalho) {
  const ks = [];
  if (semanasCabecalho) ks.push(semanasCabecalho);
  for (let k = nums.length - 2; k >= 1; k--) if (!ks.includes(k)) ks.push(k);
  for (const k of ks) {
    if (k > nums.length - 2) continue;
    const fim = nums.length - 2;
    const r = resolverConta(nums.slice(fim - k, fim), nums[fim], nums[fim + 1]);
    if (r) return { total: r.total, trocas: r.trocas, confiavel: true };
  }
  const bruto = nums.length >= 2 ? nums[nums.length - 2] : nums[0];
  return bruto ? { total: parseInt(bruto, 10), trocas: 0, confiavel: false } : null;
}

/** Texto do OCR → [{ lido, total, confiavel, trocas }] (sem cabeçalho nem "TOTAL DO GRUPO"). */
export function extrairLinhas(texto) {
  const linhasTexto = String(texto || '').split(/\r?\n/);
  const cabecalho = linhasTexto.find(l => /semana/i.test(l));
  const semanasCabecalho = cabecalho ? (cabecalho.match(/semana/gi) || []).length : 0;

  const linhas = [];
  for (const bruta of linhasTexto) {
    const tokens = bruta.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;

    const primeiroNum = tokens.findIndex(t => tokenDigitos(t) !== null);
    if (primeiroNum <= 0) continue;

    // Nome: 1º token sempre; os seguintes só se forem palavras (o emoji vira lixo tipo "Y" ou "¥")
    const nomeTokens = tokens.slice(0, primeiroNum)
      .map(t => t.replace(/[^\p{L}]/gu, ''))
      .filter((t, i) => t && (i === 0 || t.length >= 3));
    const lido = nomeTokens.join(' ');
    if (!lido || IGNORAR.test(normalizarNome(lido))) continue;

    const nums = tokens.slice(primeiroNum).map(tokenDigitos).filter(n => n !== null);
    const r = lerTotal(nums, semanasCabecalho);
    if (r) linhas.push({ lido, ...r });
  }
  return linhas;
}

/**
 * Junta as leituras das várias escalas: para cada membro (pela 1ª palavra do nome),
 * fica a leitura cuja conta fecha com menos trocas; se nenhuma fecha, o TOTAL mais repetido.
 */
export function combinarLeituras(leituras) {
  const ordem = [];
  const porNome = new Map();
  leituras.forEach(linhas => linhas.forEach(l => {
    const chave = normalizarNome(l.lido).split(' ')[0];
    if (!porNome.has(chave)) { porNome.set(chave, []); ordem.push(chave); }
    porNome.get(chave).push(l);
  }));

  return ordem.map(chave => {
    const cands = porNome.get(chave);
    const lido = cands.slice().sort((a, b) => b.lido.length - a.lido.length)[0].lido;
    const boas = cands.filter(c => c.confiavel).sort((a, b) => a.trocas - b.trocas);
    if (boas.length) return { lido, total: boas[0].total, conferir: false };
    const contagem = new Map();
    cands.forEach(c => contagem.set(c.total, (contagem.get(c.total) || 0) + 1));
    const total = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return { lido, total, conferir: true };
  });
}

function lerAliases() {
  try { return JSON.parse(localStorage.getItem(ALIAS_KEY) || '{}') || {}; }
  catch { return {}; }
}

/** Guarda "nome lido no print → membro" escolhido na conferência, para casar sozinho da próxima vez. */
export function lembrarAliases(pares) {
  try {
    const atual = lerAliases();
    pares.forEach(({ lido, userId }) => {
      const chave = normalizarNome(lido);
      if (chave && userId) atual[chave] = userId;
    });
    localStorage.setItem(ALIAS_KEY, JSON.stringify(atual));
  } catch (err) {
    console.warn('[MSY][ranking-import] Não foi possível lembrar apelidos:', err);
  }
}

/* Distância de edição (Levenshtein) entre duas strings curtas. */
function distancia(a, b) {
  let ant = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b.length; j++) {
      atual[j] = Math.min(ant[j] + 1, atual[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    ant = atual;
  }
  return ant[b.length];
}

/**
 * Casa o nome lido com um membro de profiles.
 * Ordem: apelido já confirmado → nome completo → começo do nome → primeiro nome
 * → alguma palavra do nome → iniciais. Só aceita quando sobra exatamente um membro.
 */
export function casarMembro(lido, membros, aliases = lerAliases()) {
  const alvo = normalizarNome(lido);
  if (!alvo) return null;
  if (aliases[alvo] && membros.some(m => m.id === aliases[alvo])) return aliases[alvo];

  const lista = membros.map(m => {
    const nome = normalizarNome(m.name);
    return { id: m.id, nome, palavras: nome.split(' '), iniciais: normalizarNome(m.initials).replace(/\s/g, '') };
  });
  const testes = [
    m => m.nome === alvo,
    m => m.nome.startsWith(alvo + ' '),
    m => m.palavras[0] === alvo.split(' ')[0] && alvo.length >= 3,
    m => m.palavras.includes(alvo),
    m => alvo.length >= 4 && m.palavras.some(p => p.startsWith(alvo)),
    m => m.iniciais && m.iniciais === alvo.replace(/\s/g, ''),
    // OCR trocou uma letra ("Jodo Pedro" → João Pedro): começo do nome com 1 letra diferente
    m => alvo.length >= 4 && distancia(m.palavras.slice(0, alvo.split(' ').length).join(' '), alvo) <= 1,
  ];
  for (const teste of testes) {
    const achados = lista.filter(teste);
    if (achados.length === 1) return achados[0].id;
    if (achados.length > 1) return null; // ambíguo: a Diretoria escolhe
  }
  return null;
}

/* Fundo escuro com texto claro: amplia, passa para cinza e inverte para o OCR. */
async function prepararImagem(bitmap, escala) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = img.data;
  let soma = 0;
  for (let i = 0; i < px.length; i += 4) soma += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  const escuro = soma / (px.length / 4) < 128;
  for (let i = 0; i < px.length; i += 4) {
    let y = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    if (escuro) y = 255 - y;
    px[i] = px[i + 1] = px[i + 2] = y;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Lê o print e devolve as linhas casadas com os membros.
 * onProgresso(0..1) é opcional, para mostrar o andamento no modal.
 */
export async function importarRankingDeImagem(arquivo, membros, onProgresso) {
  const Tesseract = await carregarTesseract();
  const bitmap = await createImageBitmap(arquivo);
  // Prints grandes já têm letra legível: reduz as escalas para não estourar memória
  const fator = Math.min(1, 1000 / bitmap.width);
  let passo = 0;
  const worker = await Tesseract.createWorker('eng', 1, {
    logger: m => {
      if (m.status === 'recognizing text' && onProgresso) onProgresso((passo + m.progress) / ESCALAS.length);
    },
  });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
    const leituras = [];
    for (; passo < ESCALAS.length; passo++) {
      const canvas = await prepararImagem(bitmap, Math.max(1, ESCALAS[passo] * fator));
      const { data } = await worker.recognize(canvas);
      leituras.push(extrairLinhas(data.text));
    }
    const aliases = lerAliases();
    return combinarLeituras(leituras).map(l => {
      const userId = casarMembro(l.lido, membros, aliases);
      return { ...l, userId, status: userId ? 'ok' : 'pendente' };
    });
  } finally {
    bitmap.close?.();
    await worker.terminate();
  }
}
