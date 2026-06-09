/* ============================================================
   MSY PORTAL — Jornal da Masayoshi
   Central editorial multimidia.
   ============================================================ */

import {
  captureStoryVideoThumbnail,
  compressImage,
  exportStoryImageFile,
  loadImage,
  normalizeMediaEditState,
  validateMediaFile,
} from '../social/social_media.js?v=20260609-jornal-editor';

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
const ARTICLE_IMAGE_ASPECTS = {
  '16:9': { label: 'Horizontal', ratio: 16 / 9 },
  '21:9': { label: 'Horizontal ampla', ratio: 21 / 9 },
  '1:1': { label: 'Quadrada', ratio: 1 },
  '4:5': { label: 'Vertical', ratio: 4 / 5 },
  '9:16': { label: 'Vertical Story', ratio: 9 / 16 },
  free: { label: 'Livre', ratio: null },
};
const ARTICLE_PHOTO_POSITION = 0;
const GALLERY_POSITION_START = 10;

const state = {
  profile: null,
  canManage: false,
  posts: [],
  activeSection: 'principal',
  activeFormat: 'all',
  editingPostId: null,
  jornalLikesAvailable: true,
  jornalViewsAvailable: true,
  articlePhotoItem: null,
};

const JOURNAL_IMAGE_ASPECT_OPTIONS = [
  ['original', 'Original'],
  ['16:9', '16:9'],
  ['21:9', '21:9'],
  ['1:1', '1:1'],
  ['4:5', '4:5'],
  ['9:16', '9:16'],
];

function journalMediaAspectCss(aspect = 'original', originalAspect = null) {
  if (aspect === 'original' && Number(originalAspect) > 0) return `${Number(originalAspect)} / 1`;
  const map = {
    '9:16': '9 / 16',
    '1:1': '1 / 1',
    '4:5': '4 / 5',
    '16:9': '16 / 9',
    '21:9': '21 / 9',
    original: 'var(--editor-original-aspect, 16 / 9)',
  };
  return map[aspect] || map.original;
}

function journalDetectMediaFormat(width, height) {
  const ratio = Number(width) / Math.max(Number(height), 1);
  if (!Number.isFinite(ratio) || ratio <= 0) return 'Formato desconhecido';
  if (Math.abs(ratio - 1) < 0.04) return 'Quadrado';
  if (ratio < 1) return 'Retrato';
  return 'Paisagem';
}

function journalRenderMediaDimensionMeta(item) {
  const editState = journalEnsureMediaEditState(item);
  const width = Number(editState?.originalWidth || 0);
  const height = Number(editState?.originalHeight || 0);
  const dimensions = width && height ? `${width}x${height}` : 'Carregando dimensões';
  const format = editState?.detectedFormat || (editState?.originalAspect ? journalDetectMediaFormat(editState.originalAspect, 1) : 'Formato original');
  return `
    <div><strong>Dimensão:</strong> ${Utils.escapeHtml(dimensions)}</div>
    <div><strong>Formato:</strong> ${Utils.escapeHtml(format)}</div>`;
}

function journalIsMediaEditActive(editState = {}) {
  const normalized = normalizeMediaEditState(editState);
  return normalized.aspect !== 'original'
    || Math.abs(Number(normalized.zoom || 1) - 1) > 0.01
    || Math.abs(Number(normalized.offsetX || 0)) > 0.01
    || Math.abs(Number(normalized.offsetY || 0)) > 0.01
    || Math.abs(Number(normalized.rotation || 0)) > 0.01;
}

function journalEnsureMediaEditState(item, fallbackAspect = '16:9') {
  if (!item) return null;
  item.editState = normalizeMediaEditState({
    aspect: fallbackAspect,
    ...(item.editState || {}),
  }, 'image');
  return item.editState;
}

function journalMediaEditorTransform(editState = {}) {
  const s = normalizeMediaEditState(editState);
  return `translate(calc(-50% + ${s.offsetX * 42}%), calc(-50% + ${s.offsetY * 42}%)) scale(${s.zoom}) rotate(${s.rotation}deg)`;
}

function journalMediaEditorSelector(id) {
  const safeId = window.CSS?.escape ? CSS.escape(String(id)) : String(id).replace(/["\\]/g, '\\$&');
  return `[data-media-editor="${safeId}"]`;
}

function journalRenderEditableMediaNode(item, { controls = true } = {}) {
  if (!item) return '<div class="social-empty"><i class="fa-regular fa-image"></i>Nenhuma mídia.</div>';
  const editState = journalEnsureMediaEditState(item);
  const aspect = journalMediaAspectCss(editState.aspect, editState.originalAspect);
  const style = `--editor-aspect:${aspect};--editor-transform:${journalMediaEditorTransform(editState)}`;
  const activeClass = journalIsMediaEditActive(editState) ? ' is-edited' : ' is-original';
  return `
    <div class="media-editor-crop${activeClass}" style="${style}" data-media-editor="${Utils.escapeHtml(item.id)}" data-media-editor-scope="jornal">
      <div class="media-editor-viewport">
        <img class="media-editor-media" src="${Utils.escapeHtml(item.url)}" alt="Preview">
        ${controls ? '<div class="media-editor-mask" aria-hidden="true"></div>' : ''}
        <div class="media-editor-load-error" data-media-load-error hidden>
          <i class="fa-regular fa-image"></i>
          <span>Não foi possível carregar esta imagem.</span>
        </div>
      </div>
    </div>`;
}

function journalApplyMediaEditorTransform(root, item) {
  const editor = root?.querySelector?.(journalMediaEditorSelector(item.id));
  if (!editor) return;
  const editState = journalEnsureMediaEditState(item);
  const aspect = journalMediaAspectCss(editState.aspect, editState.originalAspect);
  editor.style.setProperty('--editor-aspect', aspect);
  editor.style.setProperty('--editor-transform', journalMediaEditorTransform(editState));
  editor.closest('.journal-photo-editor-main')?.style.setProperty('--editor-aspect', aspect);
  const active = journalIsMediaEditActive(editState);
  editor.classList.toggle('is-edited', active);
  editor.classList.toggle('is-original', !active);
}

function journalBindMediaEditorGestures(root, item, onChange = () => {}) {
  const editor = root?.querySelector?.(journalMediaEditorSelector(item.id));
  if (!editor) return;
  journalEnsureMediaEditState(item);
  const pointers = new Map();
  let start = null;
  const pointDistance = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const pointAngle = (a, b) => Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX) * 180 / Math.PI;
  const schedule = () => requestAnimationFrame(() => {
    journalApplyMediaEditorTransform(root, item);
    onChange(item);
  });
  editor.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button,input,select,textarea')) return;
    event.preventDefault();
    editor.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, event);
    const values = [...pointers.values()];
    start = {
      points: values,
      offsetX: item.editState.offsetX,
      offsetY: item.editState.offsetY,
      zoom: item.editState.zoom,
      rotation: item.editState.rotation,
      distance: values.length > 1 ? pointDistance(values[0], values[1]) : 0,
      angle: values.length > 1 ? pointAngle(values[0], values[1]) : 0,
    };
  });
  editor.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId) || !start) return;
    pointers.set(event.pointerId, event);
    const values = [...pointers.values()];
    if (values.length > 1 && start.points.length > 1) {
      const distance = pointDistance(values[0], values[1]);
      const angle = pointAngle(values[0], values[1]);
      item.editState.zoom = Math.min(3, Math.max(0.5, start.zoom * (distance / Math.max(start.distance, 1))));
      item.editState.rotation = (start.rotation + angle - start.angle + 360) % 360;
    } else {
      const first = start.points[0];
      const current = values[0];
      const rect = editor.getBoundingClientRect();
      item.editState.offsetX = Math.min(1, Math.max(-1, start.offsetX + ((current.clientX - first.clientX) / Math.max(rect.width, 1)) * 2));
      item.editState.offsetY = Math.min(1, Math.max(-1, start.offsetY + ((current.clientY - first.clientY) / Math.max(rect.height, 1)) * 2));
    }
    schedule();
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((eventName) => editor.addEventListener(eventName, (event) => {
    pointers.delete(event.pointerId);
    start = null;
  }));
}

function journalBindMediaPreviewDiagnostics(root, item) {
  if (!root || !item) return;
  const editor = root.querySelector?.(journalMediaEditorSelector(item.id));
  const img = editor?.querySelector?.('img.media-editor-media');
  if (!editor || !img || img.dataset.previewDiagnosticsBound === '1') return;
  img.dataset.previewDiagnosticsBound = '1';
  const errorNode = editor.querySelector('[data-media-load-error]');
  const markLoaded = () => {
    editor.classList.remove('load-error');
    if (errorNode) errorNode.hidden = true;
  };
  const markError = () => {
    editor.classList.add('load-error');
    if (errorNode) errorNode.hidden = false;
    Utils.showToast?.('Não foi possível carregar a imagem selecionada.', 'error');
  };
  img.addEventListener('load', markLoaded, { once: true });
  img.addEventListener('error', markError, { once: true });
  if (img.complete) {
    if (img.naturalWidth > 0) markLoaded();
    else markError();
  }
}

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
  const [mediaRes, commentsRes, likesRes, viewsRes] = ids.length ? await Promise.all([
    db.from('jornal_media').select('*').in('post_id', ids).order('position'),
    db.from('jornal_comments')
      .select('*, author:author_id(id,name,role,tier,initials,color,avatar_url)')
      .in('post_id', ids)
      .is('deleted_at', null)
      .order('created_at'),
    db.from('jornal_likes').select('post_id,user_id').in('post_id', ids),
    db.from('jornal_views').select('post_id,user_id').in('post_id', ids),
  ]) : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

  if (mediaRes.error) throw mediaRes.error;
  if (commentsRes.error) throw commentsRes.error;
  if (likesRes.error) {
    state.jornalLikesAvailable = false;
    console.warn('[MSY][jornal] Likes do Jornal indisponiveis:', likesRes.error.message);
  } else {
    state.jornalLikesAvailable = true;
  }
  if (viewsRes.error) {
    state.jornalViewsAvailable = false;
    console.warn('[MSY][jornal] Views do Jornal indisponiveis:', viewsRes.error.message);
  } else {
    state.jornalViewsAvailable = true;
  }

  const mediaByPost = groupBy(mediaRes.data || [], 'post_id');
  const commentsByPost = groupBy(commentsRes.data || [], 'post_id');
  const likes = likesRes.error ? [] : (likesRes.data || []);
  const views = viewsRes.error ? [] : (viewsRes.data || []);
  const likesByPost = countBy(likes, 'post_id');
  const viewsByPost = countBy(views, 'post_id');
  const myLiked = new Set(likes.filter((like) => like.user_id === state.profile.id).map((like) => like.post_id));
  const myViewed = new Set(views.filter((view) => view.user_id === state.profile.id).map((view) => view.post_id));
  state.posts = posts.map((post) => ({
    ...post,
    media: mediaByPost[post.id] || [],
    comments: commentsByPost[post.id] || [],
    likes_count: likesByPost[post.id] || Number(getLocalJornalLiked(post.id)),
    liked_by_me: myLiked.has(post.id) || getLocalJornalLiked(post.id),
    views_count: viewsByPost[post.id] || Number(getLocalJornalViewed(post.id)),
    viewed_by_me: myViewed.has(post.id) || getLocalJornalViewed(post.id),
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
  ['journalPostModal', 'journalEditorModal', 'journalLightbox'].forEach((id) => {
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
      ${posts.length ? `<div class="${gridClass}">${posts.map((post, index) => renderListingCard(post, index === 0 && (key === 'principal' || key === 'escrito'))).join('')}</div>` : renderEmpty('Nenhuma publicação nesta seção ainda.')}
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

function renderListingCard(post, lead = false) {
  return isWrittenPost(post) ? renderNewspaperCard(post, lead) : renderCard(post, lead);
}

function renderCard(post, large = false) {
  const [icon, label] = TYPE_LABELS[post.post_type] || TYPE_LABELS.article;
  const media = getPostCoverImage(post);
  const videoUrl = getPostVideoUrl(post);
  const status = state.canManage && post.status !== 'published' ? `<span class="journal-chip">${post.status === 'draft' ? 'Rascunho' : 'Arquivado'}</span>` : '';
  return `
    <button class="journal-card ${large ? 'large' : ''}" data-open-journal-post="${post.id}" id="post-${post.id}">
      <div class="journal-card-media">
        ${media ? `<img src="${Utils.escapeHtml(media)}" loading="lazy" decoding="async" alt="">` : videoUrl ? `<video src="${Utils.escapeHtml(videoUrl)}" muted playsinline webkit-playsinline preload="metadata" data-journal-card-video></video>` : `<div class="fallback"><i class="fa-solid ${icon}"></i></div>`}
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
  bindJournalCardVideoPreviews();
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

function bindJournalCardVideoPreviews(root = document) {
  root.querySelectorAll('video[data-journal-card-video]').forEach((video) => {
    if (video.dataset.previewBound === 'true') return;
    video.dataset.previewBound = 'true';
    video.playsInline = true;
    video.addEventListener('loadedmetadata', () => {
      const duration = Number(video.duration || 0);
      const targetTime = Number.isFinite(duration) && duration > 1 ? Math.min(0.8, duration - 0.1) : 0;
      if (targetTime > 0) {
        try {
          video.currentTime = targetTime;
        } catch (err) {
          console.warn('[MSY][jornal] Preview do card de video indisponivel:', err);
        }
      }
    }, { once: true });
  });
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
  recordJournalView(post, modal);
}

function renderPostBody(post) {
  const videoUrl = getPostVideoUrl(post);
  if (post.post_type === 'video' || videoUrl) {
    const poster = getPostCoverImage(post);
    return `
      <div class="journal-player">
        ${videoUrl ? `<video src="${Utils.escapeHtml(videoUrl)}" controls playsinline webkit-playsinline x5-playsinline preload="metadata" ${poster ? `poster="${Utils.escapeHtml(poster)}"` : ''}></video>` : renderEmpty('Video indisponivel.')}
      </div>
      ${renderVideoDescription(post)}`;
  }
  if (post.post_type === 'tirinha') {
    return renderComicPost(post);
  }
  return renderArticlePost(post);
}

async function createJornalVideoCover(videoFile) {
  try {
    const thumb = await captureStoryVideoThumbnail(videoFile, 0.8, 0);
    const base = videoFile.name.replace(/\.[^.]+$/, '') || 'video';
    const coverFile = new File([thumb.blob], `${base}-capa.webp`, { type: thumb.blob.type || 'image/webp' });
    const cover = await uploadJornalFile(coverFile, 'covers', { imageOnly: true });
    if (thumb.url?.startsWith('blob:')) URL.revokeObjectURL(thumb.url);
    return cover;
  } catch (err) {
    console.warn('[MSY][jornal] Capa automatica do video indisponivel:', err);
    return null;
  }
}

function bindInlineJournalVideos(root = document) {
  root.querySelectorAll('.journal-player video').forEach((video) => {
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('x5-playsinline', '');
  });
}

function renderVideoDescription(post) {
  const views = Number(post.views_count ?? post.view_count ?? post.views ?? 0);
  const viewsLabel = `${views.toLocaleString('pt-BR')} visualizaç${views === 1 ? 'ão' : 'ões'}`;
  const dateLabel = Utils.formatDate(post.published_at || post.created_at);
  const description = post.summary || 'Sem descrição.';
  const likes = Number(post.likes_count || 0);
  return `
    <section class="journal-video-description">
      <div class="journal-video-description-top">
        <div class="journal-video-description-meta">
          <strong data-journal-views="${post.id}">${viewsLabel}</strong>
          <span>${dateLabel}</span>
        </div>
        <button type="button" class="journal-like-btn ${post.liked_by_me ? 'active' : ''}" data-like-journal-post="${post.id}" aria-pressed="${post.liked_by_me ? 'true' : 'false'}">
          <i class="fa-${post.liked_by_me ? 'solid' : 'regular'} fa-thumbs-up"></i>
          <span>${likes.toLocaleString('pt-BR')}</span>
        </button>
      </div>
      <div class="journal-video-description-title">Descrição</div>
      <p>${Utils.escapeHtml(description)}</p>
    </section>`;
}

function renderArticlePost(post) {
  const status = state.canManage && post.status !== 'published'
    ? `<span>${post.status === 'draft' ? 'Rascunho' : 'Arquivado'}</span>`
    : '';
  return `
    <article class="journal-article journal-article-page">
      <div class="journal-paper-mast">
        <span>Jornal escrito</span>
        <span>${Utils.formatDate(post.published_at || post.created_at)}</span>
        ${status}
      </div>
      <div class="journal-article-kicker">${post.post_type === 'special' ? 'Especial' : 'Matéria'}</div>
      <h1>${Utils.escapeHtml(post.title)}</h1>
      ${post.summary || post.subtitle ? `<p class="journal-article-deck">${Utils.escapeHtml(post.summary || post.subtitle)}</p>` : ''}
      ${renderBlocks(post)}
      <div class="journal-paper-byline">${Utils.escapeHtml(post.author?.name || 'Editorial MSY')}</div>
    </article>`;
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
  const aspectStyle = meta.exported ? '' : getArticleAspectStyle(meta.aspect);
  const cropClass = !meta.exported && meta.cropActive ? ' crop-active' : '';
  const imgStyle = !meta.exported && meta.cropActive
    ? `transform:translate(calc(-50% + ${meta.crop.x}%), calc(-50% + ${meta.crop.y}%)) scale(${meta.crop.zoom})`
    : '';
  return `
    <figure class="journal-article-photo photo-${Utils.escapeHtml(meta.position || 'right')}" style="${aspectStyle}">
      <img class="${cropClass.trim()}" src="${Utils.escapeHtml(url)}" loading="lazy" decoding="async" alt="${Utils.escapeHtml(caption || '')}" style="${imgStyle}">
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
  bindInlineJournalVideos(modal);
  modal.querySelectorAll('[data-close-journal-modal]').forEach((btn) => btn.addEventListener('click', () => closeModal(modal)));
  modal.onclick = (event) => { if (event.target === modal) closeModal(modal); };
  modal.querySelector('[data-journal-comment-form]')?.addEventListener('submit', submitComment);
  modal.querySelectorAll('[data-delete-journal-comment]').forEach((btn) => btn.addEventListener('click', () => deleteComment(post.id, btn.dataset.deleteJournalComment)));
  modal.querySelectorAll('[data-open-journal-image]').forEach((btn) => btn.addEventListener('click', () => openLightbox(btn.dataset.openJournalImage)));
  modal.querySelector('[data-like-journal-post]')?.addEventListener('click', () => toggleJournalLike(post.id, modal));
  modal.querySelector('[data-edit-journal-post]')?.addEventListener('click', () => {
    closeModal(modal);
    openEditor(post);
  });
  modal.querySelector('[data-archive-journal-post]')?.addEventListener('click', () => toggleArchive(post));
  modal.querySelector('[data-delete-journal-post]')?.addEventListener('click', () => deletePost(post));
}

async function toggleJournalLike(postId, root = document) {
  const post = state.posts.find((item) => item.id === postId);
  const btn = root.querySelector(`[data-like-journal-post="${postId}"]`);
  if (!post || !btn) return;
  const previousLiked = Boolean(post.liked_by_me);
  const previousCount = Number(post.likes_count || 0);
  const nextLiked = !previousLiked;
  const nextCount = Math.max(0, previousCount + (nextLiked ? 1 : -1));
  applyJournalLikeState(post, btn, nextLiked, nextCount);
  try {
    if (state.jornalLikesAvailable) {
      const request = nextLiked
        ? db.from('jornal_likes').insert({ post_id: postId, user_id: state.profile.id })
        : db.from('jornal_likes').delete().eq('post_id', postId).eq('user_id', state.profile.id);
      const { error } = await request;
      if (error) throw error;
    } else {
      setLocalJornalLiked(postId, nextLiked);
    }
  } catch (err) {
    state.jornalLikesAvailable = false;
    setLocalJornalLiked(postId, nextLiked);
    applyJournalLikeState(post, btn, nextLiked, nextCount);
    console.warn('[MSY][jornal] Like local aplicado:', err.message);
  }
}

function applyJournalLikeState(post, btn, liked, count) {
  post.liked_by_me = liked;
  post.likes_count = count;
  btn.classList.toggle('active', liked);
  btn.setAttribute('aria-pressed', liked ? 'true' : 'false');
  btn.innerHTML = `<i class="fa-${liked ? 'solid' : 'regular'} fa-thumbs-up"></i><span>${count.toLocaleString('pt-BR')}</span>`;
}

async function recordJournalView(post, root = document) {
  if (!post || post.viewed_by_me) return;
  const nextCount = Number(post.views_count || 0) + 1;
  post.viewed_by_me = true;
  post.views_count = nextCount;
  setLocalJornalViewed(post.id, true);
  updateJournalViewsLabel(post, root);
  try {
    if (!state.jornalViewsAvailable) return;
    const { error } = await db.from('jornal_views').insert({ post_id: post.id, user_id: state.profile.id });
    if (error && error.code !== '23505') throw error;
  } catch (err) {
    state.jornalViewsAvailable = false;
    console.warn('[MSY][jornal] View local aplicada:', err.message);
  }
}

function updateJournalViewsLabel(post, root = document) {
  const label = root.querySelector(`[data-journal-views="${post.id}"]`);
  if (!label) return;
  const views = Number(post.views_count || 0);
  label.textContent = `${views.toLocaleString('pt-BR')} visualizaç${views === 1 ? 'ão' : 'ões'}`;
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
  state.articlePhotoItem = null;
  const modal = document.getElementById('journalEditorModal');
  if (!modal) return;
  const editorType = normalizeEditorPostType(post?.post_type);
  const articleBlocks = normalizeArticleBlocks(post?.content_blocks);
  const articlePhotoItem = post?.media?.find((item) => item.media_type === 'image') || null;
  const articlePhoto = articlePhotoItem?.url || '';
  const hasArticlePhoto = Boolean(articlePhoto);
  if (hasArticlePhoto) {
    state.articlePhotoItem = {
      id: 'article-photo',
      url: articlePhoto,
      existingUrl: articlePhoto,
      media_type: 'image',
      editState: normalizeMediaEditState({ aspect: '16:9' }, 'image'),
    };
    loadImageFromUrl(articlePhoto).then((img) => {
      if (!state.articlePhotoItem) return;
      state.articlePhotoItem.editState.originalAspect = img.width / img.height;
      state.articlePhotoItem.editState.originalWidth = img.width;
      state.articlePhotoItem.editState.originalHeight = img.height;
      state.articlePhotoItem.editState.detectedFormat = journalDetectMediaFormat(img.width, img.height);
      state.articlePhotoItem.editState.aspect = 'original';
      updateArticlePhotoEditorUI();
    }).catch(() => {});
  }
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
              <input type="hidden" name="article_photo_enabled" value="${hasArticlePhoto ? '1' : '0'}">
              <input type="file" name="article_photo" accept="image/*" hidden>
              <div class="journal-photo-editor full" id="journalPhotoEditor">
                <div class="journal-photo-editor-head">
                  <strong><i class="fa-solid fa-image"></i> Foto da matéria</strong>
                  <div class="journal-photo-editor-actions">
                    <button type="button" class="btn btn-ghost btn-sm" data-add-article-photo><i class="fa-solid fa-image"></i> ${hasArticlePhoto ? 'Trocar foto' : 'Adicionar foto'}</button>
                    <button type="button" class="btn btn-ghost btn-sm" data-remove-article-photo ${hasArticlePhoto ? '' : 'disabled'}><i class="fa-solid fa-xmark"></i> Remover</button>
                  </div>
                </div>
                <div class="journal-photo-editor-body" id="journalPhotoEditorBody" ${hasArticlePhoto ? '' : 'hidden'}>
                  <div class="journal-photo-editor-main" id="journalPhotoEditorMain" style="--editor-aspect:16 / 9">
                    ${hasArticlePhoto ? journalRenderEditableMediaNode(state.articlePhotoItem) : ''}
                  </div>
                  <div class="journal-photo-editor-controls" id="journalPhotoEditorControls">
                    <div class="journal-photo-editor-meta" id="journalPhotoEditorMeta">${hasArticlePhoto ? journalRenderMediaDimensionMeta(state.articlePhotoItem) : ''}</div>
                    <div class="journal-photo-editor-field">
                      <label>Proporção</label>
                      <select class="form-input form-select" data-photo-edit-field="aspect">
                        ${JOURNAL_IMAGE_ASPECT_OPTIONS.map(([value, label]) => `<option value="${value}" ${state.articlePhotoItem?.editState?.aspect === value ? 'selected' : ''}>${label}</option>`).join('')}
                      </select>
                    </div>
                    <div class="journal-photo-editor-field">
                      <label>Posição na matéria</label>
                      <select class="form-input form-select" name="article_photo_position">
                        <option value="right" ${getArticleImageMeta(articlePhotoItem).position === 'right' ? 'selected' : ''}>Direita</option>
                        <option value="left" ${getArticleImageMeta(articlePhotoItem).position === 'left' ? 'selected' : ''}>Esquerda</option>
                        <option value="top" ${getArticleImageMeta(articlePhotoItem).position === 'top' ? 'selected' : ''}>Topo</option>
                      </select>
                    </div>
                    <label class="journal-photo-editor-field">
                      <span>Zoom <span data-photo-zoom-label>${Number(state.articlePhotoItem?.editState?.zoom || 1).toFixed(2)}x</span></span>
                      <input type="range" min="0.5" max="3" step="0.01" value="${Number(state.articlePhotoItem?.editState?.zoom || 1)}" data-photo-edit-field="zoom">
                    </label>
                    <label class="journal-photo-editor-field">
                      <span>Rotação <span data-photo-rotation-label>${Math.round(Number(state.articlePhotoItem?.editState?.rotation || 0))}°</span></span>
                      <input type="range" min="0" max="360" step="1" value="${Number(state.articlePhotoItem?.editState?.rotation || 0)}" data-photo-edit-field="rotation">
                    </label>
                    <button type="button" class="btn btn-ghost btn-sm journal-photo-editor-reset" data-photo-edit-reset><i class="fa-solid fa-rotate-left"></i> Resetar enquadramento</button>
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
  modal.querySelectorAll('[data-photo-edit-field]').forEach((field) => field.addEventListener('input', (event) => handleArticlePhotoEditField(event)));
  modal.querySelector('[data-photo-edit-reset]')?.addEventListener('click', resetArticlePhotoEdit);
  modal.querySelector('[name="gallery"]')?.addEventListener('change', updateEditorPreview);
  modal.querySelector('#journalEditorForm')?.addEventListener('submit', savePost);
  updateEditorMode();
  if (state.articlePhotoItem) {
    bindArticlePhotoEditorGestures(modal);
    journalBindMediaPreviewDiagnostics(modal, state.articlePhotoItem);
  }
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
    const summary = postType === 'tirinha'
      ? form.elements.comic_caption.value.trim()
      : form.elements.summary?.value.trim() || null;

    if (postType === 'video' && !videoFile && !getPostVideoUrl(existing)) {
      throw new Error('Envie um vídeo principal para publicações de vídeo.');
    }
    if (postType === 'article' && !getArticleEditorBlocks().some((block) => block.text)) {
      throw new Error('Escreva o texto do jornal antes de salvar.');
    }
    if (postType === 'article' && articlePhotoEnabled && !state.articlePhotoItem && !existing?.media?.some((item) => item.media_type === 'image')) {
      throw new Error('Escolha uma imagem valida para a foto do jornal.');
    }
    if (postType === 'tirinha' && !galleryFiles.length && !existing?.media?.some((item) => item.media_type === 'image')) {
      throw new Error('Envie ao menos uma cena para a tirinha.');
    }

    const video = videoFile ? await uploadJornalFile(videoFile, 'videos', { videoOnly: true }) : null;
    const videoCover = videoFile ? await createJornalVideoCover(videoFile) : null;

    let articlePhoto = null;
    let articlePhotoMeta = {};
    if (postType === 'article' && articlePhotoEnabled && state.articlePhotoItem) {
      const item = state.articlePhotoItem;
      const editState = journalEnsureMediaEditState(item);
      const position = form.elements.article_photo_position?.value || 'right';
      articlePhotoMeta = {
        kind: 'article_photo',
        position,
        aspect: editState.aspect,
        exported: true,
        editState: { ...editState },
      };
      if (item.file) {
        const exportedFile = await exportStoryImageFile(item.file, editState);
        articlePhoto = await uploadJornalFile(exportedFile, 'article', { imageOnly: true });
      } else if (item.existingUrl) {
        articlePhoto = { url: item.existingUrl, storage_path: null, needsReExport: false };
      }
    }

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
      cover_url: videoCover?.url || existing?.cover_url || null,
      cover_storage_path: videoCover?.storage_path || existing?.cover_storage_path || null,
      video_url: video?.url || existing?.video_url || null,
      video_storage_path: video?.storage_path || existing?.video_storage_path || null,
      published_at: status === 'published' ? (existing?.published_at || new Date().toISOString()) : existing?.published_at || null,
      updated_at: new Date().toISOString(),
    };

    let postId = existing?.id;
    if (existing) {
      const { error } = await db.from('jornal_posts').update(payload).eq('id', existing.id);
      if (error) throw error;
      if (videoCover?.storage_path && existing.cover_storage_path) {
        db.storage.from(BUCKET).remove([existing.cover_storage_path]).catch((err) => console.warn('[MSY][jornal] Capa antiga nao removida:', err));
      }
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
    if (articlePhoto && articlePhoto.url) {
      mediaRows.push({
        post_id: postId,
        author_id: state.profile.id,
        media_type: 'image',
        url: articlePhoto.url,
        storage_path: articlePhoto.storage_path || null,
        position: ARTICLE_PHOTO_POSITION,
        alt_text: JSON.stringify(articlePhotoMeta),
      });
    }
    for (let index = 0; index < galleryFiles.length; index += 1) {
      const uploaded = await uploadJornalFile(galleryFiles[index], 'gallery', { imageOnly: true });
      mediaRows.push({ post_id: postId, author_id: state.profile.id, media_type: 'image', url: uploaded.url, storage_path: uploaded.storage_path, position: GALLERY_POSITION_START + index });
    }
    if (mediaRows.length) {
      const { error } = await db.from('jornal_media').insert(mediaRows);
      if (error) throw error;
    }

    if (state.articlePhotoItem?.url?.startsWith('blob:')) URL.revokeObjectURL(state.articlePhotoItem.url);
    state.articlePhotoItem = null;
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
    const layout = document.getElementById('journalArticlePaperLayout');
    const enabled = form.elements.article_photo_enabled?.value === '1';
    const position = form.elements.article_photo_position?.value || 'right';
    layout?.classList.toggle('no-photo', !enabled);
    layout?.classList.remove('photo-left', 'photo-right', 'photo-top');
    if (enabled) layout?.classList.add(`photo-${position}`);
  }

  const comicPreview = document.getElementById('journalComicPreview');
  if (comicPreview) {
    const count = Math.max(1, form.elements.gallery?.files?.length || comicPreview.dataset.existingCount || 4);
    comicPreview.innerHTML = renderComicEditorPreview(null, Number(count));
  }
}

function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Imagem invalida.'));
    img.crossOrigin = 'anonymous';
    img.src = url;
  });
}

function chooseArticlePhoto() {
  document.querySelector('#journalEditorForm [name="article_photo"]')?.click();
}

async function handleArticlePhotoSelected() {
  const form = document.getElementById('journalEditorForm');
  const file = form?.elements.article_photo?.files?.[0];
  if (!file) return;
  try {
    validateMediaFile(file, { maxImageMB: 12 });
    if (!file.type.startsWith('image/')) throw new Error('Use uma imagem neste campo.');
    const url = URL.createObjectURL(file);
    const img = await loadImage(file);
    if (state.articlePhotoItem?.url?.startsWith('blob:')) URL.revokeObjectURL(state.articlePhotoItem.url);
    state.articlePhotoItem = {
      id: 'article-photo',
      file,
      url,
      media_type: 'image',
      editState: normalizeMediaEditState({ aspect: 'original' }, 'image'),
    };
    state.articlePhotoItem.editState.originalAspect = img.width / img.height;
    state.articlePhotoItem.editState.originalWidth = img.width;
    state.articlePhotoItem.editState.originalHeight = img.height;
    state.articlePhotoItem.editState.detectedFormat = journalDetectMediaFormat(img.width, img.height);
    form.elements.article_photo_enabled.value = '1';
    updateArticlePhotoEditorUI();
    updateEditorPreview();
  } catch (err) {
    console.error('[MSY][jornal] Erro ao carregar foto:', err);
    Utils.showToast(err.message || 'Erro ao carregar imagem.', 'error');
  }
}

function removeArticlePhoto() {
  const form = document.getElementById('journalEditorForm');
  if (!form) return;
  form.elements.article_photo_enabled.value = '0';
  if (state.articlePhotoItem?.url?.startsWith('blob:')) URL.revokeObjectURL(state.articlePhotoItem.url);
  state.articlePhotoItem = null;
  const body = document.getElementById('journalPhotoEditorBody');
  const main = document.getElementById('journalPhotoEditorMain');
  const controls = document.getElementById('journalPhotoEditorControls');
  if (body) body.hidden = true;
  if (main) main.innerHTML = '';
  const removeBtn = document.querySelector('[data-remove-article-photo]');
  if (removeBtn) removeBtn.disabled = true;
  const addBtn = document.querySelector('[data-add-article-photo]');
  if (addBtn) addBtn.innerHTML = '<i class="fa-solid fa-image"></i> Adicionar foto';
  const photo = document.getElementById('journalArticlePhotoPreview');
  if (photo) {
    photo.classList.add('is-empty');
    photo.innerHTML = '<span>Foto</span>';
  }
  updateEditorPreview();
}

function updateArticlePhotoEditorUI() {
  const form = document.getElementById('journalEditorForm');
  const body = document.getElementById('journalPhotoEditorBody');
  const main = document.getElementById('journalPhotoEditorMain');
  const meta = document.getElementById('journalPhotoEditorMeta');
  const removeBtn = document.querySelector('[data-remove-article-photo]');
  const addBtn = document.querySelector('[data-add-article-photo]');
  const photo = document.getElementById('journalArticlePhotoPreview');
  const layout = document.getElementById('journalArticlePaperLayout');
  if (!state.articlePhotoItem) {
    if (body) body.hidden = true;
    if (removeBtn) removeBtn.disabled = true;
    if (addBtn) addBtn.innerHTML = '<i class="fa-solid fa-image"></i> Adicionar foto';
    if (photo) { photo.classList.add('is-empty'); photo.innerHTML = '<span>Foto</span>'; }
    layout?.classList.add('no-photo');
    return;
  }
  const editState = journalEnsureMediaEditState(state.articlePhotoItem);
  const aspect = journalMediaAspectCss(editState.aspect, editState.originalAspect);
  if (body) body.hidden = false;
  if (main) {
    main.style.setProperty('--editor-aspect', aspect);
    main.innerHTML = journalRenderEditableMediaNode(state.articlePhotoItem);
  }
  if (meta) meta.innerHTML = journalRenderMediaDimensionMeta(state.articlePhotoItem);
  if (removeBtn) removeBtn.disabled = false;
  if (addBtn) addBtn.innerHTML = '<i class="fa-solid fa-image"></i> Trocar foto';
  const zoomLabel = document.querySelector('[data-photo-zoom-label]');
  const rotationLabel = document.querySelector('[data-photo-rotation-label]');
  const zoomInput = document.querySelector('[data-photo-edit-field="zoom"]');
  const rotationInput = document.querySelector('[data-photo-edit-field="rotation"]');
  const aspectSelect = document.querySelector('[data-photo-edit-field="aspect"]');
  if (zoomLabel) zoomLabel.textContent = `${Number(editState.zoom || 1).toFixed(2)}x`;
  if (rotationLabel) rotationLabel.textContent = `${Math.round(Number(editState.rotation || 0))}°`;
  if (zoomInput) zoomInput.value = Number(editState.zoom || 1);
  if (rotationInput) rotationInput.value = Number(editState.rotation || 0);
  if (aspectSelect) aspectSelect.value = editState.aspect || 'original';
  if (photo) {
    photo.classList.remove('is-empty');
    photo.innerHTML = `<img src="${Utils.escapeHtml(state.articlePhotoItem.existingUrl || state.articlePhotoItem.url)}" alt="">`;
  }
  const position = form?.elements.article_photo_position?.value || 'right';
  layout?.classList.remove('no-photo', 'photo-left', 'photo-right', 'photo-top');
  layout?.classList.add(`photo-${position}`);
  const modal = document.getElementById('journalEditorModal');
  if (modal) {
    bindArticlePhotoEditorGestures(modal);
    journalBindMediaPreviewDiagnostics(modal, state.articlePhotoItem);
  }
}

function handleArticlePhotoEditField(event) {
  if (!state.articlePhotoItem) return;
  const key = event.currentTarget.dataset.photoEditField;
  const value = event.currentTarget.value;
  const editState = journalEnsureMediaEditState(state.articlePhotoItem);
  if (key === 'zoom' || key === 'rotation') editState[key] = Number(value);
  else editState[key] = value;
  if (key === 'aspect') {
    editState.zoom = 1;
    editState.offsetX = 0;
    editState.offsetY = 0;
    editState.rotation = 0;
  }
  const modal = document.getElementById('journalEditorModal');
  if (modal) {
    journalApplyMediaEditorTransform(modal, state.articlePhotoItem);
    const zoomLabel = modal.querySelector('[data-photo-zoom-label]');
    const rotationLabel = modal.querySelector('[data-photo-rotation-label]');
    if (zoomLabel) zoomLabel.textContent = `${Number(editState.zoom || 1).toFixed(2)}x`;
    if (rotationLabel) rotationLabel.textContent = `${Math.round(Number(editState.rotation || 0))}°`;
    const main = document.getElementById('journalPhotoEditorMain');
    if (main) main.style.setProperty('--editor-aspect', journalMediaAspectCss(editState.aspect, editState.originalAspect));
  }
  updateEditorPreview();
}

function resetArticlePhotoEdit() {
  if (!state.articlePhotoItem) return;
  const editState = journalEnsureMediaEditState(state.articlePhotoItem);
  editState.zoom = 1;
  editState.rotation = 0;
  editState.offsetX = 0;
  editState.offsetY = 0;
  updateArticlePhotoEditorUI();
}

function bindArticlePhotoEditorGestures(root) {
  if (!state.articlePhotoItem) return;
  journalBindMediaEditorGestures(root, state.articlePhotoItem, () => {
    const modal = document.getElementById('journalEditorModal');
    if (!modal) return;
    const zoomLabel = modal.querySelector('[data-photo-zoom-label]');
    const rotationLabel = modal.querySelector('[data-photo-rotation-label]');
    const zoomInput = modal.querySelector('[data-photo-edit-field="zoom"]');
    const rotationInput = modal.querySelector('[data-photo-edit-field="rotation"]');
    if (zoomLabel) zoomLabel.textContent = `${Number(state.articlePhotoItem.editState.zoom || 1).toFixed(2)}x`;
    if (rotationLabel) rotationLabel.textContent = `${Math.round(Number(state.articlePhotoItem.editState.rotation || 0))}°`;
    if (zoomInput) zoomInput.value = state.articlePhotoItem.editState.zoom;
    if (rotationInput) rotationInput.value = state.articlePhotoItem.editState.rotation;
  });
}
function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function getArticleAspectCssValue(aspect = '16:9') {
  if (aspect === 'free') return '4 / 3';
  return aspect.replace(':', ' / ');
}

function getArticleAspectStyle(aspect = '16:9') {
  return `--journal-image-aspect:${getArticleAspectCssValue(aspect)}`;
}

function renderArticleEditorBlock(block = { type: 'paragraph', text: '' }) {
  const isHeading = block.type === 'heading';
  const label = isHeading ? 'Subtítulo' : 'Texto do jornal';
  return `
    <div class="journal-article-editor-block" data-article-block="${isHeading ? 'heading' : 'paragraph'}">
      <label>${label}</label>
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

function createUploadId() {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === 'function') return webCrypto.randomUUID();
  if (typeof webCrypto?.getRandomValues === 'function') {
    const bytes = webCrypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
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
  const path = `${state.profile.id}/${folder}/${Date.now()}-${createUploadId()}-${safe}.${ext}`;
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
  const directCover = [post?.cover_url, post?.thumbnail_url, post?.poster_url]
    .find((url) => url && !isLikelyVideoUrl(url));
  if (directCover) return directCover;
  const image = post?.media?.find((item) => ['thumbnail', 'image'].includes(item.media_type) && item.url && !isLikelyVideoUrl(item.url));
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
  const fallback = { position: 'right', aspect: '16:9', cropActive: false, crop: { x: 0, y: 0, zoom: 1 }, exported: false };
  if (!media?.alt_text) return fallback;
  try {
    const meta = JSON.parse(media.alt_text);
    const crop = meta?.crop || {};
    return {
      position: ['left', 'right', 'top'].includes(meta?.position) ? meta.position : 'right',
      aspect: meta?.aspect || '16:9',
      cropActive: Boolean(meta?.cropActive),
      exported: Boolean(meta?.exported),
      crop: {
        x: clampNumber(Number(crop.x ?? 0), -60, 60),
        y: clampNumber(Number(crop.y ?? 0), -60, 60),
        zoom: clampNumber(Number(crop.zoom ?? 1), 1, 4),
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

function isWrittenPost(post) {
  return ['article', 'special'].includes(post?.post_type);
}

function groupBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key];
    if (!acc[value]) acc[value] = [];
    acc[value].push(item);
    return acc;
  }, {});
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key];
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function localJornalLikeKey(postId) {
  return `msy_jornal_like_${postId}`;
}

function getLocalJornalLiked(postId) {
  try {
    return localStorage.getItem(localJornalLikeKey(postId)) === '1';
  } catch {
    return false;
  }
}

function setLocalJornalLiked(postId, liked) {
  try {
    if (liked) localStorage.setItem(localJornalLikeKey(postId), '1');
    else localStorage.removeItem(localJornalLikeKey(postId));
  } catch {
    /* localStorage pode estar indisponivel em alguns webviews. */
  }
}

function localJornalViewKey(postId) {
  return `msy_jornal_view_${postId}`;
}

function getLocalJornalViewed(postId) {
  try {
    return localStorage.getItem(localJornalViewKey(postId)) === '1';
  } catch {
    return false;
  }
}

function setLocalJornalViewed(postId, viewed) {
  try {
    if (viewed) localStorage.setItem(localJornalViewKey(postId), '1');
    else localStorage.removeItem(localJornalViewKey(postId));
  } catch {
    /* localStorage pode estar indisponivel em alguns webviews. */
  }
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
