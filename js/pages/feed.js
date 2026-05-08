/* ============================================================
   MSY PORTAL — FEED SOCIAL
   Nova experiencia social interna.
   ============================================================ */

import { SocialService } from '../social/social_service.js';
import { filePreview, revokePreviews, uploadSocialMedia, validateMediaFile } from '../social/social_media.js';

const { db, Utils, renderSidebar, renderTopBar } = window.MSY;

const state = {
  profile: null,
  service: null,
  posts: [],
  stories: [],
  members: [],
  follows: [],
  messages: [],
  previews: [],
  hasSocialTables: true,
  loadingMore: false,
};

function avatar(person, size = 42) {
  const initials = person?.initials || Utils.getInitials(person?.name || 'MSY');
  const color = person?.color || '#7f1d1d';
  const img = person?.avatar_url
    ? `<img src="${Utils.escapeHtml(person.avatar_url)}" alt="${Utils.escapeHtml(person.name || 'Avatar')}">`
    : Utils.escapeHtml(initials);
  return `<div class="social-avatar" style="width:${size}px;height:${size}px;background:linear-gradient(135deg,${color},#111)">${img}</div>`;
}

function timeAgo(dateStr) {
  const diff = Math.max(1, Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000));
  if (diff < 60) return 'agora';
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} d`;
  return Utils.formatDate(dateStr);
}

function richText(text = '') {
  const safe = Utils.escapeHtml(text);
  return safe
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|\s)(#[\p{L}\p{N}_-]+)/gu, '$1<span class="hashtag">$2</span>')
    .replace(/(^|\s)(@[\p{L}\p{N}_.-]+)/gu, '$1<span class="mention">$2</span>');
}

function isFollowing(memberId) {
  return state.follows.some((f) => f.follower_id === state.profile.id && f.following_id === memberId);
}

function canManage(post) {
  return state.profile.tier === 'diretoria' || post.author_id === state.profile.id;
}

async function initFeed() {
  const profile = await renderSidebar('feed');
  if (!profile) return;
  state.profile = profile;
  state.service = new SocialService(db, profile, Utils);
  await renderTopBar('Feed Social', profile);

  document.getElementById('pageContent').innerHTML = layout();
  bindComposer();
  bindSearch();
  bindModals();
  await loadInitial();
  handleDeepLink();
}

function layout() {
  return `
    <div class="social-shell">
      <section class="social-main">
        <div class="social-hero">
          <div>
            <div class="social-title">Feed Social MSY</div>
            <div class="social-subtitle">Posts, fotos, stories, comentarios e interacoes da comunidade.</div>
          </div>
          <div class="social-pill"><i class="fa-solid fa-sparkles"></i> Rede interna</div>
        </div>

        <div class="stories-strip" id="storiesStrip"></div>

        <div class="social-composer">
          <div class="composer-top">
            ${avatar(state.profile)}
            <textarea class="composer-input" id="composerText" placeholder="Compartilhe uma atualizacao, foto, conquista ou ideia... Use @membro e #hashtags"></textarea>
          </div>
          <div class="composer-dropzone" id="composerDrop">
            <i class="fa-solid fa-cloud-arrow-up"></i>
            Arraste imagens ou videos aqui, ou clique para escolher.
          </div>
          <input type="file" id="composerFiles" accept="image/*,video/mp4,video/webm,video/quicktime" multiple hidden>
          <input type="file" id="storyFiles" accept="image/*,video/mp4,video/webm,video/quicktime" hidden>
          <div class="composer-previews" id="composerPreviews"></div>
          <div class="composer-actions">
            <div class="composer-tools">
              <button class="social-icon-btn" id="mediaBtn" title="Adicionar fotos ou videos"><i class="fa-solid fa-image"></i></button>
              <button class="social-icon-btn" id="emojiBtn" title="Adicionar emoji"><i class="fa-regular fa-face-smile"></i></button>
              <button class="social-icon-btn" id="storyBtn" title="Criar story"><i class="fa-solid fa-circle-plus"></i></button>
            </div>
            <button class="btn btn-primary social-submit" id="publishBtn"><i class="fa-solid fa-paper-plane"></i> Publicar</button>
          </div>
        </div>

        <div class="social-card">
          <div class="social-search">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input id="socialSearchInput" placeholder="Buscar posts, pessoas e hashtags">
          </div>
          <div class="social-search-results" id="socialSearchResults"></div>
        </div>

        <div class="social-feed-list" id="feedList">
          <div class="social-empty"><i class="fa-solid fa-circle-notch fa-spin"></i> Carregando feed...</div>
        </div>
      </section>

      <aside class="social-rail">
        <div class="social-card">
          <div class="side-title"><i class="fa-solid fa-user-plus"></i>Sugestoes para seguir</div>
          <div id="suggestionsList"></div>
        </div>
        <div class="social-card">
          <div class="side-title"><i class="fa-solid fa-inbox"></i>Mensagens recebidas</div>
          <div id="messagesList"></div>
        </div>
      </aside>
    </div>

    <div class="story-viewer" id="storyViewer"></div>
    <div class="profile-viewer" id="profileViewer"></div>
    <div class="share-viewer" id="shareViewer"></div>`;
}

async function loadInitial() {
  try {
    const data = await state.service.loadBootstrap();
    Object.assign(state, data, { hasSocialTables: true });
  } catch (err) {
    console.warn('[MSY][feed-social] Usando modo legado:', err);
    state.hasSocialTables = false;
    state.posts = await state.service.loadLegacyFeed();
    state.stories = [];
    state.members = await loadBasicMembers();
    state.follows = [];
    state.messages = [];
  }
  renderAll();
}

async function loadBasicMembers() {
  try {
    const { data } = await db
      .from('profiles')
      .select('id,name,role,tier,initials,color,avatar_url,bio')
      .eq('status', 'ativo')
      .order('name');
    return data || [];
  } catch {
    return [];
  }
}

function renderAll() {
  renderStories();
  renderPosts();
  renderSuggestions();
  renderMessages();
}

function renderStories() {
  const el = document.getElementById('storiesStrip');
  if (!el) return;
  const create = `
    <div class="story-create" id="createStoryBubble">
      <div class="story-avatar"><div class="story-avatar-inner"><i class="fa-solid fa-plus"></i></div></div>
      <div class="story-label">Seu story</div>
    </div>`;
  const stories = state.stories.map((group, idx) => `
    <div class="story-bubble" data-story-index="${idx}">
      <div class="story-avatar"><div class="story-avatar-inner">${group.author?.avatar_url ? `<img src="${Utils.escapeHtml(group.author.avatar_url)}">` : Utils.escapeHtml(group.author?.initials || Utils.getInitials(group.author?.name || 'MS'))}</div></div>
      <div class="story-label">${Utils.escapeHtml(group.author?.name || 'Membro')}</div>
    </div>`).join('');
  el.innerHTML = create + stories;
  document.getElementById('createStoryBubble')?.addEventListener('click', () => document.getElementById('storyFiles').click());
  el.querySelectorAll('[data-story-index]').forEach((node) => {
    node.addEventListener('click', () => openStory(Number(node.dataset.storyIndex), 0));
  });
}

function renderPosts() {
  const el = document.getElementById('feedList');
  if (!el) return;
  if (!state.posts.length) {
    el.innerHTML = `<div class="social-empty"><i class="fa-regular fa-images"></i>Nenhuma publicacao ainda. Seja o primeiro a postar.</div>`;
    return;
  }
  const warning = state.hasSocialTables ? '' : `
    <div class="social-schema-warning">
      <i class="fa-solid fa-database"></i>
      A nova rede social ja esta pronta no codigo. Para liberar posts, stories e curtidas reais, aplique o arquivo <strong>js/migration_social_feed.sql</strong> no Supabase.
    </div>`;
  el.innerHTML = warning + state.posts.map(renderPost).join('');
  bindPostEvents(el);
}

function renderPost(post) {
  const author = post.author || {};
  const verified = author.tier === 'diretoria' ? '<span class="verified-dot"><i class="fa-solid fa-check"></i></span>' : '';
  const media = (post.media || []).length ? `
    <div class="post-media">
      <div class="post-media-track">
        ${post.media.map((m) => `<div class="post-media-slide">${m.media_type === 'video' ? `<video src="${Utils.escapeHtml(m.url)}" controls playsinline></video>` : `<img src="${Utils.escapeHtml(m.url)}" loading="lazy">`}</div>`).join('')}
      </div>
      ${post.media.length > 1 ? `<div class="post-media-dots">${post.media.map((_, i) => `<span class="post-media-dot${i === 0 ? ' active' : ''}"></span>`).join('')}</div>` : ''}
    </div>` : '';
  return `
    <article class="social-post" id="post-${post.id}" data-post-id="${post.id}">
      <div class="post-head">
        <div class="post-author" data-profile-id="${author.id || post.author_id}">
          ${avatar(author, 44)}
          <div class="post-author-copy">
            <div class="post-author-name"><span>${Utils.escapeHtml(author.name || 'Membro MSY')}</span>${verified}</div>
            <div class="post-meta"><span>@${Utils.escapeHtml(author.username || Utils.getInitials(author.name || 'msy').toLowerCase())}</span><span>·</span><span>${Utils.escapeHtml(author.role || 'Membro')}</span><span>·</span><span>${timeAgo(post.created_at)}</span>${post.edited_at ? '<span>editado</span>' : ''}</div>
          </div>
        </div>
        <div class="post-menu-wrap">
          <button class="social-icon-btn post-more-btn"><i class="fa-solid fa-ellipsis"></i></button>
          <div class="post-menu">
            ${canManage(post) && !post.legacy ? `<button data-edit-post="${post.id}"><i class="fa-solid fa-pen"></i> Editar</button>` : ''}
            ${state.profile.tier === 'diretoria' && !post.legacy ? `<button data-pin-post="${post.id}"><i class="fa-solid fa-thumbtack"></i> ${post.is_pinned ? 'Desfixar' : 'Fixar'}</button>` : ''}
            ${canManage(post) && !post.legacy ? `<button class="danger" data-delete-post="${post.id}"><i class="fa-solid fa-trash"></i> Excluir</button>` : ''}
            <button data-copy-post="${post.id}"><i class="fa-solid fa-link"></i> Copiar link</button>
          </div>
        </div>
      </div>
      ${post.content ? `<div class="post-content">${richText(post.content)}</div>` : ''}
      ${media}
      ${post.link ? `<div class="post-content"><a href="${Utils.escapeHtml(post.link)}" target="_blank" rel="noopener">Abrir link original</a></div>` : ''}
      <div class="post-actions">
        <div class="post-actions-left">
          <button class="social-action ${post.liked_by_me ? 'active' : ''}" data-like-post="${post.id}" title="Curtir"><i class="fa-${post.liked_by_me ? 'solid' : 'regular'} fa-heart"></i></button>
          <button class="social-action" data-focus-comment="${post.id}" title="Comentar"><i class="fa-regular fa-comment"></i></button>
          <button class="social-action" data-share-post="${post.id}" title="Compartilhar"><i class="fa-regular fa-paper-plane"></i></button>
        </div>
        <button class="social-action ${post.saved_by_me ? 'active' : ''}" data-save-post="${post.id}" title="Salvar"><i class="fa-${post.saved_by_me ? 'solid' : 'regular'} fa-bookmark"></i></button>
      </div>
      <div class="post-stats">
        <span>${post.likes_count || 0} curtida${post.likes_count === 1 ? '' : 's'}</span>
        <span>${post.comments_count || 0} comentario${post.comments_count === 1 ? '' : 's'}</span>
      </div>
      <div class="post-comments">
        <div class="comments-list">${renderComments(post)}</div>
        ${state.hasSocialTables ? `
          <form class="comment-form" data-comment-form="${post.id}">
            ${avatar(state.profile, 32)}
            <input class="comment-input" name="comment" placeholder="Adicionar comentario...">
            <button class="social-icon-btn" type="submit" title="Enviar"><i class="fa-solid fa-arrow-up"></i></button>
          </form>` : ''}
      </div>
    </article>`;
}

function renderComments(post) {
  const comments = (post.comments || []).slice(-4);
  return comments.map((c) => `
    <div class="comment-item${c.parent_id ? ' reply' : ''}" id="comment-${c.id}">
      ${avatar(c.author || {}, 30)}
      <div class="comment-body">
        <div class="comment-name">${Utils.escapeHtml(c.author?.name || 'Membro')}</div>
        <div class="comment-text">${richText(c.content)}</div>
        <div class="comment-meta"><span>${timeAgo(c.created_at)}</span><button data-reply-comment="${c.id}" data-post-id="${post.id}">Responder</button></div>
      </div>
    </div>`).join('');
}

function bindPostEvents(root) {
  root.querySelectorAll('.post-more-btn').forEach((btn) => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    btn.nextElementSibling?.classList.toggle('open');
  }));
  document.addEventListener('click', () => document.querySelectorAll('.post-menu.open').forEach((m) => m.classList.remove('open')), { once: true });

  root.querySelectorAll('[data-like-post]').forEach((btn) => btn.addEventListener('click', () => toggleLike(btn.dataset.likePost, btn)));
  root.querySelectorAll('[data-save-post]').forEach((btn) => btn.addEventListener('click', () => toggleSave(btn.dataset.savePost)));
  root.querySelectorAll('[data-share-post]').forEach((btn) => btn.addEventListener('click', () => openShare(btn.dataset.sharePost)));
  root.querySelectorAll('[data-focus-comment]').forEach((btn) => btn.addEventListener('click', () => document.querySelector(`[data-comment-form="${btn.dataset.focusComment}"] input`)?.focus()));
  root.querySelectorAll('[data-profile-id]').forEach((node) => node.addEventListener('click', () => openProfile(node.dataset.profileId)));
  root.querySelectorAll('[data-delete-post]').forEach((btn) => btn.addEventListener('click', () => deletePost(btn.dataset.deletePost)));
  root.querySelectorAll('[data-edit-post]').forEach((btn) => btn.addEventListener('click', () => editPost(btn.dataset.editPost)));
  root.querySelectorAll('[data-pin-post]').forEach((btn) => btn.addEventListener('click', () => pinPost(btn.dataset.pinPost)));
  root.querySelectorAll('[data-copy-post]').forEach((btn) => btn.addEventListener('click', () => copyPost(btn.dataset.copyPost)));
  root.querySelectorAll('[data-comment-form]').forEach((form) => form.addEventListener('submit', addComment));
}

function bindComposer() {
  const files = document.getElementById('composerFiles');
  const drop = document.getElementById('composerDrop');
  document.getElementById('mediaBtn').addEventListener('click', () => {
    drop.classList.toggle('visible');
    files.click();
  });
  document.getElementById('emojiBtn').addEventListener('click', () => {
    const input = document.getElementById('composerText');
    input.value += input.value.endsWith(' ') || !input.value ? '✨ ' : ' ✨ ';
    input.focus();
  });
  document.getElementById('storyBtn').addEventListener('click', () => document.getElementById('storyFiles').click());
  document.getElementById('storyFiles').addEventListener('change', createStoryFromFile);
  document.getElementById('publishBtn').addEventListener('click', publishPost);
  files.addEventListener('change', () => addFiles([...files.files]));
  drop.addEventListener('click', () => files.click());
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('dragging'); }));
  drop.addEventListener('drop', (e) => addFiles([...e.dataTransfer.files]));
}

function addFiles(files) {
  try {
    files.forEach((file) => {
      validateMediaFile(file);
      if (state.previews.length >= 10) throw new Error('Limite de 10 midias por publicacao.');
      state.previews.push(filePreview(file));
    });
    renderPreviews();
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

function renderPreviews() {
  const el = document.getElementById('composerPreviews');
  el.innerHTML = state.previews.map((item) => `
    <div class="composer-preview" data-preview-id="${item.id}">
      ${item.media_type === 'video' ? `<video src="${item.url}" muted></video>` : `<img src="${item.url}">`}
      <button class="composer-preview-remove" title="Remover"><i class="fa-solid fa-xmark"></i></button>
    </div>`).join('');
  el.querySelectorAll('.composer-preview-remove').forEach((btn) => btn.addEventListener('click', () => {
    const id = btn.closest('.composer-preview').dataset.previewId;
    const item = state.previews.find((p) => p.id === id);
    revokePreviews([item]);
    state.previews = state.previews.filter((p) => p.id !== id);
    renderPreviews();
  }));
}

async function publishPost() {
  if (!state.hasSocialTables) {
    Utils.showToast('Aplique a migration social no Supabase antes de publicar no novo Feed.', 'error');
    return;
  }
  const btn = document.getElementById('publishBtn');
  const content = document.getElementById('composerText').value.trim();
  if (!content && !state.previews.length) return Utils.showToast('Escreva algo ou adicione uma midia.', 'error');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Publicando...';
  try {
    const media = [];
    for (const item of state.previews) media.push(await uploadSocialMedia(db, state.profile.id, item.file, 'posts'));
    await state.service.createPost({ content, media });
    revokePreviews(state.previews);
    state.previews = [];
    document.getElementById('composerText').value = '';
    renderPreviews();
    state.posts = await state.service.loadPosts();
    renderPosts();
    Utils.showToast('Publicado no Feed!');
  } catch (err) {
    console.error(err);
    Utils.showToast('Erro ao publicar. Confira a migration e o bucket social-media.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Publicar';
  }
}

async function createStoryFromFile() {
  if (!state.hasSocialTables) {
    Utils.showToast('Aplique a migration social no Supabase antes de criar stories.', 'error');
    return;
  }
  const input = document.getElementById('storyFiles');
  const file = input.files?.[0];
  if (!file) return;
  try {
    validateMediaFile(file);
    Utils.showToast('Enviando story...');
    const media = await uploadSocialMedia(db, state.profile.id, file, 'stories');
    await state.service.createStory(media);
    state.stories = await state.service.loadStories();
    renderStories();
    Utils.showToast('Story publicado por 24 horas!');
  } catch (err) {
    console.error(err);
    Utils.showToast('Erro ao criar story.', 'error');
  } finally {
    input.value = '';
  }
}

async function toggleLike(postId, btn) {
  const post = state.posts.find((p) => p.id === postId);
  if (!post || post.legacy) return;
  try {
    const liked = await state.service.toggleLike(post);
    post.liked_by_me = liked;
    post.likes_count += liked ? 1 : -1;
    btn.classList.toggle('active', liked);
    btn.classList.add('like-pop');
    setTimeout(() => btn.classList.remove('like-pop'), 380);
    btn.innerHTML = `<i class="fa-${liked ? 'solid' : 'regular'} fa-heart"></i>`;
    renderPosts();
  } catch {
    Utils.showToast('Erro ao curtir.', 'error');
  }
}

async function toggleSave(postId) {
  const post = state.posts.find((p) => p.id === postId);
  if (!post || post.legacy) return;
  try {
    const saved = await state.service.toggleSave(post);
    post.saved_by_me = saved;
    renderPosts();
    Utils.showToast(saved ? 'Publicacao salva.' : 'Publicacao removida dos salvos.');
  } catch {
    Utils.showToast('Erro ao salvar.', 'error');
  }
}

async function addComment(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const post = state.posts.find((p) => p.id === form.dataset.commentForm);
  const input = form.elements.comment;
  if (!post || !input.value.trim()) return;
  try {
    const comment = await state.service.addComment(post, input.value);
    post.comments.push(comment);
    post.comments_count += 1;
    input.value = '';
    renderPosts();
  } catch (err) {
    console.error('[MSY][feed-social] Erro ao comentar:', err);
    Utils.showToast('Erro ao comentar.', 'error');
  }
}

async function deletePost(postId) {
  if (!await MSYConfirm.show('Excluir esta publicacao?', { title: 'Excluir publicacao' })) return;
  await state.service.deletePost(postId);
  state.posts = state.posts.filter((p) => p.id !== postId);
  renderPosts();
}

async function editPost(postId) {
  const post = state.posts.find((p) => p.id === postId);
  const next = prompt('Editar publicacao:', post?.content || '');
  if (next === null) return;
  await state.service.updatePost(postId, next.trim());
  post.content = next.trim();
  post.edited_at = new Date().toISOString();
  renderPosts();
}

async function pinPost(postId) {
  const post = state.posts.find((p) => p.id === postId);
  await state.service.togglePin(postId, !post.is_pinned);
  post.is_pinned = !post.is_pinned;
  state.posts.sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || new Date(b.created_at) - new Date(a.created_at));
  renderPosts();
}

function copyPost(postId) {
  const url = `${location.origin}${location.pathname}?post=${postId}`;
  navigator.clipboard?.writeText(url);
  Utils.showToast('Link copiado.');
}

function renderSuggestions() {
  const el = document.getElementById('suggestionsList');
  if (!el) return;
  const items = state.members.filter((m) => m.id !== state.profile.id).slice(0, 6);
  el.innerHTML = items.length ? items.map((m) => `
    <div class="member-suggestion">
      <div data-open-member-profile="${m.id}" style="cursor:pointer">${avatar(m, 36)}</div>
      <div class="member-copy"><div class="member-name">${Utils.escapeHtml(m.name)}</div><div class="member-role">${Utils.escapeHtml(m.role || 'Membro')}</div></div>
      <button class="follow-btn ${isFollowing(m.id) ? 'following' : ''}" data-follow="${m.id}">${isFollowing(m.id) ? 'Seguindo' : 'Seguir'}</button>
    </div>`).join('') : '<div class="message-sub">Sugestoes aparecem depois da migration social.</div>';
  el.querySelectorAll('[data-follow]').forEach((btn) => btn.addEventListener('click', () => toggleFollow(btn.dataset.follow)));
  el.querySelectorAll('[data-open-member-profile]').forEach((node) => node.addEventListener('click', () => openProfile(node.dataset.openMemberProfile)));
}

async function toggleFollow(memberId) {
  if (!state.hasSocialTables) {
    Utils.showToast('Para seguir membros, aplique a migration social no Supabase.', 'error');
    return;
  }
  try {
    const following = isFollowing(memberId);
    const nowFollowing = await state.service.toggleFollow(memberId, following);
    if (nowFollowing) state.follows.push({ follower_id: state.profile.id, following_id: memberId });
    else state.follows = state.follows.filter((f) => !(f.follower_id === state.profile.id && f.following_id === memberId));
    renderSuggestions();
    const btn = document.querySelector(`[data-profile-follow="${memberId}"]`);
    if (btn) {
      btn.classList.toggle('following', nowFollowing);
      btn.textContent = nowFollowing ? 'Seguindo' : 'Seguir';
    }
  } catch {
    Utils.showToast('Erro ao seguir membro.', 'error');
  }
}

function renderMessages() {
  const el = document.getElementById('messagesList');
  if (!el) return;
  el.innerHTML = state.messages.length ? state.messages.map((m) => `
    <div class="message-row">
      ${avatar(m.sender, 34)}
      <div class="message-copy"><div class="message-name">${Utils.escapeHtml(m.sender?.name || 'Membro')}</div><div class="message-sub">${Utils.escapeHtml(m.body || 'Enviou uma publicacao')}</div></div>
    </div>`).join('') : '<div class="message-sub">Nenhuma mensagem nova.</div>';
}

function bindSearch() {
  const input = document.getElementById('socialSearchInput');
  const box = document.getElementById('socialSearchResults');
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim();
      if (q.length < 2) { box.classList.remove('open'); box.innerHTML = ''; return; }
      const res = state.hasSocialTables ? await state.service.search(q) : searchLocalMembers(q);
      box.innerHTML = [
        ...res.members.map((m) => `<div class="social-result-item" data-open-profile="${m.id}">${avatar(m, 32)}<div><strong>${Utils.escapeHtml(m.name)}</strong><div class="message-sub">@${Utils.escapeHtml(m.username || 'membro')}</div></div></div>`),
        ...res.posts.map((p) => `<div class="social-result-item" data-open-post="${p.id}"><i class="fa-regular fa-message"></i><div>${Utils.escapeHtml((p.content || '').slice(0, 90))}</div></div>`),
        ...res.hashtags.map((h) => `<div class="social-result-item"><i class="fa-solid fa-hashtag"></i><strong>${Utils.escapeHtml(h)}</strong></div>`),
      ].join('') || '<div class="message-sub">Nada encontrado.</div>';
      box.classList.add('open');
      box.querySelectorAll('[data-open-profile]').forEach((n) => n.addEventListener('click', () => openProfile(n.dataset.openProfile)));
      box.querySelectorAll('[data-open-post]').forEach((n) => n.addEventListener('click', () => focusPost(n.dataset.openPost)));
    }, 260);
  });
}

function searchLocalMembers(query) {
  const q = query.toLowerCase();
  return {
    posts: [],
    hashtags: [],
    members: state.members.filter((m) =>
      (m.name || '').toLowerCase().includes(q)
      || (m.role || '').toLowerCase().includes(q)
      || (m.username || '').toLowerCase().includes(q)
    ).slice(0, 10),
  };
}

function openProfile(memberId) {
  const member = state.members.find((m) => m.id === memberId) || state.posts.find((p) => p.author_id === memberId)?.author;
  if (!member) return;
  const postsCount = state.posts.filter((p) => p.author_id === memberId).length;
  const followers = state.follows.filter((f) => f.following_id === memberId).length;
  const following = state.follows.filter((f) => f.follower_id === memberId).length;
  const isMe = memberId === state.profile.id;
  const followingMember = isFollowing(memberId);
  const modal = document.getElementById('profileViewer');
  modal.innerHTML = `
    <div class="profile-panel">
      <div class="profile-cover">${member.banner_url ? `<img src="${Utils.escapeHtml(member.banner_url)}">` : ''}</div>
      <div class="profile-modal-body">
        <div class="profile-modal-head">
          ${avatar(member, 92)}
          <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
            ${!isMe ? `<button class="follow-btn ${followingMember ? 'following' : ''}" data-profile-follow="${memberId}">${followingMember ? 'Seguindo' : 'Seguir'}</button>` : ''}
            <button class="social-icon-btn story-close" data-close-modal><i class="fa-solid fa-xmark"></i></button>
          </div>
        </div>
        <div class="profile-modal-name">${Utils.escapeHtml(member.name)}</div>
        <div class="profile-modal-meta">@${Utils.escapeHtml(member.username || Utils.getInitials(member.name).toLowerCase())} · ${Utils.escapeHtml(member.role || 'Membro')} · ${member.tier === 'diretoria' ? 'Verificado' : 'Membro'}</div>
        <p class="profile-modal-bio">${Utils.escapeHtml(member.social_bio || member.bio || 'Sem bio ainda.')}</p>
        <div class="profile-stats">
          <div class="profile-stat"><strong>${postsCount}</strong><span>posts</span></div>
          <div class="profile-stat"><strong>${followers}</strong><span>seguidores</span></div>
          <div class="profile-stat"><strong>${following}</strong><span>seguindo</span></div>
        </div>
      </div>
    </div>`;
  modal.classList.add('open');
  modal.querySelector('[data-profile-follow]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFollow(memberId);
  });
}

function openShare(postId) {
  const post = state.posts.find((p) => p.id === postId);
  if (!post || post.legacy) return Utils.showToast('Compartilhamento disponivel no novo Feed social.', 'error');
  const modal = document.getElementById('shareViewer');
  const members = state.members.filter((m) => m.id !== state.profile.id);
  modal.innerHTML = `
    <div class="share-panel">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <div><div class="social-title" style="font-size:1.1rem">Enviar publicacao</div><div class="social-subtitle">Escolha um membro para receber no inbox.</div></div>
        <button class="social-icon-btn" data-close-modal><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="share-member-list">
        ${members.map((m) => `<div class="share-member" data-send-post="${post.id}" data-recipient="${m.id}">${avatar(m, 36)}<div><strong>${Utils.escapeHtml(m.name)}</strong><div class="message-sub">${Utils.escapeHtml(m.role || 'Membro')}</div></div></div>`).join('')}
      </div>
    </div>`;
  modal.classList.add('open');
  modal.querySelectorAll('[data-send-post]').forEach((node) => node.addEventListener('click', async () => {
    await state.service.sharePost(post, node.dataset.recipient);
    modal.classList.remove('open');
    Utils.showToast('Publicacao enviada.');
  }));
}

function openStory(groupIndex, storyIndex) {
  const group = state.stories[groupIndex];
  const story = group?.stories?.[storyIndex];
  if (!story) return;
  state.service.markStoryViewed(story.id);
  const modal = document.getElementById('storyViewer');
  modal.innerHTML = `
    <div class="story-panel">
      <div class="story-media">${story.media_type === 'video' ? `<video src="${Utils.escapeHtml(story.media_url)}" autoplay controls playsinline></video>` : `<img src="${Utils.escapeHtml(story.media_url)}">`}</div>
      <div class="story-top">${avatar(group.author, 34)}<strong>${Utils.escapeHtml(group.author?.name || 'Membro')}</strong><button class="social-icon-btn story-close" data-close-modal><i class="fa-solid fa-xmark"></i></button></div>
      <div class="story-bottom">${['❤️','🔥','👏','✨'].map((r) => `<button class="story-reaction" data-story-reaction="${r}">${r}</button>`).join('')}</div>
    </div>`;
  modal.classList.add('open');
  modal.querySelectorAll('[data-story-reaction]').forEach((btn) => btn.addEventListener('click', async () => {
    await state.service.reactToStory(story, btn.dataset.storyReaction);
    Utils.showToast('Reacao enviada.');
  }));
}

function bindModals() {
  document.addEventListener('click', (e) => {
    if (e.target.matches('.story-viewer,.profile-viewer,.share-viewer,[data-close-modal]') || e.target.closest('[data-close-modal]')) {
      document.querySelectorAll('.story-viewer,.profile-viewer,.share-viewer').forEach((m) => m.classList.remove('open'));
    }
  });
}

function focusPost(postId) {
  const node = document.getElementById(`post-${postId}`);
  if (!node) return;
  node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  node.classList.add('highlight');
  setTimeout(() => node.classList.remove('highlight'), 2600);
}

function handleDeepLink() {
  const params = new URLSearchParams(location.search);
  const postId = params.get('post');
  const commentId = params.get('comment');
  const profileId = params.get('profile');
  const storyId = params.get('story');
  if (postId) setTimeout(() => focusPost(postId), 500);
  if (commentId) setTimeout(() => {
    const node = document.getElementById(`comment-${commentId}`);
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      node.closest('.social-post')?.classList.add('highlight');
    }
  }, 600);
  if (profileId) setTimeout(() => openProfile(profileId), 500);
  if (storyId) {
    const groupIndex = state.stories.findIndex((g) => g.stories.some((s) => s.id === storyId));
    const storyIndex = groupIndex >= 0 ? state.stories[groupIndex].stories.findIndex((s) => s.id === storyId) : -1;
    if (groupIndex >= 0 && storyIndex >= 0) setTimeout(() => openStory(groupIndex, storyIndex), 500);
  }
}

initFeed().catch((err) => {
  console.error('[MSY][feed-social] Erro ao inicializar:', err);
  window.MSY.Utils.showToast?.('Erro ao carregar Feed Social.', 'error');
});
