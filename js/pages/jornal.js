/* ============================================================
   MSY PORTAL — Jornal da Masayoshi
   Central editorial multimidia.
   ============================================================ */

import { compressImage, validateMediaFile } from '../social/social_media.js';

const { db, Utils, renderSidebar, renderTopBar } = window.MSY;

const BUCKET = 'jornal-media';
const TYPE_LABELS = {
  video: ['fa-circle-play', 'Video'],
  article: ['fa-newspaper', 'Materia'],
  gallery: ['fa-images', 'Galeria'],
  tirinha: ['fa-pen-nib', 'Tirinha'],
  special: ['fa-star', 'Especial'],
};
const SECTION_LABELS = {
  principal: 'Destaques',
  videos: 'Videos',
  escrito: 'Jornal escrito',
  tirinha: 'Tirinhas',
  especiais: 'Especiais',
  arquivo: 'Arquivo',
};

const FORMAT_LABELS = {
  all: ['fa-layer-group', 'Tudo'],
  video: ['fa-circle-play', 'Vídeo'],
  written: ['fa-newspaper', 'Jornal escrito'],
};
const EDITOR_FORMATS = {
  video: ['fa-circle-play', 'Vídeo'],
  article: ['fa-newspaper', 'Jornal escrito'],
  tirinha: ['fa-table-cells-large', 'Tirinha'],
};

const state = {
  profile: null,
  canManage: false,
  posts: [],
  activeSection: 'principal',
  activeFormat: 'all',
  editingPostId: null,
};

async function initJornal() {
  const profile = await renderSidebar('jornal');
  if (!profile) return;
  state.profile = profile;
  state.canManage = profile.tier === 'diretoria' || await MSYPerms.check(profile.id, profile.tier, 'gerenciar_jornal');
  await renderTopBar('Jornal da Masayoshi', profile);
  Utils.showLoading(document.getElementById('pageContent'));
  await loadPosts();
  renderPage();
  openHashPost();
}

async function loadPosts() {
  let request = db
    .from('jornal_posts')
    .select(`
      *,
      author:author_id(id,name,role,tier,initials,color,avatar_url)
    `)
    .in('status', state.canManage ? ['draft', 'published', 'archived'] : ['published', 'archived'])
    .order('is_featured', { ascending: false })
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  const { data, error } = await request;
  if (error) {
    console.error('[MSY][jornal] Erro ao carregar posts:', error);
    throw error;
  }

  const posts = data || [];
  const ids = posts.map((post) => post.id);
  const [mediaRes, commentsRes] = ids.length ? await Promise.all([
    db.from('jornal_media').select('*').in('post_id', ids).order('position'),
    db.from('jornal_comments')
      .select('*, author:author_id(id,name,role,tier,initials,color,avatar_url)')
      .in('post_id', ids)
      .is('deleted_at', null)
      .order('created_at'),
  ]) : [{ data: [] }, { data: [] }];

  if (mediaRes.error) throw mediaRes.error;
  if (commentsRes.error) throw commentsRes.error;

  const mediaByPost = groupBy(mediaRes.data || [], 'post_id');
  const commentsByPost = groupBy(commentsRes.data || [], 'post_id');
  state.posts = posts.map((post) => ({
    ...post,
    media: mediaByPost[post.id] || [],
    comments: commentsByPost[post.id] || [],
  }));
}

function renderPage() {
  const content = document.getElementById('pageContent');
  const featured = getFeaturedPost();
  content.innerHTML = `
    <div class="journal-shell">
      ${renderHero(featured)}
      ${state.canManage ? renderAdminBar() : ''}
      ${renderTabs()}
      ${renderFormatFilters()}
      <div class="journal-grid">
        <main class="journal-main">
          ${renderSection('principal', 'Destaques da edição', 'A linha editorial principal da Ordem.', getSectionPosts('principal'))}
          ${renderSection('videos', 'Jornal em video', 'Edições semanais, mensais e registros audiovisuais.', getVideoPosts())}
          ${renderSection('escrito', 'Jornal escrito', 'Matérias editoriais, reportagens internas e textos longos da Masayoshi.', getWrittenPosts())}
          ${renderSection('tirinha', 'Tirinhas e quadros visuais', 'Publicações ilustradas, humor interno e pequenas narrativas.', getSectionPosts('tirinha'))}
          ${renderSection('especiais', 'Publicações especiais', 'Matérias marcantes, editoriais e conteúdos de maior peso.', getSectionPosts('especiais'))}
          ${renderSection('arquivo', 'Arquivo editorial', 'Histórico completo das publicações preservadas.', getArchivePosts())}
        </main>
        <aside class="journal-side">
          ${renderSidePanel('Ultimos videos', getVideoPosts().slice(0, 4))}
          ${renderSidePanel('Leituras recentes', state.posts.filter((p) => p.post_type === 'article' || p.post_type === 'special').slice(0, 4))}
        </aside>
      </div>
    </div>
  `;
  ensureModalRoots();
  bindPage();
  updateVisibleSections();
}

function ensureModalRoots() {
  const root = document.body;
  if (!root) return;
  ['journalPostModal', 'journalEditorModal', 'journalLightbox', 'journalCropModal'].forEach((id) => {
    let modal = document.getElementById(id);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = id;
      modal.className = 'journal-modal';
    }
    if (modal.parentElement !== root) {
      root.appendChild(modal);
    }
  });
}

function renderHero(post) {
  return `
    <section class="journal-hero">
      <div class="journal-hero-content">
        <div class="journal-kicker">Edição especial</div>
        <h1 class="journal-title">Jornal da Masayoshi</h1>
        <p class="journal-subtitle">${post ? Utils.escapeHtml(post.subtitle || post.summary || 'Comunicação oficial, memoria editorial e midia propria da Ordem.') : 'A central editorial da Ordem: videos, materias, tirinhas, especiais e arquivo historico em uma experiencia propria.'}</p>
        <div class="journal-hero-meta">
          <span class="journal-chip"><i class="fa-solid fa-newspaper"></i> Centro de midia MSY</span>
          ${post ? `<span class="journal-chip"><i class="fa-solid fa-star"></i> Destaque: ${Utils.escapeHtml(post.title)}</span>` : ''}
        </div>
      </div>
    </section>`;
}

function renderAdminBar() {
  return `
    <section class="journal-admin-bar">
      <div>
        <strong>Redação da Masayoshi</strong>
        <div class="journal-section-sub">Crie rascunhos, publique edições e organize o acervo editorial.</div>
      </div>
      <button class="btn btn-primary" id="journalNewPost"><i class="fa-solid fa-plus"></i> Nova publicação</button>
    </section>`;
}

function renderTabs() {
  return `
    <nav class="journal-tabs" aria-label="Seções do Jornal">
      ${Object.entries(SECTION_LABELS).map(([key, label]) => `
        <button class="journal-tab ${state.activeSection === key ? 'active' : ''}" data-journal-section="${key}">${label}</button>
      `).join('')}
    </nav>`;
}

function renderFormatFilters() {
  return `
    <nav class="journal-format-tabs" aria-label="Filtro de formato do Jornal">
      ${Object.entries(FORMAT_LABELS).map(([key, [icon, label]]) => `
        <button class="journal-format-tab ${state.activeFormat === key ? 'active' : ''}" data-journal-format="${key}">
          <i class="fa-solid ${icon}"></i>
          <span>${label}</span>
        </button>
      `).join('')}
    </nav>`;
}

function renderSection(key, title, subtitle, posts) {
  const gridClass = key === 'videos' ? 'journal-video-grid'
    : key === 'escrito' ? 'journal-newspaper-grid'
    : key === 'tirinha' ? 'journal-gallery-grid'
      : key === 'arquivo' ? 'journal-archive-grid'
        : 'journal-feature-grid';
  return `
    <section class="journal-section" data-journal-section-panel="${key}">
      <div class="journal-section-head">
        <div>
          <div class="journal-section-title">${title}</div>
          <div class="journal-section-sub">${subtitle}</div>
        </div>
        <span class="journal-chip">${posts.length} item${posts.length === 1 ? '' : 's'}</span>
      </div>
      ${posts.length ? `<div class="${gridClass}">${posts.map((post, index) => key === 'escrito' ? renderNewspaperCard(post, index === 0) : renderCard(post, index === 0 && key === 'principal')).join('')}</div>` : renderEmpty('Nenhuma publicação nesta seção ainda.')}
    </section>`;
}

function renderSidePanel(title, posts) {
  return `
    <section class="journal-section">
      <div class="journal-section-head">
        <div class="journal-section-title">${title}</div>
      </div>
      ${posts.length ? `<div class="journal-archive-grid" style="grid-template-columns:1fr">${posts.map((post) => renderCard(post, false)).join('')}</div>` : renderEmpty('Sem itens por enquanto.')}
    </section>`;
}

function renderCard(post, large = false) {
  const [icon, label] = TYPE_LABELS[post.post_type] || TYPE_LABELS.article;
  const media = getPostCoverImage(post);
  const videoUrl = getPostVideoUrl(post);
  const status = state.canManage && post.status !== 'published' ? `<span class="journal-chip">${post.status === 'draft' ? 'Rascunho' : 'Arquivado'}</span>` : '';
  return `
    <button class="journal-card ${large ? 'large' : ''}" data-open-journal-post="${post.id}" id="post-${post.id}">
      <div class="journal-card-media">
        ${media ? `<img src="${Utils.escapeHtml(media)}" loading="lazy" decoding="async" alt="">` : videoUrl ? `<video src="${Utils.escapeHtml(videoUrl)}" muted playsinline preload="metadata"></video>` : `<div class="fallback"><i class="fa-solid ${icon}"></i></div>`}
        ${post.post_type === 'video' || videoUrl ? '<span class="journal-play-badge"><i class="fa-solid fa-play"></i></span>' : ''}
      </div>
      <div class="journal-card-body">
        <div class="journal-card-type"><i class="fa-solid ${icon}"></i>${label}${status}</div>
        <div class="journal-card-title">${Utils.escapeHtml(post.title)}</div>
        ${post.subtitle || post.summary ? `<div class="journal-card-summary">${Utils.escapeHtml(post.subtitle || post.summary)}</div>` : ''}
        <div class="journal-card-meta">
          <span>${Utils.escapeHtml(post.author?.name || 'Editorial MSY')}</span>
          <span>·</span>
          <span>${Utils.formatDate(post.published_at || post.created_at)}</span>
        </div>
      </div>
    </button>`;
}

function renderNewspaperCard(post, lead = false) {
  const status = state.canManage && post.status !== 'published' ? `<span>${post.status === 'draft' ? 'Rascunho' : 'Arquivado'}</span>` : '';
  const cover = getPostCoverImage(post);
  const summary = post.summary || post.subtitle || getPlainBlockExcerpt(post);
  return `
    <button class="journal-paper-card ${lead ? 'lead' : ''}" data-open-journal-post="${post.id}" id="post-${post.id}">
      <div class="journal-paper-mast">
        <span>Jornal escrito</span>
        <span>${Utils.formatDate(post.published_at || post.created_at)}</span>
        ${status}
      </div>
      <div class="journal-paper-layout">
        ${cover ? `<div class="journal-paper-photo"><img src="${Utils.escapeHtml(cover)}" loading="lazy" decoding="async" alt=""></div>` : ''}
        <div class="journal-paper-copy">
          <div class="journal-paper-kicker">${post.post_type === 'special' ? 'Especial' : 'Matéria'}</div>
          <h3>${Utils.escapeHtml(post.title)}</h3>
          ${summary ? `<p>${Utils.escapeHtml(summary)}</p>` : ''}
          <div class="journal-paper-byline">${Utils.escapeHtml(post.author?.name || 'Editorial MSY')}</div>
        </div>
      </div>
    </button>`;
}

function renderEmpty(text) {
  return `<div class="journal-empty"><div><i class="fa-regular fa-newspaper" style="font-size:1.6rem;margin-bottom:8px"></i><div>${text}</div></div></div>`;
}

function bindPage() {
  document.querySelectorAll('[data-journal-section]').forEach((btn) => btn.addEventListener('click', () => {
    state.activeSection = btn.dataset.journalSection;
    state.activeFormat = state.activeSection === 'videos' ? 'video'
      : state.activeSection === 'escrito' ? 'written'
        : 'all';
    document.querySelectorAll('.journal-tab').forEach((tab) => tab.classList.toggle('active', tab === btn));
    document.querySelectorAll('.journal-format-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.journalFormat === state.activeFormat));
    updateVisibleSections();
  }));
  document.querySelectorAll('[data-journal-format]').forEach((btn) => btn.addEventListener('click', () => {
    state.activeFormat = btn.dataset.journalFormat;
    if (state.activeFormat === 'video') state.activeSection = 'videos';
    if (state.activeFormat === 'written') state.activeSection = 'escrito';
    if (state.activeFormat === 'all' && !['principal', 'tirinha', 'especiais', 'arquivo'].includes(state.activeSection)) state.activeSection = 'principal';
    document.querySelectorAll('.journal-format-tab').forEach((tab) => tab.classList.toggle('active', tab === btn));
    document.querySelectorAll('.journal-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.journalSection === state.activeSection));
    updateVisibleSections();
  }));
  document.querySelectorAll('[data-open-journal-post]').forEach((btn) => btn.addEventListener('click', () => openPost(btn.dataset.openJournalPost)));
  document.getElementById('journalNewPost')?.addEventListener('click', () => openEditor());
}

function updateVisibleSections() {
  document.querySelectorAll('[data-journal-section-panel]').forEach((panel) => {
    const section = panel.dataset.journalSectionPanel;
    const sectionMatches = section === state.activeSection;
    const formatMatches = state.activeFormat === 'all'
      || (state.activeFormat === 'video' && section === 'videos')
      || (state.activeFormat === 'written' && ['escrito', 'especiais'].includes(section));
    panel.hidden = !(sectionMatches && formatMatches);
  });
}

function openHashPost() {
  const id = window.location.hash.replace('#post-', '');
  if (id && state.posts.some((post) => post.id === id)) openPost(id);
}

function openPost(postId) {
  const post = state.posts.find((item) => item.id === postId);
  const modal = document.getElementById('journalPostModal');
  if (!post || !modal) return;
  const [icon, label] = TYPE_LABELS[post.post_type] || TYPE_LABELS.article;
  modal.innerHTML = `
    <div class="journal-modal-panel">
      <div class="journal-modal-head">
        <div>
          <div class="journal-kicker" style="margin-bottom:6px"><i class="fa-solid ${icon}"></i>${label}</div>
          <div class="journal-modal-title">${Utils.escapeHtml(post.title)}</div>
        </div>
        <button class="social-icon-btn" data-close-journal-modal><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="journal-modal-body">
        ${renderPostBody(post)}
        ${renderComments(post)}
      </div>
      ${state.canManage ? `
        <div class="journal-modal-foot">
          <button class="btn btn-ghost" data-edit-journal-post="${post.id}"><i class="fa-solid fa-pen"></i> Editar</button>
          <button class="btn btn-ghost" data-archive-journal-post="${post.id}"><i class="fa-solid fa-box-archive"></i> ${post.status === 'archived' ? 'Restaurar' : 'Arquivar'}</button>
          <button class="btn btn-danger" data-delete-journal-post="${post.id}"><i class="fa-solid fa-trash"></i> Excluir</button>
        </div>` : ''}
    </div>`;
  openModal(modal);
  bindPostModal(modal, post);
}

function renderPostBody(post) {
  const videoUrl = getPostVideoUrl(post);
  if (post.post_type === 'video' || videoUrl) {
    const poster = getPostCoverImage(post);
    return `
      <div class="journal-player">
        ${videoUrl ? `<video src="${Utils.escapeHtml(videoUrl)}" controls preload="metadata" ${poster ? `poster="${Utils.escapeHtml(poster)}"` : ''}></video>` : renderEmpty('Video indisponivel.')}
      </div>
      ${post.summary ? `<div class="journal-article"><p>${Utils.escapeHtml(post.summary)}</p></div>` : ''}`;
  }
  if (post.post_type === 'tirinha') {
    return renderComicPost(post);
  }
  return `<article class="journal-article">${renderBlocks(post)}</article>`;
}

function renderComicPost(post) {
  const images = post.media?.filter((item) => item.media_type === 'image') || [];
  return `
    <article class="journal-comic-page">
      <div class="journal-comic-mast">
        <span>Tirinha Masayoshi</span>
        <span>${Utils.formatDate(post.published_at || post.created_at)}</span>
      </div>
      <h3>${Utils.escapeHtml(post.title)}</h3>
      ${post.summary ? `<p class="journal-comic-caption">${Utils.escapeHtml(post.summary)}</p>` : ''}
      <div class="journal-comic-grid">
        ${images.length ? images.map((item, index) => `
          <button class="journal-comic-panel" data-open-journal-image="${Utils.escapeHtml(item.url)}">
            <img src="${Utils.escapeHtml(item.url)}" loading="lazy" decoding="async" alt="${Utils.escapeHtml(item.caption || `Cena ${index + 1}`)}">
            <span>${index + 1}</span>
          </button>
        `).join('') : renderEmpty('Nenhuma cena enviada para esta tirinha.')}
      </div>
    </article>`;
}

function renderBlocks(post) {
  const blocks = Array.isArray(post.content_blocks) ? post.content_blocks : [];
  const gallery = post.media?.filter((item) => item.media_type === 'image') || [];
  const leadImage = gallery[0];
  const leadMeta = getArticleImageMeta(leadImage);
  const body = blocks.length ? blocks.map(renderArticleBlock).join('') : (post.summary ? `<p>${Utils.escapeHtml(post.summary)}</p>` : '');

  return `
    ${leadImage ? renderArticlePhoto(leadImage.url, leadImage.caption || post.title, leadMeta) : ''}
    <div class="journal-article-flow">${body}</div>
    ${gallery.length > 1 ? gallery.slice(1).map((item) => renderFigure(item.url, item.caption, true)).join('') : ''}
  `;
}

function renderArticleBlock(block) {
  if (block.type === 'heading') return `<h3>${Utils.escapeHtml(block.text || '')}</h3>`;
  if (block.type === 'quote') return `<blockquote>${Utils.escapeHtml(block.text || '')}</blockquote>`;
  if (block.type === 'image') return renderFigure(block.url, block.caption);
  return `<p>${Utils.escapeHtml(block.text || '')}</p>`;
}

function renderArticlePhoto(url, caption = '', meta = getArticleImageMeta()) {
  const crop = meta.crop;
  return `
    <figure class="journal-article-photo photo-${Utils.escapeHtml(meta.position || 'right')}">
      <img src="${Utils.escapeHtml(url)}" loading="lazy" decoding="async" alt="${Utils.escapeHtml(caption || '')}" style="${meta.cropActive ? `transform:translate(calc(-50% + ${crop.x}%), calc(-50% + ${crop.y}%)) scale(${crop.zoom})` : 'transform:translate(-50%, -50%) scale(1)'}">
      ${caption ? `<figcaption>${Utils.escapeHtml(caption)}</figcaption>` : ''}
    </figure>`;
}

function renderFigure(url, caption = '', lightbox = false) {
  if (!url) return '';
  return `<figure>${lightbox ? `<button class="journal-card" data-open-journal-image="${Utils.escapeHtml(url)}"><img src="${Utils.escapeHtml(url)}" loading="lazy" decoding="async" alt="${Utils.escapeHtml(caption || '')}"></button>` : `<img src="${Utils.escapeHtml(url)}" loading="lazy" decoding="async" alt="${Utils.escapeHtml(caption || '')}">`}${caption ? `<figcaption>${Utils.escapeHtml(caption)}</figcaption>` : ''}</figure>`;
}

function renderComments(post) {
  if (!post.comments_enabled) return '<div class="journal-comments"><div class="journal-section-sub">Comentarios desativados nesta publicacao.</div></div>';
  return `
    <section class="journal-comments">
      <div class="journal-section-title" style="font-size:1.1rem;margin-bottom:14px">Comentários</div>
      <form class="journal-comment-form" data-journal-comment-form="${post.id}">
        ${avatar(state.profile, 34)}
        <input class="journal-comment-input" name="comment" autocomplete="off" placeholder="Escreva um comentário...">
      </form>
      <div id="journalCommentsList">
        ${post.comments.length ? post.comments.map(renderComment).join('') : '<div class="journal-section-sub">Nenhum comentário ainda.</div>'}
      </div>
    </section>`;
}

function renderComment(comment) {
  return `
    <div class="journal-comment" data-journal-comment="${comment.id}">
      ${avatar(comment.author || {}, 34)}
      <div>
        <div><span class="journal-comment-name">${Utils.escapeHtml(comment.author?.name || 'Membro')}</span><span class="journal-comment-date">${Utils.formatDateTime(comment.created_at)}</span></div>
        <div class="journal-comment-text">${Utils.escapeHtml(comment.content)}</div>
        ${canManageComment(comment) ? `<button class="comment-delete-btn" data-delete-journal-comment="${comment.id}">Excluir</button>` : ''}
      </div>
    </div>`;
}

function bindPostModal(modal, post) {
  modal.querySelectorAll('[data-close-journal-modal]').forEach((btn) => btn.addEventListener('click', () => closeModal(modal)));
  modal.onclick = (event) => { if (event.target === modal) closeModal(modal); };
  modal.querySelector('[data-journal-comment-form]')?.addEventListener('submit', submitComment);
  modal.querySelectorAll('[data-delete-journal-comment]').forEach((btn) => btn.addEventListener('click', () => deleteComment(post.id, btn.dataset.deleteJournalComment)));
  modal.querySelectorAll('[data-open-journal-image]').forEach((btn) => btn.addEventListener('click', () => openLightbox(btn.dataset.openJournalImage)));
  modal.querySelector('[data-edit-journal-post]')?.addEventListener('click', () => {
    closeModal(modal);
    openEditor(post);
  });
  modal.querySelector('[data-archive-journal-post]')?.addEventListener('click', () => toggleArchive(post));
  modal.querySelector('[data-delete-journal-post]')?.addEventListener('click', () => deletePost(post));
}

async function submitComment(event) {
  event.preventDefault();
  const postId = event.currentTarget.dataset.journalCommentForm;
  const input = event.currentTarget.elements.comment;
  const content = input.value.trim();
  if (!content) return;
  try {
    const { error } = await db.from('jornal_comments').insert({ post_id: postId, author_id: state.profile.id, content });
    if (error) throw error;
    input.value = '';
    await reloadAndReopen(postId);
  } catch (err) {
    console.error('[MSY][jornal] Erro ao comentar:', err);
    Utils.showToast(err.message || 'Erro ao comentar.', 'error');
  }
}

async function deleteComment(postId, commentId) {
  if (!await confirmAction('Excluir este comentário?')) return;
  const { error } = await db.from('jornal_comments').update({ deleted_at: new Date().toISOString() }).eq('id', commentId);
  if (error) return Utils.showToast(error.message || 'Erro ao excluir comentário.', 'error');
  await reloadAndReopen(postId);
}

async function reloadAndReopen(postId) {
  await loadPosts();
  renderPage();
  openPost(postId);
}

function openEditor(post = null) {
  state.editingPostId = post?.id || null;
  const modal = document.getElementById('journalEditorModal');
  if (!modal) return;
  const editorType = normalizeEditorPostType(post?.post_type);
  const articleBlocks = normalizeArticleBlocks(post?.content_blocks);
  const articlePhotoItem = post?.media?.find((item) => item.media_type === 'image') || null;
  const articlePhoto = articlePhotoItem?.url || '';
  const articlePhotoMeta = getArticleImageMeta(articlePhotoItem);
  const hasArticlePhoto = Boolean(articlePhoto);
  modal.innerHTML = `
    <div class="journal-modal-panel">
      <div class="journal-modal-head">
        <div class="journal-modal-title">${post ? 'Editar publicação' : 'Nova publicação'}</div>
        <button class="social-icon-btn" data-close-journal-modal><i class="fa-solid fa-xmark"></i></button>
      </div>
      <form class="journal-modal-body" id="journalEditorForm">
        <div class="journal-editor">
          <input type="hidden" name="post_type" value="${editorType}">
          <div class="journal-format-picker" role="radiogroup" aria-label="Formato da publicação">
            ${Object.entries(EDITOR_FORMATS).map(([key, [icon, label]]) => `
              <button type="button" class="journal-format-choice ${editorType === key ? 'active' : ''}" data-editor-type="${key}">
                <i class="fa-solid ${icon}"></i>
                <span>${label}</span>
              </button>
            `).join('')}
          </div>

          <div class="journal-editor-grid">
            ${field('Título', 'title', post?.title || '', 'text', true)}
            ${selectStatus(post?.status || 'draft')}

            <section class="journal-editor-panel" data-editor-panel="video">
              <div class="journal-field full">
                <label>Vídeo</label>
                <input type="file" name="video" accept="video/mp4,video/webm,video/quicktime">
                <div class="journal-file-note">${getPostVideoUrl(post) ? 'Vídeo atual preservado. Envie outro apenas se quiser substituir.' : 'Envie o arquivo principal do vídeo.'}</div>
              </div>
              ${field('Resumo', 'summary', post?.summary || '', 'textarea')}
            </section>

            <section class="journal-editor-panel" data-editor-panel="article">
              <div class="journal-photo-controls full">
                <input type="hidden" name="article_photo_enabled" value="${hasArticlePhoto ? '1' : '0'}">
                <input type="file" name="article_photo" accept="image/*" hidden>
                <button type="button" class="btn btn-ghost" data-add-article-photo><i class="fa-solid fa-image"></i> ${hasArticlePhoto ? 'Trocar foto' : 'Adicionar foto'}</button>
                <button type="button" class="btn btn-ghost" data-open-article-crop data-photo-option><i class="fa-solid fa-crop-simple"></i> Recortar</button>
                <button type="button" class="btn btn-ghost" data-remove-article-photo data-photo-option><i class="fa-solid fa-xmark"></i> Remover foto</button>
                <div class="journal-field" data-photo-option>
                  <label>Posição</label>
                  <select name="article_photo_position">
                    <option value="right" ${articlePhotoMeta.position === 'right' ? 'selected' : ''}>Direita</option>
                    <option value="left" ${articlePhotoMeta.position === 'left' ? 'selected' : ''}>Esquerda</option>
                    <option value="top" ${articlePhotoMeta.position === 'top' ? 'selected' : ''}>Topo</option>
                  </select>
                </div>
                <input type="hidden" name="article_photo_x" value="${articlePhotoMeta.crop.x}">
                <input type="hidden" name="article_photo_y" value="${articlePhotoMeta.crop.y}">
                <input type="hidden" name="article_photo_zoom" value="${articlePhotoMeta.crop.zoom}">
                <input type="hidden" name="article_photo_crop_active" value="${articlePhotoMeta.cropActive ? '1' : '0'}">
                <div class="journal-photo-pick full" data-photo-option>
                  <figure class="journal-photo-pick-preview ${articlePhoto ? '' : 'is-empty'}" id="journalArticlePhotoPickPreview">
                    ${articlePhoto ? `<img src="${Utils.escapeHtml(articlePhoto)}" alt="">` : '<span>Nenhuma foto escolhida</span>'}
                  </figure>
                  <div class="journal-photo-pick-actions">
                    <span>Escolha a foto e o recorte abre automaticamente, igual fluxo de postagem.</span>
                  </div>
                </div>
              </div>
              <div class="journal-article-builder full" id="journalArticleBuilder">
                ${articleBlocks.map(renderArticleEditorBlock).join('')}
              </div>
              <div class="journal-builder-actions full">
                <button type="button" class="btn btn-ghost btn-sm" data-add-article-block="heading"><i class="fa-solid fa-plus"></i> Subtítulo</button>
                <button type="button" class="btn btn-ghost btn-sm" data-add-article-block="paragraph"><i class="fa-solid fa-plus"></i> Texto</button>
              </div>
              <div class="journal-editor-paper" id="journalArticlePreview">
                <div class="journal-paper-mast"><span>Jornal escrito</span><span>Prévia</span></div>
                <h3>${Utils.escapeHtml(post?.title || 'Manchete da edição')}</h3>
                <div class="journal-editor-paper-layout" id="journalArticlePaperLayout">
                  <figure class="journal-editor-paper-photo ${articlePhoto ? '' : 'is-empty'}" id="journalArticlePhotoPreview">
                    ${articlePhoto ? `<img src="${Utils.escapeHtml(articlePhoto)}" alt="">` : '<span>Foto</span>'}
                  </figure>
                  <div class="journal-editor-paper-flow" id="journalArticleTextPreview"></div>
                </div>
              </div>
            </section>

            <section class="journal-editor-panel" data-editor-panel="tirinha">
              ${field('Legenda', 'comic_caption', post?.summary || '', 'textarea')}
              <div class="journal-field full">
                <label>Cenas da tirinha</label>
                <input type="file" name="gallery" accept="image/*" multiple>
                <div class="journal-file-note">${post?.media?.some((item) => item.media_type === 'image') ? 'Cenas atuais preservadas. Envie novas imagens para adicionar quadros.' : 'Envie as imagens dos quadros na ordem da história.'}</div>
              </div>
              <div class="journal-comic-editor-preview" id="journalComicPreview" data-existing-count="${post?.media?.filter((item) => item.media_type === 'image').length || 0}">
                ${renderComicEditorPreview(post)}
              </div>
            </section>

            <div class="journal-editor-options full">
              <label class="journal-chip"><input type="checkbox" name="comments_enabled" ${post?.comments_enabled !== false ? 'checked' : ''}> Comentários</label>
              <label class="journal-chip"><input type="checkbox" name="is_featured" ${post?.is_featured ? 'checked' : ''}> Destaque</label>
            </div>
          </div>
        </div>
      </form>
      <div class="journal-modal-foot">
        <button class="btn btn-ghost" data-close-journal-modal>Cancelar</button>
        <button class="btn btn-primary" form="journalEditorForm" type="submit"><i class="fa-solid fa-floppy-disk"></i> Salvar</button>
      </div>
    </div>`;
  openModal(modal);
  modal.querySelectorAll('[data-close-journal-modal]').forEach((btn) => btn.addEventListener('click', () => closeModal(modal)));
  modal.querySelectorAll('[data-editor-type]').forEach((btn) => btn.addEventListener('click', () => setEditorType(btn.dataset.editorType)));
  modal.querySelector('[name="title"]')?.addEventListener('input', updateEditorPreview);
  modal.querySelector('#journalArticleBuilder')?.addEventListener('input', updateEditorPreview);
  modal.querySelector('#journalArticleBuilder')?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-remove-article-block]');
    if (btn) {
      btn.closest('.journal-article-editor-block')?.remove();
      updateEditorPreview();
    }
  });
  modal.querySelectorAll('[data-add-article-block]').forEach((btn) => btn.addEventListener('click', () => addArticleEditorBlock(btn.dataset.addArticleBlock)));
  modal.querySelector('[data-add-article-photo]')?.addEventListener('click', chooseArticlePhoto);
  modal.querySelector('[data-remove-article-photo]')?.addEventListener('click', removeArticlePhoto);
  modal.querySelector('[name="article_photo"]')?.addEventListener('change', handleArticlePhotoSelected);
  modal.querySelector('[name="article_photo_position"]')?.addEventListener('change', updateEditorPreview);
  modal.querySelector('[data-open-article-crop]')?.addEventListener('click', openArticleCropModal);
  modal.querySelector('[name="gallery"]')?.addEventListener('change', updateEditorPreview);
  modal.querySelector('#journalEditorForm')?.addEventListener('submit', savePost);
  updateEditorMode();
}

function field(label, name, value = '', type = 'text', required = false) {
  const input = type === 'textarea'
    ? `<textarea name="${name}" ${required ? 'required' : ''}>${Utils.escapeHtml(value)}</textarea>`
    : `<input name="${name}" type="${type}" value="${Utils.escapeHtml(value)}" ${required ? 'required' : ''}>`;
  return `<div class="journal-field ${type === 'textarea' ? 'full' : ''}"><label>${label}</label>${input}</div>`;
}

function selectStatus(value) {
  return `<div class="journal-field"><label>Publicação</label><select name="status">
    <option value="draft" ${value === 'draft' ? 'selected' : ''}>Rascunho</option>
    <option value="published" ${value === 'published' ? 'selected' : ''}>Publicado</option>
    <option value="archived" ${value === 'archived' ? 'selected' : ''}>Arquivado</option>
  </select></div>`;
}

async function savePost(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = document.querySelector('button[form="journalEditorForm"]');
  try {
    Utils.setButtonLoading?.(submit, true);
    const existing = state.posts.find((post) => post.id === state.editingPostId);
    const status = form.elements.status.value;
    const postType = form.elements.post_type.value;
    const videoFile = form.elements.video.files?.[0] || null;
    const galleryFiles = [...(form.elements.gallery.files || [])];
    const articlePhotoEnabled = form.elements.article_photo_enabled?.value === '1';
    const articlePhotoFile = articlePhotoEnabled ? (form.elements.article_photo.files?.[0] || null) : null;
    const summary = postType === 'tirinha'
      ? form.elements.comic_caption.value.trim()
      : form.elements.summary?.value.trim() || null;

    if (postType === 'video' && !videoFile && !getPostVideoUrl(existing)) {
      throw new Error('Envie um vídeo principal para publicações de vídeo.');
    }
    if (postType === 'article' && !getArticleEditorBlocks().some((block) => block.text)) {
      throw new Error('Escreva o texto do jornal antes de salvar.');
    }
    if (postType === 'tirinha' && !galleryFiles.length && !existing?.media?.some((item) => item.media_type === 'image')) {
      throw new Error('Envie ao menos uma cena para a tirinha.');
    }

    const video = videoFile ? await uploadJornalFile(videoFile, 'videos', { videoOnly: true }) : null;
    const articlePhoto = articlePhotoFile ? await uploadJornalFile(articlePhotoFile, 'article', { imageOnly: true }) : null;
    const payload = {
      title: form.elements.title.value.trim(),
      subtitle: null,
      summary,
      post_type: postType,
      section: getEditorSection(postType),
      status,
      content_blocks: getEditorBlocks(),
      comments_enabled: form.elements.comments_enabled.checked,
      is_featured: form.elements.is_featured.checked,
      author_id: existing?.author_id || state.profile.id,
      cover_url: existing?.cover_url || null,
      cover_storage_path: existing?.cover_storage_path || null,
      video_url: video?.url || existing?.video_url || null,
      video_storage_path: video?.storage_path || existing?.video_storage_path || null,
      published_at: status === 'published' ? (existing?.published_at || new Date().toISOString()) : existing?.published_at || null,
      updated_at: new Date().toISOString(),
    };

    let postId = existing?.id;
    if (existing) {
      const { error } = await db.from('jornal_posts').update(payload).eq('id', existing.id);
      if (error) throw error;
    } else {
      const { data, error } = await db.from('jornal_posts').insert(payload).select('id').single();
      if (error) throw error;
      postId = data.id;
    }

    if (postType === 'article' && existing && (articlePhoto || !articlePhotoEnabled)) {
      const oldImages = (existing.media || []).filter((item) => item.media_type === 'image');
      const oldPaths = oldImages.map((item) => item.storage_path).filter(Boolean);
      if (oldImages.length) {
        const { error } = await db.from('jornal_media').delete().eq('post_id', postId).eq('media_type', 'image');
        if (error) throw error;
      }
      if (oldPaths.length) {
        await db.storage.from(BUCKET).remove([...new Set(oldPaths)]).catch((err) => console.warn('[MSY][jornal] Fotos antigas não removidas:', err));
      }
    }

    const mediaRows = [];
    if (video) mediaRows.push({ post_id: postId, author_id: state.profile.id, media_type: 'video', url: video.url, storage_path: video.storage_path, position: 0 });
    if (articlePhoto) {
      mediaRows.push({
        post_id: postId,
        author_id: state.profile.id,
        media_type: 'image',
        url: articlePhoto.url,
        storage_path: articlePhoto.storage_path,
        position: -Date.now(),
        alt_text: JSON.stringify({
          kind: 'article_photo',
          position: form.elements.article_photo_position?.value || 'right',
          crop: getArticleCropState(form),
          cropActive: form.elements.article_photo_crop_active?.value === '1',
        }),
      });
    }
    for (let index = 0; index < galleryFiles.length; index += 1) {
      const uploaded = await uploadJornalFile(galleryFiles[index], 'gallery', { imageOnly: true });
      mediaRows.push({ post_id: postId, author_id: state.profile.id, media_type: 'image', url: uploaded.url, storage_path: uploaded.storage_path, position: index + 1 });
    }
    if (mediaRows.length) {
      const { error } = await db.from('jornal_media').insert(mediaRows);
      if (error) throw error;
    }

    closeModal(document.getElementById('journalEditorModal'));
    await loadPosts();
    renderPage();
    Utils.showToast('Publicação salva.', 'success');
  } catch (err) {
    console.error('[MSY][jornal] Erro ao salvar publicação:', err);
    Utils.showToast(err.message || 'Erro ao salvar publicação.', 'error');
  } finally {
    Utils.setButtonLoading?.(submit, false);
  }
}

function updateEditorMode() {
  const form = document.getElementById('journalEditorForm');
  if (!form) return;
  const type = form.elements.post_type?.value || 'article';
  document.querySelectorAll('[data-editor-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.editorPanel !== type;
  });
  document.querySelectorAll('[data-editor-type]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.editorType === type);
  });
  updateEditorPreview();
}

function setEditorType(type) {
  const form = document.getElementById('journalEditorForm');
  if (!form || !EDITOR_FORMATS[type]) return;
  form.elements.post_type.value = type;
  updateEditorMode();
}

function updateEditorPreview() {
  const form = document.getElementById('journalEditorForm');
  if (!form) return;
  const title = form.elements.title?.value.trim() || 'Manchete da edição';
  const articlePreview = document.getElementById('journalArticlePreview');
  if (articlePreview) {
    articlePreview.querySelector('h3').textContent = title;
    const flow = document.getElementById('journalArticleTextPreview');
    if (flow) flow.innerHTML = renderArticlePreviewBlocks(getArticleEditorBlocks());
    updateArticlePhotoPreview(form);
    updatePhotoControls(form);
  }

  const comicPreview = document.getElementById('journalComicPreview');
  if (comicPreview) {
    const count = Math.max(1, form.elements.gallery?.files?.length || comicPreview.dataset.existingCount || 4);
    comicPreview.innerHTML = renderComicEditorPreview(null, Number(count));
  }
}

function updateArticlePhotoPreview(form) {
  const photo = document.getElementById('journalArticlePhotoPreview');
  const pickPreview = document.getElementById('journalArticlePhotoPickPreview');
  const layout = document.getElementById('journalArticlePaperLayout');
  if (!photo) return;
  const enabled = form.elements.article_photo_enabled?.value === '1';
  const position = form.elements.article_photo_position?.value || 'right';
  layout?.classList.toggle('no-photo', !enabled);
  layout?.classList.remove('photo-left', 'photo-right', 'photo-top');
  layout?.classList.add(`photo-${position}`);
  document.querySelectorAll('[data-photo-option]').forEach((option) => {
    option.hidden = !enabled;
  });
  if (!enabled) return;

  const file = form.elements.article_photo?.files?.[0];
  if (file) {
    const fileKey = `${file.name}:${file.size}:${file.lastModified}`;
    if (photo.dataset.previewFileKey !== fileKey) {
      const previous = photo.dataset.previewUrl;
      if (previous) URL.revokeObjectURL(previous);
      const url = URL.createObjectURL(file);
      photo.dataset.previewUrl = url;
      photo.dataset.previewFileKey = fileKey;
      photo.innerHTML = `<img src="${url}" alt="">`;
      if (pickPreview) {
        pickPreview.classList.remove('is-empty');
        pickPreview.innerHTML = `<img src="${url}" alt="">`;
      }
    }
  }
  photo.classList.remove('is-empty');
  const img = photo.querySelector('img');
  const pickImg = pickPreview?.querySelector('img');
  const crop = getArticleCropState(form);
  if (img) {
    applyArticleCropStyle(img, crop);
  }
  if (pickImg) applyArticleCropStyle(pickImg, crop);
}

function updatePhotoControls(form) {
  const enabled = form.elements.article_photo_enabled?.value === '1';
  document.querySelectorAll('[data-photo-option]').forEach((option) => {
    option.hidden = !enabled;
  });
  const addBtn = document.querySelector('[data-add-article-photo]');
  if (addBtn) addBtn.innerHTML = `<i class="fa-solid fa-image"></i> ${enabled ? 'Trocar foto' : 'Adicionar foto'}`;
}

function chooseArticlePhoto() {
  document.querySelector('#journalEditorForm [name="article_photo"]')?.click();
}

function handleArticlePhotoSelected() {
  const form = document.getElementById('journalEditorForm');
  if (!form?.elements.article_photo?.files?.[0]) return;
  form.elements.article_photo_enabled.value = '1';
  form.elements.article_photo_crop_active.value = '0';
  resetArticleCrop(false);
  updateEditorPreview();
  setTimeout(openArticleCropModal, 0);
}

function removeArticlePhoto() {
  const form = document.getElementById('journalEditorForm');
  if (!form) return;
  form.elements.article_photo_enabled.value = '0';
  form.elements.article_photo_crop_active.value = '0';
  form.elements.article_photo.value = '';
  const photo = document.getElementById('journalArticlePhotoPreview');
  const pickPreview = document.getElementById('journalArticlePhotoPickPreview');
  if (photo) {
    photo.classList.add('is-empty');
    photo.innerHTML = '<span>Foto</span>';
  }
  if (pickPreview) {
    pickPreview.classList.add('is-empty');
    pickPreview.innerHTML = '<span>Nenhuma foto escolhida</span>';
  }
  updateEditorPreview();
}

function getArticlePhotoSrc() {
  const photo = document.getElementById('journalArticlePhotoPreview')?.querySelector('img');
  return photo?.src || '';
}

function openArticleCropModal() {
  const form = document.getElementById('journalEditorForm');
  const src = getArticlePhotoSrc();
  if (form?.elements.article_photo_enabled?.value !== '1') {
    Utils.showToast('Adicione uma foto antes de recortar.', 'error');
    return;
  }
  if (!src) {
    Utils.showToast('Escolha uma foto antes de recortar.', 'error');
    return;
  }
  const modal = document.getElementById('journalCropModal');
  if (!modal) return;
  modal.innerHTML = `
    <div class="journal-crop-modal-panel">
      <div class="journal-crop-modal-head">
        <strong>Recortar foto</strong>
        <button type="button" class="social-icon-btn" data-close-journal-modal><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="journal-crop-modal-body">
        <div class="journal-crop-frame journal-crop-frame-large" id="journalArticleCropFrame">
          <img src="${Utils.escapeHtml(src)}" alt="">
          <div class="journal-crop-grid" aria-hidden="true"></div>
        </div>
      </div>
      <div class="journal-crop-modal-foot">
        <div class="journal-crop-tools">
          <button type="button" class="social-icon-btn" data-photo-zoom="-"><i class="fa-solid fa-minus"></i></button>
          <button type="button" class="social-icon-btn" data-photo-reset><i class="fa-solid fa-rotate-left"></i></button>
          <button type="button" class="social-icon-btn" data-photo-zoom="+"><i class="fa-solid fa-plus"></i></button>
          <span>Arraste a imagem dentro da moldura para enquadrar.</span>
        </div>
        <button type="button" class="btn btn-primary" data-apply-article-crop><i class="fa-solid fa-check"></i> Aplicar recorte</button>
      </div>
    </div>`;
  openModal(modal);
  const crop = getArticleCropState(form);
  const img = modal.querySelector('#journalArticleCropFrame img');
  if (img) applyArticleCropStyle(img, crop);
  bindArticleCropEditor(modal);
  modal.querySelectorAll('[data-photo-zoom]').forEach((btn) => btn.addEventListener('click', () => adjustArticleCropZoom(btn.dataset.photoZoom)));
  modal.querySelector('[data-photo-reset]')?.addEventListener('click', resetArticleCrop);
  modal.querySelector('[data-apply-article-crop]')?.addEventListener('click', () => {
    form.elements.article_photo_crop_active.value = '1';
    updateEditorPreview();
    closeModal(modal);
  });
  modal.querySelector('[data-close-journal-modal]')?.addEventListener('click', () => closeModal(modal));
  modal.onclick = (event) => { if (event.target === modal) closeModal(modal); };
}

function getArticleCropState(form = document.getElementById('journalEditorForm')) {
  return {
    x: clampNumber(Number(form?.elements.article_photo_x?.value || 0), -28, 28),
    y: clampNumber(Number(form?.elements.article_photo_y?.value || 0), -28, 28),
    zoom: clampNumber(Number(form?.elements.article_photo_zoom?.value || 1), 1, 2.4),
  };
}

function setArticleCropState(crop) {
  const form = document.getElementById('journalEditorForm');
  if (!form) return;
  const nextCrop = {
    x: clampNumber(crop.x, -28, 28),
    y: clampNumber(crop.y, -28, 28),
    zoom: clampNumber(crop.zoom, 1, 2.4),
  };
  form.elements.article_photo_x.value = String(nextCrop.x);
  form.elements.article_photo_y.value = String(nextCrop.y);
  form.elements.article_photo_zoom.value = String(nextCrop.zoom);
  form.elements.article_photo_crop_active.value = '1';
  const modalImg = document.querySelector('#journalCropModal #journalArticleCropFrame img');
  if (modalImg) applyArticleCropStyle(modalImg, nextCrop);
  updateEditorPreview();
}

function applyArticleCropStyle(img, crop) {
  const form = document.getElementById('journalEditorForm');
  const active = form?.elements.article_photo_crop_active?.value === '1';
  img.classList.remove('crop-active');
  img.style.objectPosition = 'center';
  img.style.transform = active
    ? `translate(calc(-50% + ${crop.x}%), calc(-50% + ${crop.y}%)) scale(${crop.zoom})`
    : 'translate(-50%, -50%) scale(1)';
}

function adjustArticleCropZoom(direction) {
  const crop = getArticleCropState();
  const delta = direction === '+' ? 0.12 : -0.12;
  setArticleCropState({ ...crop, zoom: crop.zoom + delta });
}

function resetArticleCrop(refresh = true) {
  const form = document.getElementById('journalEditorForm');
  if (!form) return;
  form.elements.article_photo_x.value = '0';
  form.elements.article_photo_y.value = '0';
  form.elements.article_photo_zoom.value = '1';
  form.elements.article_photo_crop_active.value = '0';
  if (refresh) updateEditorPreview();
}

function bindArticleCropEditor(root) {
  const frame = root.querySelector('#journalArticleCropFrame');
  if (!frame) return;
  let start = null;
  frame.addEventListener('pointerdown', (event) => {
    if (!frame.querySelector('img')) return;
    event.preventDefault();
    frame.setPointerCapture?.(event.pointerId);
    const crop = getArticleCropState();
    start = { clientX: event.clientX, clientY: event.clientY, crop };
  });
  frame.addEventListener('pointermove', (event) => {
    if (!start) return;
    const rect = frame.getBoundingClientRect();
    const next = {
      ...start.crop,
      x: start.crop.x + ((event.clientX - start.clientX) / Math.max(rect.width, 1)) * 84,
      y: start.crop.y + ((event.clientY - start.clientY) / Math.max(rect.height, 1)) * 84,
    };
    setArticleCropState(next);
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((name) => frame.addEventListener(name, () => {
    start = null;
  }));
  frame.addEventListener('wheel', (event) => {
    if (!frame.querySelector('img')) return;
    event.preventDefault();
    const crop = getArticleCropState();
    setArticleCropState({ ...crop, zoom: crop.zoom + (event.deltaY > 0 ? -0.08 : 0.08) });
  }, { passive: false });
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function renderArticleEditorBlock(block = { type: 'paragraph', text: '' }) {
  const isHeading = block.type === 'heading';
  return `
    <div class="journal-article-editor-block" data-article-block="${isHeading ? 'heading' : 'paragraph'}">
      <label>${isHeading ? 'Subtítulo' : 'Texto'}</label>
      <textarea data-article-block-text class="${isHeading ? 'is-heading' : ''}">${Utils.escapeHtml(block.text || '')}</textarea>
      <button type="button" class="social-icon-btn danger" data-remove-article-block title="Remover"><i class="fa-solid fa-trash"></i></button>
    </div>`;
}

function addArticleEditorBlock(type = 'paragraph') {
  const builder = document.getElementById('journalArticleBuilder');
  if (!builder) return;
  builder.insertAdjacentHTML('beforeend', renderArticleEditorBlock({ type, text: '' }));
  builder.querySelector('.journal-article-editor-block:last-child textarea')?.focus();
  updateEditorPreview();
}

function getArticleEditorBlocks() {
  return [...document.querySelectorAll('.journal-article-editor-block')]
    .map((row) => ({
      type: row.dataset.articleBlock === 'heading' ? 'heading' : 'paragraph',
      text: row.querySelector('[data-article-block-text]')?.value.trim() || '',
    }))
    .filter((block) => block.text);
}

function renderArticlePreviewBlocks(blocks = []) {
  if (!blocks.length) return '<p>Escreva a matéria para ver o texto diagramado como jornal.</p>';
  return blocks.map((block) => block.type === 'heading'
    ? `<h4>${Utils.escapeHtml(block.text)}</h4>`
    : `<p>${Utils.escapeHtml(block.text)}</p>`).join('');
}

function renderComicEditorPreview(post = null, count = null) {
  const existingImages = post?.media?.filter((item) => item.media_type === 'image') || [];
  const panelCount = count || existingImages.length || 4;
  return Array.from({ length: Math.min(Math.max(panelCount, 1), 8) }, (_, index) => {
    const image = existingImages[index]?.url;
    return `
      <div class="journal-comic-preview-panel">
        ${image ? `<img src="${Utils.escapeHtml(image)}" alt="">` : `<span>Cena ${index + 1}</span>`}
      </div>`;
  }).join('');
}

function getEditorBlocks() {
  const form = document.getElementById('journalEditorForm');
  if (!form || form.elements.post_type.value !== 'article') return [];
  return getArticleEditorBlocks();
}

function normalizeEditorPostType(type = 'article') {
  if (type === 'video' || type === 'tirinha') return type;
  return 'article';
}

function getEditorSection(type) {
  if (type === 'video') return 'videos';
  if (type === 'tirinha') return 'tirinha';
  return 'principal';
}

function normalizeArticleBlocks(blocks = []) {
  const valid = Array.isArray(blocks)
    ? blocks.filter((block) => block?.text).map((block) => ({
      type: block.type === 'heading' ? 'heading' : 'paragraph',
      text: block.text,
    }))
    : [];
  return valid.length ? valid : [{ type: 'paragraph', text: '' }];
}

async function uploadJornalFile(file, folder, options = {}) {
  const { imageOnly = false, videoOnly = false } = options;
  validateMediaFile(file, { maxImageMB: 12, maxVideoMB: 50 });
  if (imageOnly && !file.type.startsWith('image/')) throw new Error('Use uma imagem neste campo.');
  if (videoOnly && !file.type.startsWith('video/')) throw new Error('Use um vídeo neste campo.');
  const uploadFile = file.type.startsWith('image/') && file.type !== 'image/gif'
    ? await compressImage(file, { maxWidth: 2200, maxHeight: 2200, quality: 0.86 })
    : file;
  const ext = (uploadFile.name.split('.').pop() || 'bin').toLowerCase();
  const safe = uploadFile.name.replace(/\.[^.]+$/, '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 42) || 'jornal';
  const path = `${state.profile.id}/${folder}/${Date.now()}-${crypto.randomUUID()}-${safe}.${ext}`;
  const { error } = await db.storage.from(BUCKET).upload(path, uploadFile, {
    cacheControl: '31536000',
    upsert: false,
    contentType: uploadFile.type,
  });
  if (error) throw error;
  const { data } = db.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, storage_path: path };
}

async function toggleArchive(post) {
  const nextStatus = post.status === 'archived' ? 'published' : 'archived';
  const { error } = await db.from('jornal_posts').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', post.id);
  if (error) return Utils.showToast(error.message || 'Erro ao arquivar.', 'error');
  closeModal(document.getElementById('journalPostModal'));
  await loadPosts();
  renderPage();
}

async function deletePost(post) {
  if (!await confirmAction('Excluir esta publicação e remover seus arquivos?')) return;
  const paths = [post.cover_storage_path, post.video_storage_path, ...(post.media || []).map((item) => item.storage_path)].filter(Boolean);
  if (paths.length) await db.storage.from(BUCKET).remove([...new Set(paths)]).catch((err) => console.warn('[MSY][jornal] Arquivos não removidos:', err));
  const { error } = await db.from('jornal_posts').delete().eq('id', post.id);
  if (error) return Utils.showToast(error.message || 'Erro ao excluir.', 'error');
  closeModal(document.getElementById('journalPostModal'));
  await loadPosts();
  renderPage();
}

function openLightbox(url) {
  const modal = document.getElementById('journalLightbox');
  modal.innerHTML = `
    <button class="social-icon-btn story-close" data-close-journal-modal style="position:absolute;top:18px;right:18px"><i class="fa-solid fa-xmark"></i></button>
    <img class="journal-lightbox-img" src="${Utils.escapeHtml(url)}" alt="">`;
  openModal(modal);
  modal.querySelector('[data-close-journal-modal]')?.addEventListener('click', () => closeModal(modal));
  modal.onclick = (event) => { if (event.target === modal) closeModal(modal); };
}

function getFeaturedPost() {
  return state.posts.find((post) => post.status === 'published' && post.is_featured)
    || state.posts.find((post) => post.status === 'published')
    || state.posts[0];
}

function getSectionPosts(section) {
  return state.posts.filter((post) => post.status !== 'archived' && post.section === section);
}

function getArchivePosts() {
  return state.posts.filter((post) => post.status === 'archived' || post.section === 'arquivo');
}

function getTypePosts(type) {
  return state.posts.filter((post) => post.status !== 'archived' && post.post_type === type);
}

function getVideoPosts() {
  return state.posts.filter((post) => post.status !== 'archived' && (post.post_type === 'video' || Boolean(getPostVideoUrl(post))));
}

function getWrittenPosts() {
  return state.posts.filter((post) => post.status !== 'archived' && ['article', 'special'].includes(post.post_type));
}

function getPostCoverImage(post) {
  const cover = post?.cover_url || '';
  if (cover && !isLikelyVideoUrl(cover)) return cover;
  const image = post?.media?.find((item) => item.media_type === 'image' && item.url && !isLikelyVideoUrl(item.url));
  return image?.url || '';
}

function getPostVideoUrl(post) {
  if (post?.video_url) return post.video_url;
  const mediaVideo = post?.media?.find((item) => item.media_type === 'video' && item.url);
  if (mediaVideo?.url) return mediaVideo.url;
  if (post?.cover_url && isLikelyVideoUrl(post.cover_url)) return post.cover_url;
  const videoLikeMedia = post?.media?.find((item) => item.url && isLikelyVideoUrl(item.url));
  return videoLikeMedia?.url || '';
}

function getArticleImageMeta(media = null) {
  const fallback = { position: 'right', cropActive: false, crop: { x: 0, y: 0, zoom: 1 } };
  if (!media?.alt_text) return fallback;
  try {
    const meta = JSON.parse(media.alt_text);
    const crop = meta?.crop || {};
    return {
      position: ['left', 'right', 'top'].includes(meta?.position) ? meta.position : 'right',
      cropActive: Boolean(meta?.cropActive),
      crop: {
        x: clampNumber(Number(crop.x ?? 0), -42, 42),
        y: clampNumber(Number(crop.y ?? 0), -42, 42),
        zoom: clampNumber(Number(crop.zoom ?? 1), 1, 2.4),
      },
    };
  } catch {
    return fallback;
  }
}

function isLikelyVideoUrl(url = '') {
  const clean = String(url).split('?')[0].toLowerCase();
  return /\.(mp4|webm|mov|m4v|quicktime)$/.test(clean) || clean.includes('/videos/');
}

function getPlainBlockExcerpt(post) {
  const blocks = Array.isArray(post?.content_blocks) ? post.content_blocks : [];
  const text = blocks.map((block) => block?.text || '').join(' ').replace(/\s+/g, ' ').trim();
  return text.length > 170 ? `${text.slice(0, 167)}...` : text;
}

function groupBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key];
    if (!acc[value]) acc[value] = [];
    acc[value].push(item);
    return acc;
  }, {});
}

function avatar(profile = {}, size = 36) {
  const bg = `linear-gradient(135deg,${profile.color || '#7f1d1d'},#111)`;
  return `<span class="avatar" style="width:${size}px;height:${size}px;min-width:${size}px;background:${bg};overflow:hidden">${profile.avatar_url ? `<img src="${Utils.escapeHtml(profile.avatar_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%" alt="">` : Utils.escapeHtml(profile.initials || Utils.getInitials(profile.name || 'MSY'))}</span>`;
}

function canManageComment(comment) {
  return state.canManage || comment.author_id === state.profile.id;
}

function openModal(modal) {
  modal?.classList.add('open');
  if (modal) modal.scrollTop = 0;
  const panel = modal?.querySelector('.journal-modal-panel');
  const body = modal?.querySelector('.journal-modal-body');
  if (panel) panel.scrollTop = 0;
  if (body) body.scrollTop = 0;
  document.body.classList.add('social-modal-locked');
}

function closeModal(modal) {
  modal?.classList.remove('open');
  modal?.querySelectorAll('video').forEach((video) => video.pause());
  if (!document.querySelector('.journal-modal.open')) {
    document.body.classList.remove('social-modal-locked');
  }
}

async function confirmAction(message) {
  if (window.MSYConfirm?.show) return await MSYConfirm.show(message, { title: 'Jornal da Masayoshi', type: 'warn' });
  return window.confirm(message);
}

initJornal().catch((err) => {
  console.error('[MSY][jornal] Erro ao inicializar:', err);
  const content = document.getElementById('pageContent');
  if (content) {
    content.innerHTML = '<div class="empty-state"><div class="empty-state-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><div class="empty-state-text">Erro ao carregar o Jornal da Masayoshi. Confira se a migration foi aplicada.</div></div>';
  }
  Utils.showToast?.('Erro ao carregar Jornal.', 'error');
});
