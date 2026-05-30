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

const EDITOR_SECTION_LABELS = {
  principal: 'Destaques',
  videos: 'Videos',
  tirinha: 'Tirinhas',
  especiais: 'Especiais',
  arquivo: 'Arquivo',
};

const FORMAT_LABELS = {
  all: ['fa-layer-group', 'Tudo'],
  video: ['fa-circle-play', 'Vídeo'],
  written: ['fa-newspaper', 'Jornal escrito'],
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
          ${renderSection('videos', 'Jornal em video', 'Edições semanais, mensais e registros audiovisuais.', getSectionPosts('videos'))}
          ${renderSection('escrito', 'Jornal escrito', 'Matérias editoriais, reportagens internas e textos longos da Masayoshi.', getWrittenPosts())}
          ${renderSection('tirinha', 'Tirinhas e quadros visuais', 'Publicações ilustradas, humor interno e pequenas narrativas.', getSectionPosts('tirinha'))}
          ${renderSection('especiais', 'Publicações especiais', 'Matérias marcantes, editoriais e conteúdos de maior peso.', getSectionPosts('especiais'))}
          ${renderSection('arquivo', 'Arquivo editorial', 'Histórico completo das publicações preservadas.', getArchivePosts())}
        </main>
        <aside class="journal-side">
          ${renderSidePanel('Ultimos videos', getTypePosts('video').slice(0, 4))}
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
  const image = post?.cover_url ? `--hero-image:url('${Utils.escapeHtml(post.cover_url)}')` : '';
  return `
    <section class="journal-hero" style="${image}">
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
      ${posts.length ? `<div class="${gridClass}">${posts.map((post, index) => renderCard(post, index === 0 && key === 'principal')).join('')}</div>` : renderEmpty('Nenhuma publicação nesta seção ainda.')}
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
  const media = post.cover_url || post.media?.find((item) => item.media_type === 'image')?.url || '';
  const status = state.canManage && post.status !== 'published' ? `<span class="journal-chip">${post.status === 'draft' ? 'Rascunho' : 'Arquivado'}</span>` : '';
  return `
    <button class="journal-card ${large ? 'large' : ''}" data-open-journal-post="${post.id}" id="post-${post.id}">
      <div class="journal-card-media">
        ${media ? `<img src="${Utils.escapeHtml(media)}" loading="lazy" decoding="async" alt="">` : `<div class="fallback"><i class="fa-solid ${icon}"></i></div>`}
        ${post.post_type === 'video' ? '<span class="journal-play-badge"><i class="fa-solid fa-play"></i></span>' : ''}
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
          ${post.subtitle ? `<div class="journal-section-sub">${Utils.escapeHtml(post.subtitle)}</div>` : ''}
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
  if (post.post_type === 'video') {
    const videoUrl = post.video_url || post.media?.find((item) => item.media_type === 'video')?.url;
    return `
      <div class="journal-player">
        ${videoUrl ? `<video src="${Utils.escapeHtml(videoUrl)}" controls preload="metadata" poster="${Utils.escapeHtml(post.cover_url || '')}"></video>` : renderEmpty('Video indisponivel.')}
      </div>
      ${post.summary ? `<div class="journal-article"><p>${Utils.escapeHtml(post.summary)}</p></div>` : ''}`;
  }
  return `<article class="journal-article">${renderBlocks(post)}</article>`;
}

function renderBlocks(post) {
  const blocks = Array.isArray(post.content_blocks) ? post.content_blocks : [];
  const gallery = post.media?.filter((item) => item.media_type === 'image') || [];
  const body = blocks.length ? blocks.map((block) => {
    if (block.type === 'heading') return `<h3>${Utils.escapeHtml(block.text || '')}</h3>`;
    if (block.type === 'quote') return `<blockquote>${Utils.escapeHtml(block.text || '')}</blockquote>`;
    if (block.type === 'image') return renderFigure(block.url, block.caption);
    return `<p>${Utils.escapeHtml(block.text || '')}</p>`;
  }).join('') : (post.summary ? `<p>${Utils.escapeHtml(post.summary)}</p>` : '');

  const images = gallery.length ? gallery.map((item) => renderFigure(item.url, item.caption, true)).join('') : '';
  return `${post.cover_url ? renderFigure(post.cover_url, post.subtitle) : ''}${body}${images}`;
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
  const blocks = Array.isArray(post?.content_blocks) && post.content_blocks.length ? post.content_blocks : [{ type: 'paragraph', text: '' }];
  modal.innerHTML = `
    <div class="journal-modal-panel">
      <div class="journal-modal-head">
        <div class="journal-modal-title">${post ? 'Editar publicação' : 'Nova publicação'}</div>
        <button class="social-icon-btn" data-close-journal-modal><i class="fa-solid fa-xmark"></i></button>
      </div>
      <form class="journal-modal-body" id="journalEditorForm">
        <div class="journal-editor">
          <div class="journal-editor-grid">
            ${field('Título', 'title', post?.title || '', 'text', true)}
            ${field('Subtítulo', 'subtitle', post?.subtitle || '')}
            ${selectField('Tipo', 'post_type', post?.post_type || 'article', TYPE_LABELS)}
            ${selectField('Seção', 'section', post?.section || 'principal', Object.fromEntries(Object.entries(EDITOR_SECTION_LABELS).map(([k, v]) => [k, ['', v]])))}
            ${selectStatus(post?.status || 'draft')}
            ${field('Resumo', 'summary', post?.summary || '', 'textarea')}
            <div class="journal-field full">
              <label>Blocos da matéria</label>
              <div class="journal-blocks" id="journalBlocks">${blocks.map(renderBlockEditor).join('')}</div>
              <button type="button" class="btn btn-ghost btn-sm" id="journalAddBlock"><i class="fa-solid fa-plus"></i> Adicionar bloco</button>
            </div>
            <div class="journal-field">
              <label>Capa/thumbnail</label>
              <input type="file" name="cover" accept="image/*">
              <div class="journal-file-note">${post?.cover_url ? 'Uma capa já existe. Envie outra apenas se quiser substituir.' : 'Imagem principal para cards, hero e poster de vídeo.'}</div>
            </div>
            <div class="journal-field">
              <label>Vídeo principal</label>
              <input type="file" name="video" accept="video/mp4,video/webm,video/quicktime">
              <div class="journal-file-note">${post?.video_url ? 'Um vídeo já existe. Envie outro apenas se quiser substituir.' : 'Obrigatório para publicações do tipo vídeo.'}</div>
            </div>
            <div class="journal-field full">
              <label>Galeria/imagens internas</label>
              <input type="file" name="gallery" accept="image/*" multiple>
              <div class="journal-file-note">Use para tirinhas, galerias e imagens complementares de matérias.</div>
            </div>
            <label class="journal-chip"><input type="checkbox" name="comments_enabled" ${post?.comments_enabled !== false ? 'checked' : ''}> Comentários</label>
            <label class="journal-chip"><input type="checkbox" name="is_featured" ${post?.is_featured ? 'checked' : ''}> Destaque</label>
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
  modal.querySelector('#journalAddBlock')?.addEventListener('click', addBlockEditor);
  modal.querySelector('#journalBlocks')?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-remove-block]');
    if (btn) btn.closest('.journal-block-row')?.remove();
  });
  modal.querySelector('#journalEditorForm')?.addEventListener('submit', savePost);
}

function field(label, name, value = '', type = 'text', required = false) {
  const input = type === 'textarea'
    ? `<textarea name="${name}" ${required ? 'required' : ''}>${Utils.escapeHtml(value)}</textarea>`
    : `<input name="${name}" type="${type}" value="${Utils.escapeHtml(value)}" ${required ? 'required' : ''}>`;
  return `<div class="journal-field ${type === 'textarea' ? 'full' : ''}"><label>${label}</label>${input}</div>`;
}

function selectField(label, name, value, options) {
  return `<div class="journal-field"><label>${label}</label><select name="${name}">${Object.entries(options).map(([key, data]) => `<option value="${key}" ${key === value ? 'selected' : ''}>${data[1]}</option>`).join('')}</select></div>`;
}

function selectStatus(value) {
  return `<div class="journal-field"><label>Status</label><select name="status">
    <option value="draft" ${value === 'draft' ? 'selected' : ''}>Rascunho</option>
    <option value="published" ${value === 'published' ? 'selected' : ''}>Publicado</option>
    <option value="archived" ${value === 'archived' ? 'selected' : ''}>Arquivado</option>
  </select></div>`;
}

function renderBlockEditor(block = { type: 'paragraph', text: '' }) {
  return `
    <div class="journal-block-row">
      <select data-block-type>
        <option value="paragraph" ${block.type === 'paragraph' ? 'selected' : ''}>Parágrafo</option>
        <option value="heading" ${block.type === 'heading' ? 'selected' : ''}>Subtítulo</option>
        <option value="quote" ${block.type === 'quote' ? 'selected' : ''}>Citação</option>
      </select>
      <textarea data-block-text>${Utils.escapeHtml(block.text || '')}</textarea>
      <button type="button" class="social-icon-btn danger" data-remove-block title="Remover"><i class="fa-solid fa-trash"></i></button>
    </div>`;
}

function addBlockEditor() {
  document.getElementById('journalBlocks')?.insertAdjacentHTML('beforeend', renderBlockEditor());
}

async function savePost(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = document.querySelector('button[form="journalEditorForm"]');
  try {
    Utils.setButtonLoading?.(submit, true);
    const existing = state.posts.find((post) => post.id === state.editingPostId);
    const status = form.elements.status.value;
    const coverFile = form.elements.cover.files?.[0] || null;
    const videoFile = form.elements.video.files?.[0] || null;
    const galleryFiles = [...(form.elements.gallery.files || [])];

    if (form.elements.post_type.value === 'video' && !videoFile && !existing?.video_url) {
      throw new Error('Envie um vídeo principal para publicações de vídeo.');
    }

    const cover = coverFile ? await uploadJornalFile(coverFile, 'covers', { imageOnly: true }) : null;
    const video = videoFile ? await uploadJornalFile(videoFile, 'videos', { videoOnly: true }) : null;
    const payload = {
      title: form.elements.title.value.trim(),
      subtitle: form.elements.subtitle.value.trim() || null,
      summary: form.elements.summary.value.trim() || null,
      post_type: form.elements.post_type.value,
      section: form.elements.section.value,
      status,
      content_blocks: getEditorBlocks(),
      comments_enabled: form.elements.comments_enabled.checked,
      is_featured: form.elements.is_featured.checked,
      author_id: existing?.author_id || state.profile.id,
      cover_url: cover?.url || existing?.cover_url || null,
      cover_storage_path: cover?.storage_path || existing?.cover_storage_path || null,
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

    const mediaRows = [];
    if (video) mediaRows.push({ post_id: postId, author_id: state.profile.id, media_type: 'video', url: video.url, storage_path: video.storage_path, position: 0 });
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

function getEditorBlocks() {
  return [...document.querySelectorAll('.journal-block-row')]
    .map((row) => ({
      type: row.querySelector('[data-block-type]')?.value || 'paragraph',
      text: row.querySelector('[data-block-text]')?.value.trim() || '',
    }))
    .filter((block) => block.text);
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

function getWrittenPosts() {
  return state.posts.filter((post) => post.status !== 'archived' && ['article', 'special'].includes(post.post_type));
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
  document.body.classList.remove('social-modal-locked');
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
