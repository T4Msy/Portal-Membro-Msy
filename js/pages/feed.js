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
  socialNotifications: [],
  notificationFilter: 'all',
  notificationPanelOpen: false,
  socialNotificationChannel: null,
  directConversations: [],
  directUnreadCount: 0,
  activeDirectConversationId: null,
  activeProfileId: null,
  activeProfilePosts: [],
  activeProfileSummary: null,
  activeProfileTab: 'posts',
  previews: [],
  storyPreviews: [],
  storyCursor: null,
  storyMediaCache: new Map(),
  storyPreloadQueue: new Set(),
  modalScrollY: 0,
  bodyLockTop: '',
  hasSocialTables: true,
  loadingMore: false,
  hasMorePosts: true,
  postCursor: null,
  feedEventsBound: false,
  feedObserver: null,
  mediaObserver: null,
  mentionDropdown: null,
  mentionTarget: null,
  mentionItems: [],
  mentionActiveIndex: 0,
  socialSearchItems: [],
  socialSearchActiveIndex: 0,
  feedScrollBeforeProfile: 0,
  pendingFollows: new Set(),
};

function avatar(person, size = 42) {
  const initials = person?.initials || Utils.getInitials(person?.name || 'MSY');
  const color = person?.color || '#7f1d1d';
  const picture = person?.social_avatar_url || person?.avatar_url;
  const img = picture
    ? `<img src="${Utils.escapeHtml(picture)}" alt="${Utils.escapeHtml(person.name || 'Avatar')}">`
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

function canEditPost(post) {
  return post.author_id === state.profile.id;
}

function canManageStory(story) {
  return state.profile.tier === 'diretoria' || story.author_id === state.profile.id;
}

function displayUsername(member) {
  return state.service?.getDisplayUsername(member) || 'membro';
}

function setDirectConversations(conversations = []) {
  state.directConversations = conversations;
  state.directUnreadCount = state.service?.getDirectUnreadCount(conversations) || 0;
  renderDirectUnreadBadges();
}

function renderDirectUnreadBadges() {
  const count = Number(state.directUnreadCount || 0);
  ['directUnreadBadge', 'directUnreadMobileBadge'].forEach((id) => {
    const badge = document.getElementById(id);
    if (!badge) return;
    badge.toggleAttribute('hidden', count === 0);
    badge.textContent = count > 9 ? '9+' : String(count);
  });
}

function showFeedRoute() {
  const feed = document.getElementById('feedRouteView');
  const route = document.getElementById('socialProfileRoute');
  document.body.classList.remove('social-profile-mode');
  if (feed) {
    feed.hidden = false;
    feed.style.display = '';
    feed.setAttribute('aria-hidden', 'false');
  }
  if (route) {
    route.hidden = true;
    route.style.display = 'none';
    route.setAttribute('aria-hidden', 'true');
  }
}

function showProfileOnlyRoute() {
  const feed = document.getElementById('feedRouteView');
  const route = document.getElementById('socialProfileRoute');
  document.body.classList.add('social-profile-mode');
  if (feed) {
    feed.hidden = true;
    feed.style.display = 'none';
    feed.setAttribute('aria-hidden', 'true');
  }
  if (route) {
    route.hidden = false;
    route.style.display = '';
    route.setAttribute('aria-hidden', 'false');
  }
  window.scrollTo({ top: 0, behavior: 'auto' });
  document.getElementById('pageContent')?.scrollTo?.({ top: 0, behavior: 'auto' });
  route?.scrollTo?.({ top: 0, behavior: 'auto' });
}

function findMember(memberId) {
  return state.members.find((m) => m.id === memberId)
    || state.posts.find((p) => p.author_id === memberId)?.author
    || (memberId === state.profile?.id ? state.profile : null);
}

function isMobileSocial() {
  return window.matchMedia('(max-width: 640px)').matches;
}

function directStreakMeta(streak = {}) {
  const level = streak.active ? streak.level || 'nascimento' : 'apagado';
  const configs = {
    apagado: { icon: '·', label: 'Vínculo adormecido' },
    nascimento: { icon: '🐣', label: 'Nasceu' },
    pequeno: { icon: '🐤', label: 'Pequeno' },
    medio: { icon: '🐦', label: 'Médio' },
    forte: { icon: '🐦‍⬛', label: 'Forte' },
    lendario: { icon: '🪽', label: 'Lendário' },
  };
  return { level, ...configs[level] };
}

function findStoryById(storyId) {
  for (const group of state.stories) {
    const story = group.stories?.find((item) => item.id === storyId);
    if (story) return story;
  }
  return null;
}

function lockBodyScroll() {
  if (document.body.classList.contains('social-modal-locked')) return;
  state.modalScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  state.bodyLockTop = `-${state.modalScrollY}px`;
  document.documentElement.classList.add('social-modal-locked');
  document.body.classList.add('social-modal-locked');
  document.body.style.top = state.bodyLockTop;
}

function unlockBodyScroll() {
  if (!document.body.classList.contains('social-modal-locked')) return;
  document.documentElement.classList.remove('social-modal-locked');
  document.body.classList.remove('social-modal-locked');
  document.body.style.top = '';
  window.scrollTo({ top: state.modalScrollY, behavior: 'auto' });
}

function openModal(modal) {
  lockBodyScroll();
  if (modal.parentElement !== document.body) document.body.appendChild(modal);
  modal.classList.add('open');
}

function closeSocialModals() {
  const storyViewer = document.getElementById('storyViewer');
  if (storyViewer?.dataset.storyTimer) {
    clearTimeout(Number(storyViewer.dataset.storyTimer));
    delete storyViewer.dataset.storyTimer;
  }
  document.querySelectorAll('.story-viewer,.profile-viewer,.story-composer-modal,.media-viewer,.post-comments-modal').forEach((m) => {
    m.querySelectorAll('video').forEach((video) => video.pause());
    m.classList.remove('open');
    m.classList.remove('follow-list-viewer');
    m.classList.remove('social-profile-editor-viewer');
    ['align-items', 'justify-content', 'padding', 'background'].forEach((prop) => m.style.removeProperty(prop));
  });
  state.notificationPanelOpen = false;
  unlockBodyScroll();
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
  bindFeedInteractions();
  bindSocialNotifications();
  bindRouteNavigation();
  await loadInitial();
  subscribeSocialNotifications();
  handleDeepLink();
}

function layout() {
  return `
    <section id="socialProfileRoute" class="social-profile-route" hidden></section>
    <div class="social-shell" id="feedRouteView">
      <section class="social-main">
        <div class="social-hero">
          <div>
            <div class="social-title">Feed Social MSY</div>
            <div class="social-subtitle">Posts, stories, perfis e interacoes da comunidade.</div>
          </div>
          <div class="social-top-actions">
            <button class="social-icon-btn social-top-icon" id="openSearchBtn" title="Pesquisar membros"><i class="fa-solid fa-magnifying-glass"></i></button>
            <button class="social-icon-btn social-top-icon" id="openActivityBtn" title="Atividade"><i class="fa-regular fa-heart"></i><span class="social-notification-badge" id="socialNotificationBadge" hidden></span></button>
            <button class="social-icon-btn social-top-icon" id="openDirectBtn" title="Direct"><i class="fa-regular fa-paper-plane"></i><span class="social-notification-badge direct" id="directUnreadBadge" hidden></span></button>
            <button class="social-profile-chip" id="openMyProfileBtn" type="button" title="Meu perfil">${avatar(state.profile, 34)}<span>Meu perfil</span></button>
            <div class="social-pill"><i class="fa-solid fa-sparkles"></i> Rede interna</div>
          </div>
        </div>

        <div class="social-mobile-bar">
          <button class="social-mobile-action" id="openSearchMobileBtn"><i class="fa-solid fa-magnifying-glass"></i><span>Pesquisar</span></button>
          <button class="social-mobile-action" id="openActivityMobileBtn"><i class="fa-regular fa-heart"></i><span>Atividade</span><span class="social-notification-badge mobile" id="socialNotificationMobileBadge" hidden></span></button>
          <button class="social-mobile-action" id="openDirectMobileBtn"><i class="fa-regular fa-paper-plane"></i><span>Direct</span><span class="social-notification-badge mobile direct" id="directUnreadMobileBadge" hidden></span></button>
          <button class="social-mobile-action" id="openMyProfileMobileBtn"><i class="fa-regular fa-user"></i><span>Perfil</span></button>
        </div>

        <div class="social-card social-member-search-card">
          <div class="social-search">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input id="socialSearchInput" autocomplete="off" placeholder="Pesquisar @username">
            <button class="social-search-clear" type="button" id="socialSearchClear" hidden><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="social-search-results" id="socialSearchResults"></div>
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
          <input type="file" id="storyFiles" accept="image/*,video/mp4,video/webm,video/quicktime" multiple hidden>
          <div class="composer-previews" id="composerPreviews"></div>
          <div class="composer-actions">
            <div class="composer-tools">
              <button class="social-icon-btn" id="mediaBtn" title="Adicionar fotos ou videos"><i class="fa-solid fa-image"></i></button>
              <button class="social-icon-btn" id="emojiBtn" title="Adicionar emoji"><i class="fa-regular fa-face-smile"></i></button>
            </div>
            <button class="btn btn-primary social-submit" id="publishBtn"><i class="fa-solid fa-paper-plane"></i> Publicar</button>
          </div>
        </div>

        <div class="social-feed-list" id="feedList">
          <div class="social-empty"><i class="fa-solid fa-circle-notch fa-spin"></i> Carregando feed...</div>
        </div>
      </section>

      <aside class="social-rail">
        <div class="social-card my-social-card" id="mySocialProfileCard"></div>
        <div class="social-card">
          <div class="side-title"><i class="fa-solid fa-user-plus"></i>Descobrir membros</div>
          <div id="suggestionsList"></div>
        </div>
      </aside>
    </div>

    <div class="story-viewer" id="storyViewer"></div>
    <div class="media-viewer" id="mediaViewer"></div>
    <div class="post-comments-modal" id="postCommentsModal"></div>
    <div class="story-composer-modal" id="storyComposerModal"></div>
    <div class="story-composer-modal" id="mobilePostComposerModal"></div>
    <div class="profile-viewer" id="socialNotificationsDrawer"></div>
    <div class="profile-viewer" id="profileViewer"></div>
    <div class="profile-viewer" id="directViewer"></div>`;
}

async function loadInitial() {
  try {
    const data = await state.service.loadBootstrap();
    Object.assign(state, data, { hasSocialTables: true });
    setDirectConversations(data.directConversations || []);
    syncPostPaginationState();
  } catch (err) {
    console.warn('[MSY][feed-social] Usando modo legado:', err);
    state.hasSocialTables = false;
    state.posts = await state.service.loadLegacyFeed();
    state.stories = [];
    state.members = await loadBasicMembers();
    state.follows = [];
    state.messages = [];
    state.socialNotifications = [];
    state.directConversations = [];
    state.directUnreadCount = 0;
    syncPostPaginationState();
  }
  renderAll();
}

function syncPostPaginationState() {
  state.postCursor = state.posts.at(-1)?.created_at || null;
  state.hasMorePosts = state.hasSocialTables && state.posts.length >= state.service.pageSize;
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
  renderTopProfileChip();
  renderStories();
  renderPosts();
  renderSocialNotifications();
  renderDirectUnreadBadges();
  renderMyProfileCard();
  renderSuggestions();
}

function renderTopProfileChip() {
  const btn = document.getElementById('openMyProfileBtn');
  if (!btn || !state.profile) return;
  btn.innerHTML = `${avatar(state.profile, 34)}<span>Meu perfil</span>`;
}

function socialProfileStats(memberId = state.profile?.id) {
  return {
    posts: state.posts.filter((post) => post.author_id === memberId).length,
    followers: state.follows.filter((follow) => follow.following_id === memberId).length,
    following: state.follows.filter((follow) => follow.follower_id === memberId).length,
  };
}

function renderMyProfileCard() {
  const el = document.getElementById('mySocialProfileCard');
  if (!el || !state.profile) return;
  const stats = socialProfileStats(state.profile.id);
  el.innerHTML = `
    <div class="my-profile-cover">${state.profile.banner_url ? `<img src="${Utils.escapeHtml(state.profile.banner_url)}" alt="">` : ''}</div>
    <div class="my-profile-card-main">
      ${avatar(state.profile, 66)}
      <div class="my-profile-copy">
        <strong>${Utils.escapeHtml(state.profile.name || 'Meu perfil')}</strong>
        <span>@${Utils.escapeHtml(displayUsername(state.profile))}</span>
      </div>
    </div>
    <p>${Utils.escapeHtml(state.profile.social_bio || state.profile.bio || 'Configure sua bio social para aparecer aqui.')}</p>
    <div class="my-profile-stats">
      <button type="button" data-open-my-profile><strong>${stats.posts}</strong><span>posts</span></button>
      <button type="button" data-open-followers="${state.profile.id}"><strong>${stats.followers}</strong><span>seguidores</span></button>
      <button type="button" data-open-following="${state.profile.id}"><strong>${stats.following}</strong><span>seguindo</span></button>
    </div>
    <div class="my-profile-actions">
      <button type="button" class="follow-btn" data-open-my-profile><i class="fa-regular fa-user"></i> Ver perfil</button>
      <button type="button" class="follow-btn profile-primary-action" data-edit-social-profile><i class="fa-solid fa-pen"></i> Editar</button>
    </div>`;
  el.querySelectorAll('[data-open-my-profile]').forEach((btn) => btn.addEventListener('click', () => openProfile(state.profile.id)));
  el.querySelector('[data-edit-social-profile]')?.addEventListener('click', openSocialProfileEditor);
  el.querySelectorAll('[data-open-followers]').forEach((btn) => btn.addEventListener('click', () => openFollowList(btn.dataset.openFollowers, 'followers')));
  el.querySelectorAll('[data-open-following]').forEach((btn) => btn.addEventListener('click', () => openFollowList(btn.dataset.openFollowing, 'following')));
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
      <div class="story-avatar"><div class="story-avatar-inner">${group.author?.social_avatar_url || group.author?.avatar_url ? `<img src="${Utils.escapeHtml(group.author.social_avatar_url || group.author.avatar_url)}">` : Utils.escapeHtml(group.author?.initials || Utils.getInitials(group.author?.name || 'MS'))}</div></div>
      <div class="story-label">${Utils.escapeHtml(group.author?.name || 'Membro')}</div>
    </div>`).join('');
  el.innerHTML = create + stories;
  document.getElementById('createStoryBubble')?.addEventListener('click', () => document.getElementById('storyFiles').click());
  el.querySelectorAll('[data-story-index]').forEach((node) => {
    node.addEventListener('click', () => openStory(Number(node.dataset.storyIndex), 0));
  });
  if (state.stories.length) {
    if (window.requestIdleCallback) window.requestIdleCallback(() => warmStoryWindow(0, 0), { timeout: 400 });
    else window.setTimeout(() => warmStoryWindow(0, 0), 120);
  }
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
  el.innerHTML = warning + state.posts.map(renderPost).join('') + renderFeedSentinel();
  hydrateFeedEnhancements(el);
  setupInfiniteFeed();
}

function renderFeedSentinel() {
  if (!state.hasSocialTables || !state.hasMorePosts) return '';
  return '<div class="feed-sentinel" id="feedSentinel"><i class="fa-solid fa-circle-notch fa-spin"></i> Carregando mais publicacoes...</div>';
}

function renderPost(post) {
  const author = post.author || {};
  const verified = author.tier === 'diretoria' ? '<span class="verified-dot"><i class="fa-solid fa-check"></i></span>' : '';
  const media = (post.media || []).length ? `
      <div class="post-media" data-media-post="${post.id}">
        <div class="post-media-track">
        ${post.media.map((m, index) => `<div class="post-media-slide" role="button" tabindex="0" data-open-media="${post.id}" data-media-index="${index}" aria-label="Abrir midia">${m.media_type === 'video' ? `<video src="${Utils.escapeHtml(m.url)}" controls playsinline preload="metadata"></video>` : `<img src="${Utils.escapeHtml(m.url)}" loading="lazy" decoding="async">`}</div>`).join('')}
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
            <div class="post-meta"><span>@${Utils.escapeHtml(displayUsername(author))}</span><span>·</span><span>${Utils.escapeHtml(author.role || 'Membro')}</span><span>·</span><span>${timeAgo(post.created_at)}</span>${post.edited_at ? '<span class="edited-badge">Editado</span>' : ''}</div>
          </div>
        </div>
        <div class="post-menu-wrap">
          <button class="social-icon-btn post-more-btn" data-post-menu="${post.id}" aria-label="Mais opcoes"><i class="fa-solid fa-ellipsis"></i></button>
          <div class="post-menu">
            ${canEditPost(post) && !post.legacy ? `<button data-edit-post="${post.id}"><i class="fa-solid fa-pen"></i> Editar</button>` : ''}
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
          <button class="social-action" data-open-comments="${post.id}" title="Comentar"><i class="fa-regular fa-comment"></i></button>
          <button class="social-action" data-message-post-author="${author.id || post.author_id}" title="Enviar direct"><i class="fa-regular fa-paper-plane"></i></button>
        </div>
        <button class="social-action ${post.saved_by_me ? 'active' : ''}" data-save-post="${post.id}" title="Salvar"><i class="fa-${post.saved_by_me ? 'solid' : 'regular'} fa-bookmark"></i></button>
      </div>
      <div class="post-stats">
        <span>${post.likes_count || 0} curtida${post.likes_count === 1 ? '' : 's'}</span>
        <span>${post.comments_count || 0} comentario${post.comments_count === 1 ? '' : 's'}</span>
      </div>
      <div class="post-comments">
        ${(post.comments_count || 0) > 0 ? `<button class="post-comments-open" type="button" data-open-comments="${post.id}">Ver ${post.comments_count} comentario${post.comments_count === 1 ? '' : 's'}</button>` : ''}
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

function hydrateFeedEnhancements(root = document) {
  root.querySelectorAll('.post-media-track:not([data-media-bound])').forEach((track) => {
    track.dataset.mediaBound = 'true';
    track.addEventListener('scroll', () => syncMediaDots(track), { passive: true });
  });
  ensureMediaObserver();
  root.querySelectorAll('.post-media-slide video').forEach((video) => state.mediaObserver?.observe(video));
}

function syncMediaDots(track) {
  const wrap = track.closest('.post-media');
  const dots = wrap?.querySelectorAll('.post-media-dot') || [];
  if (!dots.length) return;
  const index = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
  dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
}

function ensureMediaObserver() {
  if (state.mediaObserver || !('IntersectionObserver' in window)) return;
  state.mediaObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting && entry.target instanceof HTMLVideoElement) entry.target.pause();
    });
  }, { threshold: 0.2 });
}

function bindFeedInteractions() {
  if (state.feedEventsBound) return;
  state.feedEventsBound = true;
  const root = document.getElementById('feedList');
  if (!root) return;
  root.addEventListener('click', handleFeedClick);
  root.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-open-media]')) {
      e.preventDefault();
      handleFeedClick(e);
    }
  });
  root.addEventListener('submit', (e) => {
    if (e.target.matches('[data-comment-form]')) addComment(e);
  });
  root.addEventListener('focusin', (e) => {
    if (e.target.matches('.comment-input')) bindMentionAutocomplete(e.target, { minChars: 1 });
  });
}

function handleFeedClick(e) {
  if (e.target.closest('[data-load-more-posts]')) return loadMorePosts();
  const menuBtn = e.target.closest('[data-post-menu]');
  if (menuBtn) {
    e.stopPropagation();
    menuBtn.nextElementSibling?.classList.toggle('open');
    return;
  }
  const mediaBtn = e.target.closest('[data-open-media]');
  if (mediaBtn) {
    if (e.target.closest('video')) return;
    const post = state.posts.find((p) => p.id === mediaBtn.dataset.openMedia);
    if (post) openMediaViewer(post, Number(mediaBtn.dataset.mediaIndex || 0));
    return;
  }
  const likeBtn = e.target.closest('[data-like-post]');
  if (likeBtn) return toggleLike(likeBtn.dataset.likePost, likeBtn);
  const saveBtn = e.target.closest('[data-save-post]');
  if (saveBtn) return toggleSave(saveBtn.dataset.savePost, saveBtn);
  const commentBtn = e.target.closest('[data-focus-comment]');
  if (commentBtn) {
    document.querySelector(`[data-comment-form="${commentBtn.dataset.focusComment}"] input`)?.focus();
    return;
  }
  const openCommentsBtn = e.target.closest('[data-open-comments]');
  if (openCommentsBtn) return openPostComments(openCommentsBtn.dataset.openComments);
  const replyBtn = e.target.closest('[data-reply-comment]');
  if (replyBtn) return openPostComments(replyBtn.dataset.postId, replyBtn.dataset.replyComment);
  const directBtn = e.target.closest('[data-message-post-author]');
  if (directBtn) return openDirectInbox(directBtn.dataset.messagePostAuthor);
  const profileNode = e.target.closest('[data-profile-id]');
  if (profileNode) return openProfile(profileNode.dataset.profileId);
  const deleteBtn = e.target.closest('[data-delete-post]');
  if (deleteBtn) return deletePost(deleteBtn.dataset.deletePost);
  const editBtn = e.target.closest('[data-edit-post]');
  if (editBtn) return editPost(editBtn.dataset.editPost);
  const pinBtn = e.target.closest('[data-pin-post]');
  if (pinBtn) return pinPost(pinBtn.dataset.pinPost);
  const copyBtn = e.target.closest('[data-copy-post]');
  if (copyBtn) return copyPost(copyBtn.dataset.copyPost);
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.post-menu-wrap')) {
    document.querySelectorAll('.post-menu.open').forEach((m) => m.classList.remove('open'));
  }
});

function updatePostNode(postId) {
  const post = state.posts.find((p) => p.id === postId);
  const node = document.getElementById(`post-${postId}`);
  if (!post || !node) return;
  node.outerHTML = renderPost(post);
  const next = document.getElementById(`post-${postId}`);
  if (next) hydrateFeedEnhancements(next);
}

function updatePostStatsNode(post) {
  const node = document.getElementById(`post-${post.id}`);
  const stats = node?.querySelector('.post-stats');
  if (!stats) return;
  stats.innerHTML = `
    <span>${post.likes_count || 0} curtida${post.likes_count === 1 ? '' : 's'}</span>
    <span>${post.comments_count || 0} comentario${post.comments_count === 1 ? '' : 's'}</span>`;
}

function openMediaViewer(post, startIndex = 0) {
  const modal = document.getElementById('mediaViewer');
  const media = post.media || [];
  if (!modal || !media.length) return;
  const index = Math.max(0, Math.min(startIndex, media.length - 1));
  modal.innerHTML = `
    <div class="media-viewer-panel">
      <div class="media-viewer-top">
        ${avatar(post.author || {}, 34)}
        <div class="media-viewer-copy">
          <strong>${Utils.escapeHtml(post.author?.name || 'Membro MSY')}</strong>
          <span>${index + 1} de ${media.length}</span>
        </div>
        <button class="social-icon-btn story-close" data-close-modal><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="media-viewer-track">
        ${media.map((item, idx) => `<div class="media-viewer-slide${idx === index ? ' active' : ''}" data-media-view-slide="${idx}">
          ${item.media_type === 'video' ? `<video src="${Utils.escapeHtml(item.url)}" controls playsinline preload="metadata"></video>` : `<img src="${Utils.escapeHtml(item.url)}" alt="Midia do post" decoding="async">`}
        </div>`).join('')}
      </div>
      ${media.length > 1 ? `
        <button class="media-viewer-nav prev" data-media-view-prev><i class="fa-solid fa-chevron-left"></i></button>
        <button class="media-viewer-nav next" data-media-view-next><i class="fa-solid fa-chevron-right"></i></button>` : ''}
    </div>`;
  openModal(modal);
  const show = (nextIndex) => {
    const safeIndex = Math.max(0, Math.min(nextIndex, media.length - 1));
    modal.querySelectorAll('video').forEach((video) => video.pause());
    modal.querySelectorAll('[data-media-view-slide]').forEach((slide) => {
      slide.classList.toggle('active', Number(slide.dataset.mediaViewSlide) === safeIndex);
    });
    const count = modal.querySelector('.media-viewer-copy span');
    if (count) count.textContent = `${safeIndex + 1} de ${media.length}`;
    modal.dataset.mediaIndex = String(safeIndex);
  };
  modal.dataset.mediaIndex = String(index);
  modal.querySelector('[data-media-view-prev]')?.addEventListener('click', () => show(Number(modal.dataset.mediaIndex || 0) - 1));
  modal.querySelector('[data-media-view-next]')?.addEventListener('click', () => show(Number(modal.dataset.mediaIndex || 0) + 1));
}

function renderComments(post) {
  const comments = (post.comments || []).slice(-4);
  return comments.map((c) => `
    <div class="comment-item${c.parent_id ? ' reply' : ''}" id="comment-${c.id}">
      ${avatar(c.author || {}, 30)}
      <div class="comment-body">
        <div class="comment-name">${Utils.escapeHtml(c.author?.name || 'Membro')} <span class="message-sub">@${Utils.escapeHtml(displayUsername(c.author || {}))}</span></div>
        <div class="comment-text">${richText(c.content)}</div>
        <div class="comment-meta"><span>${timeAgo(c.created_at)}</span><button data-reply-comment="${c.id}" data-post-id="${post.id}">Responder</button></div>
      </div>
    </div>`).join('');
}

function renderCommentRows(post, { full = false } = {}) {
  const comments = full ? (post.comments || []) : (post.comments || []).slice(-4);
  return comments.map((c) => `
    <div class="comment-item${c.parent_id ? ' reply' : ''}" id="comment-${c.id}" data-comment-row="${c.id}">
      ${avatar(c.author || {}, 32)}
      <div class="comment-body">
        <div class="comment-name">${Utils.escapeHtml(c.author?.name || 'Membro')} <span class="message-sub">@${Utils.escapeHtml(displayUsername(c.author || {}))}</span></div>
        <div class="comment-text">${richText(c.content)}</div>
        <div class="comment-meta"><span>${timeAgo(c.created_at)}</span><button data-reply-comment="${c.id}" data-post-id="${post.id}">Responder</button></div>
      </div>
    </div>`).join('');
}

function openPostComments(postId, replyToCommentId = null) {
  const post = state.posts.find((p) => p.id === postId);
  const modal = document.getElementById('postCommentsModal');
  if (!post || !modal) return;
  const replyTo = replyToCommentId ? post.comments.find((comment) => comment.id === replyToCommentId) : null;
  modal.innerHTML = `
    <div class="post-comments-panel">
      <div class="post-comments-grabber"></div>
      <div class="post-comments-head">
        <div>
          <strong>Comentarios</strong>
          <span>${post.comments_count || 0} resposta${post.comments_count === 1 ? '' : 's'} na publicacao</span>
        </div>
        <button class="social-icon-btn" data-close-modal><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="post-comments-context">
        ${avatar(post.author || {}, 34)}
        <div><strong>${Utils.escapeHtml(post.author?.name || 'Membro MSY')}</strong><p>${Utils.escapeHtml((post.content || '').slice(0, 180))}</p></div>
      </div>
      <div class="post-comments-list" id="postCommentsSheetList">
        ${(post.comments || []).length ? renderCommentRows(post, { full: true }) : '<div class="social-empty"><i class="fa-regular fa-comment"></i>Nenhum comentario ainda.</div>'}
      </div>
      <form class="post-comments-composer" id="postCommentsComposer">
        ${avatar(state.profile, 34)}
        <div class="post-comments-input-wrap">
          <div class="post-comments-reply-target" id="postCommentsReplyTarget" style="${replyTo ? '' : 'display:none'}">
            Respondendo ${replyTo ? Utils.escapeHtml(replyTo.author?.name || 'comentario') : ''}<button type="button" data-clear-comment-reply><i class="fa-solid fa-xmark"></i></button>
          </div>
          <input name="comment" class="comment-input" autocomplete="off" placeholder="Adicionar comentario...">
        </div>
        <button class="social-icon-btn" type="submit" title="Enviar"><i class="fa-solid fa-arrow-up"></i></button>
      </form>
    </div>`;
  modal.dataset.postId = postId;
  modal.dataset.replyTo = replyToCommentId || '';
  openModal(modal);
  const input = modal.querySelector('input[name="comment"]');
  bindMentionAutocomplete(input, { minChars: 1 });
  modal.querySelector('#postCommentsSheetList')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-reply-comment]');
    if (btn) setPostCommentReply(post, btn.dataset.replyComment);
  });
  modal.querySelector('[data-clear-comment-reply]')?.addEventListener('click', () => setPostCommentReply(post, null));
  modal.querySelector('#postCommentsComposer')?.addEventListener('submit', submitPostCommentSheet);
  requestAnimationFrame(() => input?.focus({ preventScroll: true }));
}

function setPostCommentReply(post, commentId) {
  const modal = document.getElementById('postCommentsModal');
  if (!modal || !post) return;
  const target = commentId ? post.comments.find((comment) => comment.id === commentId) : null;
  modal.dataset.replyTo = target?.id || '';
  const label = modal.querySelector('#postCommentsReplyTarget');
  if (label) {
    label.style.display = target ? '' : 'none';
    label.innerHTML = target
      ? `Respondendo ${Utils.escapeHtml(target.author?.name || 'comentario')}<button type="button" data-clear-comment-reply><i class="fa-solid fa-xmark"></i></button>`
      : '';
    label.querySelector('[data-clear-comment-reply]')?.addEventListener('click', () => setPostCommentReply(post, null));
  }
  modal.querySelector('input[name="comment"]')?.focus();
}

async function submitPostCommentSheet(e) {
  e.preventDefault();
  const modal = document.getElementById('postCommentsModal');
  const post = state.posts.find((p) => p.id === modal?.dataset.postId);
  const input = e.currentTarget.elements.comment;
  const body = input?.value.trim();
  if (!post || !body) return;
  const btn = e.currentTarget.querySelector('button[type="submit"]');
  try {
    if (btn) btn.disabled = true;
    const comment = await state.service.addComment(post, body, modal.dataset.replyTo || null);
    post.comments.push(comment);
    post.comments_count += 1;
    input.value = '';
    setPostCommentReply(post, null);
    const list = document.getElementById('postCommentsSheetList');
    if (list) list.innerHTML = renderCommentRows(post, { full: true });
    updatePostStatsNode(post);
    updatePostNode(post.id);
  } catch (err) {
    console.error('[MSY][feed-social] Erro ao comentar:', err);
    Utils.showToast(err.message || 'Erro ao comentar.', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function bindPostEvents(root) {
  root.querySelectorAll('.post-more-btn').forEach((btn) => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    btn.nextElementSibling?.classList.toggle('open');
  }));
  document.addEventListener('click', () => document.querySelectorAll('.post-menu.open').forEach((m) => m.classList.remove('open')), { once: true });

  root.querySelectorAll('[data-like-post]').forEach((btn) => btn.addEventListener('click', () => toggleLike(btn.dataset.likePost, btn)));
  root.querySelectorAll('[data-save-post]').forEach((btn) => btn.addEventListener('click', () => toggleSave(btn.dataset.savePost)));
  root.querySelectorAll('[data-focus-comment]').forEach((btn) => btn.addEventListener('click', () => document.querySelector(`[data-comment-form="${btn.dataset.focusComment}"] input`)?.focus()));
  root.querySelectorAll('[data-message-post-author]').forEach((btn) => btn.addEventListener('click', () => openDirectInbox(btn.dataset.messagePostAuthor)));
  root.querySelectorAll('[data-profile-id]').forEach((node) => node.addEventListener('click', () => openProfile(node.dataset.profileId)));
  root.querySelectorAll('[data-delete-post]').forEach((btn) => btn.addEventListener('click', () => deletePost(btn.dataset.deletePost)));
  root.querySelectorAll('[data-edit-post]').forEach((btn) => btn.addEventListener('click', () => editPost(btn.dataset.editPost)));
  root.querySelectorAll('[data-pin-post]').forEach((btn) => btn.addEventListener('click', () => pinPost(btn.dataset.pinPost)));
  root.querySelectorAll('[data-copy-post]').forEach((btn) => btn.addEventListener('click', () => copyPost(btn.dataset.copyPost)));
  root.querySelectorAll('[data-comment-form]').forEach((form) => {
    form.addEventListener('submit', addComment);
    bindMentionAutocomplete(form.elements.comment, { minChars: 1 });
  });
}

function bindComposer() {
  const files = document.getElementById('composerFiles');
  const drop = document.getElementById('composerDrop');
  const composerInput = document.getElementById('composerText');
  document.getElementById('mediaBtn').addEventListener('click', () => {
    if (isMobileSocial()) {
      openMobilePostComposer({ pickMedia: true });
      return;
    }
    drop.classList.toggle('visible');
    files.click();
  });
  document.getElementById('openDirectBtn')?.addEventListener('click', () => openDirectInbox());
  document.getElementById('emojiBtn').addEventListener('click', () => {
    composerInput.value += composerInput.value.endsWith(' ') || !composerInput.value ? '✨ ' : ' ✨ ';
    composerInput.focus();
    syncComposerState();
  });
  composerInput.addEventListener('input', syncComposerState);
  composerInput.addEventListener('focus', () => {
    if (isMobileSocial()) openMobilePostComposer();
  });
  bindMentionAutocomplete(composerInput, { minChars: 1 });
  document.getElementById('storyFiles').addEventListener('change', createStoryFromFile);
  document.getElementById('publishBtn').addEventListener('click', publishPost);
  files.addEventListener('change', () => {
    addFiles([...files.files]);
    files.value = '';
  });
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
    if (isMobileSocial()) openMobilePostComposer();
  } catch (err) {
    Utils.showToast(err.message, 'error');
  }
}

function renderPreviews() {
  const el = document.getElementById('composerPreviews');
  if (!el) return;
  if (!state.previews.length) {
    el.innerHTML = '';
    syncComposerState();
    return;
  }
  const main = state.previews[0];
  const mediaNode = (item, attrs = '') => item.media_type === 'video'
    ? `<video src="${item.url}" muted playsinline ${attrs}></video>`
    : `<img src="${item.url}" alt="Preview da publicacao" ${attrs}>`;
  el.innerHTML = `
    <div class="composer-preview-stage">
      <div class="composer-preview-main" data-preview-id="${main.id}">
        ${mediaNode(main)}
        <button class="composer-preview-remove" title="Remover midia" aria-label="Remover midia"><i class="fa-solid fa-xmark"></i></button>
        <div class="composer-preview-badge"><i class="fa-solid fa-layer-group"></i> ${state.previews.length}/10</div>
      </div>
      <div class="composer-preview-info">
        <strong>Pronto para publicar</strong>
        <span>${state.previews.length === 1 ? '1 midia selecionada' : `${state.previews.length} midias selecionadas`}</span>
      </div>
    </div>
    ${state.previews.length > 1 ? `
      <div class="composer-preview-strip" aria-label="Midias selecionadas">
        ${state.previews.map((item, index) => `
          <button type="button" class="composer-preview-thumb${index === 0 ? ' active' : ''}" data-preview-focus="${item.id}" aria-label="Midia ${index + 1}">
            ${mediaNode(item)}
          </button>`).join('')}
      </div>` : ''}`;
  el.querySelectorAll('.composer-preview-remove').forEach((btn) => btn.addEventListener('click', () => {
    const id = btn.closest('[data-preview-id]')?.dataset.previewId;
    const item = state.previews.find((p) => p.id === id);
    if (item) revokePreviews([item]);
    state.previews = state.previews.filter((p) => p.id !== id);
    renderPreviews();
  }));
  el.querySelectorAll('[data-preview-focus]').forEach((btn) => btn.addEventListener('click', () => {
    const index = state.previews.findIndex((item) => item.id === btn.dataset.previewFocus);
    if (index <= 0) return;
    state.previews = [state.previews[index], ...state.previews.filter((_, itemIndex) => itemIndex !== index)];
    renderPreviews();
  }));
  syncComposerState();
  renderMobilePostComposer();
}

function syncComposerState() {
  const composer = document.querySelector('.social-composer');
  const hasMedia = state.previews.length > 0;
  composer?.classList.toggle('composer-has-media', hasMedia);
  const drop = document.getElementById('composerDrop');
  if (hasMedia) drop?.classList.remove('visible');
  const publishBtn = document.getElementById('publishBtn');
  if (publishBtn) {
    publishBtn.classList.toggle('composer-primary-ready', hasMedia || Boolean(document.getElementById('composerText')?.value.trim()));
  }
}

function openMobilePostComposer({ pickMedia = false } = {}) {
  const modal = document.getElementById('mobilePostComposerModal');
  if (!modal) return;
  renderMobilePostComposer();
  openModal(modal);
  const input = modal.querySelector('#mobileComposerText');
  requestAnimationFrame(() => input?.focus({ preventScroll: true }));
  if (pickMedia) setTimeout(() => document.getElementById('composerFiles')?.click(), 120);
}

function renderMobilePostComposer() {
  const modal = document.getElementById('mobilePostComposerModal');
  if (!modal?.classList.contains('open') && !isMobileSocial()) return;
  if (!modal) return;
  const text = document.getElementById('composerText')?.value || '';
  const canPost = Boolean(text.trim() || state.previews.length);
  modal.innerHTML = `
    <div class="mobile-composer-panel">
      <div class="mobile-composer-head">
        <button type="button" class="mobile-composer-link" data-close-modal>Cancelar</button>
        <strong>Nova publicacao</strong>
        <button type="button" class="mobile-composer-post" data-mobile-publish ${canPost ? '' : 'disabled'}>Postar</button>
      </div>
      <div class="mobile-composer-body">
        <div class="mobile-composer-author">
          ${avatar(state.profile, 38)}
          <div><strong>${Utils.escapeHtml(state.profile.name || 'Voce')}</strong><span>@${Utils.escapeHtml(displayUsername(state.profile))}</span></div>
        </div>
        ${renderMobileComposerPreview()}
        <textarea id="mobileComposerText" class="mobile-composer-text" maxlength="1200" placeholder="Escreva uma legenda...">${Utils.escapeHtml(text)}</textarea>
      </div>
      <div class="mobile-composer-tools">
        <button type="button" class="social-icon-btn" data-mobile-pick-media><i class="fa-solid fa-image"></i></button>
        <button type="button" class="social-icon-btn" data-mobile-emoji><i class="fa-regular fa-face-smile"></i></button>
        <span>${state.previews.length ? `${state.previews.length}/10 midias` : 'Adicione foto ou video'}</span>
      </div>
    </div>`;
  const mobileText = modal.querySelector('#mobileComposerText');
  mobileText?.addEventListener('input', () => {
    const inline = document.getElementById('composerText');
    if (inline) inline.value = mobileText.value;
    syncComposerState();
    modal.querySelector('[data-mobile-publish]')?.toggleAttribute('disabled', !Boolean(mobileText.value.trim() || state.previews.length));
  });
  bindMentionAutocomplete(mobileText, { minChars: 1 });
  modal.querySelectorAll('[data-mobile-pick-media]').forEach((btn) => btn.addEventListener('click', () => document.getElementById('composerFiles')?.click()));
  modal.querySelector('[data-mobile-emoji]')?.addEventListener('click', () => {
    if (!mobileText) return;
    mobileText.value += mobileText.value.endsWith(' ') || !mobileText.value ? '✨ ' : ' ✨ ';
    document.getElementById('composerText').value = mobileText.value;
    mobileText.focus();
    syncComposerState();
  });
  modal.querySelector('[data-mobile-publish]')?.addEventListener('click', publishPostFromMobile);
  modal.querySelectorAll('[data-remove-mobile-preview]').forEach((btn) => btn.addEventListener('click', () => {
    const item = state.previews.find((preview) => preview.id === btn.dataset.removeMobilePreview);
    if (item) revokePreviews([item]);
    state.previews = state.previews.filter((preview) => preview.id !== btn.dataset.removeMobilePreview);
    renderPreviews();
    renderMobilePostComposer();
  }));
  modal.querySelectorAll('[data-focus-mobile-preview]').forEach((btn) => btn.addEventListener('click', () => {
    const index = state.previews.findIndex((item) => item.id === btn.dataset.focusMobilePreview);
    if (index <= 0) return;
    state.previews = [state.previews[index], ...state.previews.filter((_, itemIndex) => itemIndex !== index)];
    renderPreviews();
    renderMobilePostComposer();
  }));
}

function renderMobileComposerPreview() {
  if (!state.previews.length) {
    return `
      <button type="button" class="mobile-composer-empty-media" data-mobile-pick-media>
        <i class="fa-regular fa-image"></i>
        <span>Adicionar foto ou video</span>
      </button>`;
  }
  const main = state.previews[0];
  const mediaNode = (item) => item.media_type === 'video'
    ? `<video src="${item.url}" muted playsinline controls></video>`
    : `<img src="${item.url}" alt="Preview da publicacao">`;
  return `
    <div class="mobile-composer-preview">
      <div class="mobile-composer-preview-main">
        ${mediaNode(main)}
        <button type="button" data-remove-mobile-preview="${main.id}" aria-label="Remover midia"><i class="fa-solid fa-xmark"></i></button>
      </div>
      ${state.previews.length > 1 ? `
        <div class="mobile-composer-strip">
          ${state.previews.map((item, index) => `
            <button type="button" class="${index === 0 ? 'active' : ''}" data-focus-mobile-preview="${item.id}">
              ${mediaNode(item)}
            </button>`).join('')}
        </div>` : ''}
    </div>`;
}

async function publishPostFromMobile() {
  const mobileText = document.getElementById('mobileComposerText');
  const inline = document.getElementById('composerText');
  if (mobileText && inline) inline.value = mobileText.value;
  await publishPost();
  if (!state.previews.length && !(inline?.value || '').trim()) closeSocialModals();
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
    syncPostPaginationState();
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
  const files = [...(input.files || [])];
  if (!files.length) return;
  try {
    files.forEach((file) => validateMediaFile(file));
    state.storyPreviews = files.map((file) => filePreview(file));
    openStoryComposer();
  } catch (err) {
    console.error(err);
    Utils.showToast(err.message || 'Erro ao preparar story.', 'error');
  } finally {
    input.value = '';
  }
}

function openStoryComposer() {
  const items = state.storyPreviews;
  if (!items.length) return;
  const modal = document.getElementById('storyComposerModal');
  modal.innerHTML = `
    <div class="story-compose-panel">
      <div class="story-compose-preview" id="storyComposePreview">
        ${items.map((item, index) => `<div class="story-compose-slide-preview${index === 0 ? ' active' : ''}" data-story-preview-slide="${index}">${item.media_type === 'video' ? `<video src="${item.url}" controls playsinline></video>` : `<img src="${item.url}" alt="Preview do story">`}</div>`).join('')}
      </div>
      <div class="story-compose-side">
        <div class="story-compose-head">
          <div>
            <div class="social-title" style="font-size:1.05rem">Novo story</div>
            <div class="social-subtitle">Adicione legenda e publique todos os itens em sequência.</div>
          </div>
          <button class="social-icon-btn" data-close-story-composer><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="story-compose-strip">
          ${items.map((item, index) => `<button type="button" class="story-compose-thumb${index === 0 ? ' active' : ''}" data-story-thumb="${index}">${item.media_type === 'video' ? '<i class="fa-solid fa-play"></i>' : `<img src="${item.url}" alt="Thumb">`}</button>`).join('')}
        </div>
        <textarea id="storyCaptionInput" class="story-caption-input" maxlength="160" placeholder="Adicionar legenda..."></textarea>
        <div class="story-caption-count"><span id="storyCaptionCount">0</span>/160</div>
        <button class="btn btn-primary social-submit" id="publishStoryBtn"><i class="fa-solid fa-circle-plus"></i> Publicar stories</button>
      </div>
    </div>`;
  openModal(modal);
  const input = document.getElementById('storyCaptionInput');
  input.addEventListener('input', () => {
    document.getElementById('storyCaptionCount').textContent = String(input.value.length);
  });
  modal.querySelector('[data-close-story-composer]').addEventListener('click', closeStoryComposer);
  modal.querySelectorAll('[data-story-thumb]').forEach((btn) => btn.addEventListener('click', () => {
    const idx = Number(btn.dataset.storyThumb);
    modal.querySelectorAll('[data-story-preview-slide]').forEach((slide) => slide.classList.toggle('active', Number(slide.dataset.storyPreviewSlide) === idx));
    modal.querySelectorAll('[data-story-thumb]').forEach((thumb) => thumb.classList.toggle('active', Number(thumb.dataset.storyThumb) === idx));
  }));
  document.getElementById('publishStoryBtn').addEventListener('click', publishStoryFromPreview);
}

function closeStoryComposer() {
  if (state.storyPreviews?.length) revokePreviews(state.storyPreviews);
  state.storyPreviews = [];
  closeSocialModals();
}

async function publishStoryFromPreview() {
  if (!state.storyPreviews?.length) return;
  const btn = document.getElementById('publishStoryBtn');
  const caption = document.getElementById('storyCaptionInput')?.value.trim() || '';
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Publicando...';
  try {
    for (const item of state.storyPreviews) {
      const media = await uploadSocialMedia(db, state.profile.id, item.file, 'stories');
      await state.service.createStory(media, caption);
    }
    revokePreviews(state.storyPreviews);
    state.storyPreviews = [];
    closeSocialModals();
    state.stories = await state.service.loadStories();
    renderStories();
    Utils.showToast('Stories publicados por 24 horas!');
  } catch (err) {
    console.error(err);
    Utils.showToast('Erro ao publicar story.', 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-circle-plus"></i> Publicar stories';
  }
}

async function toggleLike(postId, btn) {
  const post = state.posts.find((p) => p.id === postId);
  if (!post || post.legacy) return;
  try {
    btn.disabled = true;
    const liked = await state.service.toggleLike(post);
    post.liked_by_me = liked;
    post.likes_count = Math.max(0, (post.likes_count || 0) + (liked ? 1 : -1));
    btn.classList.toggle('active', liked);
    btn.classList.add('like-pop');
    setTimeout(() => btn.classList.remove('like-pop'), 380);
    btn.innerHTML = `<i class="fa-${liked ? 'solid' : 'regular'} fa-heart"></i>`;
    updatePostStatsNode(post);
  } catch {
    Utils.showToast('Erro ao curtir.', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function toggleSave(postId, btn = null) {
  const post = state.posts.find((p) => p.id === postId);
  if (!post || post.legacy) return;
  try {
    if (btn) btn.disabled = true;
    const saved = await state.service.toggleSave(post);
    post.saved_by_me = saved;
    if (btn) {
      btn.classList.toggle('active', saved);
      btn.innerHTML = `<i class="fa-${saved ? 'solid' : 'regular'} fa-bookmark"></i>`;
    } else {
      updatePostNode(postId);
    }
    Utils.showToast(saved ? 'Publicacao salva.' : 'Publicacao removida dos salvos.');
  } catch {
    Utils.showToast('Erro ao salvar.', 'error');
  } finally {
    if (btn) btn.disabled = false;
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
    closeMentionDropdown();
    updatePostNode(post.id);
  } catch (err) {
    console.error('[MSY][feed-social] Erro ao comentar:', err);
    Utils.showToast('Erro ao comentar.', 'error');
  }
}

async function deletePost(postId) {
  const post = state.posts.find((p) => p.id === postId);
  if (!post || !canManage(post)) return Utils.showToast('Sem permissao para excluir esta publicacao.', 'error');
  if (!await MSYConfirm.show('Excluir esta publicacao? Esta acao remove o post do feed.', { title: 'Excluir publicacao', type: 'danger', confirmText: 'Excluir' })) return;
  try {
    await state.service.deletePost(postId);
    state.posts = state.posts.filter((p) => p.id !== postId);
    document.getElementById(`post-${postId}`)?.remove();
    Utils.showToast('Publicacao excluida.');
  } catch (err) {
    console.error('[MSY][feed-social] Erro ao excluir post:', err);
    Utils.showToast(err.message || 'Erro ao excluir publicacao.', 'error');
  }
}

async function editPost(postId) {
  const post = state.posts.find((p) => p.id === postId);
  if (!post || !canEditPost(post)) return Utils.showToast('Apenas o autor pode editar esta publicacao.', 'error');
  const next = prompt('Editar publicacao:', post?.content || '');
  if (next === null) return;
  try {
    await state.service.updatePost(postId, next.trim());
    post.content = next.trim();
    post.edited_at = new Date().toISOString();
    updatePostNode(postId);
    Utils.showToast('Publicacao atualizada.');
  } catch (err) {
    Utils.showToast(err.message || 'Erro ao editar publicacao.', 'error');
  }
}

async function pinPost(postId) {
  const post = state.posts.find((p) => p.id === postId);
  await state.service.togglePin(postId, !post.is_pinned);
  post.is_pinned = !post.is_pinned;
  state.posts.sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || new Date(b.created_at) - new Date(a.created_at));
  renderPosts();
}

function setupInfiniteFeed() {
  if (state.feedObserver) {
    state.feedObserver.disconnect();
    state.feedObserver = null;
  }
  const sentinel = document.getElementById('feedSentinel');
  if (!sentinel || !state.hasSocialTables || !state.hasMorePosts || !('IntersectionObserver' in window)) return;
  state.feedObserver = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) loadMorePosts();
  }, { rootMargin: '640px 0px' });
  state.feedObserver.observe(sentinel);
}

async function loadMorePosts() {
  if (state.loadingMore || !state.hasMorePosts || !state.postCursor) return;
  state.loadingMore = true;
  const sentinel = document.getElementById('feedSentinel');
  try {
    const nextPosts = await state.service.loadPosts({ before: state.postCursor });
    state.hasMorePosts = nextPosts.length >= state.service.pageSize;
    state.postCursor = nextPosts.at(-1)?.created_at || state.postCursor;
    state.posts = [...state.posts, ...nextPosts];
    const html = nextPosts.map(renderPost).join('');
    if (sentinel) {
      sentinel.insertAdjacentHTML('beforebegin', html);
      if (!state.hasMorePosts) sentinel.remove();
    }
    hydrateFeedEnhancements(document.getElementById('feedList'));
    setupInfiniteFeed();
  } catch (err) {
    console.error('[MSY][feed-social] Erro ao carregar mais posts:', err);
    if (sentinel) sentinel.innerHTML = '<button class="social-icon-btn" type="button" data-load-more-posts>Recarregar</button>';
  } finally {
    state.loadingMore = false;
  }
}

function copyPost(postId) {
  const url = `${location.origin}${location.pathname}?post=${postId}`;
  navigator.clipboard?.writeText(url);
  Utils.showToast('Link copiado.');
}

const notificationFilters = [
  { key: 'all', label: 'Tudo' },
  { key: 'posts', label: 'Posts' },
  { key: 'stories', label: 'Stories' },
  { key: 'comments', label: 'Comentarios' },
  { key: 'followers', label: 'Seguidores' },
  { key: 'mentions', label: '@Mencoes' },
];

function notificationIcon(category) {
  const map = {
    posts: 'fa-heart',
    stories: 'fa-circle-play',
    comments: 'fa-comment',
    followers: 'fa-user-plus',
    mentions: 'fa-at',
    important: 'fa-bolt',
  };
  return map[category] || 'fa-heart';
}

function notificationLabel(notification) {
  const actorName = notification.actor?.name || 'Alguem';
  const event = notification.metadata?.event;
  if (event === 'story_reply') return `${actorName} respondeu seu story.`;
  if (notification.category === 'posts') return `${actorName} curtiu sua publicacao.`;
  if (notification.category === 'stories') return `${actorName} interagiu com seu story.`;
  if (notification.category === 'comments') return `${actorName} comentou em uma publicacao.`;
  if (notification.category === 'followers') return `${actorName} comecou a seguir voce.`;
  if (notification.category === 'mentions') return `${actorName} mencionou voce.`;
  return notification.message || 'Nova interacao social.';
}

function renderSocialNotifications() {
  const unread = state.socialNotifications.filter((item) => !item.read).length;
  document.getElementById('socialNotificationBadge')?.toggleAttribute('hidden', unread === 0);
  const badge = document.getElementById('socialNotificationBadge');
  if (badge) badge.textContent = unread > 9 ? '9+' : String(unread);
  document.getElementById('socialNotificationMobileBadge')?.toggleAttribute('hidden', unread === 0);
  const mobileBadge = document.getElementById('socialNotificationMobileBadge');
  if (mobileBadge) mobileBadge.textContent = unread > 9 ? '9+' : String(unread);
  document.getElementById('openActivityBtn')?.classList.toggle('has-unread', unread > 0);
  if (state.notificationPanelOpen) renderSocialNotificationsDrawer();
}

function notificationPeriod(createdAt) {
  const date = new Date(createdAt);
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startWeek = startToday - (6 * 86400000);
  const time = date.getTime();
  if (time >= startToday) return 'Hoje';
  if (time >= startWeek) return 'Esta semana';
  return 'Anterior';
}

function renderActivityThumbnail(notification) {
  const postId = notification.target_type === 'post'
    ? notification.target_id
    : new URLSearchParams((notification.target_url || notification.link || '').split('?')[1] || '').get('post');
  const post = postId ? state.posts.find((item) => item.id === postId) : null;
  const media = post?.media?.[0];
  if (media) {
    return `<span class="activity-thumb">${media.media_type === 'video' ? `<video src="${Utils.escapeHtml(media.url)}" muted playsinline preload="metadata"></video>` : `<img src="${Utils.escapeHtml(media.url)}" alt="">`}</span>`;
  }
  if (notification.target_type === 'story') {
    const story = findStoryById(notification.target_id);
    if (story?.media_url) return `<span class="activity-thumb">${story.media_type === 'video' ? `<video src="${Utils.escapeHtml(story.media_url)}" muted playsinline preload="metadata"></video>` : `<img src="${Utils.escapeHtml(story.media_url)}" alt="">`}</span>`;
  }
  return '';
}

function renderNotificationCenter({ compact = false } = {}) {
  const filtered = state.notificationFilter === 'all'
    ? state.socialNotifications
    : state.socialNotifications.filter((item) => item.category === state.notificationFilter);
  const items = compact ? filtered.slice(0, 10) : filtered;
  const grouped = items.reduce((acc, item) => {
    const period = notificationPeriod(item.created_at);
    if (!acc[period]) acc[period] = [];
    acc[period].push(item);
    return acc;
  }, {});
  return `
    <div class="activity-head">
      <div>
        <div class="side-title"><i class="fa-regular fa-heart"></i>Atividade</div>
        <div class="activity-subtitle">${state.socialNotifications.filter((item) => !item.read).length} nova${state.socialNotifications.filter((item) => !item.read).length === 1 ? '' : 's'} interacao${state.socialNotifications.filter((item) => !item.read).length === 1 ? '' : 'es'}</div>
      </div>
      <button class="social-icon-btn" data-mark-social-read title="Marcar tudo como lido"><i class="fa-solid fa-check-double"></i></button>
    </div>
    <div class="activity-filters">
      ${notificationFilters.map((filter) => `<button type="button" class="${state.notificationFilter === filter.key ? 'active' : ''}" data-notification-filter="${filter.key}">${filter.label}</button>`).join('')}
    </div>
    <div class="activity-list premium">
      ${items.length ? ['Hoje', 'Esta semana', 'Anterior'].map((period) => grouped[period]?.length ? `
        <section class="activity-period">
          <div class="activity-period-title">${period}</div>
          ${grouped[period].map(renderNotificationItem).join('')}
        </section>` : '').join('') : '<div class="social-empty activity-empty"><i class="fa-regular fa-heart"></i>Nenhuma interacao por aqui.</div>'}
    </div>`;
}

function renderNotificationItem(notification) {
  const actor = notification.actor || {};
  return `
    <button type="button" class="activity-item${notification.read ? '' : ' unread'}" data-open-notification="${notification.id}">
      <span class="activity-unread-dot" aria-hidden="true"></span>
      <div class="activity-avatar-wrap">
        ${actor.id ? avatar(actor, 42) : `<span class="activity-fallback-icon"><i class="fa-solid ${notificationIcon(notification.category)}"></i></span>`}
        <span class="activity-kind"><i class="fa-solid ${notificationIcon(notification.category)}"></i></span>
      </div>
      <div class="activity-copy">
        <strong>${Utils.escapeHtml(notificationLabel(notification))}</strong>
        <span>${Utils.escapeHtml(notification.message || '')}</span>
      </div>
      ${renderActivityThumbnail(notification)}
      <time>${timeAgo(notification.created_at)}</time>
    </button>`;
}

function bindSocialNotifications() {
  document.getElementById('openActivityBtn')?.addEventListener('click', openSocialNotificationsDrawer);
  document.getElementById('openActivityMobileBtn')?.addEventListener('click', openSocialNotificationsDrawer);
  document.getElementById('openDirectMobileBtn')?.addEventListener('click', () => openDirectInbox());
}

function bindNotificationCenter(root) {
  root.querySelectorAll('[data-notification-filter]').forEach((btn) => btn.addEventListener('click', async () => {
    state.notificationFilter = btn.dataset.notificationFilter;
    renderSocialNotifications();
    if (!state.socialNotifications.some((item) => state.notificationFilter === 'all' || item.category === state.notificationFilter)) {
      await reloadSocialNotifications();
    }
  }));
  root.querySelector('[data-mark-social-read]')?.addEventListener('click', markAllSocialNotificationsRead);
  root.querySelectorAll('[data-open-notification]').forEach((btn) => btn.addEventListener('click', () => openSocialNotification(btn.dataset.openNotification)));
  root.querySelector('[data-open-activity-drawer]')?.addEventListener('click', openSocialNotificationsDrawer);
}

async function reloadSocialNotifications() {
  if (!state.hasSocialTables) return;
  try {
    state.socialNotifications = await state.service.loadSocialNotifications({ filter: 'all', limit: 32 });
    renderSocialNotifications();
    if (state.notificationPanelOpen) renderSocialNotificationsDrawer();
  } catch (err) {
    console.warn('[MSY][feed-social] Notificacoes sociais indisponiveis:', err);
  }
}

async function refreshDirectUnreadCount() {
  if (!state.hasSocialTables) return;
  try {
    const conversations = await state.service.loadDirectConversations();
    setDirectConversations(conversations);
    if (document.getElementById('directViewer')?.classList.contains('open')) renderDirectInbox();
  } catch (err) {
    console.warn('[MSY][feed-social] Contador do Direct indisponivel:', err);
  }
}

async function markAllSocialNotificationsRead() {
  if (!state.hasSocialTables) return;
  try {
    await Promise.all(state.socialNotifications.filter((item) => !item.read).map((item) => state.service.markSocialNotificationRead(item.id)));
    state.socialNotifications = state.socialNotifications.map((item) => ({ ...item, read: true, unread: false }));
    renderSocialNotifications();
    if (state.notificationPanelOpen) renderSocialNotificationsDrawer();
  } catch {
    Utils.showToast('Erro ao marcar atividade como lida.', 'error');
  }
}

function openSocialNotificationsDrawer() {
  state.notificationPanelOpen = true;
  renderSocialNotificationsDrawer();
}

function renderSocialNotificationsDrawer() {
  const modal = document.getElementById('socialNotificationsDrawer');
  if (!modal) return;
  modal.innerHTML = `
    <div class="activity-drawer-panel">
      <div class="activity-drawer-head">
        <div>
          <div class="activity-drawer-kicker"><i class="fa-regular fa-heart"></i></div>
          <div class="social-title">Atividade</div>
          <div class="social-subtitle">Curtidas, comentarios, seguidores, mencoes e stories.</div>
        </div>
        <button class="social-icon-btn story-close" data-close-modal><i class="fa-solid fa-xmark"></i></button>
      </div>
      ${renderNotificationCenter({ compact: false })}
    </div>`;
  openModal(modal);
  bindNotificationCenter(modal);
}

async function openSocialNotification(notificationId) {
  const notification = state.socialNotifications.find((item) => item.id === notificationId);
  if (!notification) return;
  try {
    if (!notification.read) await state.service.markSocialNotificationRead(notification.id);
    notification.read = true;
    notification.unread = false;
    renderSocialNotifications();
  } catch {
    // Navigation is more important than read-state feedback here.
  }
  closeSocialModals();
  openNotificationTarget(notification);
}

function openNotificationTarget(notification) {
  if (notification.target_type === 'profile' && notification.target_id) return openProfile(notification.target_id);
  if (notification.target_type === 'story' && notification.target_id) {
    const groupIndex = state.stories.findIndex((g) => g.stories.some((s) => s.id === notification.target_id));
    const storyIndex = groupIndex >= 0 ? state.stories[groupIndex].stories.findIndex((s) => s.id === notification.target_id) : -1;
    if (groupIndex >= 0 && storyIndex >= 0) return openStory(groupIndex, storyIndex);
  }
  if (notification.target_type === 'direct_conversation' && notification.target_id) return openDirectInbox(notification.target_id);
  const url = notification.target_url || notification.link || '';
  const params = new URLSearchParams(url.split('?')[1] || '');
  const postId = params.get('post') || (notification.target_type === 'post' ? notification.target_id : null);
  const commentId = params.get('comment') || (notification.target_type === 'comment' ? notification.target_id : null);
  if (commentId) {
    if (state.activeProfileId) closeProfileRoute({ replace: true });
    const node = document.getElementById(`comment-${commentId}`);
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      node.closest('.social-post')?.classList.add('highlight');
      return;
    }
  }
  if (postId) {
    if (state.activeProfileId) closeProfileRoute({ replace: true });
    return focusPost(postId);
  }
}

function subscribeSocialNotifications() {
  if (!state.hasSocialTables || state.socialNotificationChannel) return;
  try {
    state.socialNotificationChannel = db
      .channel(`feed-social-notifications-${state.profile.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${state.profile.id}`,
      }, (payload) => {
        const item = state.service.normalizeSocialNotification(payload.new);
        if (state.service.isDirectNotification(item)) {
          refreshDirectUnreadCount();
          return;
        }
        if (!state.service.isSocialActivityNotification(item)) return;
        state.socialNotifications = [item, ...state.socialNotifications.filter((current) => current.id !== item.id)].slice(0, 48);
        renderSocialNotifications();
        if (state.notificationPanelOpen) renderSocialNotificationsDrawer();
      })
      .subscribe();
  } catch (err) {
    console.warn('[MSY][feed-social] Realtime de atividade indisponivel:', err);
  }
}

function renderSuggestions() {
  const el = document.getElementById('suggestionsList');
  if (!el) return;
  const followedIds = new Set(state.follows.filter((f) => f.follower_id === state.profile.id).map((f) => f.following_id));
  const items = state.members
    .filter((m) => m.id !== state.profile.id)
    .sort((a, b) => Number(followedIds.has(a.id)) - Number(followedIds.has(b.id)))
    .slice(0, 6);
  el.innerHTML = items.length ? items.map((m) => `
    <div class="member-suggestion">
      <div data-open-member-profile="${m.id}" style="cursor:pointer">${avatar(m, 36)}</div>
      <div class="member-copy"><div class="member-name">${Utils.escapeHtml(m.name)}</div><div class="member-role">@${Utils.escapeHtml(displayUsername(m))} · ${Utils.escapeHtml(m.role || 'Membro')}</div></div>
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
  if (!memberId || state.pendingFollows.has(memberId)) return;
  state.pendingFollows.add(memberId);
  const buttons = document.querySelectorAll(`[data-follow="${memberId}"],[data-profile-follow="${memberId}"]`);
  buttons.forEach((btn) => { btn.disabled = true; btn.classList.add('is-loading'); });
  const wasFollowing = isFollowing(memberId);
  try {
    const nowFollowing = await state.service.toggleFollow(memberId, wasFollowing);
    state.follows = await state.service.loadFollows();
    const syncedFollowing = isFollowing(memberId) || nowFollowing;
    renderSuggestions();
    renderMyProfileCard();
    const btn = document.querySelector(`[data-profile-follow="${memberId}"]`);
    if (btn) {
      btn.classList.toggle('following', syncedFollowing);
      btn.textContent = syncedFollowing ? 'Seguindo' : 'Seguir';
    }
    if (state.activeProfileId === memberId) {
      state.activeProfileSummary = {
        ...(state.activeProfileSummary || {}),
        isFollowing: syncedFollowing,
        followersCount: Math.max(0, Number(state.activeProfileSummary?.followersCount || 0) + (syncedFollowing === wasFollowing ? 0 : (syncedFollowing ? 1 : -1))),
      };
      renderProfileRoute();
    }
  } catch (err) {
    console.error('[MSY][feed-social] Erro ao seguir membro:', err);
    Utils.showToast('Erro ao seguir membro.', 'error');
  } finally {
    state.pendingFollows.delete(memberId);
    document.querySelectorAll(`[data-follow="${memberId}"],[data-profile-follow="${memberId}"]`).forEach((btn) => {
      btn.disabled = false;
      btn.classList.remove('is-loading');
    });
  }
}

function openMemberSearch() {
  const card = document.querySelector('.social-member-search-card');
  const input = document.getElementById('socialSearchInput');
  const box = document.getElementById('socialSearchResults');
  if (!input || !box) return;
  document.body.classList.add('social-search-open');
  renderSocialSearchSuggestions(box);
  card?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  requestAnimationFrame(() => input.focus({ preventScroll: true }));
}

function bindSearch() {
  const input = document.getElementById('socialSearchInput');
  const box = document.getElementById('socialSearchResults');
  const clear = document.getElementById('socialSearchClear');
  if (!input || !box) return;
  let timer;
  document.getElementById('openSearchBtn')?.addEventListener('click', openMemberSearch);
  document.getElementById('openSearchMobileBtn')?.addEventListener('click', openMemberSearch);
  document.getElementById('openMyProfileBtn')?.addEventListener('click', () => openProfile(state.profile.id));
  document.getElementById('openMyProfileMobileBtn')?.addEventListener('click', () => openProfile(state.profile.id));
  const close = () => {
    document.body.classList.remove('social-search-open');
    box.classList.remove('open');
    state.socialSearchItems = [];
    state.socialSearchActiveIndex = 0;
  };
  const run = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim();
      clear?.toggleAttribute('hidden', q.length === 0);
      if (q.length < 1) {
        renderSocialSearchSuggestions(box);
        return;
      }
      const res = state.hasSocialTables ? await state.service.search(q) : searchLocalMembers(q);
      renderMemberSearchResults(box, res.members, q);
    }, 160);
  };
  input.addEventListener('focus', () => {
    document.body.classList.add('social-search-open');
    renderSocialSearchSuggestions(box);
  });
  input.addEventListener('input', run);
  input.addEventListener('keydown', (e) => {
    if (!state.socialSearchItems.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      state.socialSearchActiveIndex = (state.socialSearchActiveIndex + 1) % state.socialSearchItems.length;
      syncSocialSearchActive(box);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      state.socialSearchActiveIndex = (state.socialSearchActiveIndex - 1 + state.socialSearchItems.length) % state.socialSearchItems.length;
      syncSocialSearchActive(box);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const member = state.socialSearchItems[state.socialSearchActiveIndex];
      if (member) {
        close();
        input.blur();
        openProfile(member.id);
      }
    } else if (e.key === 'Escape') {
      close();
      input.blur();
    }
  });
  clear?.addEventListener('click', () => {
    input.value = '';
    clear.hidden = true;
    input.focus();
    renderSocialSearchSuggestions(box);
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.social-member-search-card') && !e.target.closest('#openSearchBtn,#openSearchMobileBtn')) close();
  });
}

function socialSearchSuggestionMembers() {
  const following = new Set(state.follows.filter((f) => f.follower_id === state.profile.id).map((f) => f.following_id));
  return state.members
    .filter((member) => member.id !== state.profile.id)
    .sort((a, b) => {
      const scoreA = (a.tier === 'diretoria' ? 3 : 0) + (following.has(a.id) ? 2 : 0);
      const scoreB = (b.tier === 'diretoria' ? 3 : 0) + (following.has(b.id) ? 2 : 0);
      return scoreB - scoreA || String(a.name || '').localeCompare(String(b.name || ''));
    })
    .slice(0, 8);
}

function renderSocialSearchSuggestions(box) {
  renderMemberSearchResults(box, socialSearchSuggestionMembers(), '', 'Sugestoes para descobrir');
}

function renderMemberSearchResults(box, members = [], query = '', title = 'Resultados') {
  const cleanQuery = state.service?.normalizeUsername(query) || query.toLowerCase().replace(/^@+/, '');
  const orderedMembers = [...members].sort((a, b) => memberSearchScore(b, cleanQuery) - memberSearchScore(a, cleanQuery));
  state.socialSearchItems = orderedMembers;
  state.socialSearchActiveIndex = 0;
  box.innerHTML = `
    <div class="social-search-panel-head">
      <strong>${Utils.escapeHtml(title)}</strong>
      <span>${query ? `@${Utils.escapeHtml(cleanQuery)}` : 'Encontre membros rapidamente'}</span>
    </div>
    ${orderedMembers.length ? orderedMembers.map((m, index) => `
      <button type="button" class="social-result-item${index === 0 ? ' active' : ''}" data-open-profile="${m.id}" data-search-index="${index}">
        ${avatar(m, 42)}
        <span class="social-result-copy">
          <strong>${Utils.escapeHtml(m.name || 'Membro')}</strong>
          <span>@${Utils.escapeHtml(displayUsername(m))} · ${Utils.escapeHtml(m.role || 'Membro')}</span>
        </span>
        ${m.tier === 'diretoria' ? '<span class="verified-dot"><i class="fa-solid fa-check"></i></span>' : '<i class="fa-solid fa-chevron-right"></i>'}
      </button>`).join('') : '<div class="social-empty activity-empty"><i class="fa-regular fa-user"></i>Nenhum membro encontrado.</div>'}`;
  box.classList.add('open');
  box.querySelectorAll('[data-open-profile]').forEach((node) => node.addEventListener('click', () => {
    document.body.classList.remove('social-search-open');
    box.classList.remove('open');
    document.getElementById('socialSearchInput')?.blur();
    openProfile(node.dataset.openProfile);
  }));
}

function syncSocialSearchActive(box) {
  box.querySelectorAll('[data-search-index]').forEach((node, index) => {
    node.classList.toggle('active', index === state.socialSearchActiveIndex);
  });
}

function memberSearchScore(member, query) {
  if (!query) return 0;
  const username = displayUsername(member);
  const name = String(member.name || '').toLowerCase();
  if (username === query) return 100;
  if (username.startsWith(query)) return 80;
  if (username.includes(query)) return 60;
  if (name.startsWith(query)) return 40;
  if (name.includes(query)) return 20;
  return 0;
}

function searchLocalMembers(query) {
  const q = query.toLowerCase().replace(/^@+/, '');
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

function openProfileModal(memberId) {
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
        <div class="profile-modal-meta">@${Utils.escapeHtml(displayUsername(member))} · ${Utils.escapeHtml(member.role || 'Membro')} · ${member.tier === 'diretoria' ? 'Verificado' : 'Membro'}</div>
        <p class="profile-modal-bio">${Utils.escapeHtml(member.social_bio || member.bio || 'Sem bio ainda.')}</p>
        <div class="profile-stats">
          <button class="profile-stat" type="button" data-open-member-posts="${memberId}"><strong>${postsCount}</strong><span>posts</span></button>
          <button class="profile-stat" type="button" data-open-followers="${memberId}"><strong>${followers}</strong><span>seguidores</span></button>
          <button class="profile-stat" type="button" data-open-following="${memberId}"><strong>${following}</strong><span>seguindo</span></button>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">
          ${!isMe ? `<button class="social-icon-btn" data-start-direct="${memberId}" title="Enviar direct"><i class="fa-regular fa-paper-plane"></i></button>` : ''}
          ${isMe ? `<button class="social-icon-btn" data-edit-social-profile title="Editar perfil"><i class="fa-solid fa-pen"></i></button>` : ''}
        </div>
      </div>
    </div>`;
  openModal(modal);
  modal.querySelector('[data-profile-follow]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFollow(memberId);
  });
  modal.querySelector('[data-start-direct]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openDirectInbox(memberId);
  });
  modal.querySelector('[data-open-followers]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openFollowList(memberId, 'followers');
  });
  modal.querySelector('[data-open-following]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openFollowList(memberId, 'following');
  });
  modal.querySelector('[data-open-member-posts]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeSocialModals();
    setTimeout(() => {
      document.querySelectorAll('.social-post').forEach((node) => node.classList.remove('highlight'));
      document.querySelectorAll(`.social-post[data-post-id]`).forEach((node) => {
        const post = state.posts.find((item) => item.id === node.dataset.postId);
        if (post?.author_id === memberId) node.classList.add('highlight');
      });
    }, 80);
  });
  modal.querySelector('[data-edit-social-profile]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openSocialProfileEditor();
  });
}

async function openProfile(memberId, { replace = false } = {}) {
  if (!memberId) return;
  const member = findMember(memberId);
  if (!member) return;
  if (!state.activeProfileId) state.feedScrollBeforeProfile = window.scrollY || document.documentElement.scrollTop || 0;
  state.activeProfileId = memberId;
  state.activeProfileTab = state.activeProfileTab || 'posts';
  showProfileRouteLoading(member);
  if (!replace) {
    const url = new URL(location.href);
    url.search = `?profile=${memberId}`;
    history.pushState({ socialProfile: memberId }, '', url);
  }
  try {
    const [summary, posts] = state.hasSocialTables
      ? await Promise.all([
        state.service.loadProfileSocialSummary(memberId),
        state.service.loadProfilePosts(memberId, { limit: 24 }),
      ])
      : [null, state.posts.filter((post) => post.author_id === memberId)];
    state.activeProfileSummary = summary || {
      postsCount: posts.length,
      followersCount: state.follows.filter((f) => f.following_id === memberId).length,
      followingCount: state.follows.filter((f) => f.follower_id === memberId).length,
      isFollowing: isFollowing(memberId),
    };
    state.activeProfilePosts = posts;
    mergeProfilePosts(posts);
  } catch (err) {
    console.warn('[MSY][feed-social] Perfil social usando dados locais:', err);
    state.activeProfileSummary = {
      postsCount: state.posts.filter((post) => post.author_id === memberId).length,
      followersCount: state.follows.filter((f) => f.following_id === memberId).length,
      followingCount: state.follows.filter((f) => f.follower_id === memberId).length,
      isFollowing: isFollowing(memberId),
    };
    state.activeProfilePosts = state.posts.filter((post) => post.author_id === memberId);
  }
  renderProfileRoute();
}

function mergeProfilePosts(posts = []) {
  posts.forEach((post) => {
    const index = state.posts.findIndex((item) => item.id === post.id);
    if (index >= 0) state.posts[index] = post;
    else state.posts.push(post);
  });
}

function showProfileRouteLoading(member) {
  const feed = document.getElementById('feedRouteView');
  const route = document.getElementById('socialProfileRoute');
  if (!feed || !route) return;
  showProfileOnlyRoute();
  route.innerHTML = `
    <div class="social-profile-page">
      <header class="social-profile-topbar">
        <button class="social-profile-back" type="button" data-back-feed><i class="fa-solid fa-arrow-left"></i></button>
        <div>
          <strong>${Utils.escapeHtml(member.name || 'Membro')}</strong>
          <span>@${Utils.escapeHtml(displayUsername(member))}</span>
        </div>
      </header>
      <div class="social-profile-hero skeleton">
        <div class="social-profile-banner"></div>
        <div class="social-profile-main">
          ${avatar(member, 104)}
          <div class="social-profile-copy">
            <div class="profile-modal-name">${Utils.escapeHtml(member.name || 'Membro')}</div>
            <div class="profile-modal-meta">@${Utils.escapeHtml(displayUsername(member))}</div>
          </div>
        </div>
      </div>
      <div class="social-empty"><i class="fa-solid fa-circle-notch fa-spin"></i> Carregando perfil social...</div>
    </div>`;
  route.querySelector('[data-back-feed]')?.addEventListener('click', closeProfileRoute);
  requestAnimationFrame(() => {
    route.scrollTo?.({ top: 0, behavior: 'auto' });
    document.getElementById('pageContent')?.scrollTo?.({ top: 0, behavior: 'auto' });
  });
}

function renderProfileRoute() {
  const route = document.getElementById('socialProfileRoute');
  const feed = document.getElementById('feedRouteView');
  const member = findMember(state.activeProfileId);
  if (!route || !feed || !member) return;
  showProfileOnlyRoute();
  const summary = state.activeProfileSummary || {};
  const isMe = member.id === state.profile.id;
  const followingMember = isFollowing(member.id) || summary.isFollowing;
  const posts = state.activeProfilePosts || [];
  const mediaItems = posts.flatMap((post) => (post.media || []).map((media, index) => ({ post, media, index })));
  route.innerHTML = `
    <div class="social-profile-page">
      <header class="social-profile-topbar">
        <button class="social-profile-back" type="button" data-back-feed><i class="fa-solid fa-arrow-left"></i></button>
        <div>
          <strong>${Utils.escapeHtml(member.name || 'Membro')}</strong>
          <span>@${Utils.escapeHtml(displayUsername(member))}</span>
        </div>
        <div class="social-profile-top-actions">
          ${!isMe ? `<button class="social-icon-btn" data-start-direct="${member.id}" title="Enviar Direct"><i class="fa-regular fa-paper-plane"></i></button>` : ''}
        </div>
      </header>
      <section class="social-profile-hero">
        <div class="social-profile-banner">${member.banner_url ? `<img src="${Utils.escapeHtml(member.banner_url)}" alt="Banner" onerror="this.remove()">` : ''}</div>
        <div class="social-profile-main">
          ${avatar(member, 104)}
          <div class="social-profile-copy">
            <div class="social-profile-name-row">
              <h1>${Utils.escapeHtml(member.name || 'Membro')}</h1>
              ${member.tier === 'diretoria' ? '<span class="verified-dot"><i class="fa-solid fa-check"></i></span>' : ''}
            </div>
            <div class="profile-modal-meta">@${Utils.escapeHtml(displayUsername(member))} · ${Utils.escapeHtml(member.role || 'Membro')}</div>
            <p>${Utils.escapeHtml(member.social_bio || member.bio || 'Sem bio social ainda.')}</p>
            <div class="social-profile-actions">
              ${!isMe ? `<button class="follow-btn profile-primary-action ${followingMember ? 'following' : ''}" data-profile-follow="${member.id}">${followingMember ? 'Seguindo' : 'Seguir'}</button>` : `<button class="follow-btn profile-primary-action" data-edit-social-profile>Editar perfil</button>`}
              ${!isMe ? `<button class="social-icon-btn profile-direct-action" data-start-direct="${member.id}" title="Enviar Direct"><i class="fa-regular fa-paper-plane"></i></button>` : ''}
            </div>
          </div>
        </div>
        <div class="social-profile-stats">
          <button type="button" data-profile-tab="posts"><strong>${summary.postsCount ?? posts.length}</strong><span>posts</span></button>
          <button type="button" data-open-followers="${member.id}"><strong>${summary.followersCount || 0}</strong><span>seguidores</span></button>
          <button type="button" data-open-following="${member.id}"><strong>${summary.followingCount || 0}</strong><span>seguindo</span></button>
          <button type="button" data-profile-tab="media"><strong>${mediaItems.length}</strong><span>midias</span></button>
        </div>
      </section>
      <nav class="social-profile-tabs">
        <button class="${state.activeProfileTab === 'posts' ? 'active' : ''}" data-profile-tab="posts"><i class="fa-solid fa-table-cells-large"></i><span>Posts</span></button>
        <button class="${state.activeProfileTab === 'media' ? 'active' : ''}" data-profile-tab="media"><i class="fa-regular fa-image"></i><span>Midias</span></button>
        <button class="${state.activeProfileTab === 'about' ? 'active' : ''}" data-profile-tab="about"><i class="fa-regular fa-user"></i><span>Sobre</span></button>
      </nav>
      <section class="social-profile-content">
        ${renderProfileTab(member, posts, mediaItems)}
      </section>
    </div>`;
  bindProfileRoute(route);
  hydrateFeedEnhancements(route);
  requestAnimationFrame(() => {
    route.scrollTo?.({ top: 0, behavior: 'auto' });
    document.getElementById('pageContent')?.scrollTo?.({ top: 0, behavior: 'auto' });
  });
}

function renderProfileTab(member, posts, mediaItems) {
  if (state.activeProfileTab === 'media') {
    return mediaItems.length ? `
      <div class="profile-media-grid">
        ${mediaItems.map(({ post, media, index }) => `
          <button type="button" data-open-profile-media="${post.id}" data-media-index="${index}">
            ${media.media_type === 'video' ? `<video src="${Utils.escapeHtml(media.url)}" muted playsinline preload="metadata"></video><i class="fa-solid fa-play"></i>` : `<img src="${Utils.escapeHtml(media.url)}" loading="lazy" decoding="async">`}
          </button>`).join('')}
      </div>` : '<div class="social-empty"><i class="fa-regular fa-image"></i>Nenhuma midia publicada ainda.</div>';
  }
  if (state.activeProfileTab === 'about') {
    return `
      <div class="social-profile-about">
        <div class="social-card"><div class="side-title"><i class="fa-regular fa-id-card"></i>Bio</div><p>${Utils.escapeHtml(member.social_bio || member.bio || 'Sem bio social ainda.')}</p></div>
        <div class="social-card"><div class="side-title"><i class="fa-solid fa-user-shield"></i>Perfil</div><p>@${Utils.escapeHtml(displayUsername(member))}<br>${Utils.escapeHtml(member.role || 'Membro')}<br>${member.tier === 'diretoria' ? 'Perfil verificado' : 'Membro da rede MSY'}</p></div>
      </div>`;
  }
  return posts.length ? `<div class="social-feed-list profile-post-list">${posts.map(renderPost).join('')}</div>` : '<div class="social-empty"><i class="fa-regular fa-images"></i>Nenhuma publicacao ainda.</div>';
}

function bindProfileRoute(route) {
  if (route.dataset.feedEventsBound !== 'true') {
    route.dataset.feedEventsBound = 'true';
    route.addEventListener('click', handleFeedClick);
    route.addEventListener('submit', (e) => {
      if (e.target.matches('[data-comment-form]')) addComment(e);
    });
  }
  route.querySelector('[data-back-feed]')?.addEventListener('click', closeProfileRoute);
  route.querySelector('[data-profile-follow]')?.addEventListener('click', () => toggleFollow(state.activeProfileId));
  route.querySelector('[data-start-direct]')?.addEventListener('click', (e) => openDirectInbox(e.currentTarget.dataset.startDirect));
  route.querySelector('[data-edit-social-profile]')?.addEventListener('click', openSocialProfileEditor);
  route.querySelectorAll('[data-profile-tab]').forEach((btn) => btn.addEventListener('click', () => {
    state.activeProfileTab = btn.dataset.profileTab;
    renderProfileRoute();
  }));
  route.querySelectorAll('[data-open-followers]').forEach((btn) => btn.addEventListener('click', () => openFollowList(btn.dataset.openFollowers, 'followers')));
  route.querySelectorAll('[data-open-following]').forEach((btn) => btn.addEventListener('click', () => openFollowList(btn.dataset.openFollowing, 'following')));
  route.querySelectorAll('[data-open-profile-media]').forEach((btn) => btn.addEventListener('click', () => {
    const post = state.activeProfilePosts.find((item) => item.id === btn.dataset.openProfileMedia);
    if (post) openMediaViewer(post, Number(btn.dataset.mediaIndex || 0));
  }));
}

function closeProfileRoute({ replace = false } = {}) {
  state.activeProfileId = null;
  state.activeProfilePosts = [];
  state.activeProfileSummary = null;
  const route = document.getElementById('socialProfileRoute');
  if (route) {
    route.innerHTML = '';
  }
  showFeedRoute();
  if (!replace) history.pushState({}, '', location.pathname);
  requestAnimationFrame(() => window.scrollTo({ top: state.feedScrollBeforeProfile || 0, behavior: 'auto' }));
}

function bindRouteNavigation() {
  window.addEventListener('popstate', () => {
    const profileId = new URLSearchParams(location.search).get('profile');
    if (profileId) openProfile(profileId, { replace: true });
    else closeProfileRoute({ replace: true });
  });
}

function getStoryPosition(groupIndex, storyIndex) {
  let flatIndex = 0;
  for (let g = 0; g < state.stories.length; g += 1) {
    const items = state.stories[g]?.stories || [];
    for (let s = 0; s < items.length; s += 1) {
      if (g === groupIndex && s === storyIndex) return flatIndex;
      flatIndex += 1;
    }
  }
  return -1;
}

function getStoryByFlatIndex(targetIndex) {
  let flatIndex = 0;
  for (let groupIndex = 0; groupIndex < state.stories.length; groupIndex += 1) {
    const group = state.stories[groupIndex];
    const items = group?.stories || [];
    for (let storyIndex = 0; storyIndex < items.length; storyIndex += 1) {
      if (flatIndex === targetIndex) {
        return { group, story: items[storyIndex], groupIndex, storyIndex, flatIndex };
      }
      flatIndex += 1;
    }
  }
  return null;
}

function getNextStoryCursor(groupIndex, storyIndex, direction = 1) {
  const flat = getStoryPosition(groupIndex, storyIndex);
  if (flat < 0) return null;
  return getStoryByFlatIndex(flat + direction);
}

function storyMediaKey(story) {
  return story?.id || story?.media_url || '';
}

function shouldPreloadHeavyMedia() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (connection?.saveData) return false;
  return !/2g/.test(connection?.effectiveType || '');
}

function preloadStoryMedia(story, { priority = false } = {}) {
  const key = storyMediaKey(story);
  if (!story?.media_url || !key || state.storyMediaCache.has(key) || state.storyPreloadQueue.has(key)) {
    const cached = state.storyMediaCache.get(key);
    if (cached) cached.touchedAt = Date.now();
    return cached?.promise || Promise.resolve();
  }
  state.storyPreloadQueue.add(key);
  const promise = new Promise((resolve) => {
    if (story.media_type === 'video') {
      if (!shouldPreloadHeavyMedia() && !priority) return resolve(null);
      const video = document.createElement('video');
      video.preload = priority ? 'auto' : 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.src = story.media_url;
      const done = () => resolve(video);
      video.addEventListener(priority ? 'loadeddata' : 'loadedmetadata', done, { once: true });
      video.addEventListener('error', () => resolve(null), { once: true });
      video.load();
      return;
    }
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (img.decode) img.decode().then(() => resolve(img)).catch(() => resolve(img));
      else resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = story.media_url;
  }).finally(() => {
    state.storyPreloadQueue.delete(key);
    trimStoryMediaCache();
  });
  state.storyMediaCache.set(key, { storyId: story.id, mediaType: story.media_type, url: story.media_url, promise, touchedAt: Date.now() });
  return promise;
}

function waitForStoryMedia(story, timeout = 900) {
  const preload = preloadStoryMedia(story, { priority: true }).catch(() => null);
  return Promise.race([
    preload,
    new Promise((resolve) => setTimeout(resolve, timeout)),
  ]);
}

function trimStoryMediaCache() {
  const maxItems = shouldPreloadHeavyMedia() ? 14 : 7;
  if (state.storyMediaCache.size <= maxItems) return;
  [...state.storyMediaCache.entries()]
    .sort((a, b) => (a[1].touchedAt || 0) - (b[1].touchedAt || 0))
    .slice(0, state.storyMediaCache.size - maxItems)
    .forEach(([key]) => state.storyMediaCache.delete(key));
}

function warmStoryWindow(groupIndex, storyIndex) {
  const currentFlat = getStoryPosition(groupIndex, storyIndex);
  if (currentFlat < 0) return;
  [-1, 0, 1, 2, 3].forEach((offset) => {
    const item = getStoryByFlatIndex(currentFlat + offset);
    if (item?.story) preloadStoryMedia(item.story, { priority: offset === 0 || offset === 1 });
  });
}

function renderStoryProgress(group, storyIndex) {
  const items = group?.stories || [];
  return `
    <div class="story-progress-stack">
      ${items.map((_, index) => `<span class="${index < storyIndex ? 'done' : index === storyIndex ? 'active' : ''}"><i></i></span>`).join('')}
    </div>`;
}

function markStoryMediaReady(modal) {
  const mediaWrap = modal.querySelector('.story-media');
  const media = modal.querySelector('.story-media img,.story-media video');
  if (!mediaWrap || !media) return;
  const ready = () => mediaWrap.classList.add('ready');
  const failed = () => mediaWrap.classList.add('failed');
  if (media instanceof HTMLImageElement && media.complete && media.naturalWidth > 0) {
    ready();
    return;
  }
  if (media instanceof HTMLVideoElement && media.readyState >= 2) {
    ready();
    media.play?.().catch(() => {});
    return;
  }
  media.addEventListener('load', ready, { once: true });
  media.addEventListener('loadeddata', () => {
    ready();
    media.play?.().catch(() => {});
  }, { once: true });
  media.addEventListener('canplay', ready, { once: true });
  media.addEventListener('error', failed, { once: true });
}

async function openStoryPremium(groupIndex, storyIndex) {
  const group = state.stories[groupIndex];
  const story = group?.stories?.[storyIndex];
  if (!story) return;
  state.storyCursor = { groupIndex, storyIndex };
  const mediaReady = waitForStoryMedia(story);
  warmStoryWindow(groupIndex, storyIndex);
  state.service.markStoryViewed(story.id).catch((err) => console.warn('[MSY][feed-social] View do story indisponivel:', err));

  const modal = document.getElementById('storyViewer');
  const canViewReactions = canManageStory(story);
  if (modal.dataset.storyTimer) clearTimeout(Number(modal.dataset.storyTimer));
  modal.innerHTML = `
    <div class="story-panel story-panel-instagram">
      ${renderStoryProgress(group, storyIndex)}
      <button type="button" class="story-tap-zone story-tap-prev" data-story-prev aria-label="Story anterior"></button>
      <button type="button" class="story-tap-zone story-tap-next" data-story-next aria-label="Proximo story"></button>
      <div class="story-media story-media-premium is-loading">
        <div class="story-media-loader"><i class="fa-solid fa-circle-notch fa-spin"></i></div>
        ${story.media_type === 'video'
          ? `<video src="${Utils.escapeHtml(story.media_url)}" autoplay muted playsinline webkit-playsinline preload="auto"></video>`
          : `<img src="${Utils.escapeHtml(story.media_url)}" decoding="async" fetchpriority="high">`}
      </div>
      <div class="story-top story-top-instagram">
        ${avatar(group.author, 38)}
        <div class="story-author-copy">
          <strong>${Utils.escapeHtml(displayUsername(group.author || {}))}</strong>
          <span>${timeAgo(story.created_at)}</span>
        </div>
        ${canManageStory(story) ? `<button class="social-icon-btn story-close" data-delete-story="${story.id}" title="Excluir story"><i class="fa-solid fa-trash"></i></button>` : ''}
        <button class="social-icon-btn story-close" data-close-modal><i class="fa-solid fa-xmark"></i></button>
      </div>
      ${story.caption ? `<div class="story-caption story-caption-instagram">${richText(story.caption)}</div>` : ''}
      <div class="story-bottom story-bottom-instagram">
        <form class="story-inline-reply" id="storyInlineReply">
          <input id="storyReplyInput" maxlength="180" autocomplete="off" placeholder="Enviar mensagem...">
          <button type="submit" class="story-inline-send" aria-label="Enviar resposta"><i class="fa-regular fa-paper-plane"></i></button>
        </form>
        <button class="story-social-icon" data-story-reaction="heart" title="Curtir story"><i class="fa-regular fa-heart"></i><span></span></button>
        <button class="story-social-icon" data-story-focus-reply title="Responder story"><i class="fa-regular fa-comment"></i></button>
        <button class="story-social-icon" data-share-story title="Enviar"><i class="fa-regular fa-paper-plane"></i></button>
        ${canViewReactions ? `<button class="story-social-icon" data-toggle-story-reactions title="Visualizacoes"><i class="fa-regular fa-eye"></i><span id="storyReactionsCount">...</span></button>` : ''}
      </div>
      ${canViewReactions ? `<div class="story-reactions-panel" id="storyReactionsPanel">
        <div class="story-reactions-title">Atividade do story</div>
        <div id="storyReactionsContent" class="message-sub">Carregando...</div>
      </div>` : ''}
    </div>`;

  openModal(modal);
  mediaReady.finally(() => markStoryMediaReady(modal));
  markStoryMediaReady(modal);

  const go = (direction) => {
    const next = getNextStoryCursor(groupIndex, storyIndex, direction);
    if (next) openStoryPremium(next.groupIndex, next.storyIndex);
  };
  modal.querySelector('[data-story-prev]')?.addEventListener('click', (e) => { e.stopPropagation(); go(-1); });
  modal.querySelector('[data-story-next]')?.addEventListener('click', (e) => { e.stopPropagation(); go(1); });
  modal.querySelector('[data-story-focus-reply]')?.addEventListener('click', () => modal.querySelector('#storyReplyInput')?.focus());
  modal.querySelector('[data-share-story]')?.addEventListener('click', () => modal.querySelector('#storyReplyInput')?.focus());
  modal.querySelector('[data-story-reaction]')?.addEventListener('click', async (e) => {
    e.currentTarget.classList.add('active');
    await state.service.reactToStory(story, 'heart');
    hydrateStoryMeta(story.id, canViewReactions);
  });
  modal.querySelector('#storyInlineReply')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = modal.querySelector('#storyReplyInput');
    const text = input?.value.trim();
    if (!text) return;
    try {
      const targetUserId = group?.author?.id;
      if (!targetUserId) throw new Error('Nao foi possivel identificar o autor do story.');
      const conversationId = await state.service.ensureDirectConversation(targetUserId);
      await state.service.sendDirectMessage(conversationId, text, {
        kind: 'story_reply',
        story_id: story.id,
        story_url: story.media_url,
        media_type: story.media_type,
      });
      input.value = '';
      Utils.showToast('Resposta enviada no Direct.');
    } catch (err) {
      console.error(err);
      Utils.showToast(err.message || 'Erro ao responder story.', 'error');
    }
  });
  modal.querySelector('[data-toggle-story-reactions]')?.addEventListener('click', () => {
    document.getElementById('storyReactionsPanel')?.classList.toggle('open');
  });
  modal.querySelector('[data-delete-story]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteStory(story.id);
  });
  bindStoryGestures(modal, go);
  startStoryProgress(modal, groupIndex, storyIndex, story, go);
  hydrateStoryMeta(story.id, canViewReactions);
}

function bindStoryGestures(modal, go) {
  let startX = 0;
  let startY = 0;
  let startAt = 0;
  modal.querySelector('.story-panel')?.addEventListener('touchstart', (e) => {
    if (e.target.closest('input,textarea,button')) return;
    const touch = e.touches?.[0];
    startX = touch?.clientX || 0;
    startY = touch?.clientY || 0;
    startAt = Date.now();
  }, { passive: true });
  modal.querySelector('.story-panel')?.addEventListener('touchend', (e) => {
    if (e.target.closest('input,textarea,button')) return;
    const touch = e.changedTouches?.[0];
    const dx = (touch?.clientX || 0) - startX;
    const dy = (touch?.clientY || 0) - startY;
    if (Math.abs(dx) > 54 && Math.abs(dx) > Math.abs(dy) * 1.4) go(dx < 0 ? 1 : -1);
    else if (dy > 76 && Math.abs(dy) > Math.abs(dx) * 1.2) closeSocialModals();
    else if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && Date.now() - startAt < 260) {
      go((touch?.clientX || 0) < window.innerWidth / 2 ? -1 : 1);
    }
  }, { passive: true });
}

async function openStory(groupIndex, storyIndex) {
  return openStoryPremium(groupIndex, storyIndex);
}

async function openStoryFast(groupIndex, storyIndex) {
  const group = state.stories[groupIndex];
  const story = group?.stories?.[storyIndex];
  if (!story) return;
  state.storyCursor = { groupIndex, storyIndex };
  preloadStoryMedia(story, { priority: true });
  warmStoryWindow(groupIndex, storyIndex);
  state.service.markStoryViewed(story.id).catch((err) => console.warn('[MSY][feed-social] View do story indisponivel:', err));
  const canViewReactions = canManageStory(story);
  const modal = document.getElementById('storyViewer');
  if (modal.dataset.storyTimer) clearTimeout(Number(modal.dataset.storyTimer));
  modal.innerHTML = `
    <div class="story-panel story-panel-stable">
      <div class="story-progress"><span></span></div>
      <button type="button" class="story-tap-zone story-tap-prev" data-story-prev aria-label="Story anterior"></button>
      <button type="button" class="story-tap-zone story-tap-next" data-story-next aria-label="Proximo story"></button>
      <div class="story-media">${story.media_type === 'video' ? `<video src="${Utils.escapeHtml(story.media_url)}" autoplay playsinline preload="auto"></video>` : `<img src="${Utils.escapeHtml(story.media_url)}" decoding="async" fetchpriority="high">`}</div>
      <div class="story-top">
        ${avatar(group.author, 34)}
        <div class="story-author-copy"><strong>${Utils.escapeHtml(group.author?.name || 'Membro')}</strong><span>@${Utils.escapeHtml(displayUsername(group.author || {}))} · ${timeAgo(story.created_at)}</span></div>
        ${canManageStory(story) ? `<button class="social-icon-btn story-close" data-delete-story="${story.id}" title="Excluir story"><i class="fa-solid fa-trash"></i></button>` : ''}
        <button class="social-icon-btn story-close" data-close-modal><i class="fa-solid fa-xmark"></i></button>
      </div>
      ${story.caption ? `<div class="story-caption">${richText(story.caption)}</div>` : ''}
      <div class="story-bottom">
        <div class="story-reactions-row">${['❤️','🔥','👏','✨'].map((r) => `<button class="story-reaction" data-story-reaction="${r}">${r}<span></span></button>`).join('')}</div>
        <button class="story-reaction" data-story-reply title="Responder story"><i class="fa-regular fa-paper-plane"></i><span>Responder</span></button>
        ${canViewReactions ? `<button class="story-reactions-toggle" data-toggle-story-reactions><i class="fa-solid fa-chart-simple"></i> <span id="storyReactionsCount">...</span></button>` : ''}
      </div>
      ${canViewReactions ? `<div class="story-reactions-panel" id="storyReactionsPanel">
        <div class="story-reactions-title">Reacoes recebidas</div>
        <div id="storyReactionsContent" class="message-sub">Carregando...</div>
      </div>` : ''}
      <div class="story-reply-composer" id="storyReplyComposer" style="display:none">
        <textarea id="storyReplyInput" class="story-caption-input" maxlength="160" placeholder="Responder story..."></textarea>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px">
          <button class="social-icon-btn" type="button" data-close-story-reply>Cancelar</button>
          <button class="btn btn-primary social-submit" type="button" data-send-story-reply>Enviar</button>
        </div>
      </div>
    </div>`;
  openModal(modal);
  requestAnimationFrame(() => {
    modal.scrollTop = 0;
    modal.querySelector('.story-panel')?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  });
  modal.querySelectorAll('[data-story-reaction]').forEach((btn) => btn.addEventListener('click', async () => {
    await state.service.reactToStory(story, btn.dataset.storyReaction);
    Utils.showToast('Reacao enviada.');
    hydrateStoryMeta(story.id, canViewReactions);
  }));
  modal.querySelectorAll('[data-story-prev]').forEach((node) => node.addEventListener('click', (e) => {
    e.stopPropagation();
    if (storyIndex > 0) openStoryFast(groupIndex, storyIndex - 1);
    else if (groupIndex > 0) {
      const prevGroup = state.stories[groupIndex - 1];
      openStoryFast(groupIndex - 1, prevGroup.stories.length - 1);
    }
  }));
  modal.querySelectorAll('[data-story-next]').forEach((node) => node.addEventListener('click', (e) => {
    e.stopPropagation();
    const groupStories = group.stories || [];
    if (storyIndex < groupStories.length - 1) openStoryFast(groupIndex, storyIndex + 1);
    else if (groupIndex < state.stories.length - 1) openStoryFast(groupIndex + 1, 0);
  }));
  modal.querySelector('[data-story-reply]')?.addEventListener('click', () => {
    const composer = document.getElementById('storyReplyComposer');
    if (composer) composer.style.display = 'block';
    composer?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    composer?.querySelector('#storyReplyInput')?.focus();
  });
  modal.querySelector('[data-close-story-reply]')?.addEventListener('click', () => {
    const composer = document.getElementById('storyReplyComposer');
    if (composer) composer.style.display = 'none';
  });
  modal.querySelector('[data-send-story-reply]')?.addEventListener('click', async () => {
    const input = document.getElementById('storyReplyInput');
    const text = input?.value.trim();
    if (!text) return;
    try {
      const targetUserId = group?.author?.id;
      if (!targetUserId) throw new Error('Nao foi possivel identificar o autor do story.');
      const conversationId = await state.service.ensureDirectConversation(targetUserId);
      await state.service.sendDirectMessage(conversationId, text);
      input.value = '';
      const composer = document.getElementById('storyReplyComposer');
      if (composer) composer.style.display = 'none';
      Utils.showToast('Resposta enviada no Direct.');
    } catch (err) {
      console.error(err);
      Utils.showToast(err.message || 'Erro ao responder story.', 'error');
    }
  });
  modal.querySelector('[data-toggle-story-reactions]')?.addEventListener('click', () => {
    document.getElementById('storyReactionsPanel')?.classList.toggle('open');
  });
  modal.querySelector('[data-delete-story]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteStory(story.id);
  });
  bindStoryGestures(modal, (direction) => {
    const next = getNextStoryCursor(groupIndex, storyIndex, direction);
    if (next) openStoryFast(next.groupIndex, next.storyIndex);
  });
  startStoryProgress(modal, groupIndex, storyIndex, story);
  hydrateStoryMeta(story.id, canViewReactions);
}

function startStoryProgress(modal, groupIndex, storyIndex, story, go = null) {
  const bar = modal.querySelector('.story-progress-stack .active i, .story-progress span');
  if (!bar || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  bar.style.animation = 'none';
  requestAnimationFrame(() => {
    bar.style.animation = story.media_type === 'video' ? '' : 'storyProgress 6s linear forwards';
  });
  const video = modal.querySelector('.story-media video');
  if (video) {
    const syncVideoProgress = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        bar.style.animation = `storyProgress ${Math.max(3, Math.min(video.duration, 18))}s linear forwards`;
      }
      video.play?.().catch(() => {});
    };
    if (video.readyState >= 1) syncVideoProgress();
    else video.addEventListener('loadedmetadata', syncVideoProgress, { once: true });
    video.addEventListener('ended', () => {
      if (!modal.classList.contains('open')) return;
      if (go) go(1);
    }, { once: true });
  }
  if (story.media_type !== 'image') return;
  const timer = setTimeout(() => {
    if (!modal.classList.contains('open')) return;
    if (go) return go(1);
    const next = getNextStoryCursor(groupIndex, storyIndex, 1);
    if (next) openStoryFast(next.groupIndex, next.storyIndex);
  }, 6000);
  modal.dataset.storyTimer = String(timer);
}

async function hydrateStoryMeta(storyId, canViewReactions) {
  const modal = document.getElementById('storyViewer');
  let reactions = [];
  let views = [];
  try {
    reactions = await state.service.loadStoryReactions(storyId);
  } catch (err) {
    console.warn('[MSY][feed-social] Reacoes do story indisponiveis:', err);
  }
  const reactionSummary = reactions.reduce((acc, row) => {
    acc[row.reaction] = (acc[row.reaction] || 0) + 1;
    return acc;
  }, {});
  modal.querySelectorAll('[data-story-reaction]').forEach((btn) => {
    const span = btn.querySelector('span');
    if (span) span.textContent = reactionSummary[btn.dataset.storyReaction] || '';
  });
  if (!canViewReactions) return;
  try {
    views = await state.service.loadStoryViews(storyId);
  } catch (err) {
    console.warn('[MSY][feed-social] Views do story indisponiveis:', err);
  }
  const counter = document.getElementById('storyReactionsCount');
  if (counter) counter.textContent = `${reactions.length} reacao${reactions.length === 1 ? '' : 'es'}`;
  const content = document.getElementById('storyReactionsContent');
  if (!content) return;
  content.innerHTML = `
    <div class="story-reactions-summary">${Object.entries(reactionSummary).map(([reaction, count]) => `<span>${Utils.escapeHtml(reaction)} ${count}</span>`).join('') || '<span>Nenhuma ainda</span>'}</div>
    ${reactions.length ? reactions.map((r) => `
      <div class="story-reaction-row">
        ${avatar(r.user || {}, 30)}
        <div><strong>${Utils.escapeHtml(r.user?.name || 'Membro')}</strong><span>${timeAgo(r.created_at)}</span></div>
        <em>${Utils.escapeHtml(r.reaction)}</em>
      </div>`).join('') : '<div class="message-sub">Nenhuma reacao ainda.</div>'}
    <div class="story-reactions-title" style="margin-top:14px">Visualizacoes</div>
    <div class="story-reactions-summary">${views.length ? `<span>${views.length} visualizacao${views.length === 1 ? '' : 'es'}</span>` : '<span>Nenhuma visualizacao ainda</span>'}</div>
    ${views.length ? views.map((view) => `
      <div class="story-reaction-row">
        ${avatar(view.user || {}, 30)}
        <div><strong>${Utils.escapeHtml(view.user?.name || 'Membro')}</strong><span>${timeAgo(view.viewed_at)}</span></div>
        <em><i class="fa-regular fa-eye"></i></em>
      </div>`).join('') : '<div class="message-sub">Ninguem viu este story ainda.</div>'}`;
}

async function openStoryLegacy(groupIndex, storyIndex) {
  const group = state.stories[groupIndex];
  const story = group?.stories?.[storyIndex];
  if (!story) return;
  state.storyCursor = { groupIndex, storyIndex };
  state.service.markStoryViewed(story.id);
  let reactions = [];
  let views = [];
  try {
    reactions = await state.service.loadStoryReactions(story.id);
  } catch (err) {
    console.warn('[MSY][feed-social] Reacoes do story indisponiveis:', err);
  }
  try {
    views = await state.service.loadStoryViews(story.id);
  } catch (err) {
    console.warn('[MSY][feed-social] Views do story indisponiveis:', err);
  }
  const reactionSummary = reactions.reduce((acc, row) => {
    acc[row.reaction] = (acc[row.reaction] || 0) + 1;
    return acc;
  }, {});
  const canViewReactions = canManageStory(story);
  const reactionsTotal = reactions.length;
  const modal = document.getElementById('storyViewer');
  modal.innerHTML = `
    <div class="story-panel">
      <div class="story-media">${story.media_type === 'video' ? `<video src="${Utils.escapeHtml(story.media_url)}" autoplay controls playsinline></video>` : `<img src="${Utils.escapeHtml(story.media_url)}">`}</div>
      <div class="story-top">
        ${avatar(group.author, 34)}
        <div class="story-author-copy"><strong>${Utils.escapeHtml(group.author?.name || 'Membro')}</strong><span>@${Utils.escapeHtml(displayUsername(group.author || {}))} · ${timeAgo(story.created_at)}</span></div>
        <button class="social-icon-btn story-close" data-story-prev title="Story anterior"><i class="fa-solid fa-chevron-left"></i></button>
        <button class="social-icon-btn story-close" data-story-next title="Próximo story"><i class="fa-solid fa-chevron-right"></i></button>
        ${canManageStory(story) ? `<button class="social-icon-btn story-close" data-delete-story="${story.id}" title="Excluir story"><i class="fa-solid fa-trash"></i></button>` : ''}
        <button class="social-icon-btn story-close" data-close-modal><i class="fa-solid fa-xmark"></i></button>
      </div>
      ${story.caption ? `<div class="story-caption">${richText(story.caption)}</div>` : ''}
      <div class="story-bottom">
        <div class="story-reactions-row">${['❤️','🔥','👏','✨'].map((r) => `<button class="story-reaction" data-story-reaction="${r}">${r}<span>${reactionSummary[r] || ''}</span></button>`).join('')}</div>
        <button class="story-reaction" data-story-reply title="Responder story"><i class="fa-regular fa-paper-plane"></i><span>Responder</span></button>
        ${canViewReactions ? `<button class="story-reactions-toggle" data-toggle-story-reactions><i class="fa-solid fa-chart-simple"></i> ${reactionsTotal} reacao${reactionsTotal === 1 ? '' : 'es'}</button>` : ''}
      </div>
      ${canViewReactions ? `<div class="story-reactions-panel" id="storyReactionsPanel">
        <div class="story-reactions-title">Reacoes recebidas</div>
        <div class="story-reactions-summary">${Object.entries(reactionSummary).map(([reaction, count]) => `<span>${Utils.escapeHtml(reaction)} ${count}</span>`).join('') || '<span>Nenhuma ainda</span>'}</div>
        ${reactions.length ? reactions.map((r) => `
          <div class="story-reaction-row">
            ${avatar(r.user || {}, 30)}
            <div><strong>${Utils.escapeHtml(r.user?.name || 'Membro')}</strong><span>${timeAgo(r.created_at)}</span></div>
            <em>${Utils.escapeHtml(r.reaction)}</em>
          </div>`).join('') : '<div class="message-sub">Nenhuma reacao ainda.</div>'}
        <div class="story-reactions-title" style="margin-top:14px">Visualizacoes</div>
        <div class="story-reactions-summary">${views.length ? `<span>${views.length} visualizacao${views.length === 1 ? '' : 'es'}</span>` : '<span>Nenhuma visualizacao ainda</span>'}</div>
        ${views.length ? views.map((view) => `
          <div class="story-reaction-row">
            ${avatar(view.user || {}, 30)}
            <div><strong>${Utils.escapeHtml(view.user?.name || 'Membro')}</strong><span>${timeAgo(view.viewed_at)}</span></div>
            <em><i class="fa-regular fa-eye"></i></em>
          </div>`).join('') : '<div class="message-sub">Ninguem viu este story ainda.</div>'}
      </div>` : ''}
      <div class="story-reply-composer" id="storyReplyComposer" style="display:none">
        <textarea id="storyReplyInput" class="story-caption-input" maxlength="160" placeholder="Responder story..."></textarea>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px">
          <button class="social-icon-btn" type="button" data-close-story-reply>Cancelar</button>
          <button class="btn btn-primary social-submit" type="button" data-send-story-reply>Enviar</button>
        </div>
      </div>
    </div>`;
  openModal(modal);
  requestAnimationFrame(() => {
    modal.scrollTop = 0;
    const panel = modal.querySelector('.story-panel');
    const media = modal.querySelector('.story-media');
    if (panel) panel.scrollTop = 0;
    if (media) media.scrollLeft = 0;
  });
  modal.querySelectorAll('[data-story-reaction]').forEach((btn) => btn.addEventListener('click', async () => {
    await state.service.reactToStory(story, btn.dataset.storyReaction);
    Utils.showToast('Reacao enviada.');
    openStory(groupIndex, storyIndex);
  }));
  modal.querySelector('[data-story-prev]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (storyIndex > 0) openStory(groupIndex, storyIndex - 1);
    else if (groupIndex > 0) {
      const prevGroup = state.stories[groupIndex - 1];
      openStory(groupIndex - 1, prevGroup.stories.length - 1);
    }
  });
  modal.querySelector('[data-story-next]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const groupStories = group.stories || [];
    if (storyIndex < groupStories.length - 1) openStory(groupIndex, storyIndex + 1);
    else if (groupIndex < state.stories.length - 1) openStory(groupIndex + 1, 0);
  });
  modal.querySelector('[data-story-reply]')?.addEventListener('click', () => {
    const composer = document.getElementById('storyReplyComposer');
    composer?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    composer?.querySelector('#storyReplyInput')?.focus();
    composer?.style && (composer.style.display = 'block');
  });
  modal.querySelector('[data-close-story-reply]')?.addEventListener('click', () => {
    const composer = document.getElementById('storyReplyComposer');
    if (composer) composer.style.display = 'none';
  });
  modal.querySelector('[data-send-story-reply]')?.addEventListener('click', async () => {
    const input = document.getElementById('storyReplyInput');
    const text = input?.value.trim();
    if (!text) return;
    try {
      const targetUserId = group?.author?.id;
      if (!targetUserId) throw new Error('Não foi possível identificar o autor do story.');
      const conversationId = await state.service.ensureDirectConversation(targetUserId);
      await state.service.sendDirectMessage(conversationId, text);
      input.value = '';
      const composer = document.getElementById('storyReplyComposer');
      if (composer) composer.style.display = 'none';
      Utils.showToast('Resposta enviada no Direct.');
    } catch (err) {
      console.error(err);
      Utils.showToast(err.message || 'Erro ao responder story.', 'error');
    }
  });
  modal.querySelector('[data-toggle-story-reactions]')?.addEventListener('click', () => {
    document.getElementById('storyReactionsPanel')?.classList.toggle('open');
  });
  modal.querySelector('[data-delete-story]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteStory(story.id);
  });
}

async function deleteStory(storyId) {
  const story = findStoryById(storyId);
  if (!story || !canManageStory(story)) return Utils.showToast('Sem permissao para excluir este story.', 'error');
  if (!await MSYConfirm.show('Excluir este story?', { title: 'Excluir story', type: 'danger', confirmText: 'Excluir' })) return;
  try {
    await state.service.deleteStory(storyId);
    closeSocialModals();
    state.stories = await state.service.loadStories();
    renderStories();
    Utils.showToast('Story excluido.');
  } catch (err) {
    console.error('[MSY][feed-social] Erro ao excluir story:', err);
    Utils.showToast(err.message || 'Erro ao excluir story.', 'error');
  }
}

function getFollowMembers(memberId, type = 'followers') {
  const ids = type === 'followers'
    ? state.follows.filter((follow) => follow.following_id === memberId).map((follow) => follow.follower_id)
    : state.follows.filter((follow) => follow.follower_id === memberId).map((follow) => follow.following_id);

  return ids
    .map((id) => state.members.find((member) => member.id === id) || state.posts.find((post) => post.author_id === id)?.author)
    .filter(Boolean);
}

function openFollowList(memberId, type = 'followers') {
  const member = state.members.find((item) => item.id === memberId) || state.profile;
  const list = getFollowMembers(memberId, type);
  const modal = document.getElementById('profileViewer');
  modal.classList.remove('social-profile-editor-viewer');
  modal.classList.add('follow-list-viewer');
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';
  modal.style.padding = window.matchMedia('(max-width: 640px)').matches ? '14px' : '18px';
  modal.style.background = 'rgba(0,0,0,.74)';
  modal.innerHTML = `
    <div class="profile-panel follow-list-panel" style="width:min(430px,calc(100vw - 28px));height:auto;max-height:min(600px,72dvh);border-radius:24px;overflow:hidden">
      <div class="profile-modal-body">
        <div class="profile-modal-head">
          <div>
            <div class="profile-modal-name">${type === 'followers' ? 'Seguidores' : 'Seguindo'}</div>
            <div class="profile-modal-meta">${Utils.escapeHtml(member?.name || 'Membro')} · ${list.length} pessoa${list.length === 1 ? '' : 's'}</div>
          </div>
          <button class="social-icon-btn story-close" data-close-modal><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="social-search-results follow-list-results open" style="position:static;display:flex;flex-direction:column;gap:10px;box-shadow:none;border:none;background:transparent;padding:0">
          ${list.length ? list.map((person) => `
            <div class="social-result-item" data-open-profile="${person.id}">
              ${avatar(person, 36)}
              <div>
                <strong>${Utils.escapeHtml(person.name || 'Membro')}</strong>
                <div class="message-sub">@${Utils.escapeHtml(displayUsername(person))}</div>
              </div>
            </div>`).join('') : '<div class="message-sub">Nenhum membro nesta lista ainda.</div>'}
        </div>
      </div>
    </div>`;
  openModal(modal);
  modal.querySelectorAll('[data-open-profile]').forEach((node) => node.addEventListener('click', () => {
    closeSocialModals();
    openProfile(node.dataset.openProfile);
  }));
}

function openSocialProfileEditor() {
  const modal = document.getElementById('profileViewer');
  const stats = socialProfileStats(state.profile.id);
  const socialAvatar = state.profile.social_avatar_url || state.profile.avatar_url || '';
  modal.classList.remove('follow-list-viewer');
  ['align-items', 'justify-content', 'padding', 'background'].forEach((prop) => modal.style.removeProperty(prop));
  modal.classList.add('social-profile-editor-viewer');
  modal.innerHTML = `
    <div class="profile-panel social-editor-panel">
      <div class="social-editor-banner" id="socialEditorBannerPreview" style="${state.profile.banner_url ? `background-image:url('${Utils.escapeHtml(state.profile.banner_url)}')` : ''}">
        <button type="button" class="social-editor-media-btn" data-pick-social-banner><i class="fa-solid fa-image"></i> Trocar banner</button>
      </div>
      <div class="social-editor-body">
        <div class="social-editor-head">
          <div class="social-editor-avatar-wrap">
            <div class="social-editor-avatar-preview" id="socialEditorAvatarPreview">
              ${socialAvatar ? `<img src="${Utils.escapeHtml(socialAvatar)}" alt="Avatar social">` : avatar(state.profile, 86)}
            </div>
            <button type="button" class="social-editor-avatar-btn" data-pick-social-avatar><i class="fa-solid fa-camera"></i></button>
          </div>
          <div class="social-editor-title">
            <span>Meu perfil social</span>
            <strong>${Utils.escapeHtml(state.profile.name || 'Membro MSY')}</strong>
            <em>@${Utils.escapeHtml(displayUsername(state.profile))}</em>
          </div>
          <button class="social-icon-btn story-close" data-close-modal><i class="fa-solid fa-xmark"></i></button>
        </div>

        <div class="social-editor-stats">
          <button type="button" data-open-my-profile><strong>${stats.posts}</strong><span>posts</span></button>
          <button type="button" data-open-followers="${state.profile.id}"><strong>${stats.followers}</strong><span>seguidores</span></button>
          <button type="button" data-open-following="${state.profile.id}"><strong>${stats.following}</strong><span>seguindo</span></button>
        </div>

        <input type="file" id="socialAvatarFile" accept="image/*" hidden>
        <input type="file" id="socialBannerFile" accept="image/*" hidden>

        <div class="social-editor-grid">
          <label class="social-editor-field">
            <span>Username</span>
            <input id="socialUsernameInput" class="comment-input" maxlength="24" value="${Utils.escapeHtml(displayUsername(state.profile))}" placeholder="username">
          </label>
          <label class="social-editor-field">
            <span>Foto social por URL</span>
            <input id="socialAvatarInput" class="comment-input" value="${Utils.escapeHtml(state.profile.social_avatar_url || '')}" placeholder="https://...">
          </label>
          <label class="social-editor-field social-editor-field-wide">
            <span>Bio social</span>
            <textarea id="socialBioInput" class="story-caption-input" maxlength="180" placeholder="Conte um pouco sobre voce.">${Utils.escapeHtml(state.profile.social_bio || state.profile.bio || '')}</textarea>
          </label>
          <label class="social-editor-field social-editor-field-wide">
            <span>Banner por URL</span>
            <input id="socialBannerInput" class="comment-input" value="${Utils.escapeHtml(state.profile.banner_url || '')}" placeholder="https://...">
          </label>
        </div>

        <div class="social-editor-actions">
          <button type="button" class="follow-btn" data-open-my-profile><i class="fa-regular fa-user"></i> Ver perfil</button>
          <button class="btn btn-primary social-submit" id="saveSocialProfileBtn"><i class="fa-solid fa-floppy-disk"></i> Salvar perfil social</button>
        </div>
      </div>
    </div>`;
  openModal(modal);
  modal.querySelector('[data-pick-social-avatar]')?.addEventListener('click', () => modal.querySelector('#socialAvatarFile')?.click());
  modal.querySelector('[data-pick-social-banner]')?.addEventListener('click', () => modal.querySelector('#socialBannerFile')?.click());
  modal.querySelectorAll('[data-open-my-profile]').forEach((btn) => btn.addEventListener('click', () => {
    closeSocialModals();
    openProfile(state.profile.id);
  }));
  modal.querySelectorAll('[data-open-followers]').forEach((btn) => btn.addEventListener('click', () => openFollowList(btn.dataset.openFollowers, 'followers')));
  modal.querySelectorAll('[data-open-following]').forEach((btn) => btn.addEventListener('click', () => openFollowList(btn.dataset.openFollowing, 'following')));
  modal.querySelector('#socialAvatarFile')?.addEventListener('change', () => previewSocialProfileImage(modal, 'avatar'));
  modal.querySelector('#socialBannerFile')?.addEventListener('change', () => previewSocialProfileImage(modal, 'banner'));
  modal.querySelector('#socialAvatarInput')?.addEventListener('input', (e) => updateSocialAvatarPreview(e.target.value));
  modal.querySelector('#socialBannerInput')?.addEventListener('input', (e) => updateSocialBannerPreview(e.target.value));
  modal.querySelector('#saveSocialProfileBtn')?.addEventListener('click', saveSocialProfile);
}

function updateSocialAvatarPreview(url) {
  const preview = document.getElementById('socialEditorAvatarPreview');
  if (!preview) return;
  const value = String(url || '').trim();
  preview.innerHTML = value
    ? `<img src="${Utils.escapeHtml(value)}" alt="Avatar social">`
    : avatar(state.profile, 86);
}

function updateSocialBannerPreview(url) {
  const preview = document.getElementById('socialEditorBannerPreview');
  if (!preview) return;
  const value = String(url || '').trim();
  preview.style.backgroundImage = value ? `url("${value.replace(/"/g, '%22')}")` : '';
}

function previewSocialProfileImage(modal, kind) {
  const input = modal.querySelector(kind === 'avatar' ? '#socialAvatarFile' : '#socialBannerFile');
  const file = input?.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    Utils.showToast('Use apenas imagem para o perfil social.', 'error');
    input.value = '';
    return;
  }
  const url = URL.createObjectURL(file);
  if (kind === 'avatar') {
    updateSocialAvatarPreview(url);
  } else {
    updateSocialBannerPreview(url);
  }
}

async function saveSocialProfile() {
  const username = document.getElementById('socialUsernameInput')?.value || '';
  const social_bio = document.getElementById('socialBioInput')?.value || '';
  let social_avatar_url = document.getElementById('socialAvatarInput')?.value.trim() || '';
  let banner_url = document.getElementById('socialBannerInput')?.value.trim() || '';
  const avatarFile = document.getElementById('socialAvatarFile')?.files?.[0] || null;
  const bannerFile = document.getElementById('socialBannerFile')?.files?.[0] || null;
  const saveBtn = document.getElementById('saveSocialProfileBtn');
  try {
    if (saveBtn) saveBtn.disabled = true;
    if (avatarFile) {
      if (!avatarFile.type.startsWith('image/')) throw new Error('A foto do perfil precisa ser uma imagem.');
      validateMediaFile(avatarFile, { maxImageMB: 8, maxVideoMB: 0 });
      social_avatar_url = (await uploadSocialMedia(db, state.profile.id, avatarFile, 'profile/avatar')).url;
    }
    if (bannerFile) {
      if (!bannerFile.type.startsWith('image/')) throw new Error('O banner precisa ser uma imagem.');
      validateMediaFile(bannerFile, { maxImageMB: 12, maxVideoMB: 0 });
      banner_url = (await uploadSocialMedia(db, state.profile.id, bannerFile, 'profile/banner')).url;
    }
    const profile = await state.service.updateSocialProfile({ username, social_bio, banner_url, social_avatar_url });
    state.profile = profile;
    state.members = state.members.map((member) => member.id === profile.id ? { ...member, ...profile } : member);
    state.posts = state.posts.map((post) => post.author_id === profile.id
      ? { ...post, author: { ...post.author, ...profile, username: displayUsername(profile), social_bio: profile.social_bio, banner_url: profile.banner_url, social_avatar_url: profile.social_avatar_url } }
      : post);
    renderStories();
    renderPosts();
    renderSuggestions();
    renderMyProfileCard();
    renderTopProfileChip();
    if (state.activeProfileId === profile.id) {
      state.activeProfilePosts = state.posts.filter((post) => post.author_id === profile.id);
      renderProfileRoute();
    }
    Utils.showToast(profile._socialAvatarPendingMigration
      ? 'Perfil atualizado. Rode a migration social para salvar a foto social separada.'
      : 'Perfil social atualizado.');
    closeSocialModals();
    openProfile(profile.id);
  } catch (err) {
    console.error('[MSY][feed-social] Erro ao atualizar perfil social:', err);
    Utils.showToast(err.message || 'Erro ao salvar perfil social.', 'error');
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function openDirectInbox(targetId = null) {
  if (!state.hasSocialTables) {
    Utils.showToast('Aplique as migrations sociais antes de usar o Direct.', 'error');
    return;
  }

  const maybeUuid = typeof targetId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetId)
    ? targetId
    : null;

  try {
    setDirectConversations(await state.service.loadDirectConversations());

    if (maybeUuid) {
      const directConversation = state.directConversations.find((conversation) => conversation.id === maybeUuid);
      if (directConversation) {
        state.activeDirectConversationId = directConversation.id;
        directConversation.messages = directConversation.messages?.length
          ? directConversation.messages
          : await state.service.loadDirectMessages(directConversation.id);
        await state.service.markDirectConversationRead(directConversation.id);
        directConversation.unread_count = 0;
        state.directUnreadCount = state.service.getDirectUnreadCount(state.directConversations);
        renderDirectUnreadBadges();
      } else if (maybeUuid !== state.profile.id) {
        state.activeDirectConversationId = await state.service.ensureDirectConversation(maybeUuid);
        setDirectConversations(await state.service.loadDirectConversations());
      }
    }

    if (!state.activeDirectConversationId) {
      state.activeDirectConversationId = state.directConversations[0]?.id || null;
    }

    const activeConversation = state.directConversations.find((item) => item.id === state.activeDirectConversationId);
    if (activeConversation?.unread_count) {
      activeConversation.messages = activeConversation.messages?.length
        ? activeConversation.messages
        : await state.service.loadDirectMessages(activeConversation.id);
      await state.service.markDirectConversationRead(activeConversation.id);
      activeConversation.unread_count = 0;
      state.directUnreadCount = state.service.getDirectUnreadCount(state.directConversations);
      renderDirectUnreadBadges();
    }

    renderDirectInbox();
  } catch (err) {
    console.error('[MSY][feed-social] Erro ao abrir direct:', err);
    Utils.showToast(err.message || 'Erro ao abrir Direct.', 'error');
  }
}

function renderDirectInbox() {
  const modal = document.getElementById('directViewer');
  const activeConversation = state.directConversations.find((conversation) => conversation.id === state.activeDirectConversationId) || null;
  const activeMessages = activeConversation?.messages || [];
  const peer = activeConversation?.otherParticipants?.[0]?.profile || {};
  const streak = activeConversation?.streak || { days: 0, active: false, level: 'apagado' };
  const streakMeta = directStreakMeta(streak);
  const shellClass = `direct-shell${activeConversation ? ' show-chat' : ''}`;

  modal.innerHTML = `
    <div class="${shellClass}">
      <aside class="direct-sidebar">
        <div class="direct-sidebar-header">
          <div>
            <div class="direct-title">Mensagens</div>
            <div class="direct-subtitle">Seu Direct social</div>
          </div>
          <button class="social-icon-btn direct-mobile-close" data-close-modal><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="direct-search">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input id="directSearchInput" placeholder="Pesquisar conversas">
        </div>
        <div class="direct-list">
          ${state.directConversations.length ? state.directConversations.map((conversation) => {
            const person = conversation.otherParticipants[0]?.profile || {};
            const selected = conversation.id === state.activeDirectConversationId;
            const preview = conversation.lastMessage?.body || conversation.lastMessage?.attachment?.kind || 'Nova conversa';
            const unread = Number(conversation.unread_count || 0) > 0;
            return `
              <button type="button" class="direct-thread${selected ? ' active' : ''}${unread ? ' unread' : ''}" data-open-direct-conversation="${conversation.id}">
                ${avatar(person, 54)}
                <div class="direct-thread-copy">
                  <div class="direct-thread-top">
                    <strong>${Utils.escapeHtml(person.name || conversation.title || 'Membro')}</strong>
                    <span>${timeAgo(conversation.last_message_at || conversation.updated_at || conversation.created_at)}</span>
                  </div>
                  <div class="direct-thread-handle">@${Utils.escapeHtml(displayUsername(person))}</div>
                  <div class="direct-thread-preview">${Utils.escapeHtml(preview)}</div>
                </div>
                <div class="direct-thread-meta">
                  ${conversation.unread_count ? `<span class="direct-unread">${conversation.unread_count}</span>` : ''}
                </div>
              </button>`;
          }).join('') : '<div class="social-empty"><i class="fa-regular fa-paper-plane"></i>Nenhuma conversa ainda.</div>'}
        </div>
      </aside>
      <section class="direct-chat">
        <div class="direct-chat-header">
          <button class="social-icon-btn direct-back-btn" data-direct-back><i class="fa-solid fa-arrow-left"></i></button>
          ${avatar(peer, 44)}
          <div class="direct-chat-head-copy">
            <div class="direct-chat-name">${Utils.escapeHtml(activeConversation?.title || 'Selecione uma conversa')}</div>
            <div class="direct-chat-handle">@${Utils.escapeHtml(displayUsername(peer))} · ${Utils.escapeHtml(activeConversation ? 'online agora' : 'escolha uma conversa')}</div>
          </div>
          <div class="direct-streak level-${streakMeta.level}">
            <span class="direct-streak-icon">${streakMeta.icon}</span>
            <div>
              <strong>${streak.active ? `${streak.days} dias` : 'Sem sequência'}</strong>
              <span>${streak.active ? streakMeta.label : 'Vínculo adormecido'}</span>
            </div>
          </div>
        </div>
        <div class="direct-chat-body" id="directMessagesList">
          ${activeMessages.length ? activeMessages.map((message, index) => {
            const mine = message.sender_id === state.profile.id;
            const prev = activeMessages[index - 1];
            const showDate = !prev || new Date(prev.created_at).toDateString() !== new Date(message.created_at).toDateString();
            return `
              ${showDate ? `<div class="direct-date-divider"><span>${Utils.formatDate(message.created_at)}</span></div>` : ''}
              <div class="direct-message-row ${mine ? 'mine' : 'theirs'}">
                <div class="direct-message-bubble">
                  ${message.attachment?.kind === 'media' ? `<div class="direct-message-media">${message.attachment.media_type === 'video' ? `<video src="${Utils.escapeHtml(message.attachment.url)}" controls playsinline></video>` : `<img src="${Utils.escapeHtml(message.attachment.url)}" alt="Anexo do Direct">`}</div>` : ''}
                  ${message.body ? `<div class="direct-message-text">${Utils.escapeHtml(message.body || '')}</div>` : ''}
                  <div class="direct-message-time">${new Date(message.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </div>`;
          }).join('') : '<div class="social-empty"><i class="fa-regular fa-paper-plane"></i>Nenhuma mensagem ainda.</div>'}
        </div>
        <form id="directComposer" class="direct-composer">
          <button type="button" class="direct-composer-icon" aria-label="Emoji"><i class="fa-regular fa-face-smile"></i></button>
          <button type="button" class="direct-composer-icon" aria-label="Anexo"><i class="fa-regular fa-square-plus"></i></button>
          <input type="file" id="directMediaInput" accept="image/*,video/mp4,video/webm,video/quicktime" hidden>
          <input id="directMessageInput" class="direct-composer-input" placeholder="Enviar mensagem..." ${activeConversation ? '' : 'disabled'}>
          <button class="direct-composer-send" type="submit" ${activeConversation ? '' : 'disabled'}><i class="fa-solid fa-paper-plane"></i></button>
        </form>
      </section>
    </div>`;

  openModal(modal);
  modal.querySelectorAll('[data-open-direct-conversation]').forEach((node) => node.addEventListener('click', async () => {
    state.activeDirectConversationId = node.dataset.openDirectConversation;
    const conversation = state.directConversations.find((item) => item.id === state.activeDirectConversationId);
    if (conversation) {
      conversation.messages = await state.service.loadDirectMessages(conversation.id);
      await state.service.markDirectConversationRead(conversation.id);
      conversation.unread_count = 0;
      state.directUnreadCount = state.service.getDirectUnreadCount(state.directConversations);
      renderDirectUnreadBadges();
      if (!conversation.streak || !conversation.streak.active) {
        conversation.streak = state.service.calculateDirectStreak(conversation.messages, conversation.otherParticipants.map((participant) => participant.user_id));
      }
    }
    renderDirectInbox();
  }));
  modal.querySelector('[data-direct-back]')?.addEventListener('click', () => {
    state.activeDirectConversationId = null;
    renderDirectInbox();
  });
  modal.querySelector('#directComposer')?.addEventListener('submit', sendDirectMessage);
  modal.querySelector('.direct-composer-icon[aria-label="Anexo"]')?.addEventListener('click', () => modal.querySelector('#directMediaInput')?.click());
  modal.querySelector('.direct-composer-icon[aria-label="Emoji"]')?.addEventListener('click', () => {
    const input = modal.querySelector('#directMessageInput');
    if (!input) return;
    input.value += input.value.endsWith(' ') || !input.value ? '✨ ' : ' ✨ ';
    input.focus();
  });
  modal.querySelector('#directMediaInput')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file || !state.activeDirectConversationId) return;
    try {
      validateMediaFile(file);
      const media = await uploadSocialMedia(db, state.profile.id, file, 'direct');
      const message = await state.service.sendDirectMessage(state.activeDirectConversationId, '', { kind: 'media', ...media });
      const conversation = state.directConversations.find((item) => item.id === state.activeDirectConversationId);
      if (conversation) {
        conversation.messages = [...(conversation.messages || []), message];
        conversation.lastMessage = message;
        conversation.last_message_at = message.created_at;
      }
      renderDirectInbox();
    } catch (err) {
      console.error(err);
      Utils.showToast(err.message || 'Erro ao enviar midia no direct.', 'error');
    } finally {
      e.target.value = '';
    }
  });
  const search = modal.querySelector('#directSearchInput');
  search?.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    modal.querySelectorAll('[data-open-direct-conversation]').forEach((node) => {
      const text = node.textContent.toLowerCase();
      node.style.display = !q || text.includes(q) ? '' : 'none';
    });
  });

  requestAnimationFrame(() => {
    const list = modal.querySelector('#directMessagesList');
    if (list) list.scrollTop = list.scrollHeight;
  });
}

async function sendDirectMessage(e) {
  e.preventDefault();
  const input = document.getElementById('directMessageInput');
  const body = input?.value?.trim() || '';
  if (!body || !state.activeDirectConversationId) return;
  try {
    const message = await state.service.sendDirectMessage(state.activeDirectConversationId, body);
    const conversation = state.directConversations.find((item) => item.id === state.activeDirectConversationId);
    if (conversation) {
      conversation.messages = [...(conversation.messages || []), message];
      conversation.lastMessage = message;
      conversation.last_message_at = message.created_at;
      conversation.streak = message.metadata?.direct_streak || conversation.streak;
    }
    input.value = '';
    appendDirectMessageToDom(message);
  } catch (err) {
    console.error('[MSY][feed-social] Erro ao enviar mensagem direct:', err);
    Utils.showToast(err.message || 'Erro ao enviar direct.', 'error');
  }
}

function appendDirectMessageToDom(message) {
  const list = document.getElementById('directMessagesList');
  if (!list) return renderDirectInbox();
  const activeConversation = state.directConversations.find((conversation) => conversation.id === state.activeDirectConversationId);
  const messages = activeConversation?.messages || [];
  const prev = messages[messages.length - 2] || null;
  const showDate = !prev || new Date(prev.created_at).toDateString() !== new Date(message.created_at).toDateString();
  if (list.querySelector('.social-empty')) list.innerHTML = '';
  list.insertAdjacentHTML('beforeend', `
    ${showDate ? `<div class="direct-date-divider"><span>${Utils.formatDate(message.created_at)}</span></div>` : ''}
    <div class="direct-message-row mine">
      <div class="direct-message-bubble">
        ${message.attachment?.kind === 'media' ? `<div class="direct-message-media">${message.attachment.media_type === 'video' ? `<video src="${Utils.escapeHtml(message.attachment.url)}" controls playsinline></video>` : `<img src="${Utils.escapeHtml(message.attachment.url)}" alt="Anexo do Direct">`}</div>` : ''}
        ${message.body ? `<div class="direct-message-text">${Utils.escapeHtml(message.body || '')}</div>` : ''}
        <div class="direct-message-time">${new Date(message.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
      </div>
    </div>`);
  requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
}

function bindModals() {
  document.addEventListener('click', (e) => {
    if (e.target.matches('.story-viewer,.profile-viewer,.story-composer-modal,.media-viewer,.post-comments-modal,[data-close-modal]') || e.target.closest('[data-close-modal]')) {
      closeSocialModals();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSocialModals();
  });
}

async function handleMentionInput(input, minChars = 1) {
  if (!state.hasSocialTables || !input) return closeMentionDropdown();
  const cursor = input.selectionStart ?? input.value.length;
  const beforeCursor = input.value.slice(0, cursor);
  const match = beforeCursor.match(/(^|\s)@([\p{L}\p{N}_.-]*)$/u);
  if (!match) return closeMentionDropdown();
  const query = match[2] || '';
  if (query.length < minChars) return closeMentionDropdown();
  try {
    const members = await state.service.searchMembersForMention(query, { limit: 6 });
    if (!members.length) return closeMentionDropdown();
    openMentionDropdown(input, members, query);
  } catch (err) {
    console.warn('[MSY][feed-social] Erro no autocomplete de mencoes:', err);
    closeMentionDropdown();
  }
}

function bindMentionAutocomplete(input, { minChars = 1 } = {}) {
  if (!input || input.dataset.mentionBound === 'true') return;
  input.dataset.mentionBound = 'true';
  input.addEventListener('input', () => { handleMentionInput(input, minChars); });
  input.addEventListener('keydown', (e) => {
    if (!state.mentionDropdown || state.mentionTarget !== input) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      state.mentionActiveIndex = (state.mentionActiveIndex + 1) % state.mentionItems.length;
      syncMentionDropdownState();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      state.mentionActiveIndex = (state.mentionActiveIndex - 1 + state.mentionItems.length) % state.mentionItems.length;
      syncMentionDropdownState();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      const member = state.mentionItems[state.mentionActiveIndex];
      if (!member) return;
      e.preventDefault();
      applyMentionSelection(input, member);
    } else if (e.key === 'Escape') {
      closeMentionDropdown();
    }
  });
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (document.activeElement?.closest?.('.mention-dropdown')) return;
      closeMentionDropdown();
    }, 120);
  });
}

function ensureMentionDropdown() {
  if (state.mentionDropdown) return state.mentionDropdown;
  const dropdown = document.createElement('div');
  dropdown.className = 'mention-dropdown';
  dropdown.style.display = 'none';
  document.body.appendChild(dropdown);
  state.mentionDropdown = dropdown;
  return dropdown;
}

function openMentionDropdown(input, members, query) {
  const dropdown = ensureMentionDropdown();
  state.mentionTarget = input;
  state.mentionItems = members;
  state.mentionActiveIndex = 0;
  const rect = input.getBoundingClientRect();
  dropdown.style.display = 'block';
  dropdown.style.top = `${window.scrollY + rect.bottom + 8}px`;
  dropdown.style.left = `${window.scrollX + rect.left}px`;
  dropdown.style.width = `${Math.max(rect.width, 240)}px`;
  dropdown.innerHTML = members.map((member, index) => `
    <button type="button" class="mention-option${index === 0 ? ' active' : ''}" data-mention-index="${index}">
      ${avatar(member, 30)}
      <div class="mention-option-copy">
        <strong>${Utils.escapeHtml(member.name || 'Membro')}</strong>
        <span>@${Utils.escapeHtml(member.username || query)}</span>
      </div>
    </button>`).join('');
  dropdown.querySelectorAll('[data-mention-index]').forEach((node) => node.addEventListener('mousedown', (e) => {
    e.preventDefault();
    applyMentionSelection(input, members[Number(node.dataset.mentionIndex)]);
  }));
}

function syncMentionDropdownState() {
  if (!state.mentionDropdown) return;
  state.mentionDropdown.querySelectorAll('[data-mention-index]').forEach((node, index) => {
    node.classList.toggle('active', index === state.mentionActiveIndex);
  });
}

function applyMentionSelection(input, member) {
  if (!input || !member?.username) return closeMentionDropdown();
  const cursor = input.selectionStart ?? input.value.length;
  const beforeCursor = input.value.slice(0, cursor);
  const afterCursor = input.value.slice(cursor);
  const match = beforeCursor.match(/(^|\s)@([\p{L}\p{N}_.-]*)$/u);
  if (!match) return closeMentionDropdown();
  const tokenStart = cursor - match[0].length + match[1].length;
  const nextValue = `${input.value.slice(0, tokenStart)}@${member.username} ${afterCursor}`;
  input.value = nextValue;
  const nextCursor = tokenStart + member.username.length + 2;
  input.focus();
  input.setSelectionRange(nextCursor, nextCursor);
  closeMentionDropdown();
}

function closeMentionDropdown() {
  if (state.mentionDropdown) {
    state.mentionDropdown.style.display = 'none';
    state.mentionDropdown.innerHTML = '';
  }
  state.mentionTarget = null;
  state.mentionItems = [];
  state.mentionActiveIndex = 0;
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
  const directId = params.get('direct');
  if (postId) setTimeout(() => focusPost(postId), 500);
  if (commentId) setTimeout(() => {
    const node = document.getElementById(`comment-${commentId}`);
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      node.closest('.social-post')?.classList.add('highlight');
    }
  }, 600);
  if (profileId) setTimeout(() => openProfile(profileId, { replace: true }), 500);
  if (storyId) {
    const groupIndex = state.stories.findIndex((g) => g.stories.some((s) => s.id === storyId));
    const storyIndex = groupIndex >= 0 ? state.stories[groupIndex].stories.findIndex((s) => s.id === storyId) : -1;
    if (groupIndex >= 0 && storyIndex >= 0) setTimeout(() => openStory(groupIndex, storyIndex), 500);
  }
  if (directId) setTimeout(() => openDirectInbox(directId), 500);
}

initFeed().catch((err) => {
  console.error('[MSY][feed-social] Erro ao inicializar:', err);
  window.MSY.Utils.showToast?.('Erro ao carregar Feed Social.', 'error');
});
