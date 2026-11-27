/* ============================================================
   MSY PORTAL — Jornal da Masayoshi · Edições
   Edição = jornal_posts (post_type 'edition', section 'edicoes').
   Montada em quadros dentro do portal:
     content_blocks = [
       { type:'edition', number, kind, format:'quadros' },
       { type:'quadro', quadro:'plantao', title, items:[
           { type:'heading'|'paragraph'|'quote', text },
           { type:'image', url, path, w, h, full, caption, alt } ] }, ...
     ]
   As imagens ficam no R2 (jornal-media) e são referenciadas só pelo content_blocks
   (a limpeza de órfãos do R2 procura o nome do arquivo em todas as tabelas).
   "Importar do PDF" (jornal-edicoes-import.js) monta os quadros sozinho.
   Edições antigas (páginas em jornal_media + sumário por página) continuam abrindo.
   ============================================================ */

import { createMediaStorage, lightVariantPath, lightVariantUrl, prefersLightMedia } from '../core/media-store.js?v=20261102-light';
import { canvasToBlob, importEditionPdf, releaseCanvas, scaleCanvas } from './jornal-edicoes-import.js?v=20261126-paginas-b';

const BUCKET = 'jornal-media';
const FULL_WIDTH = 2000;
const PHOTO_WIDTH = 1400;
const LIGHT_WIDTH = 900;
const MAX_PDF_MB = 200;
const MAX_EPISODE_MB = 50; // mesmo limite de vídeo do Worker do R2 (jornal-media)
const MAX_IMAGE_MB = 15;

/* Quadros do guia editorial (cores em css/jornal.css, [data-quadro]). */
export const QUADROS = {
  geral: 'Jornal Masayoshi',
  plantao: 'Plantão Masayoshi',
  'corvinho-entrevista': 'Corvinho Entrevista',
  'voce-sabia': 'Você Sabia?',
  'conhecendo-membros': 'Conhecendo os Membros',
  meme: 'Meme do Mês',
  noticias: 'Notícias que Ninguém Pediu',
  tunel: 'Túnel do Tempo',
  corvinho: 'Turma do Corvinho',
  especial: 'Edição Especial',
};

export const EDITION_KINDS = {
  regular: 'Edição regular',
  especial: 'Edição especial',
};

const TEXT_TYPES = ['heading', 'paragraph', 'quote'];

let ctx = null;
let seq = 0;
const reader = { post: null, only: null, view: 'full', current: 0, pendingPage: null, keyHandler: null };
const zoom = { root: null, pages: [], index: 0, scale: 1, x: 0, y: 0, pointers: new Map(), pinch: null, keyHandler: null };
const editor = { post: null, quadros: [], busy: false, previews: [] };

/** ctx: { state, db, Utils, openPost, openImage, recordJournalView, toggleJournalLike, reload, renderEmpty, openModal, closeModal, createUploadId, confirm } */
export function setupEditions(context) {
  ctx = context;
}

/* ── Dados ───────────────────────────────────────────────── */

export function isEdition(post) {
  return post?.post_type === 'edition';
}

function editionBlock(post) {
  const blocks = Array.isArray(post?.content_blocks) ? post.content_blocks : [];
  return blocks.find((item) => item?.type === 'edition') || {};
}

export function getEditionMeta(post) {
  const block = editionBlock(post);
  return {
    number: Number(block.number) > 0 ? Math.round(Number(block.number)) : null,
    kind: EDITION_KINDS[block.kind] ? block.kind : 'regular',
  };
}

/** Quadros da edição, já normalizados. Converte o formato antigo (páginas + sumário). */
export function getEditionQuadros(post) {
  const blocks = Array.isArray(post?.content_blocks) ? post.content_blocks : [];
  const quadros = blocks.filter((item) => item?.type === 'quadro').map(normalizeQuadro).filter((q) => q.items.length);
  if (quadros.length) return quadros;
  return legacyQuadros(post);
}

function normalizeQuadro(block) {
  const quadro = QUADROS[block?.quadro] ? block.quadro : 'geral';
  const items = (Array.isArray(block?.items) ? block.items : []).map(normalizeItem).filter(Boolean);
  return { quadro, title: String(block?.title || '').trim().slice(0, 120), items };
}

function normalizeItem(item) {
  if (!item) return null;
  if (TEXT_TYPES.includes(item.type)) {
    const text = String(item.text || '').trim();
    return text ? { type: item.type, text: text.slice(0, 8000) } : null;
  }
  if (item.type === 'image' && /^https?:\/\//.test(String(item.url || ''))) {
    return {
      type: 'image',
      url: item.url,
      path: item.path || null,
      w: Number(item.w) || null,
      h: Number(item.h) || null,
      full: Boolean(item.full),
      caption: String(item.caption || '').slice(0, 300),
      alt: String(item.alt || '').slice(0, 4000),
    };
  }
  return null;
}

function legacyQuadros(post) {
  const pages = (post?.media || [])
    .filter((item) => item.media_type === 'image' && item.url)
    .sort((a, b) => a.position - b.position)
    .map((page) => {
      let size = {};
      try { size = JSON.parse(page.alt_text || '{}') || {}; } catch { size = {}; }
      return { type: 'image', url: page.url, path: page.storage_path || null, w: size.w || null, h: size.h || null, full: true, caption: '', alt: '' };
    });
  if (!pages.length) return [];
  const toc = (Array.isArray(editionBlock(post).toc) ? editionBlock(post).toc : [])
    .map((item) => ({ quadro: QUADROS[item?.quadro] ? item.quadro : 'geral', title: String(item?.title || ''), page: Math.round(Number(item?.page)) }))
    .filter((item) => item.page >= 1 && item.page <= pages.length)
    .sort((a, b) => a.page - b.page);
  if (!toc.length) return [{ quadro: 'geral', title: '', items: pages }];
  const quadros = [];
  if (toc[0].page > 1) quadros.push({ quadro: 'geral', title: '', items: pages.slice(0, toc[0].page - 1) });
  toc.forEach((item, index) => {
    const end = index + 1 < toc.length ? toc[index + 1].page - 1 : pages.length;
    const items = pages.slice(item.page - 1, Math.max(item.page, end));
    if (items.length) quadros.push({ quadro: item.quadro, title: item.title, items });
  });
  return quadros;
}

/** Caminhos no R2 usados pela edição (para excluir junto com ela). */
export function getEditionFiles(post) {
  const paths = [];
  getEditionQuadros(post).forEach((q) => q.items.forEach((item) => {
    if (item.type === 'image' && item.path) paths.push(item.path, lightVariantPath(item.path));
  }));
  return paths.filter(Boolean);
}

function firstImage(quadros) {
  for (const q of quadros) {
    const image = q.items.find((item) => item.type === 'image');
    if (image) return image;
  }
  return null;
}

function editionCover(post, quadros = getEditionQuadros(post)) {
  return firstImage(quadros)?.url || post.cover_url || null;
}

/* "pág. 3" / "págs. 5–6": em que páginas da edição o quadro está. */
function quadroPagesLabel(quadros, index) {
  let start = 1;
  for (let i = 0; i < index; i += 1) start += quadros[i].items.filter((item) => item.type === 'image' && item.full).length;
  const pages = quadros[index].items.filter((item) => item.type === 'image' && item.full);
  if (!pages.length) return '';
  const first = pages[0].page || start;
  const last = pages[pages.length - 1].page || (start + pages.length - 1);
  return first === last ? `pág. ${first}` : `págs. ${first}–${last}`;
}

function quadroTitle(q) {
  return q.title || QUADROS[q.quadro];
}

function editionDate(post) {
  return post.published_at || post.created_at;
}

function sortByDate(posts) {
  return [...posts].sort((a, b) => new Date(editionDate(b)) - new Date(editionDate(a)));
}

function getVisibleEditions() {
  return sortByDate(ctx.state.posts.filter((post) => isEdition(post) && post.status !== 'archived'));
}

function editionLabel(post) {
  const meta = getEditionMeta(post);
  return meta.number ? `Edição Nº ${String(meta.number).padStart(2, '0')}` : 'Edição';
}

function imgAttrs(url) {
  const light = prefersLightMedia() ? lightVariantUrl(url) : null;
  const esc = ctx.Utils.escapeHtml;
  if (!light) return `src="${esc(url)}"`;
  return `src="${esc(light)}" data-full-src="${esc(url)}" onerror="this.onerror=null;this.src=this.dataset.fullSrc"`;
}

function statusChip(post) {
  if (!ctx.state.canManage || post.status === 'published') return '';
  return `<span class="edition-status">${post.status === 'draft' ? 'Rascunho' : 'Arquivado'}</span>`;
}

function countLabel(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

/* Capa de texto: quando a edição não tem nenhuma imagem, monta uma primeira página
   de jornal com o título, um trecho do texto e as faixas coloridas dos quadros. */
function textCover(post, quadros, title = post.title) {
  const esc = ctx.Utils.escapeHtml;
  const firstText = quadros.flatMap((q) => q.items).find((item) => item.type === 'paragraph' && String(item.text || '').trim());
  const lede = post.summary || firstText?.text || '';
  const date = ctx.Utils.formatDate(editionDate(post));
  const storyQ = quadros.find((q) => q.title || q.items.some((item) => item.text && item !== firstText));
  const storyText = storyQ?.items.find((item) => item.type === 'paragraph' && String(item.text || '').trim() && item.text !== lede)?.text || '';
  const story = storyQ && (storyQ.title || storyText) ? { q: storyQ, text: storyText } : null;
  return `
    <span class="edition-paper" aria-hidden="true">
      <span class="edition-paper-mast">
        <span class="edition-paper-kicker">Jornal da</span>
        <span class="edition-paper-name">Masayoshi</span>
        <span class="edition-paper-line"><span>${esc(editionLabel(post))}</span><span>${esc(date)}</span></span>
      </span>
      <span class="edition-paper-title">${esc(title)}</span>
      ${lede ? `<span class="edition-paper-lede">${esc(lede)}</span>` : ''}
      ${story ? `
        <span class="edition-paper-story" data-quadro="${esc(story.q.quadro)}">
          <span class="edition-paper-story-kicker">${esc(QUADROS[story.q.quadro])}</span>
          <span class="edition-paper-story-title">${esc(quadroTitle(story.q))}</span>
          ${story.text ? `<span class="edition-paper-story-text">${esc(story.text)}</span>` : ''}
        </span>` : ''}
      <span class="edition-paper-quadros">
        ${quadros.slice(0, 4).map((q) => `<span class="edition-paper-q" data-quadro="${esc(q.quadro)}"><span class="edition-paper-dot"></span><span class="edition-paper-qname">${esc(quadroTitle(q))}</span></span>`).join('')}
      </span>
    </span>`;
}

function coverInner(post, quadros, cover, { title, badge = true } = {}) {
  const esc = ctx.Utils.escapeHtml;
  if (!cover) return textCover(post, quadros, title);
  return `<img ${imgAttrs(cover)} loading="lazy" decoding="async" alt="">${badge ? `<span class="edition-number">${esc(editionLabel(post))}</span>` : ''}`;
}

/* ── Seção Edições ───────────────────────────────────────── */

/* Quantos itens cada aba tem (aparece no número ao lado do nome da aba). */
export function getEditionCounts() {
  return { edicoes: getVisibleEditions().length, corvinho: getCorvinhoEntries().length + getVisibleEpisodes().length };
}

export function renderEditionsSection() {
  const editions = getVisibleEditions();
  const [latest, ...rest] = editions;
  return `
    <section class="journal-section journal-section-plain" data-journal-section-panel="edicoes">
      ${latest ? `
        ${renderEditionLead(latest)}
        ${rest.length ? `
          <div class="edition-archive-head">Edições anteriores</div>
          <div class="edition-grid">${rest.map(renderEditionCard).join('')}</div>` : ''}
      ` : ctx.renderEmpty('Nenhuma edição publicada ainda.')}
    </section>`;
}

function renderEditionLead(post) {
  const esc = ctx.Utils.escapeHtml;
  const meta = getEditionMeta(post);
  const quadros = getEditionQuadros(post);
  const cover = editionCover(post, quadros);
  return `
    <article class="edition-lead">
      <button type="button" class="edition-cover edition-cover-lead" data-edition-open="${post.id}" aria-label="Ler ${esc(post.title)}">
        ${coverInner(post, quadros, cover)}
      </button>
      <div class="edition-lead-body">
        <div class="edition-kicker">
          <span>Edição mais recente</span>
          <span>·</span>
          <span>${esc(EDITION_KINDS[meta.kind])}</span>
          ${statusChip(post)}
        </div>
        <h2 class="edition-lead-title">${esc(post.title)}</h2>
        <div class="edition-lead-date">${ctx.Utils.formatDate(editionDate(post))} · ${countLabel(quadros.length, 'quadro', 'quadros')}</div>
        ${post.summary ? `<p class="edition-lead-summary">${esc(post.summary)}</p>` : ''}
        ${quadros.length ? `
          <div class="edition-toc-title">Nesta edição</div>
          <ol class="edition-toc">
            ${quadros.map((q, index) => {
              const label = QUADROS[q.quadro];
              const showLabel = q.title && q.title !== label;
              return `
              <li>
                <button type="button" class="edition-toc-item" data-quadro="${q.quadro}" data-edition-open="${post.id}" data-edition-quadro="${index}">
                  <span class="edition-toc-dot"></span>
                  <span class="edition-toc-name">
                    ${esc(quadroTitle(q))}
                    ${showLabel ? `<small>${esc(label)}</small>` : ''}
                  </span>
                  <span class="edition-toc-page">${esc(quadroPagesLabel(quadros, index))}</span>
                </button>
              </li>`;
            }).join('')}
          </ol>` : ''}
        <div class="edition-lead-actions">
          <button type="button" class="btn btn-primary" data-edition-open="${post.id}"><i class="fa-solid fa-book-open"></i> Ler edição</button>
          ${manageTools(post)}
          <span class="edition-stats">
            <span><i class="fa-regular fa-thumbs-up"></i> ${Number(post.likes_count || 0).toLocaleString('pt-BR')}</span>
            <span><i class="fa-regular fa-comment"></i> ${(post.comments || []).length.toLocaleString('pt-BR')}</span>
            <span><i class="fa-regular fa-eye"></i> ${Number(post.views_count || 0).toLocaleString('pt-BR')}</span>
          </span>
        </div>
      </div>
    </article>`;
}

function renderEditionCard(post) {
  const esc = ctx.Utils.escapeHtml;
  const quadros = getEditionQuadros(post);
  const cover = editionCover(post, quadros);
  return `
    <div class="edition-card-wrap">
      <button type="button" class="edition-card" data-edition-open="${post.id}">
        <span class="edition-cover">
          ${coverInner(post, quadros, cover)}
        </span>
        <span class="edition-card-title">${esc(post.title)}</span>
        <span class="edition-card-meta">${ctx.Utils.formatDate(editionDate(post))} · ${countLabel(quadros.length, 'quadro', 'quadros')} ${statusChip(post)}</span>
      </button>
      ${manageTools(post)}
    </div>`;
}

/* Editar / Excluir, só para quem pode mexer no Jornal. */
function manageTools(post) {
  if (!ctx.state.canManage) return '';
  return `
    <span class="edition-manage">
      <button type="button" class="btn btn-ghost btn-sm" data-edition-edit="${post.id}"><i class="fa-solid fa-pen"></i> Editar</button>
      <button type="button" class="btn btn-ghost btn-sm edition-delete-btn" data-edition-delete="${post.id}"><i class="fa-solid fa-trash"></i> Excluir</button>
    </span>`;
}

/* ── Seção Turma do Corvinho ─────────────────────────────── */


/* ── Episódios em vídeo da Turma do Corvinho ─────────────── */

/* Um episódio é um jornal_posts com post_type 'video'; o número fica em content_blocks. */
export function isEpisode(post) {
  return post?.post_type === 'video';
}

function getEpisodeNumber(post) {
  const block = Array.isArray(post?.content_blocks) ? post.content_blocks.find((b) => b?.type === 'episode') : null;
  return Number(block?.number) || null;
}

function episodeLabel(post) {
  const n = getEpisodeNumber(post);
  return n ? `Episódio ${String(n).padStart(2, '0')}` : 'Episódio';
}

function videoUrlOf(post) {
  if (post?.video_url) return post.video_url;
  return post?.media?.find((item) => item.media_type === 'video' && item.url)?.url || '';
}

function getVisibleEpisodes() {
  return sortByDate(ctx.state.posts.filter((post) => isEpisode(post) && post.status !== 'archived'));
}

function nextEpisodeNumber() {
  const numbers = ctx.state.posts.filter(isEpisode).map((post) => getEpisodeNumber(post) || 0);
  return (numbers.length ? Math.max(...numbers) : 0) + 1;
}

function renderEpisodeCard(post) {
  const esc = ctx.Utils.escapeHtml;
  const cover = post.cover_url || post.thumbnail_url || '';
  return `
    <div class="edition-card-wrap">
      <button type="button" class="edition-card episode-card" data-episode-open="${post.id}">
        <span class="episode-cover">
          ${cover ? `<img ${imgAttrs(cover)} loading="lazy" decoding="async" alt="">` : '<span class="episode-cover-empty"><i class="fa-solid fa-film"></i></span>'}
          <span class="episode-play"><i class="fa-solid fa-play"></i></span>
          <span class="edition-number">${esc(episodeLabel(post))}</span>
        </span>
        <span class="edition-card-title">${esc(post.title)}</span>
        <span class="edition-card-meta">${ctx.Utils.formatDate(editionDate(post))} ${statusChip(post)}</span>
      </button>
      ${ctx.state.canManage ? `
        <span class="edition-manage">
          <button type="button" class="btn btn-ghost btn-sm" data-episode-edit="${post.id}"><i class="fa-solid fa-pen"></i> Editar</button>
          <button type="button" class="btn btn-ghost btn-sm edition-delete-btn" data-edition-delete="${post.id}"><i class="fa-solid fa-trash"></i> Excluir</button>
        </span>` : ''}
    </div>`;
}

/* Rótulo do episódio para o modal do vídeo ("Turma do Corvinho · Episódio 01"). */
export function getEpisodeKicker(post) {
  return `Turma do Corvinho · ${episodeLabel(post)}`;
}

/* Capa automática: um quadro do vídeo no formato dele (16:9, vertical...), sem cortar. */
async function captureEpisodeCover(videoFile) {
  const url = URL.createObjectURL(videoFile);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await withTimeout(new Promise((resolve, reject) => {
      video.onloadeddata = resolve;
      video.onerror = () => reject(new Error('Vídeo ilegível'));
    }), 8000);
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const at = duration > 2 ? Math.min(duration * 0.2, 3) : 0;
    if (at > 0) {
      await withTimeout(new Promise((resolve) => { video.onseeked = resolve; video.currentTime = at; }), 5000).catch(() => null);
    }
    const width = Math.min(1280, video.videoWidth || 1280);
    const height = Math.round((video.videoHeight || 720) * (width / (video.videoWidth || 1280)));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(video, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, 0.86);
    releaseCanvas(canvas);
    const base = videoFile.name.replace(/\.[^.]+$/, '') || 'episodio';
    const file = new File([blob], `${base}-capa.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`, { type: blob.type });
    return await ctx.uploadFile(file, 'covers', { imageOnly: true });
  } catch (err) {
    console.warn('[MSY][jornal-episodios] Capa automática indisponível:', err);
    return null;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('Tempo esgotado')), ms))]);
}

export function openEpisodeEditor(post = null) {
  const modal = document.getElementById('journalEditorModal');
  if (!modal) return;
  const esc = ctx.Utils.escapeHtml;
  const number = post ? getEpisodeNumber(post) : nextEpisodeNumber();
  const dateValue = toDateInput(post?.published_at) || toDateInput(new Date().toISOString());
  const hasVideo = Boolean(videoUrlOf(post));
  modal.innerHTML = `
    <div class="journal-modal-panel edition-editor-panel episode-editor-panel">
      <div class="journal-modal-head">
        <div>
          <div class="journal-kicker" style="margin-bottom:6px"><i class="fa-solid fa-film"></i>Turma do Corvinho</div>
          <div class="journal-modal-title">${post ? 'Editar episódio' : 'Novo episódio'}</div>
        </div>
        <button type="button" class="social-icon-btn" data-close-journal-modal aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <form class="journal-modal-body" id="episodeEditorForm" novalidate>
        <div class="journal-editor">
          <div class="journal-editor-grid">
            <div class="journal-field"><label>Título</label><input name="title" required maxlength="140" value="${esc(post?.title || '')}" placeholder="Ex.: O Corvinho e o mistério do servidor"></div>
            <div class="journal-field"><label>Episódio nº</label><input name="number" type="number" min="1" max="9999" value="${number || ''}"></div>
            <div class="journal-field"><label>Data</label><input name="date" type="date" required value="${dateValue}"></div>
            <div class="journal-field"><label>Publicação</label><select name="status">
              <option value="draft" ${(post?.status || 'draft') === 'draft' ? 'selected' : ''}>Rascunho (só a redação vê)</option>
              <option value="published" ${post?.status === 'published' ? 'selected' : ''}>Publicado</option>
              <option value="archived" ${post?.status === 'archived' ? 'selected' : ''}>Arquivado</option>
            </select></div>
            <div class="journal-field full"><label>Resumo</label><textarea name="summary" maxlength="400" placeholder="Do que se trata o episódio.">${esc(post?.summary || '')}</textarea></div>
            <div class="journal-field full">
              <label>Vídeo ${hasVideo ? '<span class="edition-optional">(envie outro só se quiser trocar)</span>' : ''}</label>
              <label class="edition-pdf-drop">
                <input type="file" name="video" accept="video/mp4,video/webm,video/quicktime" hidden data-episode-video>
                <i class="fa-solid fa-film"></i>
                <span data-episode-video-label>${hasVideo ? 'Vídeo atual mantido. Toque para escolher outro.' : `Escolha o vídeo do episódio (MP4, WebM ou MOV, até ${MAX_EPISODE_MB} MB).`}</span>
              </label>
            </div>
            <div class="journal-field full">
              <label>Capa <span class="edition-optional">(opcional: sem capa, o portal tira uma do próprio vídeo)</span></label>
              <div class="episode-cover-pick">
                <span class="episode-cover-preview" data-episode-cover-preview>${post?.cover_url ? `<img src="${esc(post.cover_url)}" alt="">` : '<i class="fa-regular fa-image"></i>'}</span>
                <label class="btn btn-ghost btn-sm"><input type="file" name="cover" accept="image/*" hidden data-episode-cover><i class="fa-solid fa-image"></i> Escolher capa</label>
              </div>
            </div>
            <div class="journal-field full edition-checks">
              <label><input type="checkbox" name="comments_enabled" ${post?.comments_enabled === false ? '' : 'checked'}> Permitir comentários</label>
            </div>
          </div>
        </div>
      </form>
      <div class="journal-modal-foot">
        ${post ? '<button type="button" class="btn btn-ghost edition-delete-btn edition-foot-delete" data-episode-delete><i class="fa-solid fa-trash"></i> Excluir episódio</button>' : ''}
        <button type="button" class="btn btn-ghost" data-close-journal-modal>Cancelar</button>
        <button type="submit" form="episodeEditorForm" class="btn btn-primary" data-episode-save><i class="fa-solid fa-floppy-disk"></i> Salvar episódio</button>
      </div>
    </div>`;
  ctx.openModal(modal);

  const form = modal.querySelector('#episodeEditorForm');
  let busy = false;
  modal.querySelectorAll('[data-close-journal-modal]').forEach((btn) => btn.addEventListener('click', () => { if (!busy) ctx.closeModal(modal); }));
  modal.querySelector('[data-episode-video]').addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    const label = modal.querySelector('[data-episode-video-label]');
    if (!file) return;
    if (file.size > MAX_EPISODE_MB * 1024 * 1024) {
      event.target.value = '';
      ctx.Utils.showToast(`O vídeo passa de ${MAX_EPISODE_MB} MB. Exporte menor e tente de novo.`, 'error');
      return;
    }
    label.textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`;
    if (!form.elements.title.value.trim()) form.elements.title.value = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 140);
  });
  modal.querySelector('[data-episode-cover]').addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    const preview = modal.querySelector('[data-episode-cover-preview]');
    if (!file) return;
    const url = URL.createObjectURL(file);
    preview.innerHTML = `<img src="${url}" alt="">`;
  });
  modal.querySelector('[data-episode-delete]')?.addEventListener('click', async () => {
    if (busy) return;
    if (await ctx.deletePost(post)) ctx.closeModal(modal);
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const title = form.elements.title.value.trim();
    const date = form.elements.date.value;
    const videoFile = form.elements.video.files?.[0] || null;
    const coverFile = form.elements.cover.files?.[0] || null;
    if (!title) return ctx.Utils.showToast('Dê um título para o episódio.', 'error');
    if (!date) return ctx.Utils.showToast('Escolha a data do episódio.', 'error');
    if (!videoFile && !hasVideo) return ctx.Utils.showToast('Escolha o vídeo do episódio.', 'error');
    const saveBtn = modal.querySelector('[data-episode-save]');
    busy = true;
    saveBtn.disabled = true;
    const uploaded = [];
    let createdId = null;
    try {
      let video = null;
      let cover = null;
      if (videoFile) {
        saveBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Enviando o vídeo...';
        video = await ctx.uploadFile(videoFile, 'videos', { videoOnly: true });
        uploaded.push(video.storage_path);
      }
      saveBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Preparando a capa...';
      if (coverFile) cover = await ctx.uploadFile(coverFile, 'covers', { imageOnly: true });
      else if (videoFile) cover = await captureEpisodeCover(videoFile);
      if (cover?.storage_path) uploaded.push(cover.storage_path, lightVariantPath(cover.storage_path));
      saveBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Salvando...';
      const payload = {
        title,
        summary: form.elements.summary.value.trim() || null,
        post_type: 'video',
        section: 'videos',
        status: form.elements.status.value,
        comments_enabled: form.elements.comments_enabled.checked,
        published_at: new Date(`${date}T12:00:00-03:00`).toISOString(),
        content_blocks: [{ type: 'episode', series: 'corvinho', number: Number(form.elements.number.value) || null }],
        updated_at: new Date().toISOString(),
      };
      if (video) Object.assign(payload, { video_url: video.url, video_storage_path: video.storage_path });
      if (cover) Object.assign(payload, { cover_url: cover.url, cover_storage_path: cover.storage_path });
      if (post) {
        const { error } = await ctx.db.from('jornal_posts').update(payload).eq('id', post.id);
        if (error) throw error;
      } else {
        const { data, error } = await ctx.db.from('jornal_posts').insert({ ...payload, author_id: ctx.state.profile.id }).select('id').single();
        if (error) throw error;
        createdId = data.id;
      }
      // Arquivos trocados saem do R2 só depois que o registro foi salvo.
      const old = [];
      if (post && video && post.video_storage_path) old.push(post.video_storage_path);
      if (post && cover && post.cover_storage_path) old.push(post.cover_storage_path, lightVariantPath(post.cover_storage_path));
      if (old.length) await createMediaStorage(ctx.db).from(BUCKET).remove(old.filter(Boolean)).catch((err) => console.warn('[MSY][jornal-episodios] Arquivos antigos não removidos:', err));
      busy = false;
      ctx.closeModal(modal);
      ctx.Utils.showToast(post ? 'Episódio atualizado.' : 'Episódio criado.', 'success');
      await ctx.reload();
    } catch (err) {
      console.error('[MSY][jornal-episodios] Erro ao salvar episódio:', err);
      if (createdId) await ctx.db.from('jornal_posts').delete().eq('id', createdId).then(() => null, () => null);
      if (uploaded.length) await createMediaStorage(ctx.db).from(BUCKET).remove(uploaded.filter(Boolean)).catch(() => null);
      ctx.Utils.showToast(err?.message ? `Erro ao salvar o episódio: ${err.message}` : 'Erro ao salvar o episódio.', 'error');
      busy = false;
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar episódio';
    }
  });
}

function getCorvinhoEntries() {
  const entries = [];
  getVisibleEditions().forEach((post) => {
    getEditionQuadros(post).forEach((q, index) => {
      if (q.quadro !== 'corvinho') return;
      entries.push({ post, only: index, title: quadroTitle(q), cover: firstImage([q])?.url || null, count: q.items.length });
    });
  });
  return entries;
}

export function renderCorvinhoSection() {
  const esc = ctx.Utils.escapeHtml;
  const entries = getCorvinhoEntries();
  const episodes = getVisibleEpisodes();
  return `
    <section class="journal-section journal-section-plain" data-journal-section-panel="corvinho" data-quadro="corvinho">
      <p class="journal-section-intro"><i class="fa-solid fa-feather-pointed"></i> O Corvinho e a turma: os episódios em vídeo e o gibi que sai nas edições.</p>
      <div class="edition-archive-head"><i class="fa-solid fa-film"></i> Episódios</div>
      ${episodes.length
        ? `<div class="edition-grid episode-grid">${episodes.map(renderEpisodeCard).join('')}</div>`
        : ctx.renderEmpty(ctx.state.canManage ? 'Nenhum episódio ainda. Use "+ Novo episódio" lá em cima.' : 'Nenhum episódio publicado ainda.')}
      <div class="edition-archive-head"><i class="fa-solid fa-book-open"></i> Gibis</div>
      ${entries.length ? `
        <div class="edition-grid">
          ${entries.map(({ post, only, title, cover, count }) => `
            <button type="button" class="edition-card is-gibi" data-edition-open="${post.id}" ${only === null ? '' : `data-edition-only="${only}"`}>
              <span class="edition-cover">
                ${coverInner(post, only === null ? getEditionQuadros(post) : [getEditionQuadros(post)[only]], cover, { title })}
              </span>
              <span class="edition-card-title">${esc(title)}</span>
              <span class="edition-card-meta">${ctx.Utils.formatDate(editionDate(post))} · ${countLabel(count, 'página', 'páginas')} ${statusChip(post)}</span>
            </button>`).join('')}
        </div>` : ctx.renderEmpty('Nenhum gibi publicado ainda. Use o quadro "Turma do Corvinho" numa edição para ele aparecer aqui.')}
    </section>`;
}

export function bindEditionSections(root = document) {
  const find = (id) => ctx.state.posts.find((post) => post.id === id);
  root.querySelectorAll('[data-episode-open]').forEach((btn) => btn.addEventListener('click', () => ctx.openPost(btn.dataset.episodeOpen)));
  root.querySelectorAll('[data-episode-edit]').forEach((btn) => btn.addEventListener('click', () => {
    const post = find(btn.dataset.episodeEdit);
    if (post) openEpisodeEditor(post);
  }));
  root.querySelectorAll('[data-edition-edit]').forEach((btn) => btn.addEventListener('click', () => {
    const post = find(btn.dataset.editionEdit);
    if (post) openEditionEditor(post);
  }));
  root.querySelectorAll('[data-edition-delete]').forEach((btn) => btn.addEventListener('click', () => {
    const post = find(btn.dataset.editionDelete);
    if (post) ctx.deletePost(post);
  }));
  root.querySelectorAll('[data-edition-open]').forEach((btn) => btn.addEventListener('click', () => {
    const { editionOpen, editionQuadro, editionOnly } = btn.dataset;
    openEditionReader(editionOpen, {
      jump: editionQuadro === undefined ? null : Number(editionQuadro),
      only: editionOnly === undefined ? null : Number(editionOnly),
    });
  }));
}

/* Corpo do modal de comentários de uma edição (o modal em si é o do Jornal). */
export function renderEditionModalBody(post) {
  const esc = ctx.Utils.escapeHtml;
  const meta = getEditionMeta(post);
  const quadros = getEditionQuadros(post);
  const views = Number(post.views_count || 0);
  const likes = Number(post.likes_count || 0);
  return `
    <section class="journal-video-description">
      <div class="journal-video-description-top">
        <div class="journal-video-description-meta">
          <strong data-journal-views="${post.id}">${views.toLocaleString('pt-BR')} visualizaç${views === 1 ? 'ão' : 'ões'}</strong>
          <span>${esc(editionLabel(post))} · ${ctx.Utils.formatDate(editionDate(post))} · ${countLabel(quadros.length, 'quadro', 'quadros')}</span>
        </div>
        <button type="button" class="journal-like-btn ${post.liked_by_me ? 'active' : ''}" data-like-journal-post="${post.id}" aria-pressed="${post.liked_by_me ? 'true' : 'false'}">
          <i class="fa-${post.liked_by_me ? 'solid' : 'regular'} fa-thumbs-up"></i>
          <span>${likes.toLocaleString('pt-BR')}</span>
        </button>
      </div>
      <p>${esc(post.summary || EDITION_KINDS[meta.kind])}</p>
      <button type="button" class="btn btn-ghost" data-edition-open="${post.id}"><i class="fa-solid fa-book-open"></i> Ler edição</button>
    </section>`;
}

/* ── Leitor ──────────────────────────────────────────────── */

export function openEditionReader(postId, { jump = null, only = null } = {}) {
  const post = ctx.state.posts.find((item) => item.id === postId);
  if (!post) return;
  const quadros = getEditionQuadros(post);
  if (!quadros.length) {
    ctx.Utils.showToast('Esta edição ainda não tem conteúdo.', 'error');
    return;
  }
  const postModal = document.getElementById('journalPostModal');
  if (postModal?.classList.contains('open')) ctx.closeModal(postModal);

  reader.post = post;
  reader.only = Number.isInteger(only) && quadros[only] ? only : null;
  reader.pages = isPagesEdition(quadros);
  if (reader.pages) {
    // Edição em páginas: "only" (vindo da aba do Corvinho) abre direto o modo Por quadro.
    reader.view = reader.only !== null ? 'quadro' : (reader.keepView ? reader.view : 'full');
    reader.current = reader.only !== null ? reader.only : (Number.isInteger(jump) && quadros[jump] ? jump : 0);
    reader.only = null;
  }
  reader.keepView = false;

  let root = document.getElementById('journalEditionReader');
  if (!root) {
    root = document.createElement('div');
    root.id = 'journalEditionReader';
    root.className = 'edition-reader';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    document.body.appendChild(root);
  }
  if (reader.keyHandler) document.removeEventListener('keydown', reader.keyHandler);
  root.innerHTML = reader.pages ? renderPagesReader(post, quadros) : renderReader(post, quadros);
  root.classList.add('open');
  document.body.classList.add('social-modal-locked');
  bindReader(root, post);
  const scroller = root.querySelector('[data-reader-scroll]');
  scroller.scrollTop = 0;
  if (!reader.pages && reader.only === null && Number.isInteger(jump) && jump > 0) {
    requestAnimationFrame(() => scrollToQuadro(root, jump, false));
  }
  if (reader.pages && reader.pendingPage !== null) {
    const gi = reader.pendingPage;
    reader.pendingPage = null;
    requestAnimationFrame(() => { scrollToPage(root, gi, false); syncActiveThumb(root); });
  } else if (reader.pages && reader.view === 'full' && reader.current > 0) {
    requestAnimationFrame(() => scrollToQuadro(root, reader.current, false));
  }
  if (reader.pages) requestAnimationFrame(() => syncActiveThumb(root));
  ctx.recordJournalView(post, root);
  try { history.replaceState(null, '', `#post-${post.id}`); } catch { /* sem history */ }
  root.querySelector('.edition-reader-close')?.focus({ preventScroll: true });
}

function likeButton(post) {
  const likes = Number(post.likes_count || 0);
  return `
    <button type="button" class="journal-like-btn ${post.liked_by_me ? 'active' : ''}" data-like-journal-post="${post.id}" aria-pressed="${post.liked_by_me ? 'true' : 'false'}">
      <i class="fa-${post.liked_by_me ? 'solid' : 'regular'} fa-thumbs-up"></i>
      <span>${likes.toLocaleString('pt-BR')}</span>
    </button>`;
}

function commentsButton(post) {
  return `
    <button type="button" class="journal-like-btn" data-reader-comments aria-label="Comentários">
      <i class="fa-regular fa-comment"></i>
      <span>${(post.comments || []).length.toLocaleString('pt-BR')}</span>
    </button>`;
}

function renderReader(post, quadros) {
  const esc = ctx.Utils.escapeHtml;
  const shown = reader.only === null ? quadros.map((q, index) => ({ q, index })) : [{ q: quadros[reader.only], index: reader.only }];
  return `
    <div class="edition-reader-bar">
      <button type="button" class="social-icon-btn edition-reader-close" data-reader-close aria-label="Fechar leitor"><i class="fa-solid fa-xmark"></i></button>
      <div class="edition-reader-title">
        <span>${esc(editionLabel(post))}</span>
        <strong>${esc(post.title)}</strong>
      </div>
      <div class="edition-reader-tools">
        ${reader.only === null && quadros.length > 1 ? `
          <select class="edition-reader-toc" data-reader-toc aria-label="Ir para o quadro">
            <option value="">Quadros</option>
            ${quadros.map((q, index) => `<option value="${index}">${esc(quadroTitle(q))}</option>`).join('')}
          </select>` : ''}
        ${reader.only !== null ? '<button type="button" class="btn btn-ghost btn-sm" data-reader-full><i class="fa-solid fa-book"></i> Edição completa</button>' : ''}
        <span class="edition-like-slot">${likeButton(post)}</span>
        ${commentsButton(post)}
      </div>
    </div>
    <div class="edition-reader-progress"><span data-reader-progress></span></div>
    <div class="edition-article-scroll" data-reader-scroll>
      <article class="edition-article">
        <header class="edition-masthead">
          <div class="edition-masthead-top">
            <span>${esc(editionLabel(post))}</span>
            <span>${ctx.Utils.formatDate(editionDate(post))}</span>
          </div>
          <div class="edition-masthead-name">Jornal da Masayoshi</div>
          ${reader.only === null ? `
            <h1 class="edition-masthead-title">${esc(post.title)}</h1>
            ${post.summary ? `<p class="edition-masthead-summary">${esc(post.summary)}</p>` : ''}` : ''}
        </header>
        ${shown.map(({ q, index }) => renderQuadro(q, index)).join('')}
        <footer class="edition-article-end">
          <div class="edition-end-title">${reader.only === null ? 'Fim da edição' : 'Fim do quadro'}</div>
          <p>Gostou? Deixe seu like e comente o que achou.</p>
          <div class="edition-end-actions">
            <span class="edition-like-slot">${likeButton(post)}</span>
            ${commentsButton(post)}
            ${reader.only !== null ? '<button type="button" class="btn btn-ghost btn-sm" data-reader-full><i class="fa-solid fa-book"></i> Ler a edição completa</button>' : ''}
          </div>
        </footer>
      </article>
    </div>`;
}

function renderQuadro(q, index) {
  const esc = ctx.Utils.escapeHtml;
  const label = QUADROS[q.quadro];
  return `
    <section class="edition-q" data-quadro="${q.quadro}" data-q-index="${index}">
      <header class="edition-q-head">
        <span class="edition-q-tag">${esc(label)}</span>
        ${q.title && q.title !== label ? `<h2 class="edition-q-title">${esc(q.title)}</h2>` : ''}
      </header>
      <div class="edition-q-body">${q.items.map(renderItem).join('')}</div>
    </section>`;
}

function renderItem(item) {
  const esc = ctx.Utils.escapeHtml;
  if (item.type === 'heading') return `<h3>${esc(item.text)}</h3>`;
  if (item.type === 'quote') return `<blockquote>${esc(item.text).replace(/\n/g, '<br>')}</blockquote>`;
  if (item.type === 'paragraph') return `<p>${esc(item.text).replace(/\n/g, '<br>')}</p>`;
  const size = item.w && item.h ? `width="${item.w}" height="${item.h}"` : '';
  return `
    <figure class="edition-fig ${item.full ? 'is-full' : ''}">
      <button type="button" class="edition-fig-btn" data-edition-zoom="${esc(item.url)}" aria-label="Ampliar imagem">
        <img ${imgAttrs(item.url)} ${size} loading="lazy" decoding="async" alt="${esc(item.caption || item.alt.slice(0, 200))}">
      </button>
      ${item.caption ? `<figcaption>${esc(item.caption)}</figcaption>` : ''}
      ${item.alt ? `
        <details class="edition-fig-text">
          <summary><i class="fa-solid fa-align-left"></i> Ler o texto desta página</summary>
          <p>${esc(item.alt).replace(/\n/g, '<br>')}</p>
        </details>` : ''}
    </figure>`;
}


/* ── Leitor em páginas (edição importada do PDF) ─────────── */

/* Uma edição é "em páginas" quando tudo nela é página inteira (importada do PDF). */
function isPagesEdition(quadros) {
  return quadros.length > 0 && quadros.every((q) => q.items.length && q.items.every((item) => item.type === 'image' && item.full));
}

function pageList(quadros) {
  let n = 0;
  return quadros.flatMap((q, qi) => q.items.map((item) => {
    n += 1;
    return { item, qi, gi: n - 1, number: item.page || n };
  }));
}

function renderPagesReader(post, quadros) {
  const esc = ctx.Utils.escapeHtml;
  const byQuadro = reader.view === 'quadro';
  const current = quadros[reader.current] ? reader.current : 0;
  const pages = pageList(quadros);
  const shown = byQuadro ? pages.filter((p) => p.qi === current) : pages;
  const groups = [];
  shown.forEach((p) => {
    const last = groups[groups.length - 1];
    if (last && last.qi === p.qi) last.pages.push(p);
    else groups.push({ qi: p.qi, pages: [p] });
  });
  let zoomIndex = 0;
  return `
    <div class="edition-reader-bar">
      <button type="button" class="social-icon-btn edition-reader-close" data-reader-close aria-label="Fechar leitor"><i class="fa-solid fa-xmark"></i></button>
      <div class="edition-reader-title">
        <span>${esc(editionLabel(post))}</span>
        <strong>${esc(post.title)}</strong>
      </div>
      <div class="edition-reader-tools">
        <div class="edition-view-toggle" role="group" aria-label="Como ler">
          <button type="button" class="${byQuadro ? '' : 'active'}" data-reader-view="full" aria-pressed="${byQuadro ? 'false' : 'true'}"><i class="fa-solid fa-book-open"></i><span class="evt-long">Edição completa</span><span class="evt-short">Completa</span></button>
          <button type="button" class="${byQuadro ? 'active' : ''}" data-reader-view="quadro" aria-pressed="${byQuadro ? 'true' : 'false'}"><i class="fa-solid fa-table-cells-large"></i><span>Por quadro</span></button>
        </div>
        <button type="button" class="journal-like-btn edition-thumbs-toggle" data-thumbs-toggle aria-label="Ver todas as páginas" aria-expanded="false"><i class="fa-solid fa-grip"></i><span>Páginas</span></button>
        <span class="edition-like-slot">${likeButton(post)}</span>
        ${commentsButton(post)}
      </div>
    </div>
    <div class="edition-reader-progress"><span data-reader-progress></span></div>
    <div class="edition-thumbs-backdrop" data-thumbs-close></div>
    <div class="edition-article-scroll edition-pages-scroll" data-reader-scroll>
      ${quadros.length > 1 ? `
        <nav class="edition-qnav" aria-label="Quadros da edição">
          ${quadros.map((q, index) => `
            <button type="button" class="edition-qnav-item ${byQuadro && index === current ? 'active' : ''}" data-quadro="${q.quadro}" data-reader-quadro="${index}">
              <span class="edition-toc-dot"></span>${esc(quadroTitle(q))}
            </button>`).join('')}
        </nav>` : ''}
      <div class="edition-pages-layout">
      ${renderThumbs(quadros, pages, byQuadro ? current : null)}
      <div class="edition-pages">
        ${groups.map((group) => {
          const q = quadros[group.qi];
          const label = QUADROS[q.quadro];
          return `
            <section class="edition-pgroup" data-quadro="${q.quadro}" data-q-index="${group.qi}">
              ${byQuadro ? `
                <header class="edition-q-head">
                  <span class="edition-q-tag">${esc(label)}</span>
                  ${q.title && q.title !== label ? `<h2 class="edition-q-title">${esc(q.title)}</h2>` : ''}
                </header>` : ''}
              ${group.pages.map(({ item, number, gi }) => {
                const index = zoomIndex++;
                const size = item.w && item.h ? `width="${item.w}" height="${item.h}"` : '';
                return `
                  <figure class="edition-page" data-gpage="${gi}">
                    <button type="button" class="edition-page-btn" data-page-zoom="${index}" aria-label="Ampliar a página ${number}">
                      <img ${imgAttrs(item.url)} ${size} ${index < 2 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" alt="${esc((item.alt || `Página ${number}`).slice(0, 200))}">
                    </button>
                    <figcaption>
                      <span class="edition-page-num">Página ${number}</span>
                      ${item.alt ? `
                        <details class="edition-fig-text">
                          <summary><i class="fa-solid fa-align-left"></i> Texto da página</summary>
                          <p>${esc(item.alt).replace(/\n/g, '<br>')}</p>
                        </details>` : ''}
                    </figcaption>
                  </figure>`;
              }).join('')}
            </section>`;
        }).join('')}
      </div>
      </div>
      <footer class="edition-article-end edition-pages-end">
        ${byQuadro && quadros.length > 1 ? `
          <div class="edition-qsteps">
            ${current > 0 ? `<button type="button" class="btn btn-ghost btn-sm" data-reader-quadro="${current - 1}"><i class="fa-solid fa-arrow-left"></i> ${esc(quadroTitle(quadros[current - 1]))}</button>` : '<span></span>'}
            ${current < quadros.length - 1 ? `<button type="button" class="btn btn-primary btn-sm" data-reader-quadro="${current + 1}">${esc(quadroTitle(quadros[current + 1]))} <i class="fa-solid fa-arrow-right"></i></button>` : ''}
          </div>` : ''}
        <div class="edition-end-title">${byQuadro ? 'Fim do quadro' : 'Fim da edição'}</div>
        <p>Gostou? Deixe seu like e comente o que achou.</p>
        <div class="edition-end-actions">
          <span class="edition-like-slot">${likeButton(post)}</span>
          ${commentsButton(post)}
        </div>
      </footer>
    </div>`;
}

/* Coluna de miniaturas: todas as páginas da edição, separadas por quadro. */
function renderThumbs(quadros, pages, onlyQuadro) {
  const esc = ctx.Utils.escapeHtml;
  return `
    <aside class="edition-thumbs" data-thumbs aria-label="Páginas da edição">
      <div class="edition-thumbs-head">
        <span>Páginas</span>
        <button type="button" class="social-icon-btn edition-thumbs-close" data-thumbs-close aria-label="Fechar lista de páginas"><i class="fa-solid fa-xmark"></i></button>
      </div>
      ${quadros.map((q, qi) => {
        const own = pages.filter((p) => p.qi === qi);
        if (!own.length) return '';
        return `
          <div class="edition-thumbs-group ${onlyQuadro !== null && onlyQuadro !== qi ? 'is-other' : ''}" data-quadro="${q.quadro}">
            <div class="edition-thumbs-label"><span class="edition-toc-dot"></span>${esc(quadroTitle(q))}</div>
            <div class="edition-thumbs-grid">
              ${own.map((p) => `
                <button type="button" class="edition-thumb" data-goto-page="${p.gi}" data-thumb-q="${qi}" aria-label="Ir para a página ${p.number}">
                  <img src="${esc(lightVariantUrl(p.item.url) || p.item.url)}" data-full-src="${esc(p.item.url)}" onerror="this.onerror=null;this.src=this.dataset.fullSrc" loading="lazy" decoding="async" alt="">
                  <span>${p.number}</span>
                </button>`).join('')}
            </div>
          </div>`;
      }).join('')}
    </aside>`;
}

function scrollToPage(root, gi, smooth) {
  const scroller = root.querySelector('[data-reader-scroll]');
  const target = root.querySelector(`[data-gpage="${gi}"]`);
  if (!scroller || !target) return;
  const nav = root.querySelector('.edition-qnav');
  const offset = (nav ? nav.offsetHeight : 0) + 12;
  const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - offset;
  scroller.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
}

/* Marca na coluna a página que está na tela e mantém a miniatura visível. */
function syncActiveThumb(root) {
  const scroller = root.querySelector('[data-reader-scroll]');
  const thumbs = root.querySelector('[data-thumbs]');
  if (!scroller || !thumbs) return;
  const line = scroller.getBoundingClientRect().top + scroller.clientHeight * 0.35;
  let active = null;
  root.querySelectorAll('[data-gpage]').forEach((fig) => {
    if (fig.getBoundingClientRect().top <= line) active = fig.dataset.gpage;
  });
  if (active === null) active = root.querySelector('[data-gpage]')?.dataset.gpage ?? null;
  thumbs.querySelectorAll('.edition-thumb').forEach((btn) => {
    const on = btn.dataset.gotoPage === active;
    if (on === btn.classList.contains('active')) return;
    btn.classList.toggle('active', on);
    if (on) {
      const box = thumbs.getBoundingClientRect();
      const r = btn.getBoundingClientRect();
      if (r.top < box.top + 40 || r.bottom > box.bottom - 10) {
        thumbs.scrollTo({ top: thumbs.scrollTop + (r.top - box.top) - box.height / 3, behavior: 'smooth' });
      }
    }
  });
}

function setThumbsOpen(root, open) {
  root.classList.toggle('show-thumbs', open);
  root.querySelector('[data-thumbs-toggle]')?.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function switchReaderView(post, view, current) {
  reader.view = view;
  reader.current = current;
  reader.keepView = true;
  openEditionReader(post.id, { jump: current });
}

/* ── Zoom de página: pinça, arrastar, duplo toque, roda do mouse e setas ── */

function openPageZoom(urls, index) {
  closePageZoom();
  const root = document.createElement('div');
  root.className = 'edition-zoom';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = `
    <div class="edition-zoom-stage" data-zoom-stage><img data-zoom-img alt="" draggable="false"></div>
    <div class="edition-zoom-bar">
      <button type="button" class="social-icon-btn" data-zoom-prev aria-label="Página anterior"><i class="fa-solid fa-chevron-left"></i></button>
      <span data-zoom-count></span>
      <button type="button" class="social-icon-btn" data-zoom-next aria-label="Próxima página"><i class="fa-solid fa-chevron-right"></i></button>
      <button type="button" class="social-icon-btn" data-zoom-close aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="edition-zoom-hint">Pince ou toque duas vezes para dar zoom</div>`;
  document.body.appendChild(root);
  Object.assign(zoom, { root, pages: urls, index, pointers: new Map(), pinch: null });
  showZoomPage(index);

  const stage = root.querySelector('[data-zoom-stage]');
  root.querySelector('[data-zoom-close]').addEventListener('click', closePageZoom);
  root.querySelector('[data-zoom-prev]').addEventListener('click', () => showZoomPage(zoom.index - 1));
  root.querySelector('[data-zoom-next]').addEventListener('click', () => showZoomPage(zoom.index + 1));

  let lastTap = 0;
  let drag = null;
  stage.addEventListener('pointerdown', (event) => {
    try { stage.setPointerCapture(event.pointerId); } catch { /* ponteiro já solto */ }
    zoom.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (zoom.pointers.size === 2) {
      const [a, b] = [...zoom.pointers.values()];
      zoom.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale: zoom.scale, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, x: zoom.x, y: zoom.y };
      drag = null;
      return;
    }
    const now = Date.now();
    if (now - lastTap < 300) {
      zoomAt(zoom.scale > 1.05 ? 1 : 2.5, event.clientX, event.clientY);
      lastTap = 0;
      drag = null;
      return;
    }
    lastTap = now;
    drag = { x: event.clientX, y: event.clientY, tx: zoom.x, ty: zoom.y, onImage: event.target.matches('[data-zoom-img]') };
  });
  stage.addEventListener('pointermove', (event) => {
    if (!zoom.pointers.has(event.pointerId)) return;
    zoom.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (zoom.pinch && zoom.pointers.size >= 2) {
      const [a, b] = [...zoom.pointers.values()];
      const scale = clampScale(zoom.pinch.scale * (Math.hypot(a.x - b.x, a.y - b.y) / zoom.pinch.dist));
      const center = stageCenter();
      const ratio = scale / zoom.pinch.scale;
      zoom.scale = scale;
      zoom.x = (zoom.pinch.x - (zoom.pinch.cx - center.x)) * ratio + ((a.x + b.x) / 2 - center.x);
      zoom.y = (zoom.pinch.y - (zoom.pinch.cy - center.y)) * ratio + ((a.y + b.y) / 2 - center.y);
      applyZoom();
    } else if (drag && zoom.scale > 1.02) {
      zoom.x = drag.tx + (event.clientX - drag.x);
      zoom.y = drag.ty + (event.clientY - drag.y);
      applyZoom();
    }
  });
  const end = (event) => {
    zoom.pointers.delete(event.pointerId);
    if (zoom.pointers.size < 2) zoom.pinch = null;
    if (drag && zoom.scale <= 1.02 && zoom.pointers.size === 0) {
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        showZoomPage(zoom.index + (dx < 0 ? 1 : -1));
      } else if (!drag.onImage && Math.abs(dx) < 8 && Math.abs(dy) < 8) {
        // Toque fora da página fecha (espera um pouco para não brigar com o duplo toque).
        const tapAt = lastTap;
        setTimeout(() => { if (lastTap === tapAt && zoom.root === root && zoom.scale <= 1.02) closePageZoom(); }, 320);
      }
    }
    if (zoom.pointers.size === 0) drag = null;
    if (zoom.scale <= 1.02 && zoom.pointers.size === 0) resetZoom();
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  stage.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoomAt(zoom.scale * (event.deltaY < 0 ? 1.2 : 1 / 1.2), event.clientX, event.clientY);
  }, { passive: false });

  zoom.keyHandler = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePageZoom(); }
    else if (event.key === 'ArrowRight') showZoomPage(zoom.index + 1);
    else if (event.key === 'ArrowLeft') showZoomPage(zoom.index - 1);
  };
  document.addEventListener('keydown', zoom.keyHandler, true);
  root.querySelector('[data-zoom-close]').focus({ preventScroll: true });
}

function clampScale(scale) {
  return Math.min(5, Math.max(1, scale));
}

function stageCenter() {
  const rect = zoom.root.querySelector('[data-zoom-stage]').getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function zoomAt(target, clientX, clientY) {
  const scale = clampScale(target);
  const center = stageCenter();
  const ratio = scale / zoom.scale;
  zoom.x = (zoom.x - (clientX - center.x)) * ratio + (clientX - center.x);
  zoom.y = (zoom.y - (clientY - center.y)) * ratio + (clientY - center.y);
  zoom.scale = scale;
  if (scale <= 1.02) resetZoom();
  else applyZoom();
}

function resetZoom() {
  zoom.scale = 1;
  zoom.x = 0;
  zoom.y = 0;
  applyZoom();
}

function applyZoom() {
  const img = zoom.root?.querySelector('[data-zoom-img]');
  if (!img) return;
  // Não deixa a página sair da tela ao arrastar.
  const limitX = (img.offsetWidth * (zoom.scale - 1)) / 2;
  const limitY = (img.offsetHeight * (zoom.scale - 1)) / 2;
  zoom.x = Math.max(-limitX, Math.min(limitX, zoom.x));
  zoom.y = Math.max(-limitY, Math.min(limitY, zoom.y));
  img.style.transform = `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`;
  zoom.root.classList.toggle('is-zoomed', zoom.scale > 1.02);
}

function showZoomPage(index) {
  if (!zoom.root || index < 0 || index >= zoom.pages.length) return;
  zoom.index = index;
  const img = zoom.root.querySelector('[data-zoom-img]');
  img.src = zoom.pages[index];
  zoom.root.querySelector('[data-zoom-count]').textContent = `${index + 1} / ${zoom.pages.length}`;
  zoom.root.querySelector('[data-zoom-prev]').disabled = index === 0;
  zoom.root.querySelector('[data-zoom-next]').disabled = index === zoom.pages.length - 1;
  // Já busca a próxima para virar a página sem esperar.
  if (zoom.pages[index + 1]) { const next = new Image(); next.src = zoom.pages[index + 1]; }
  resetZoom();
}

function closePageZoom() {
  if (zoom.keyHandler) document.removeEventListener('keydown', zoom.keyHandler, true);
  zoom.keyHandler = null;
  zoom.root?.remove();
  zoom.root = null;
  zoom.pointers = new Map();
  zoom.pinch = null;
}

function bindReader(root, post) {
  const scroller = root.querySelector('[data-reader-scroll]');
  const progress = root.querySelector('[data-reader-progress]');
  root.querySelectorAll('[data-reader-close]').forEach((btn) => btn.addEventListener('click', closeEditionReader));
  root.querySelector('[data-reader-toc]')?.addEventListener('change', (event) => {
    if (event.target.value !== '') scrollToQuadro(root, Number(event.target.value), true);
    event.target.value = '';
  });
  root.querySelectorAll('[data-reader-full]').forEach((btn) => btn.addEventListener('click', () => {
    const from = reader.only;
    openEditionReader(post.id, { jump: from });
  }));
  root.querySelectorAll('.edition-like-slot').forEach((slot) => slot.addEventListener('click', () => {
    ctx.toggleJournalLike(post.id, slot);
    syncReaderLikes(root, post);
  }));
  root.querySelectorAll('[data-reader-comments]').forEach((btn) => btn.addEventListener('click', () => ctx.openPost(post.id, { keepReader: true })));
  root.querySelectorAll('[data-edition-zoom]').forEach((btn) => btn.addEventListener('click', () => ctx.openImage(btn.dataset.editionZoom)));
  if (reader.pages) {
    const quadros = getEditionQuadros(post);
    const shownPages = reader.view === 'quadro' ? pageList(quadros).filter((p) => p.qi === reader.current) : pageList(quadros);
    const urls = shownPages.map((p) => p.item.url);
    root.querySelectorAll('[data-page-zoom]').forEach((btn) => btn.addEventListener('click', () => openPageZoom(urls, Number(btn.dataset.pageZoom))));
    root.querySelectorAll('[data-reader-view]').forEach((btn) => btn.addEventListener('click', () => {
      const view = btn.dataset.readerView;
      if (view === reader.view) return;
      switchReaderView(post, view, view === 'quadro' ? visibleQuadro(root) : reader.current);
    }));
    root.querySelectorAll('[data-reader-quadro]').forEach((btn) => btn.addEventListener('click', () => {
      const index = Number(btn.dataset.readerQuadro);
      if (reader.view === 'quadro') switchReaderView(post, 'quadro', index);
      else scrollToQuadro(root, index, true);
    }));
    root.querySelectorAll('[data-goto-page]').forEach((btn) => btn.addEventListener('click', () => {
      const gi = Number(btn.dataset.gotoPage);
      const qi = Number(btn.dataset.thumbQ);
      setThumbsOpen(root, false);
      if (reader.view === 'quadro' && qi !== reader.current) {
        reader.pendingPage = gi;
        switchReaderView(post, 'quadro', qi);
        return;
      }
      scrollToPage(root, gi, true);
    }));
    root.querySelector('[data-thumbs-toggle]')?.addEventListener('click', () => setThumbsOpen(root, !root.classList.contains('show-thumbs')));
    root.querySelectorAll('[data-thumbs-close]').forEach((el) => el.addEventListener('click', () => setThumbsOpen(root, false)));
    let ticking = false;
    scroller.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { ticking = false; syncActiveThumb(root); });
    }, { passive: true });
  }

  scroller.addEventListener('scroll', () => {
    const max = scroller.scrollHeight - scroller.clientHeight;
    progress.style.width = `${max > 0 ? Math.min(100, (scroller.scrollTop / max) * 100) : 100}%`;
  }, { passive: true });

  reader.keyHandler = (event) => {
    if (document.querySelector('.journal-modal.open') || zoom.root) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeEditionReader();
    }
  };
  document.addEventListener('keydown', reader.keyHandler);
}

function syncReaderLikes(root, post) {
  const liked = Boolean(post.liked_by_me);
  const count = Number(post.likes_count || 0);
  root.querySelectorAll(`[data-like-journal-post="${post.id}"]`).forEach((btn) => {
    btn.classList.toggle('active', liked);
    btn.setAttribute('aria-pressed', liked ? 'true' : 'false');
    btn.innerHTML = `<i class="fa-${liked ? 'solid' : 'regular'} fa-thumbs-up"></i><span>${count.toLocaleString('pt-BR')}</span>`;
  });
}

/* Quadro que está na tela agora (para trocar de modo sem perder o lugar). */
function visibleQuadro(root) {
  const scroller = root.querySelector('[data-reader-scroll]');
  const top = scroller.getBoundingClientRect().top + 80;
  let found = 0;
  root.querySelectorAll('[data-q-index]').forEach((section) => {
    if (section.getBoundingClientRect().top <= top) found = Number(section.dataset.qIndex);
  });
  return found;
}

function scrollToQuadro(root, index, smooth) {
  const scroller = root.querySelector('[data-reader-scroll]');
  const target = root.querySelector(`[data-q-index="${index}"]`);
  if (!scroller || !target) return;
  const top = target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 8;
  scroller.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
}

export function closeEditionReader() {
  closePageZoom();
  const root = document.getElementById('journalEditionReader');
  root?.classList.remove('open');
  if (root) root.innerHTML = '';
  if (reader.keyHandler) document.removeEventListener('keydown', reader.keyHandler);
  reader.keyHandler = null;
  reader.post = null;
  reader.only = null;
  if (!document.querySelector('.journal-modal.open')) document.body.classList.remove('social-modal-locked');
  try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* sem history */ }
}

export function isReaderOpen() {
  return Boolean(document.getElementById('journalEditionReader')?.classList.contains('open'));
}

/* ── Editor (redação) ────────────────────────────────────── */

function key() {
  seq += 1;
  return `k${seq}`;
}

function blankQuadro() {
  return { key: key(), quadro: 'geral', title: '', pages: null, items: [{ key: key(), type: 'paragraph', text: '' }] };
}

function hasRealContent() {
  return editor.quadros.some((q) => q.items.some((item) => item.type === 'image' || String(item.text || '').trim()));
}

function toEditorQuadro(q) {
  return {
    key: key(),
    quadro: QUADROS[q.quadro] ? q.quadro : 'geral',
    title: q.title || '',
    pages: q.pages || null,
    items: q.items.map((item) => ({ ...item, key: key(), caption: item.caption || '', alt: item.alt || '' })),
  };
}

function previewUrl(item) {
  if (item.url) return item.url;
  if (!item.preview) {
    item.preview = URL.createObjectURL(item.blob || item.file);
    editor.previews.push(item.preview);
  }
  return item.preview;
}

function releasePreviews() {
  editor.previews.forEach((url) => URL.revokeObjectURL(url));
  editor.previews = [];
}

export function openEditionEditor(post = null) {
  const esc = ctx.Utils.escapeHtml;
  const modal = document.getElementById('journalEditorModal');
  if (!modal) return;
  if (isReaderOpen()) closeEditionReader();
  releasePreviews();
  editor.post = post;
  editor.busy = false;
  editor.quadros = post ? getEditionQuadros(post).map(toEditorQuadro) : [blankQuadro()];
  const meta = post ? getEditionMeta(post) : { number: nextEditionNumber(), kind: 'regular' };
  const dateValue = toDateInput(post?.published_at) || nextSaturday();

  modal.innerHTML = `
    <div class="journal-modal-panel edition-editor-panel">
      <div class="journal-modal-head">
        <div>
          <div class="journal-kicker" style="margin-bottom:6px"><i class="fa-solid fa-book-open"></i>Edição do Jornal</div>
          <div class="journal-modal-title">${post ? 'Editar edição' : 'Nova edição'}</div>
        </div>
        <button type="button" class="social-icon-btn" data-close-journal-modal aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <form class="journal-modal-body" id="editionEditorForm" novalidate>
        <div class="journal-editor">
          <div class="journal-editor-grid">
            <div class="journal-field"><label>Título</label><input name="title" required maxlength="140" value="${esc(post?.title || '')}" placeholder="Ex.: Corvinho assume o plantão"></div>
            <div class="journal-field"><label>Número</label><input name="number" type="number" min="1" max="9999" value="${meta.number || ''}"></div>
            <div class="journal-field"><label>Tipo</label><select name="kind">
              ${Object.entries(EDITION_KINDS).map(([value, label]) => `<option value="${value}" ${meta.kind === value ? 'selected' : ''}>${label}</option>`).join('')}
            </select></div>
            <div class="journal-field"><label>Data da edição</label><input name="date" type="date" required value="${dateValue}"></div>
            <div class="journal-field"><label>Publicação</label><select name="status">
              <option value="draft" ${(post?.status || 'draft') === 'draft' ? 'selected' : ''}>Rascunho (só a redação vê)</option>
              <option value="published" ${post?.status === 'published' ? 'selected' : ''}>Publicado</option>
              <option value="archived" ${post?.status === 'archived' ? 'selected' : ''}>Arquivado</option>
            </select></div>
            <div class="journal-field edition-checks">
              <label><input type="checkbox" name="comments_enabled" ${post?.comments_enabled === false ? '' : 'checked'}> Permitir comentários</label>
              <label><input type="checkbox" name="is_featured" ${post?.is_featured ? 'checked' : ''}> Destacar no topo do Jornal</label>
            </div>
            <div class="journal-field full"><label>Resumo</label><textarea name="summary" maxlength="400" placeholder="Uma ou duas frases sobre a edição.">${esc(post?.summary || '')}</textarea></div>

            <div class="journal-field full">
              <label>Quadros</label>
              <div class="edition-hint">Cada quadro é uma parte da edição (Plantão, Você Sabia?, Turma do Corvinho...). Escreva o texto, ponha fotos e mude a ordem com as setas. Não precisa de PDF. Quadros da <strong>Turma do Corvinho</strong> aparecem também na aba do gibi.</div>
              <div class="eq-list" data-quadros></div>
            </div>
            <details class="journal-field full edition-import">
              <summary><i class="fa-solid fa-file-pdf"></i> Já tem a edição em PDF? <strong>Importar e montar sozinho</strong> <span class="edition-optional">(opcional)</span></summary>
              <label class="edition-pdf-drop">
                <input type="file" accept="application/pdf,.pdf" hidden data-import-pdf>
                <i class="fa-solid fa-wand-magic-sparkles"></i>
                <span data-import-label>Escolha o PDF e o portal monta os quadros sozinho: texto, fotos e páginas de arte. Depois dá para editar tudo.</span>
              </label>
              <div class="edition-import-mode">
                <label><input type="radio" name="import_mode" value="pages" data-import-mode-opt checked> <span><strong>Páginas do PDF</strong> (recomendado): cada página igualzinha à diagramação, em alta qualidade</span></label>
                <label><input type="radio" name="import_mode" value="extract" data-import-mode-opt> <span><strong>Separar texto e fotos</strong>: vira texto corrido, tipo site de notícia</span></label>
              </div>
              <label class="edition-ocr"><input type="checkbox" data-import-ocr> Ler também o texto das páginas que são só imagem (OCR, mais lento)</label>
            </details>
          </div>
          <div class="edition-progress" data-edition-progress hidden>
            <div class="edition-progress-text" data-progress-text></div>
            <div class="edition-progress-bar"><span data-progress-bar></span></div>
          </div>
        </div>
      </form>
      <div class="journal-modal-foot">
        ${post ? '<button type="button" class="btn btn-ghost edition-delete-btn edition-foot-delete" data-editor-delete><i class="fa-solid fa-trash"></i> Excluir edição</button>' : ''}
        <button type="button" class="btn btn-ghost" data-close-journal-modal>Cancelar</button>
        <button type="submit" form="editionEditorForm" class="btn btn-primary" data-edition-save><i class="fa-solid fa-floppy-disk"></i> Salvar edição</button>
      </div>
    </div>`;

  ctx.openModal(modal);
  renderQuadroList(modal);
  bindEditor(modal);
}

function renderQuadroList(modal) {
  const list = modal.querySelector('[data-quadros]');
  if (!list) return;
  list.innerHTML = `
    ${editor.quadros.map((q, qi) => renderQuadroEditor(q, qi)).join('')}
    ${editor.quadros.length ? '' : '<div class="eq-empty">Nenhum quadro ainda. Adicione o primeiro quadro (ou importe um PDF lá embaixo).</div>'}
    <button type="button" class="btn btn-ghost eq-add-quadro" data-act="q-add"><i class="fa-solid fa-plus"></i> Novo quadro</button>`;
}

function iconBtn(act, icon, label, disabled = false, extra = '') {
  return `<button type="button" class="social-icon-btn ${extra}" data-act="${act}" aria-label="${label}" title="${label}" ${disabled ? 'disabled' : ''}><i class="fa-solid ${icon}"></i></button>`;
}

function renderQuadroEditor(q, qi) {
  const esc = ctx.Utils.escapeHtml;
  const last = editor.quadros.length - 1;
  return `
    <div class="eq-card" data-quadro="${q.quadro}" data-q="${qi}">
      <div class="eq-head">
        <span class="edition-toc-dot"></span>
        <select data-field="quadro" aria-label="Quadro">
          ${Object.entries(QUADROS).map(([value, label]) => `<option value="${value}" ${q.quadro === value ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
        <input data-field="title" maxlength="120" placeholder="Título (opcional)" value="${esc(q.title)}" aria-label="Título do quadro">
        <div class="eq-tools">
          ${iconBtn('q-up', 'fa-arrow-up', 'Subir quadro', qi === 0)}
          ${iconBtn('q-down', 'fa-arrow-down', 'Descer quadro', qi === last)}
          ${iconBtn('q-merge', 'fa-object-group', 'Juntar com o quadro de cima', qi === 0)}
          ${iconBtn('q-remove', 'fa-trash', 'Remover quadro', false, 'danger')}
        </div>
      </div>
      ${q.pages ? `<div class="eq-from"><i class="fa-solid fa-file-pdf"></i> Do PDF: página${q.pages[0] === q.pages[1] ? ` ${q.pages[0]}` : `s ${q.pages[0]}–${q.pages[1]}`}</div>` : ''}
      <div class="eq-items">
        ${q.items.length ? q.items.map((item, ii) => renderItemEditor(item, ii, q.items.length)).join('') : '<div class="eq-empty">Quadro vazio. Adicione texto ou fotos.</div>'}
      </div>
      <div class="eq-add">
        <button type="button" class="btn btn-ghost btn-sm" data-act="add-paragraph"><i class="fa-solid fa-align-left"></i> Texto</button>
        <button type="button" class="btn btn-ghost btn-sm" data-act="add-heading"><i class="fa-solid fa-heading"></i> Subtítulo</button>
        <button type="button" class="btn btn-ghost btn-sm" data-act="add-quote"><i class="fa-solid fa-quote-left"></i> Destaque</button>
        <label class="btn btn-ghost btn-sm"><input type="file" accept="image/*" multiple hidden data-add-images><i class="fa-solid fa-image"></i> Fotos</label>
      </div>
    </div>`;
}

function renderItemEditor(item, ii, count) {
  const esc = ctx.Utils.escapeHtml;
  const tools = `
    <div class="eq-item-tools">
      ${iconBtn('i-up', 'fa-arrow-up', 'Subir', ii === 0)}
      ${iconBtn('i-down', 'fa-arrow-down', 'Descer', ii === count - 1)}
      ${iconBtn('i-split', 'fa-scissors', 'Começar um quadro novo aqui', ii === 0)}
      ${iconBtn('i-remove', 'fa-trash', 'Remover', false, 'danger')}
    </div>`;
  if (item.type === 'image') {
    return `
      <div class="eq-item is-image" data-i="${ii}">
        <img class="eq-thumb ${item.full ? 'is-full' : ''}" src="${esc(previewUrl(item))}" alt="">
        <div class="eq-item-fields">
          <input data-field="caption" maxlength="300" placeholder="Legenda (opcional)" value="${esc(item.caption)}" aria-label="Legenda">
          <label class="eq-check"><input type="checkbox" data-field="full" ${item.full ? 'checked' : ''}> Página inteira (arte, gibi)</label>
          <details ${item.alt ? '' : ''}>
            <summary>Texto da imagem ${item.alt ? '<span class="edition-optional">(lido do PDF)</span>' : '<span class="edition-optional">(opcional)</span>'}</summary>
            <textarea data-field="alt" rows="4" maxlength="4000" placeholder="O texto escrito na imagem. Aparece em &quot;Ler o texto desta página&quot;.">${esc(item.alt)}</textarea>
          </details>
        </div>
        ${tools}
      </div>`;
  }
  const labels = { heading: ['fa-heading', 'Subtítulo'], paragraph: ['fa-align-left', 'Texto'], quote: ['fa-quote-left', 'Destaque'] };
  const [icon, label] = labels[item.type];
  const field = item.type === 'heading'
    ? `<input data-field="text" maxlength="200" value="${esc(item.text)}" placeholder="Subtítulo" aria-label="Subtítulo">`
    : `<textarea data-field="text" rows="${Math.min(10, Math.max(2, Math.ceil(item.text.length / 90)))}" maxlength="8000" placeholder="${item.type === 'quote' ? 'Frase em destaque' : 'Escreva o texto'}" aria-label="${label}">${esc(item.text)}</textarea>`;
  return `
    <div class="eq-item is-${item.type}" data-i="${ii}">
      <span class="eq-item-type" title="${label}"><i class="fa-solid ${icon}"></i></span>
      ${field}
      ${tools}
    </div>`;
}

function locate(target) {
  const card = target.closest('[data-q]');
  const row = target.closest('[data-i]');
  const qi = card ? Number(card.dataset.q) : -1;
  const ii = row ? Number(row.dataset.i) : -1;
  return { qi, ii, q: editor.quadros[qi], item: editor.quadros[qi]?.items[ii] };
}

function swap(list, a, b) {
  if (a < 0 || b < 0 || a >= list.length || b >= list.length) return;
  [list[a], list[b]] = [list[b], list[a]];
}

function bindEditor(modal) {
  modal.querySelector('[data-editor-delete]')?.addEventListener('click', async () => {
    if (editor.busy || !editor.post) return;
    const deleted = await ctx.deletePost(editor.post);
    if (deleted) ctx.closeModal(modal);
  });
  const form = modal.querySelector('#editionEditorForm');
  const list = modal.querySelector('[data-quadros]');
  modal.querySelectorAll('[data-close-journal-modal]').forEach((btn) => btn.addEventListener('click', () => {
    if (editor.busy) return;
    ctx.closeModal(modal);
  }));
  modal.onclick = (event) => { if (event.target === modal && !editor.busy) ctx.closeModal(modal); };

  // Texto digitado vai direto para o modelo (sem redesenhar a lista).
  list.addEventListener('input', (event) => {
    const field = event.target.dataset.field;
    if (!field) return;
    const { q, item } = locate(event.target);
    if (!q) return;
    if (item && ['text', 'caption', 'alt'].includes(field)) item[field] = event.target.value;
    else if (!item && field === 'title') q.title = event.target.value;
  });
  list.addEventListener('change', async (event) => {
    const { q, item } = locate(event.target);
    if (!q) return;
    if (event.target.matches('[data-add-images]')) {
      addImages(q, [...(event.target.files || [])]);
      event.target.value = '';
      rerender(modal);
      return;
    }
    const field = event.target.dataset.field;
    if (field === 'quadro' && !item) {
      q.quadro = QUADROS[event.target.value] ? event.target.value : 'geral';
      event.target.closest('.eq-card').dataset.quadro = q.quadro;
    } else if (field === 'full' && item) {
      item.full = event.target.checked;
      event.target.closest('.eq-item')?.querySelector('.eq-thumb')?.classList.toggle('is-full', item.full);
    }
  });
  list.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-act]');
    if (!btn || btn.disabled || editor.busy) return;
    const act = btn.dataset.act;
    const { qi, ii, q } = locate(btn);
    const quadros = editor.quadros;
    if (act === 'q-add') {
      quadros.push(blankQuadro());
    } else if (act === 'q-up') swap(quadros, qi, qi - 1);
    else if (act === 'q-down') swap(quadros, qi, qi + 1);
    else if (act === 'q-merge' && qi > 0) {
      const prev = quadros[qi - 1];
      prev.items.push(...q.items);
      if (prev.pages && q.pages) prev.pages = [prev.pages[0], q.pages[1]];
      quadros.splice(qi, 1);
    } else if (act === 'q-remove') {
      if (q.items.length && !await ctx.confirm(`Remover o quadro "${quadroTitle(q)}" e tudo o que tem nele?`)) return;
      quadros.splice(qi, 1);
    } else if (act === 'add-paragraph' || act === 'add-heading' || act === 'add-quote') {
      q.items.push({ key: key(), type: act.slice(4), text: '' });
    } else if (act === 'i-up') swap(q.items, ii, ii - 1);
    else if (act === 'i-down') swap(q.items, ii, ii + 1);
    else if (act === 'i-remove') q.items.splice(ii, 1);
    else if (act === 'i-split' && ii > 0) {
      const moved = q.items.splice(ii);
      quadros.splice(qi + 1, 0, { key: key(), quadro: q.quadro, title: '', pages: null, items: moved });
    } else return;
    rerender(modal, act.startsWith('add-') || act === 'q-add' ? { qi: act === 'q-add' ? quadros.length - 1 : qi, focusLast: true } : null);
  });

  modal.querySelector('[data-import-pdf]')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) runImport(modal, form, file);
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    saveEdition(modal, form);
  });
}

function rerender(modal, focus = null) {
  const body = modal.querySelector('.journal-modal-body');
  const scroll = body?.scrollTop || 0;
  renderQuadroList(modal);
  if (body) body.scrollTop = scroll;
  if (focus?.focusLast) {
    const card = modal.querySelector(`[data-q="${focus.qi}"]`);
    const fields = card?.querySelectorAll('[data-i] [data-field="text"]');
    const last = fields?.[fields.length - 1];
    last?.focus();
  }
}

function addImages(q, files) {
  files.forEach((file) => {
    if (!file.type.startsWith('image/')) {
      ctx.Utils.showToast(`"${file.name}" não é uma imagem.`, 'error');
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      ctx.Utils.showToast(`"${file.name}" passa de ${MAX_IMAGE_MB} MB.`, 'error');
      return;
    }
    q.items.push({ key: key(), type: 'image', file, url: null, path: null, w: null, h: null, full: false, caption: '', alt: '' });
  });
}

async function runImport(modal, form, file) {
  if (editor.busy) return;
  if (file.type && file.type !== 'application/pdf') return ctx.Utils.showToast('Escolha um arquivo PDF.', 'error');
  if (file.size > MAX_PDF_MB * 1024 * 1024) return ctx.Utils.showToast(`PDF muito grande (máx. ${MAX_PDF_MB} MB).`, 'error');
  const hasContent = hasRealContent();
  if (hasContent && !await ctx.confirm('Trocar os quadros atuais pelo conteúdo deste PDF?')) return;

  const label = modal.querySelector('[data-import-label]');
  const saveBtn = modal.querySelector('[data-edition-save]');
  editor.busy = true;
  saveBtn.disabled = true;
  label.textContent = `Lendo ${file.name}...`;
  try {
    const ocr = Boolean(modal.querySelector('[data-import-ocr]')?.checked);
    const mode = modal.querySelector('[data-import-mode-opt]:checked')?.value === 'extract' ? 'extract' : 'pages';
    const result = await importEditionPdf(file, { ocr, mode, onProgress: (text, ratio) => setProgress(modal, text, ratio) });
    editor.quadros = result.quadros.map(toEditorQuadro);
    if (!form.elements.title.value.trim()) form.elements.title.value = file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 140);
    const images = result.quadros.reduce((n, q) => n + q.items.filter((item) => item.type === 'image').length, 0);
    const texts = result.quadros.reduce((n, q) => n + q.items.filter((item) => item.type !== 'image').length, 0);
    label.textContent = mode === 'pages'
      ? `${file.name}: ${countLabel(result.pageCount, 'página', 'páginas')} em ${countLabel(editor.quadros.length, 'quadro', 'quadros')}. Confira se cada página caiu no quadro certo.`
      : `${file.name}: ${result.pageCount} páginas → ${countLabel(editor.quadros.length, 'quadro', 'quadros')}, ${countLabel(texts, 'texto', 'textos')} e ${countLabel(images, 'imagem', 'imagens')}. Revise abaixo.`;
    renderQuadroList(modal);
    ctx.Utils.showToast('PDF importado. Revise os quadros antes de salvar.', 'success');
  } catch (err) {
    console.error('[MSY][jornal-edicoes] Erro ao importar PDF:', err);
    label.textContent = 'Não foi possível ler este PDF. Tente outro arquivo.';
    ctx.Utils.showToast('Erro ao importar o PDF.', 'error');
  } finally {
    editor.busy = false;
    saveBtn.disabled = false;
    modal.querySelector('[data-edition-progress]')?.setAttribute('hidden', '');
  }
}

function setProgress(modal, text, ratio = null) {
  const box = modal.querySelector('[data-edition-progress]');
  if (!box) return;
  box.hidden = false;
  box.querySelector('[data-progress-text]').textContent = text;
  if (ratio !== null) box.querySelector('[data-progress-bar]').style.width = `${Math.round(Math.min(1, ratio) * 100)}%`;
}

/* Gera a versão final (e a leve) de uma imagem nova. GIF sobe como está (animação). */
async function prepareImage(item) {
  const source = item.blob || item.file;
  if (item.file && item.file.type === 'image/gif') {
    const bitmap = await createImageBitmap(item.file);
    const size = { w: bitmap.width, h: bitmap.height };
    bitmap.close?.();
    return { full: item.file, light: null, ext: 'gif', ...size };
  }
  const bitmap = await createImageBitmap(source);
  const maxWidth = item.full ? FULL_WIDTH : PHOTO_WIDTH;
  let full = null;
  let canvas = null;
  if (item.blob && bitmap.width <= maxWidth) {
    full = item.blob; // já veio pronta da importação
  } else {
    canvas = scaleCanvas(bitmap, Math.min(maxWidth, bitmap.width), true);
    full = await canvasToBlob(canvas, 0.86, true);
  }
  const width = canvas ? canvas.width : bitmap.width;
  const height = canvas ? canvas.height : bitmap.height;
  let light = null;
  if (width > LIGHT_WIDTH) {
    const lightCanvas = scaleCanvas(canvas || bitmap, LIGHT_WIDTH, true);
    light = await canvasToBlob(lightCanvas, 0.78, true);
    releaseCanvas(lightCanvas);
  }
  if (canvas) releaseCanvas(canvas);
  bitmap.close?.();
  const ext = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' }[full.type] || 'webp';
  return { full, light, ext, w: width, h: height };
}

async function uploadNewImages(modal, pending) {
  const storage = createMediaStorage(ctx.db).from(BUCKET);
  const stamp = Date.now();
  const batch = ctx.createUploadId().slice(0, 8);
  const uploaded = [];
  try {
    for (let n = 0; n < pending.length; n += 1) {
      const item = pending[n];
      setProgress(modal, `Enviando imagem ${n + 1} de ${pending.length}...`, n / pending.length);
      const image = await prepareImage(item);
      const path = `${ctx.state.profile.id}/edicoes/${stamp}-${batch}-${String(n + 1).padStart(3, '0')}.${image.ext}`;
      const { error } = await storage.upload(path, image.full, { cacheControl: '31536000', upsert: false, contentType: image.full.type });
      if (error) throw error;
      uploaded.push(path);
      const lightPath = image.light ? lightVariantPath(path) : null;
      if (lightPath) {
        const { error: lightError } = await storage.upload(lightPath, image.light, { cacheControl: '31536000', upsert: true, contentType: image.light.type });
        if (lightError) console.warn('[MSY][jornal-edicoes] Versão leve não enviada:', lightError);
        else uploaded.push(lightPath);
      }
      item.url = storage.getPublicUrl(path).data.publicUrl;
      item.path = path;
      item.w = image.w;
      item.h = image.h;
    }
    setProgress(modal, 'Imagens enviadas. Salvando a edição...', 1);
    return uploaded;
  } catch (err) {
    if (uploaded.length) await storage.remove(uploaded).catch(() => null);
    pending.forEach((item) => { item.url = null; item.path = null; });
    throw err;
  }
}

function buildQuadroBlocks() {
  return editor.quadros.map((q) => ({
    type: 'quadro',
    quadro: QUADROS[q.quadro] ? q.quadro : 'geral',
    title: q.title.trim().slice(0, 120),
    items: q.items.map((item) => {
      if (item.type === 'image') {
        return { type: 'image', url: item.url, path: item.path, w: item.w || null, h: item.h || null, full: Boolean(item.full), caption: item.caption.trim(), alt: item.alt.trim(), ...(item.page ? { page: item.page } : {}) };
      }
      return { type: item.type, text: String(item.text || '').trim() };
    }).filter((item) => (item.type === 'image' ? Boolean(item.url) : Boolean(item.text))),
  })).filter((q) => q.items.length);
}

async function saveEdition(modal, form) {
  if (editor.busy) return;
  const post = editor.post;
  const saveBtn = modal.querySelector('[data-edition-save]');
  const title = form.elements.title.value.trim();
  const date = form.elements.date.value;
  if (!title) return ctx.Utils.showToast('Dê um título para a edição.', 'error');
  if (!date) return ctx.Utils.showToast('Escolha a data da edição.', 'error');
  const hasContent = hasRealContent();
  if (!hasContent) return ctx.Utils.showToast('A edição está vazia: importe um PDF ou escreva os quadros.', 'error');

  editor.busy = true;
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Salvando...';
  let uploaded = [];
  let createdId = null;
  try {
    const pending = editor.quadros.flatMap((q) => q.items).filter((item) => item.type === 'image' && !item.url);
    if (pending.length) uploaded = await uploadNewImages(modal, pending);

    const quadroBlocks = buildQuadroBlocks();
    const cover = firstImage(quadroBlocks);
    const payload = {
      title,
      summary: form.elements.summary.value.trim() || null,
      post_type: 'edition',
      section: 'edicoes',
      status: form.elements.status.value,
      comments_enabled: form.elements.comments_enabled.checked,
      is_featured: form.elements.is_featured.checked,
      published_at: new Date(`${date}T12:00:00-03:00`).toISOString(),
      cover_url: cover?.url || null,
      cover_storage_path: null,
      content_blocks: [
        { type: 'edition', number: Number(form.elements.number.value) || null, kind: form.elements.kind.value, format: 'quadros' },
        ...quadroBlocks,
      ],
      updated_at: new Date().toISOString(),
    };

    let postId = post?.id;
    if (post) {
      const { error } = await ctx.db.from('jornal_posts').update(payload).eq('id', post.id);
      if (error) throw error;
    } else {
      const { data, error } = await ctx.db.from('jornal_posts')
        .insert({ ...payload, author_id: ctx.state.profile.id })
        .select('id')
        .single();
      if (error) throw error;
      postId = data.id;
      createdId = data.id;
    }
    uploaded = [];

    if (post) await cleanupOldFiles(post, quadroBlocks);

    editor.busy = false;
    releasePreviews();
    ctx.closeModal(modal);
    ctx.Utils.showToast(post ? 'Edição atualizada.' : 'Edição criada.', 'success');
    await ctx.reload();
  } catch (err) {
    console.error('[MSY][jornal-edicoes] Erro ao salvar edição:', err);
    if (createdId) await ctx.db.from('jornal_posts').delete().eq('id', createdId).then(() => null, () => null);
    if (uploaded.length) await createMediaStorage(ctx.db).from(BUCKET).remove(uploaded).catch(() => null);
    const hint = /check constraint|violates/i.test(err?.message || '') ? ' Rode a migration 20261126_jornal_edicoes.sql no Supabase.' : '';
    ctx.Utils.showToast(`Erro ao salvar a edição.${hint}`, 'error');
    editor.busy = false;
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar edição';
    modal.querySelector('[data-edition-progress]')?.setAttribute('hidden', '');
  }
}

/* Depois de salvar: tira as páginas do formato antigo e apaga do R2 o que saiu da edição. */
async function cleanupOldFiles(post, quadroBlocks) {
  const keep = new Set();
  quadroBlocks.forEach((q) => q.items.forEach((item) => { if (item.path) keep.add(item.path); }));
  const oldPaths = new Set();
  getEditionQuadros(post).forEach((q) => q.items.forEach((item) => { if (item.path) oldPaths.add(item.path); }));
  (post.media || []).forEach((item) => { if (item.storage_path) oldPaths.add(item.storage_path); });
  try {
    const mediaIds = (post.media || []).map((item) => item.id).filter(Boolean);
    if (mediaIds.length) {
      const { error } = await ctx.db.from('jornal_media').delete().in('id', mediaIds);
      if (error) throw error;
    }
    const remove = [...oldPaths].filter((path) => !keep.has(path)).flatMap((path) => [path, lightVariantPath(path)]).filter(Boolean);
    if (remove.length) await createMediaStorage(ctx.db).from(BUCKET).remove(remove);
  } catch (err) {
    console.warn('[MSY][jornal-edicoes] Arquivos antigos não removidos (a limpeza diária do R2 cuida):', err);
  }
}

function nextEditionNumber() {
  const numbers = ctx.state.posts.filter(isEdition)
    .map((post) => getEditionMeta(post).number || 0);
  return (numbers.length ? Math.max(...numbers) : 0) + 1;
}

function toDateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date);
}

function nextSaturday() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const diff = (6 - now.getDay() + 7) % 7;
  now.setDate(now.getDate() + diff);
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
