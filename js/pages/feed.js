/* ============================================================
   MSY PORTAL — FEED SOCIAL
   Nova experiencia social interna.
   ============================================================ */

import { SocialService } from '../social/social_service.js?v=20260609-post-create-composer';
import {
  captureStoryVideoThumbnail,
  createStoryMediaEditState,
  exportStoryImageFile,
  exportStoryVideoFile,
  filePreview,
  getStoryAspectRatioValue,
  loadImage,
  normalizeMediaEditState,
  removeSocialMedia,
  revokePreviews,
  supportsVideoEditing,
  uploadSocialMedia,
  validateMediaFile,
} from '../social/social_media.js?v=20260609-ig-crop-final';

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
  socialStoriesChannel: null,
  directMessagesChannel: null,
  directConversations: [],
  directUnreadCount: 0,
  activeDirectConversationId: null,
  directConversationMenu: null,
  directThreadMenuSuppressClickId: null,
  directViewportCleanup: null,
  directInitialScrollCleanup: null,
  directScrollRequestId: 0,
  directContextMessageId: null,
  directEditingMessageId: null,
  directActivityRefreshTimer: null,
  activeProfileId: null,
  activeProfilePosts: [],
  activeProfileLikedPosts: [],
  activeProfileSavedPosts: [],
  activeProfileSummary: null,
  activeProfileTab: 'posts',
  previews: [],
  postComposerTool: null,
  postEditPreviews: [],
  activePostEditId: null,
  storyPreviews: [],
  activeStoryComposerIndex: 0,
  storyEditPreview: null,
  activeStoryEditId: null,
  storyCursor: null,
  storyMediaCache: new Map(),
  storyPreloadQueue: new Set(),
  storySoundMuted: false,
  storyViewportCleanup: null,
  scrollLockCleanup: null,
  modalScrollY: 0,
  bodyLockTop: '',
  hasSocialTables: true,
  loadingMore: false,
  refreshingFeed: false,
  hasMorePosts: true,
  postCursor: null,
  feedEventsBound: false,
  feedObserver: null,
  mediaObserver: null,
  postRevealObserver: null,
  mediaViewerCleanup: null,
  lastPostTap: null,
  mentionDropdown: null,
  mentionTarget: null,
  mentionItems: [],
  mentionActiveIndex: 0,
  socialSearchItems: [],
  socialSearchActiveIndex: 0,
  feedScrollBeforeProfile: 0,
  pendingFollows: new Set(),
  canModerateFeed: false,
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
  return state.profile.tier === 'diretoria' || state.canModerateFeed || post.author_id === state.profile.id;
}

function canEditPost(post) {
  return post?.author_id === state.profile?.id;
}

function canManageStory(story) {
  return state.profile.tier === 'diretoria' || state.canModerateFeed || story.author_id === state.profile.id;
}

function canManageComment(comment, post) {
  const userId = state.profile?.id;
  return !!userId && (comment?.author_id === userId || post?.author_id === userId);
}

function displayUsername(member) {
  return state.service?.getDisplayUsername(member) || 'membro';
}

const CONTENT_TYPE_META = {
  post: { label: 'Post', icon: 'fa-regular fa-message' },
  story: { label: 'Story', icon: 'fa-regular fa-circle-play' },
  aviso: { label: 'Aviso', icon: 'fa-solid fa-bullhorn' },
  destaque: { label: 'Destaque', icon: 'fa-solid fa-star' },
};

function getPostContentType(post = {}) {
  const marker = String(post.kind || post.type || post.category || '').toLowerCase();
  if (post.is_pinned || marker.includes('destaque') || marker.includes('highlight')) return 'destaque';
  if (post.legacy || post.is_notice || marker.includes('aviso') || marker.includes('notice')) return 'aviso';
  return 'post';
}

function renderContentBadge(type = 'post') {
  if (type === 'post' || type === 'story') return '';
  const meta = CONTENT_TYPE_META[type] || CONTENT_TYPE_META.post;
  return `<span class="content-type-badge content-type-badge-${type}"><i class="${meta.icon}"></i>${meta.label}</span>`;
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

function closeDirectConversationMenu() {
  if (!state.directConversationMenu) return;
  state.directConversationMenu = null;
  state.directThreadMenuSuppressClickId = null;
  document.querySelector('.direct-thread-menu')?.remove();
}

function getDirectConversationNode(target) {
  return target?.closest?.('[data-open-direct-conversation]') || null;
}

function openDirectConversationMenu(conversationId, anchor = null) {
  if (!conversationId) return;
  const pad = 12;
  const menuWidth = 230;
  const menuHeight = 72;
  const rect = anchor?.getBoundingClientRect?.() || null;
  const sidebar = document.getElementById('directViewer')?.querySelector('.direct-sidebar');
  const sidebarRect = sidebar?.getBoundingClientRect?.() || null;
  const maxLeft = sidebarRect ? Math.max(pad, sidebarRect.width - menuWidth - pad) : Math.max(pad, window.innerWidth - menuWidth - pad);
  const maxTop = sidebarRect ? Math.max(pad, sidebarRect.height - menuHeight - pad) : Math.max(pad, window.innerHeight - menuHeight - pad);
  const left = rect && sidebarRect
    ? Math.min(Math.max(pad, rect.right - sidebarRect.left - menuWidth), maxLeft)
    : maxLeft;
  const top = rect && sidebarRect
    ? Math.min(Math.max(pad, rect.top - sidebarRect.top + (rect.height / 2) - (menuHeight / 2)), maxTop)
    : Math.max(pad, pad + 44);
  state.directConversationMenu = {
    conversationId,
    left,
    top,
  };
  if (document.getElementById('directViewer')?.classList.contains('open')) renderDirectInbox();
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
  closeMobileActions();
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

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function openPostMediaPicker() {
  document.getElementById('composerFiles')?.click();
}

function openStoryMediaPicker() {
  document.getElementById('storyFiles')?.click();
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

function renderStoryMediaElement(story, attrs = '') {
  const editState = normalizeMediaEditState(story?.media_meta || {}, story?.media_type || 'image');
  const aspect = mediaAspectCss(editState.aspect || '9:16', editState.originalAspect);
  const style = `--editor-transform:${mediaEditorTransform(editState)};--story-media-aspect:${aspect}`;
  return story.media_type === 'video'
    ? `<video class="post-media-edited" style="${style}" src="${Utils.escapeHtml(story.media_url)}" ${attrs} playsinline webkit-playsinline></video>`
    : `<img class="post-media-edited" style="${style}" src="${Utils.escapeHtml(story.media_url)}" ${attrs}>`;
}

function isPostMediaExported(media) {
  return media?.media_meta?.exported === true || /-story\.(webp|webm)$/i.test(media?.storage_path || '');
}

function renderPostMediaElement(media, attrs = '') {
  const editState = normalizeMediaEditState(media?.media_meta || {}, media?.media_type || 'image');
  const alreadyExported = isPostMediaExported(media);
  const transform = alreadyExported
    ? 'translate(-50%,-50%) scale(1) rotate(0deg)'
    : mediaEditorTransform(editState);
  const style = `--editor-transform:${transform}`;
  const className = `post-media-edited${alreadyExported ? ' post-media-rendered' : ''}`;
  return media.media_type === 'video'
    ? `<video class="${className}" style="${style}" src="${Utils.escapeHtml(media.url)}" ${attrs} playsinline></video>`
    : `<img class="${className}" style="${style}" src="${Utils.escapeHtml(media.url)}" ${attrs}>`;
}

function postMediaAspectCss(media) {
  if (Number(media?.media_meta?.exportedAspect) > 0) return `${Number(media.media_meta.exportedAspect)} / 1`;
  const width = Number(media?.width || media?.media_meta?.exportedWidth || 0);
  const height = Number(media?.height || media?.media_meta?.exportedHeight || 0);
  if (width > 0 && height > 0) return `${width} / ${height}`;
  const editState = normalizeMediaEditState(media?.media_meta || {}, media?.media_type || 'image');
  if (editState.aspect && editState.aspect !== 'original') return mediaAspectCss(editState.aspect, editState.originalAspect);
  if (Number(editState.originalAspect) > 0) return `${Number(editState.originalAspect)} / 1`;
  return '4 / 5';
}

function renderPostMediaViewerElement(media, attrs = '') {
  const url = Utils.escapeHtml(media?.url || '');
  return media?.media_type === 'video'
    ? `<video src="${url}" ${attrs} playsinline></video>`
    : `<img src="${url}" ${attrs}>`;
}

function getPostPermalink(postId) {
  const url = new URL(window.location.href);
  url.pathname = url.pathname.replace(/[^/]*$/, 'feed.html');
  url.search = '';
  url.hash = '';
  url.searchParams.set('post', postId);
  return url.toString();
}

function getPostShareAttachment(post) {
  const firstMedia = post?.media?.[0] || null;
  return {
    kind: 'post_share',
    post_id: post.id,
    post_author_id: post.author_id || post.author?.id || null,
    post_author_name: post.author?.name || 'Membro MSY',
    post_author_username: displayUsername(post.author || {}),
    content_excerpt: (post.content || '').trim().slice(0, 220),
    media_url: firstMedia?.url || null,
    media_type: firstMedia?.media_type || null,
    url: getPostPermalink(post.id),
  };
}

function getActiveDirectConversation() {
  return state.directConversations.find((conversation) => conversation.id === state.activeDirectConversationId) || null;
}

function findDirectMessage(conversationId, messageId) {
  const conversation = state.directConversations.find((item) => item.id === conversationId);
  const message = conversation?.messages?.find((item) => item.id === messageId) || null;
  return { conversation, message };
}

function upsertDirectMessage(conversationId, nextMessage) {
  const conversation = state.directConversations.find((item) => item.id === conversationId);
  if (!conversation) return null;
  const messages = [...(conversation.messages || [])];
  const index = messages.findIndex((item) => item.id === nextMessage.id);
  if (index >= 0) messages[index] = { ...messages[index], ...nextMessage };
  else messages.push(nextMessage);
  messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || String(a.id).localeCompare(String(b.id)));
  conversation.messages = messages;
  conversation.lastMessage = messages.at(-1) || null;
  conversation.last_message_at = conversation.lastMessage?.created_at || conversation.last_message_at;
  return conversation;
}

function removeDirectMessageForViewer(conversationId, messageId) {
  const conversation = state.directConversations.find((item) => item.id === conversationId);
  if (!conversation?.messages) return;
  conversation.messages = conversation.messages.filter((item) => item.id !== messageId);
  conversation.lastMessage = conversation.messages.at(-1) || null;
  conversation.last_message_at = conversation.lastMessage?.created_at || conversation.last_message_at;
}

function patchStoryInState(storyId, patch = {}) {
  for (const group of state.stories) {
    const story = group.stories?.find((item) => item.id === storyId);
    if (story) {
      Object.assign(story, patch);
      return story;
    }
  }
  return null;
}

function getStoryFallbackAttachment(story = {}, group = {}) {
  return {
    id: story.id,
    author_id: story.author_id || group.author?.id || null,
    author_name: group.author?.name || story.author?.name || 'Story',
    media_type: story.media_type,
    media_url: story.media_url,
    story_url: story.media_url,
    thumbnail_url: story.thumbnail_url || story.media_url,
    caption: story.caption || '',
  };
}

function lockBodyScroll() {
  if (document.body.classList.contains('social-modal-locked')) return;
  state.modalScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  state.bodyLockTop = `-${state.modalScrollY}px`;
  document.documentElement.classList.add('social-modal-locked');
  document.body.classList.add('social-modal-locked');
  document.body.style.top = state.bodyLockTop;
  document.body.style.left = '0';
  document.body.style.right = '0';

  const blockDocumentScroll = (event) => {
    const modal = event.target.closest?.('.story-viewer.open,.profile-viewer.open,.story-composer-modal.open,.media-viewer.open,.post-comments-modal.open');
    const scrollable = event.target.closest?.('.story-reactions-panel.open,.story-caption-instagram,.profile-panel,.story-compose-panel,.media-viewer-panel,.post-comments-panel,.direct-chat-body,.direct-list');
    if (!modal || !scrollable) event.preventDefault();
  };

  document.addEventListener('touchmove', blockDocumentScroll, { passive: false });
  document.addEventListener('wheel', blockDocumentScroll, { passive: false });
  state.scrollLockCleanup = () => {
    document.removeEventListener('touchmove', blockDocumentScroll);
    document.removeEventListener('wheel', blockDocumentScroll);
  };
}

function unlockBodyScroll() {
  if (!document.body.classList.contains('social-modal-locked')) return;
  if (typeof state.scrollLockCleanup === 'function') {
    state.scrollLockCleanup();
    state.scrollLockCleanup = null;
  }
  document.documentElement.classList.remove('social-modal-locked');
  document.body.classList.remove('social-modal-locked');
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  window.scrollTo({ top: state.modalScrollY, behavior: 'auto' });
}

function openModal(modal) {
  closeMobileActions();
  lockBodyScroll();
  if (modal.parentElement !== document.body) document.body.appendChild(modal);
  modal.classList.add('open');
}

function closeSocialModals() {
  closeMobileActions();
  const storyViewer = document.getElementById('storyViewer');
  clearStoryTimer(storyViewer);
  document.querySelectorAll('.story-viewer,.profile-viewer,.story-composer-modal,.media-viewer,.post-comments-modal').forEach((m) => {
    m.querySelectorAll('video').forEach((video) => video.pause());
    m.classList.remove('open');
    m.classList.remove('follow-list-viewer');
    m.classList.remove('social-profile-editor-viewer');
    m.classList.remove('post-share-modal');
    ['align-items', 'justify-content', 'padding', 'background'].forEach((prop) => m.style.removeProperty(prop));
  });
  state.notificationPanelOpen = false;
  if (typeof state.directViewportCleanup === 'function') {
    state.directViewportCleanup();
    state.directViewportCleanup = null;
  }
  if (typeof state.directInitialScrollCleanup === 'function') {
    state.directInitialScrollCleanup();
    state.directInitialScrollCleanup = null;
  }
  closeDirectConversationMenu();
  if (typeof state.storyViewportCleanup === 'function') {
    state.storyViewportCleanup();
    state.storyViewportCleanup = null;
  }
  if (typeof state.mediaViewerCleanup === 'function') {
    state.mediaViewerCleanup();
    state.mediaViewerCleanup = null;
  }
  if (state.directMessagesChannel) {
    try { db.removeChannel(state.directMessagesChannel); } catch {}
    state.directMessagesChannel = null;
  }
  state.directEditingMessageId = null;
  if (state.postEditPreviews?.length) revokePreviews(state.postEditPreviews.filter((item) => item.isNew));
  state.postEditPreviews = [];
  state.activePostEditId = null;
  if (state.storyEditPreview?.isNew) revokePreviews([state.storyEditPreview]);
  state.storyEditPreview = null;
  state.activeStoryEditId = null;
  unlockBodyScroll();
}

function cancelPostComposer() {
  if (state.previews?.length) revokePreviews(state.previews);
  state.previews = [];
  state.postComposerTool = null;
  state.postComposerStep = 'crop';
  state.composerLocation = '';
  const composerText = document.getElementById('composerText');
  if (composerText) composerText.value = '';
  renderPreviews();
  syncComposerState();
  closeSocialModals();
}

async function initFeed() {
  const profile = await renderSidebar('feed');
  if (!profile) return;
  state.profile = profile;
  state.canModerateFeed = profile.tier === 'diretoria' || await MSYPerms.check(profile.id, profile.tier, 'moderar_feed');
  state.service = new SocialService(db, profile, Utils);
  await renderTopBar('Feed Social', profile);

  document.getElementById('pageContent').innerHTML = layout();
  bindComposer();
  bindSearch();
  bindModals();
  bindFeedInteractions();
  bindSocialNotifications();
  bindMobileActionDock();
  bindPullToRefresh();
  bindRouteNavigation();
  await loadInitial();
  subscribeSocialNotifications();
  subscribeStoriesRealtime();
  handleDeepLink();
}

function layout() {
  return `
    <section id="socialProfileRoute" class="social-profile-route" hidden></section>
    <div class="feed-pull-refresh" id="feedPullRefresh" aria-hidden="true"><i class="fa-solid fa-arrow-down"></i><span>Puxe para atualizar</span></div>
    <div class="social-shell" id="feedRouteView">
      <section class="social-main">
        <div class="social-hero">
          <div>
            <div class="social-title">Feed Social MSY</div>
            <div class="social-subtitle">Posts, stories, perfis e interacoes da comunidade.</div>
          </div>
          <div class="social-top-actions">
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

        <div class="social-card social-member-search-card mobile-member-search-card">
          <div class="social-search-mobile-head">
            <strong>Pesquisar</strong>
            <button type="button" class="social-icon-btn" id="closeSocialSearchBtn"><i class="fa-solid fa-xmark"></i></button>
          </div>
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
            <textarea class="composer-input" id="composerText" placeholder="Compartilhe uma atualizacao, foto, conquista ou ideia... Use @membro e #hashtags" data-mobile-placeholder="O que voce quer compartilhar?"></textarea>
          </div>
          <div class="composer-dropzone" id="composerDrop">
            <i class="fa-solid fa-cloud-arrow-up"></i>
            Arraste imagens ou videos aqui, ou clique para escolher.
          </div>
          <input type="file" id="composerFiles" accept="image/*,video/*" multiple hidden>
          <input type="file" id="storyFiles" accept="image/*,video/*" multiple hidden>
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
          ${renderFeedSkeleton()}
        </div>
      </section>

      <aside class="social-rail">
        <div class="social-card my-social-card" id="mySocialProfileCard"></div>
        <div class="social-card social-discover-card">
          <div class="side-title"><i class="fa-solid fa-user-plus"></i>Descobrir membros</div>
          <div class="side-member-search">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input id="sideMemberSearchInput" autocomplete="off" placeholder="Pesquisar @username">
          </div>
          <div id="suggestionsList" class="side-member-results"></div>
        </div>
      </aside>
    </div>

    <div class="story-viewer" id="storyViewer"></div>
    <div class="media-viewer" id="mediaViewer"></div>
    <div class="post-comments-modal" id="postCommentsModal"></div>
    <div class="post-comments-modal" id="postShareModal"></div>
    <div class="story-composer-modal" id="postEditorModal"></div>
    <div class="story-composer-modal" id="storyComposerModal"></div>
    <div class="story-composer-modal" id="mobilePostComposerModal"></div>
    <div class="profile-viewer" id="socialNotificationsDrawer"></div>
    <div class="profile-viewer" id="profileViewer"></div>
    <div class="profile-viewer" id="directViewer"></div>
    <div class="mobile-action-dock" id="mobileActionDock">
      <div class="mobile-action-scrim" data-mobile-action-close></div>
      <div class="mobile-action-menu" aria-hidden="true">
        <label class="mobile-action-picker">
          <input type="file" id="mobileComposerFiles" accept="image/*,video/*" multiple>
          <i class="fa-solid fa-plus"></i><span>Publicar</span>
        </label>
        <label class="mobile-action-picker">
          <input type="file" id="mobileStoryFiles" accept="image/*,video/*" multiple>
          <i class="fa-solid fa-circle-play"></i><span>Story</span>
        </label>
        <button type="button" data-mobile-action="search"><i class="fa-solid fa-magnifying-glass"></i><span>Buscar</span></button>
        <button type="button" data-mobile-action="activity"><i class="fa-regular fa-heart"></i><span>Atividade</span></button>
        <button type="button" data-mobile-action="direct"><i class="fa-regular fa-paper-plane"></i><span>Direct</span></button>
        <button type="button" data-mobile-action="profile"><i class="fa-regular fa-user"></i><span>Perfil</span></button>
      </div>
      <button type="button" class="mobile-action-fab" id="mobileActionToggle" aria-label="Abrir ações do feed" aria-expanded="false"><i class="fa-solid fa-plus"></i></button>
    </div>`;
}

function renderFeedSkeleton(count = 3) {
  return Array.from({ length: count }, () => `
    <article class="social-post social-post-skeleton" aria-hidden="true">
      <div class="post-head">
        <span class="skeleton-avatar"></span>
        <div class="post-author-copy">
          <span class="skeleton-line" style="width:148px"></span>
          <span class="skeleton-line" style="width:210px;margin-top:8px"></span>
        </div>
      </div>
      <div class="post-content">
        <span class="skeleton-line"></span>
        <span class="skeleton-line" style="width:72%;margin-top:8px"></span>
      </div>
      <span class="skeleton-block"></span>
    </article>`).join('');
}

async function loadInitial() {
  try {
    const data = await state.service.loadBootstrap();
    Object.assign(state, data, { hasSocialTables: true });
    setDirectConversations(data.directConversations || []);
    syncPostPaginationState();
  } catch (err) {
    const message = String(err?.message || '').toLowerCase();
    const legacyCompatible = message.includes('relation')
      || message.includes('does not exist')
      || message.includes('schema cache')
      || message.includes('could not find');
    if (!legacyCompatible) {
      console.error('[MSY][feed-social] Falha ao carregar modulo social:', err);
      throw err;
    }
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
      ${renderContentBadge('story')}
    </div>`;
  const stories = state.stories.map((group, idx) => `
    <div class="story-bubble" data-story-index="${idx}">
      <div class="story-avatar"><div class="story-avatar-inner">${group.author?.social_avatar_url || group.author?.avatar_url ? `<img src="${Utils.escapeHtml(group.author.social_avatar_url || group.author.avatar_url)}">` : Utils.escapeHtml(group.author?.initials || Utils.getInitials(group.author?.name || 'MS'))}</div></div>
      <div class="story-label">${Utils.escapeHtml(group.author?.name || 'Membro')}</div>
      ${renderContentBadge('story')}
    </div>`).join('');
  el.innerHTML = create + stories;
  document.getElementById('createStoryBubble')?.addEventListener('click', openStoryMediaPicker);
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
  const contentType = getPostContentType(post);
  const verified = author.tier === 'diretoria' ? '<span class="verified-dot"><i class="fa-solid fa-check"></i></span>' : '';
  const media = (post.media || []).length ? `
      <div class="post-media" data-media-post="${post.id}">
        <div class="post-media-track">
        ${post.media.map((m, index) => `<div class="post-media-slide" style="--post-media-aspect:${postMediaAspectCss(m)}" role="button" tabindex="0" data-open-media="${post.id}" data-media-index="${index}" aria-label="Abrir midia">${renderPostMediaElement(m, m.media_type === 'video' ? 'controls preload="metadata"' : 'loading="lazy" decoding="async"')}</div>`).join('')}
      </div>
      ${post.media.length > 1 ? `
        <button type="button" class="post-media-nav post-media-prev" data-media-nav="${post.id}" data-media-direction="-1" aria-label="Foto anterior"><i class="fa-solid fa-chevron-left"></i></button>
        <button type="button" class="post-media-nav post-media-next" data-media-nav="${post.id}" data-media-direction="1" aria-label="Proxima foto"><i class="fa-solid fa-chevron-right"></i></button>
        <div class="post-media-dots">${post.media.map((_, i) => `<button type="button" class="post-media-dot${i === 0 ? ' active' : ''}" data-media-dot="${post.id}" data-media-index="${i}" aria-label="Ir para foto ${i + 1}"></button>`).join('')}</div>
      ` : ''}
    </div>` : '';
  return `
    <article class="social-post social-post-${contentType}" id="post-${post.id}" data-post-id="${post.id}" data-content-type="${contentType}">
      <div class="post-head">
        <div class="post-author" data-profile-id="${author.id || post.author_id}">
          ${avatar(author, 44)}
          <div class="post-author-copy">
            <div class="post-author-name"><span>${Utils.escapeHtml(author.name || 'Membro MSY')}</span>${verified}</div>
            <div class="post-meta"><span>@${Utils.escapeHtml(displayUsername(author))}</span><span>·</span><span>${Utils.escapeHtml(author.role || 'Membro')}</span><span>·</span><span>${timeAgo(post.created_at)}</span>${post.edited_at ? '<span class="edited-badge">Editado</span>' : ''}</div>
          </div>
        </div>
        ${renderContentBadge(contentType)}
        <div class="post-menu-wrap">
          <button class="social-icon-btn post-more-btn" data-post-menu="${post.id}" aria-label="Mais opcoes"><i class="fa-solid fa-ellipsis"></i></button>
          <div class="post-menu">
            ${canEditPost(post) && !post.legacy ? `<button data-edit-post="${post.id}"><i class="fa-solid fa-pen"></i> Editar</button>` : ''}
            ${(state.profile.tier === 'diretoria' || state.canModerateFeed) && !post.legacy ? `<button data-pin-post="${post.id}"><i class="fa-solid fa-thumbtack"></i> ${post.is_pinned ? 'Desfixar' : 'Fixar'}</button>` : ''}
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
          <button class="social-action" data-share-post="${post.id}" title="Compartilhar no Direct"><i class="fa-regular fa-paper-plane"></i></button>
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
            <button class="social-icon-btn" type="submit" title="Enviar" disabled><i class="fa-solid fa-arrow-up"></i></button>
          </form>` : ''}
      </div>
    </article>`;
}

function hydrateFeedEnhancements(root = document) {
  decorateFeedItems(root);
  root.querySelectorAll('.post-media-track:not([data-media-bound])').forEach((track) => {
    track.dataset.mediaBound = 'true';
    track.addEventListener('scroll', () => syncMediaDots(track), { passive: true });
  });
  root.querySelectorAll('.post-media:not([data-doubletap-bound])').forEach((media) => {
    media.dataset.doubletapBound = 'true';
    media.addEventListener('pointerup', handlePostMediaTap, { passive: true });
    media.addEventListener('dblclick', handlePostMediaDoubleClick);
  });
  ensureMediaObserver();
  root.querySelectorAll('.post-media-slide video').forEach((video) => state.mediaObserver?.observe(video));
}

function decorateFeedItems(root = document) {
  const posts = [...root.querySelectorAll('.social-post:not(.social-post-skeleton)')];
  posts.forEach((post, index) => {
    post.style.setProperty('--feed-item-index', String(Math.min(index, 10)));
    post.style.setProperty('--feed-reveal-delay', `${Math.min(index, 8) * 34}ms`);
    post.classList.add('feed-reveal-pending');
  });
  if (prefersReducedMotion()) {
    posts.forEach((post) => post.classList.add('feed-revealed'));
    return;
  }
  ensurePostRevealObserver();
  if (!state.postRevealObserver) {
    posts.forEach((post) => post.classList.add('feed-revealed'));
    return;
  }
  posts.forEach((post) => state.postRevealObserver?.observe(post));
}

function ensurePostRevealObserver() {
  if (state.postRevealObserver || !('IntersectionObserver' in window)) return;
  state.postRevealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('feed-revealed');
      state.postRevealObserver.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
}

function handlePostMediaTap(event) {
  if (event.pointerType === 'mouse') return;
  const media = event.currentTarget;
  const postId = media?.dataset.mediaPost;
  const now = Date.now();
  const samePost = state.lastPostTap?.postId === postId;
  const quickTap = samePost && now - state.lastPostTap.time < 320;
  state.lastPostTap = { postId, time: now };
  if (!quickTap || !postId) return;
  const likeBtn = document.getElementById(`post-${postId}`)?.querySelector('[data-like-post]');
  if (likeBtn && !likeBtn.classList.contains('active')) toggleLike(postId, likeBtn);
  showPostGestureHeart(media);
}

function handlePostMediaDoubleClick(event) {
  event.preventDefault();
  const media = event.currentTarget;
  const postId = media?.dataset.mediaPost;
  if (!postId) return;
  const likeBtn = document.getElementById(`post-${postId}`)?.querySelector('[data-like-post]');
  if (likeBtn && !likeBtn.classList.contains('active')) toggleLike(postId, likeBtn);
  showPostGestureHeart(media);
}

function showPostGestureHeart(media) {
  if (!media || prefersReducedMotion()) return;
  const pulse = document.createElement('span');
  pulse.className = 'post-gesture-heart';
  pulse.innerHTML = '<i class="fa-solid fa-heart"></i>';
  media.appendChild(pulse);
  pulse.addEventListener('animationend', () => pulse.remove(), { once: true });
}

function syncMediaDots(track) {
  const wrap = track.closest('.post-media');
  const dots = wrap?.querySelectorAll('.post-media-dot') || [];
  if (!dots.length) return;
  const index = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
  dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
}

function goToPostMedia(postId, nextIndex) {
  const safePostId = window.CSS?.escape ? CSS.escape(postId) : String(postId).replace(/"/g, '\\"');
  const wrap = document.querySelector(`.post-media[data-media-post="${safePostId}"]`);
  const track = wrap?.querySelector('.post-media-track');
  if (!track) return;
  const slides = track.querySelectorAll('.post-media-slide');
  if (!slides.length) return;
  const index = Math.min(slides.length - 1, Math.max(0, Number(nextIndex) || 0));
  track.scrollTo({ left: index * track.clientWidth, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  wrap.querySelectorAll('.post-media-dot').forEach((dot, i) => dot.classList.toggle('active', i === index));
}

function movePostMedia(postId, direction) {
  const safePostId = window.CSS?.escape ? CSS.escape(postId) : String(postId).replace(/"/g, '\\"');
  const wrap = document.querySelector(`.post-media[data-media-post="${safePostId}"]`);
  const track = wrap?.querySelector('.post-media-track');
  if (!track) return;
  const current = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
  goToPostMedia(postId, current + Number(direction || 0));
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
    const media = e.target.closest('.post-media');
    if (media && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      movePostMedia(media.dataset.mediaPost, e.key === 'ArrowLeft' ? -1 : 1);
      return;
    }
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
  root.addEventListener('input', (e) => {
    if (!e.target.matches('.comment-input')) return;
    const form = e.target.closest('[data-comment-form]');
    form?.querySelector('button[type="submit"]')?.toggleAttribute('disabled', !e.target.value.trim());
  });
}

function closeMobileActions() {
  document.body.classList.remove('social-mobile-actions-open');
  const toggle = document.getElementById('mobileActionToggle');
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
  document.querySelector('.mobile-action-menu')?.setAttribute('aria-hidden', 'true');
}

function toggleMobileActions() {
  const willOpen = !document.body.classList.contains('social-mobile-actions-open');
  document.body.classList.toggle('social-mobile-actions-open', willOpen);
  const toggle = document.getElementById('mobileActionToggle');
  if (toggle) toggle.setAttribute('aria-expanded', String(willOpen));
  document.querySelector('.mobile-action-menu')?.setAttribute('aria-hidden', String(!willOpen));
}

function bindMobileActionDock() {
  document.getElementById('mobileActionToggle')?.addEventListener('click', toggleMobileActions);
  document.querySelectorAll('[data-mobile-action-close]').forEach((node) => node.addEventListener('click', closeMobileActions));
  document.getElementById('mobileComposerFiles')?.addEventListener('change', (e) => {
    addFiles([...e.currentTarget.files]);
    e.currentTarget.value = '';
    closeMobileActions();
  });
  document.getElementById('mobileStoryFiles')?.addEventListener('change', (e) => {
    createStoryFromFile(e);
    closeMobileActions();
  });
  document.querySelectorAll('[data-mobile-action]').forEach((node) => node.addEventListener('click', () => {
    const action = node.dataset.mobileAction;
    closeMobileActions();
    if (action === 'search') openMemberSearch();
    if (action === 'activity') openSocialNotificationsDrawer();
    if (action === 'direct') openDirectInbox();
    if (action === 'profile') openProfile(state.profile.id);
  }));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMobileActions();
  });
}

function bindPullToRefresh() {
  const surface = document.getElementById('pageContent');
  const indicator = document.getElementById('feedPullRefresh');
  if (!surface || !indicator) return;
  let startY = 0;
  let pullY = 0;
  let tracking = false;

  const canStart = () => isMobileSocial()
    && !state.refreshingFeed
    && !document.body.classList.contains('social-modal-locked')
    && window.scrollY <= 1
    && (surface.scrollTop || 0) <= 1;

  surface.addEventListener('touchstart', (event) => {
    if (!canStart()) return;
    startY = event.touches[0].clientY;
    pullY = 0;
    tracking = true;
    indicator.classList.remove('ready', 'refreshing');
  }, { passive: true });

  surface.addEventListener('touchmove', (event) => {
    if (!tracking) return;
    const delta = event.touches[0].clientY - startY;
    if (delta <= 0) return;
    pullY = Math.min(112, delta * .58);
    indicator.style.setProperty('--pull-y', `${pullY}px`);
    indicator.classList.toggle('visible', pullY > 12);
    indicator.classList.toggle('ready', pullY > 72);
    if (pullY > 18) event.preventDefault();
  }, { passive: false });

  surface.addEventListener('touchend', async () => {
    if (!tracking) return;
    tracking = false;
    const shouldRefresh = pullY > 72;
    pullY = 0;
    indicator.style.setProperty('--pull-y', '0px');
    if (!shouldRefresh) {
      indicator.classList.remove('visible', 'ready');
      return;
    }
    await refreshFeedFromPull(indicator);
  }, { passive: true });
}

async function refreshFeedFromPull(indicator) {
  if (state.refreshingFeed) return;
  state.refreshingFeed = true;
  indicator?.classList.add('visible', 'refreshing');
  indicator?.querySelector('span') && (indicator.querySelector('span').textContent = 'Atualizando...');
  Utils.haptic?.(20);
  try {
    await loadInitial();
    Utils.showToast('Feed atualizado.');
  } catch (err) {
    console.error('[MSY][feed-social] Erro ao atualizar feed:', err);
    Utils.showToast('Erro ao atualizar feed.', 'error');
  } finally {
    state.refreshingFeed = false;
    setTimeout(() => {
      if (!indicator) return;
      indicator.classList.remove('visible', 'ready', 'refreshing');
      const label = indicator.querySelector('span');
      if (label) label.textContent = 'Puxe para atualizar';
    }, 260);
  }
}

function handleFeedClick(e) {
  if (e.target.closest('[data-load-more-posts]')) return loadMorePosts();
  const menuBtn = e.target.closest('[data-post-menu]');
  if (menuBtn) {
    e.stopPropagation();
    menuBtn.nextElementSibling?.classList.toggle('open');
    return;
  }
  const mediaNav = e.target.closest('[data-media-nav]');
  if (mediaNav) {
    e.preventDefault();
    e.stopPropagation();
    movePostMedia(mediaNav.dataset.mediaNav, mediaNav.dataset.mediaDirection);
    return;
  }
  const mediaDot = e.target.closest('[data-media-dot]');
  if (mediaDot) {
    e.preventDefault();
    e.stopPropagation();
    goToPostMedia(mediaDot.dataset.mediaDot, mediaDot.dataset.mediaIndex);
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
  const deleteCommentBtn = e.target.closest('[data-delete-comment]');
  if (deleteCommentBtn) return deleteComment(deleteCommentBtn.dataset.postId, deleteCommentBtn.dataset.deleteComment);
  const replyBtn = e.target.closest('[data-reply-comment]');
  if (replyBtn) return openPostComments(replyBtn.dataset.postId, replyBtn.dataset.replyComment);
  const shareBtn = e.target.closest('[data-share-post]');
  if (shareBtn) return openPostShareSheet(shareBtn.dataset.sharePost);
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
  if (!e.target.closest('[data-direct-message-bubble]')) {
    document.querySelectorAll('.direct-message-menu.open').forEach((menu) => menu.classList.remove('open'));
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

async function sharePostToDirect(postId, targetUserId, button = null, { openAfterSend = true, quiet = false } = {}) {
  const post = state.posts.find((item) => item.id === postId);
  if (!post) return Utils.showToast('Publicacao indisponivel.', 'error');
  if (!targetUserId || targetUserId === state.profile.id) {
    copyPost(postId);
    return true;
  }
  try {
    Utils.setButtonLoading?.(button, true);
    const conversationId = await state.service.ensureDirectConversation(targetUserId);
    state.activeDirectConversationId = conversationId;
    setDirectConversations(await state.service.loadDirectConversations());
    const conversation = getActiveDirectConversation();
    if (conversation) {
      conversation.messages = await state.service.loadDirectMessages(conversation.id);
      await state.service.markDirectConversationRead(conversation.id);
      conversation.unread_count = 0;
    }
    const message = await state.service.sendDirectMessage(conversationId, '', getPostShareAttachment(post));
    upsertDirectMessage(conversationId, message);
    state.directUnreadCount = state.service.getDirectUnreadCount(state.directConversations);
    renderDirectUnreadBadges();
    if (openAfterSend) {
      await subscribeDirectConversation(conversationId);
      document.getElementById('postShareModal')?.classList.remove('open');
      renderDirectInbox();
    }
    if (!quiet) Utils.showToast('Publicacao compartilhada no Direct.');
    return true;
  } catch (err) {
    console.error('[MSY][feed-social] Erro ao compartilhar publicacao no Direct:', err);
    Utils.showToast(err.message || 'Erro ao compartilhar publicacao.', 'error');
    return false;
  } finally {
    Utils.setButtonLoading?.(button, false);
  }
}

function postShareMembers(query = '') {
  const cleanQuery = String(query || '').trim().toLowerCase().replace(/^@+/, '');
  const following = new Set(state.follows.filter((f) => f.follower_id === state.profile.id).map((f) => f.following_id));
  return state.members
    .filter((member) => member.id !== state.profile.id)
    .filter((member) => {
      if (!cleanQuery) return true;
      return String(member.name || '').toLowerCase().includes(cleanQuery)
        || String(member.role || '').toLowerCase().includes(cleanQuery)
        || displayUsername(member).includes(cleanQuery);
    })
    .sort((a, b) => {
      const scoreA = (following.has(a.id) ? 4 : 0) + (a.tier === 'diretoria' ? 2 : 0) + memberSearchScore(a, cleanQuery);
      const scoreB = (following.has(b.id) ? 4 : 0) + (b.tier === 'diretoria' ? 2 : 0) + memberSearchScore(b, cleanQuery);
      return scoreB - scoreA || String(a.name || '').localeCompare(String(b.name || ''));
    });
}

function renderPostShareMembers(modal, postId, query = '') {
  const list = modal.querySelector('#postShareMemberList');
  if (!list) return;
  const selected = new Set((modal.dataset.selectedMembers || '').split(',').filter(Boolean));
  const members = postShareMembers(query);
  list.innerHTML = members.length ? members.map((member) => `
    <button type="button" class="post-share-member${selected.has(member.id) ? ' selected' : ''}" data-toggle-post-share-member="${member.id}">
      ${avatar(member, 44)}
      <span class="post-share-member-copy">
        <strong>${Utils.escapeHtml(member.name || 'Membro')}</strong>
        <span>@${Utils.escapeHtml(displayUsername(member))} · ${Utils.escapeHtml(member.role || 'Membro')}</span>
      </span>
      <span class="post-share-check"><i class="fa-solid fa-check"></i></span>
    </button>`).join('') : '<div class="social-empty activity-empty"><i class="fa-regular fa-user"></i>Nenhum membro encontrado.</div>';
  list.querySelectorAll('[data-toggle-post-share-member]').forEach((btn) => btn.addEventListener('click', () => {
    const nextSelected = new Set((modal.dataset.selectedMembers || '').split(',').filter(Boolean));
    const memberId = btn.dataset.togglePostShareMember;
    if (nextSelected.has(memberId)) nextSelected.delete(memberId);
    else nextSelected.add(memberId);
    modal.dataset.selectedMembers = [...nextSelected].join(',');
    syncPostShareSelection(modal);
    renderPostShareMembers(modal, postId, modal.querySelector('#postShareSearchInput')?.value || '');
  }));
}

function syncPostShareSelection(modal) {
  const selected = (modal.dataset.selectedMembers || '').split(',').filter(Boolean);
  const count = selected.length;
  const submit = modal.querySelector('#postShareSendBtn');
  const label = modal.querySelector('#postShareSelectionLabel');
  submit?.toggleAttribute('disabled', count === 0);
  if (label) label.textContent = count ? `${count} selecionado${count === 1 ? '' : 's'}` : 'Selecione um ou mais membros';
  if (submit) submit.innerHTML = `<i class="fa-regular fa-paper-plane"></i> Enviar${count ? ` (${count})` : ''}`;
}

async function sendSelectedPostShares(modal, postId) {
  if (modal.dataset.shareSending === 'true') return;
  const selected = (modal.dataset.selectedMembers || '').split(',').filter(Boolean);
  if (!selected.length) return;
  const button = modal.querySelector('#postShareSendBtn');
  let sent = 0;
  try {
    modal.dataset.shareSending = 'true';
    Utils.setButtonLoading?.(button, true);
    for (const memberId of selected) {
      const ok = await sharePostToDirect(postId, memberId, null, { openAfterSend: memberId === selected.at(-1), quiet: true });
      if (ok) sent += 1;
    }
    if (sent) Utils.showToast(`Publicacao enviada para ${sent} membro${sent === 1 ? '' : 's'}.`);
  } finally {
    delete modal.dataset.shareSending;
    Utils.setButtonLoading?.(button, false);
    syncPostShareSelection(modal);
  }
}

function openPostShareSheet(postId) {
  const post = state.posts.find((item) => item.id === postId);
  const modal = document.getElementById('postShareModal');
  if (!post || !modal) return;
  modal.classList.add('post-share-modal');
  modal.dataset.selectedMembers = '';
  const firstMedia = post.media?.[0] || null;
  const media = firstMedia?.url
    ? `<span class="post-share-context-thumb">${firstMedia.media_type === 'video' ? `<video src="${Utils.escapeHtml(firstMedia.url)}" muted playsinline preload="metadata"></video>` : `<img src="${Utils.escapeHtml(firstMedia.url)}" alt="">`}</span>`
    : '<span class="post-share-context-thumb"><i class="fa-regular fa-newspaper"></i></span>';
  modal.innerHTML = `
    <div class="post-share-panel">
      <div class="post-comments-grabber"></div>
      <div class="post-comments-head">
        <div>
          <strong>Compartilhar</strong>
          <span>Enviar publicacao no Direct</span>
        </div>
        <button class="social-icon-btn" data-close-modal><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="post-share-context">
        ${media}
        <div>
          <strong>${Utils.escapeHtml(post.author?.name || 'Membro MSY')}</strong>
          <p>${Utils.escapeHtml((post.content || 'Publicacao com midia').slice(0, 140))}</p>
        </div>
      </div>
      <div class="post-share-search">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input id="postShareSearchInput" autocomplete="off" placeholder="Buscar membro">
      </div>
      <div class="post-share-member-list" id="postShareMemberList"></div>
      <div class="post-share-footer">
        <span id="postShareSelectionLabel">Selecione um ou mais membros</span>
        <button type="button" class="btn btn-primary social-submit" id="postShareSendBtn" disabled><i class="fa-regular fa-paper-plane"></i> Enviar</button>
      </div>
    </div>`;
  openModal(modal);
  renderPostShareMembers(modal, postId);
  syncPostShareSelection(modal);
  const input = modal.querySelector('#postShareSearchInput');
  input?.addEventListener('input', () => renderPostShareMembers(modal, postId, input.value));
  modal.querySelector('#postShareSendBtn')?.addEventListener('click', () => sendSelectedPostShares(modal, postId));
  requestAnimationFrame(() => input?.focus({ preventScroll: true }));
}

function mergeCreatedComment(post, comment) {
  if (!post || !comment) return;
  const existed = (post.comments || []).some((item) => item.id === comment.id);
  const comments = (post.comments || []).filter((item) => item.id !== comment.id);
  comments.push(comment);
  comments.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  post.comments = comments;
  if (!existed) post.comments_count = Number(post.comments_count || 0) + 1;
  post.comments_count = Math.max(Number(post.comments_count || 0), comments.length);
}

async function submitComment(postId, text, { parentId = null } = {}) {
  const post = state.posts.find((p) => p.id === postId);
  const body = String(text || '').trim();
  if (!post || !body) return null;
  const comment = await state.service.addComment(post, body, parentId);
  mergeCreatedComment(post, comment);
  return comment;
}

function openMediaViewer(post, startIndex = 0) {
  const modal = document.getElementById('mediaViewer');
  const media = post.media || [];
  if (!modal || !media.length) return;
  if (typeof state.mediaViewerCleanup === 'function') {
    state.mediaViewerCleanup();
    state.mediaViewerCleanup = null;
  }
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
          ${renderPostMediaViewerElement(item, item.media_type === 'video' ? 'controls preload="metadata"' : 'alt="Midia do post" decoding="async"')}
        </div>`).join('')}
      </div>
      ${media.length > 1 ? `
        <button class="media-viewer-nav prev" data-media-view-prev><i class="fa-solid fa-chevron-left"></i></button>
        <button class="media-viewer-nav next" data-media-view-next><i class="fa-solid fa-chevron-right"></i></button>` : ''}
    </div>`;
  openModal(modal);
  const show = (nextIndex, direction = 0) => {
    const safeIndex = Math.max(0, Math.min(nextIndex, media.length - 1));
    modal.querySelectorAll('video').forEach((video) => video.pause());
    modal.querySelectorAll('[data-media-view-slide]').forEach((slide) => {
      const active = Number(slide.dataset.mediaViewSlide) === safeIndex;
      slide.classList.toggle('active', active);
      slide.classList.remove('from-next', 'from-prev');
      if (active && direction && !prefersReducedMotion()) {
        slide.classList.add(direction > 0 ? 'from-next' : 'from-prev');
        slide.addEventListener('animationend', () => slide.classList.remove('from-next', 'from-prev'), { once: true });
      }
    });
    const count = modal.querySelector('.media-viewer-copy span');
    if (count) count.textContent = `${safeIndex + 1} de ${media.length}`;
    modal.dataset.mediaIndex = String(safeIndex);
  };
  modal.dataset.mediaIndex = String(index);
  const go = (direction) => show(Number(modal.dataset.mediaIndex || 0) + direction, direction);
  modal.querySelector('[data-media-view-prev]')?.addEventListener('click', () => go(-1));
  modal.querySelector('[data-media-view-next]')?.addEventListener('click', () => go(1));

  let touchStartX = 0;
  let touchStartY = 0;
  const track = modal.querySelector('.media-viewer-track');
  const onTouchStart = (event) => {
    const point = event.touches?.[0];
    touchStartX = point?.clientX || 0;
    touchStartY = point?.clientY || 0;
  };
  const onTouchEnd = (event) => {
    const point = event.changedTouches?.[0];
    const dx = (point?.clientX || 0) - touchStartX;
    const dy = (point?.clientY || 0) - touchStartY;
    if (Math.abs(dx) > 54 && Math.abs(dx) > Math.abs(dy) * 1.35) go(dx < 0 ? 1 : -1);
  };
  const onKeyDown = (event) => {
    if (!modal.classList.contains('open')) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      go(-1);
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      go(1);
    }
  };
  track?.addEventListener('touchstart', onTouchStart, { passive: true });
  track?.addEventListener('touchend', onTouchEnd, { passive: true });
  document.addEventListener('keydown', onKeyDown);
  state.mediaViewerCleanup = () => {
    track?.removeEventListener('touchstart', onTouchStart);
    track?.removeEventListener('touchend', onTouchEnd);
    document.removeEventListener('keydown', onKeyDown);
  };
}

function renderComments(post) {
  const comments = (post.comments || []).slice(-3);
  return comments.map((c) => `
    <div class="comment-item${c.parent_id ? ' reply' : ''}" id="comment-${c.id}">
      ${avatar(c.author || {}, 30)}
      <div class="comment-body">
        <div class="comment-name">${Utils.escapeHtml(c.author?.name || 'Membro')} <span class="message-sub">@${Utils.escapeHtml(displayUsername(c.author || {}))}</span></div>
        <div class="comment-text">${richText(c.content)}</div>
        <div class="comment-meta">
          <span>${timeAgo(c.created_at)}</span>
          <button data-reply-comment="${c.id}" data-post-id="${post.id}">Responder</button>
          ${canManageComment(c, post) ? `<button class="comment-delete-btn" data-delete-comment="${c.id}" data-post-id="${post.id}">Excluir</button>` : ''}
        </div>
      </div>
    </div>`).join('');
}

function renderCommentRows(post, { full = false } = {}) {
  const comments = full ? (post.comments || []) : (post.comments || []).slice(-3);
  return comments.map((c) => `
    <div class="comment-item${c.parent_id ? ' reply' : ''}" id="comment-${c.id}" data-comment-row="${c.id}">
      ${avatar(c.author || {}, 32)}
      <div class="comment-body">
        <div class="comment-name">${Utils.escapeHtml(c.author?.name || 'Membro')} <span class="message-sub">@${Utils.escapeHtml(displayUsername(c.author || {}))}</span></div>
        <div class="comment-text">${richText(c.content)}</div>
        <div class="comment-meta">
          <span>${timeAgo(c.created_at)}</span>
          <button data-reply-comment="${c.id}" data-post-id="${post.id}">Responder</button>
          ${canManageComment(c, post) ? `<button class="comment-delete-btn" data-delete-comment="${c.id}" data-post-id="${post.id}">Excluir</button>` : ''}
        </div>
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
        <button class="social-icon-btn" type="submit" title="Enviar" disabled><i class="fa-solid fa-arrow-up"></i></button>
      </form>
    </div>`;
  modal.dataset.postId = postId;
  modal.dataset.replyTo = replyToCommentId || '';
  openModal(modal);
  const input = modal.querySelector('input[name="comment"]');
  bindMentionAutocomplete(input, { minChars: 1 });
  input?.addEventListener('input', () => {
    modal.querySelector('#postCommentsComposer button[type="submit"]')?.toggleAttribute('disabled', !input.value.trim());
  });
  modal.querySelector('#postCommentsSheetList')?.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('[data-delete-comment]');
    if (deleteBtn) {
      deleteComment(deleteBtn.dataset.postId, deleteBtn.dataset.deleteComment);
      return;
    }
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
    Utils.setButtonLoading?.(btn, true);
    await submitComment(post.id, body, { parentId: modal.dataset.replyTo || null });
    const createdId = post.comments.at(-1)?.id;
    input.value = '';
    btn?.setAttribute('disabled', '');
    setPostCommentReply(post, null);
    const list = document.getElementById('postCommentsSheetList');
    if (list) list.innerHTML = renderCommentRows(post, { full: true });
    document.getElementById(`comment-${createdId}`)?.classList.add('comment-just-created');
    updatePostStatsNode(post);
    updatePostNode(post.id);
    requestAnimationFrame(() => {
      const nextList = document.getElementById('postCommentsSheetList');
      if (nextList) nextList.scrollTop = nextList.scrollHeight;
    });
  } catch (err) {
    console.error('[MSY][feed-social] Erro ao comentar:', err);
    Utils.showToast(err.message || 'Erro ao comentar.', 'error');
  } finally {
    Utils.setButtonLoading?.(btn, false);
  }
}

function bindComposer() {
  const files = document.getElementById('composerFiles');
  const drop = document.getElementById('composerDrop');
  const composerInput = document.getElementById('composerText');
  const syncComposerPlaceholder = () => {
    if (!composerInput) return;
    if (!composerInput.dataset.desktopPlaceholder) composerInput.dataset.desktopPlaceholder = composerInput.getAttribute('placeholder') || '';
    composerInput.setAttribute('placeholder', isMobileSocial()
      ? (composerInput.dataset.mobilePlaceholder || composerInput.dataset.desktopPlaceholder)
      : composerInput.dataset.desktopPlaceholder);
  };
  syncComposerPlaceholder();
  window.addEventListener('resize', syncComposerPlaceholder);
  document.getElementById('mediaBtn').addEventListener('click', () => {
    if (isMobileSocial()) {
      openPostMediaPicker();
      return;
    }
    drop.classList.toggle('visible');
    openPostMediaPicker();
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
  document.getElementById('publishBtn').addEventListener('click', () => {
    if (state.previews.length) openPostComposer('details');
    else publishPost();
  });
  files.addEventListener('change', () => {
    addFiles([...files.files]);
    files.value = '';
  });
  drop.addEventListener('click', openPostMediaPicker);
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('dragging'); }));
  drop.addEventListener('drop', (e) => addFiles([...e.dataTransfer.files]));
}

function addFiles(files) {
  try {
    files.forEach((file) => {
      validateMediaFile(file);
      if (state.previews.length >= 10) throw new Error('Limite de 10 midias por publicacao.');
      const preview = filePreview(file);
      preview.editState = normalizeMediaEditState(createStoryMediaEditState(file), preview.media_type);
      preview.editState.aspect = 'original';
      preview.editState.zoom = 1;
      preview.editState.offsetX = 0;
      preview.editState.offsetY = 0;
      state.previews.push(preview);
      if (preview.media_type === 'image') {
        loadImage(file).then((image) => {
          preview.editState.originalAspect = image.width / image.height;
          preview.editState.originalWidth = image.width;
          preview.editState.originalHeight = image.height;
          preview.editState.detectedFormat = detectMediaFormat(image.width, image.height);
          renderPreviews();
        }).catch((imageErr) => {
          console.warn('[MSY][feed-social] Dimensoes da imagem indisponiveis:', imageErr);
        });
      }
    });
    renderPreviews();
    openPostComposer('crop');
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
  const mainEditState = ensureMediaEditState(main, 'original');
  const mainAspect = mediaAspectCss(mainEditState.aspect, mainEditState.originalAspect);
  const mediaNode = (item, attrs = '') => item.media_type === 'video'
    ? `<video src="${item.url}" muted playsinline ${attrs}></video>`
    : `<img src="${item.url}" alt="Preview da publicacao" ${attrs}>`;
  el.innerHTML = `
    <div class="composer-preview-stage">
      <div class="composer-preview-main" data-preview-id="${main.id}" style="--editor-aspect:${mainAspect}">
        ${renderEditableMediaNode(main, { scope: 'post' })}
        <button class="composer-preview-remove" title="Remover midia" aria-label="Remover midia"><i class="fa-solid fa-xmark"></i></button>
        <div class="composer-preview-badge"><i class="fa-solid fa-layer-group"></i> ${state.previews.length}/10</div>
      </div>
      <div class="composer-media-controls" data-composer-media-controls="${main.id}">
        <div class="composer-media-meta">${renderMediaDimensionMeta(main)}</div>
        <select class="form-input form-select" data-composer-edit-field="aspect">
          ${mediaAspectOptions.map(([value, label]) => `<option value="${value}" ${main.editState?.aspect === value ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
        <input type="range" min="0.5" max="3" step="0.01" value="${Number(main.editState?.zoom || 1)}" data-composer-edit-field="zoom" aria-label="Zoom">
        <input type="range" min="0" max="360" step="1" value="${Number(main.editState?.rotation || 0)}" data-composer-edit-field="rotation" aria-label="Rotação">
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
  el.querySelectorAll('[data-composer-edit-field]').forEach((field) => field.addEventListener('input', (event) => {
    const key = event.currentTarget.dataset.composerEditField;
    const value = event.currentTarget.value;
    if (key === 'zoom' || key === 'rotation') main.editState[key] = Number(value);
    else main.editState[key] = value;
    applyMediaEditorTransform(el, main);
  }));
	  bindMediaEditorGestures(el, main, () => {
	    const zoom = el.querySelector('[data-composer-edit-field="zoom"]');
	    const rotation = el.querySelector('[data-composer-edit-field="rotation"]');
	    if (zoom) zoom.value = main.editState.zoom;
	    if (rotation) rotation.value = main.editState.rotation;
	  });
	  bindMediaPreviewDiagnostics(el, main);
	  syncComposerState();
	  if (document.getElementById('mobilePostComposerModal')?.classList.contains('open')) renderPostComposerModal();
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

function openPostComposer(step = 'crop') {
  const modal = document.getElementById('mobilePostComposerModal');
  if (!modal) return;
  state.postComposerStep = step;
  renderPostComposerModal();
  openModal(modal);
  const focusTarget = step === 'details' ? modal.querySelector('#mobileComposerText') : modal.querySelector('[data-composer-edit-field], [data-mobile-pick-media]');
  requestAnimationFrame(() => focusTarget?.focus?.({ preventScroll: true }));
}

function openMobilePostComposer() {
  openPostComposer(state.previews.length ? 'crop' : 'details');
}

function renderPostComposerModal() {
  const modal = document.getElementById('mobilePostComposerModal');
  if (!modal) return;
  modal.classList.add('post-create-modal');
  const step = state.postComposerStep || (state.previews.length ? 'crop' : 'details');
  const text = document.getElementById('composerText')?.value || '';
  const canPost = Boolean(text.trim() || state.previews.length);
  const title = step === 'details' ? 'Nova publicacao' : 'Cortar';
  const left = step === 'details' && state.previews.length
    ? '<button type="button" class="ig-composer-icon" data-composer-step="crop" aria-label="Voltar"><i class="fa-solid fa-arrow-left"></i></button>'
    : '<button type="button" class="ig-composer-icon" data-cancel-post-composer aria-label="Cancelar publicacao"><i class="fa-solid fa-arrow-left"></i></button>';
  const right = step === 'crop'
    ? `<button type="button" class="mobile-composer-post" data-composer-step="details" ${state.previews.length ? '' : 'disabled'}>Avancar</button>`
    : `<button type="button" class="mobile-composer-post" data-mobile-publish ${canPost ? '' : 'disabled'}>Compartilhar</button>`;
  modal.innerHTML = `
    <button type="button" class="ig-create-close" data-cancel-post-composer aria-label="Cancelar publicacao"><i class="fa-solid fa-xmark"></i></button>
    <div class="mobile-composer-panel ig-post-composer-panel" data-post-composer-step="${step}">
      <div class="mobile-composer-head ig-post-composer-head">
        ${left}
        <strong>${title}</strong>
        ${right}
      </div>
      <div class="ig-post-composer-body">
        <div class="ig-post-composer-media">
          ${renderPostComposerMedia({ step })}
        </div>
        <div class="ig-post-composer-details">
          <div class="mobile-composer-author">
            ${avatar(state.profile, 38)}
            <div><strong>${Utils.escapeHtml(state.profile.name || 'Voce')}</strong><span>@${Utils.escapeHtml(displayUsername(state.profile))}</span></div>
          </div>
          <textarea id="mobileComposerText" class="mobile-composer-text" maxlength="1200" placeholder="Escreva uma legenda...">${Utils.escapeHtml(text)}</textarea>
          <label class="ig-composer-field"><i class="fa-solid fa-location-dot"></i><input id="composerLocationInput" value="${Utils.escapeHtml(state.composerLocation || '')}" maxlength="80" placeholder="Adicionar localizacao"></label>
          <label class="ig-composer-field"><i class="fa-regular fa-closed-captioning"></i><input id="composerAltInput" value="${Utils.escapeHtml(state.previews[0]?.alt_text || '')}" maxlength="220" placeholder="Texto alternativo da midia atual"></label>
          <div class="ig-composer-options">
            <button type="button" data-mobile-emoji><i class="fa-regular fa-face-smile"></i><span>Emoji</span></button>
          </div>
        </div>
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
  modal.querySelector('#composerLocationInput')?.addEventListener('input', (event) => {
    state.composerLocation = event.currentTarget.value;
  });
  modal.querySelector('#composerAltInput')?.addEventListener('input', (event) => {
    if (state.previews[0]) state.previews[0].alt_text = event.currentTarget.value;
  });
  modal.querySelectorAll('[data-composer-step]').forEach((btn) => btn.addEventListener('click', () => {
    state.postComposerStep = btn.dataset.composerStep;
    if (state.postComposerStep === 'details') state.postComposerTool = null;
    renderPostComposerModal();
  }));
  modal.querySelectorAll('[data-cancel-post-composer]').forEach((btn) => btn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    cancelPostComposer();
  }));
  modal.querySelectorAll('[data-mobile-pick-media]').forEach((btn) => btn.addEventListener('click', openPostMediaPicker));
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
    if (!state.previews.length) state.postComposerStep = 'details';
    renderPostComposerModal();
  }));
  modal.querySelectorAll('[data-focus-mobile-preview]').forEach((btn) => btn.addEventListener('click', () => {
    const index = state.previews.findIndex((item) => item.id === btn.dataset.focusMobilePreview);
    if (index <= 0) return;
    state.previews = [state.previews[index], ...state.previews.filter((_, itemIndex) => itemIndex !== index)];
    renderPreviews();
    renderPostComposerModal();
  }));
  modal.querySelectorAll('[data-mobile-media-move]').forEach((btn) => btn.addEventListener('click', () => {
    const from = state.previews.findIndex((item) => item.id === btn.dataset.mobileMediaMove);
    const to = from + Number(btn.dataset.direction);
    if (from < 0 || to < 0 || to >= state.previews.length) return;
    const [item] = state.previews.splice(from, 1);
    state.previews.splice(to, 0, item);
    renderPreviews();
    renderPostComposerModal();
  }));
  modal.querySelectorAll('[data-ig-crop-tool]').forEach((btn) => btn.addEventListener('click', () => {
    const tool = btn.dataset.igCropTool;
    state.postComposerTool = state.postComposerTool === tool ? null : tool;
    renderPostComposerModal();
  }));
  modal.querySelectorAll('[data-ig-aspect-option]').forEach((btn) => btn.addEventListener('click', () => {
    const item = state.previews[0];
    if (!item) return;
    const editState = ensureMediaEditState(item, 'original');
    editState.aspect = btn.dataset.igAspectOption || 'original';
    editState.zoom = 1;
    editState.offsetX = 0;
    editState.offsetY = 0;
    state.postComposerTool = null;
    renderPreviews();
    renderPostComposerModal();
  }));
  modal.querySelector('[data-ig-zoom-range]')?.addEventListener('input', (event) => {
    const item = state.previews[0];
    if (!item) return;
    const editState = ensureMediaEditState(item, 'original');
    editState.zoom = Number(event.currentTarget.value || 1);
    applyMediaEditorTransform(modal, item);
  });
  modal.querySelectorAll('[data-mobile-edit-field]').forEach((field) => field.addEventListener('input', (event) => {
    const item = state.previews[0];
    if (!item) return;
    const key = event.currentTarget.dataset.mobileEditField;
    const value = event.currentTarget.value;
    ensureMediaEditState(item, 'original');
    if (key === 'zoom' || key === 'rotation') item.editState[key] = Number(value);
    else item.editState[key] = value;
    applyMediaEditorTransform(modal, item);
	  }));
	  if (state.previews[0] && step === 'crop') {
	    bindMediaEditorGestures(modal, state.previews[0]);
	  }
	  if (state.previews[0]) bindMediaPreviewDiagnostics(modal, state.previews[0]);
	}

function renderPostComposerMedia({ step = state.postComposerStep || 'crop' } = {}) {
  if (!state.previews.length) {
    return `
      <button type="button" class="mobile-composer-empty-media ig-empty-media" data-mobile-pick-media>
        <i class="fa-regular fa-image"></i>
        <span>Selecionar do computador</span>
      </button>`;
  }
  const main = state.previews[0];
  const mainEditState = ensureMediaEditState(main, 'original');
  const mainAspect = mediaAspectCss(mainEditState.aspect, mainEditState.originalAspect);
  const isCropStep = step === 'crop';
  const activeTool = state.postComposerTool;
  const mediaNode = (item) => item.media_type === 'video'
    ? `<video src="${item.url}" muted playsinline controls></video>`
    : `<img src="${item.url}" alt="Preview da publicacao">`;
  return `
    <div class="mobile-composer-preview">
      <div class="mobile-composer-preview-main" style="--editor-aspect:${mainAspect}">
        ${renderEditableMediaNode(main, { scope: 'post' })}
        ${isCropStep ? `
          <button type="button" data-remove-mobile-preview="${main.id}" aria-label="Remover midia"><i class="fa-solid fa-xmark"></i></button>
          <div class="composer-preview-badge"><i class="fa-solid fa-layer-group"></i> ${state.previews.length}/10</div>
          <div class="ig-crop-overlay-tools ig-crop-tools-left">
            <button type="button" class="${activeTool === 'aspect' ? 'active' : ''}" data-ig-crop-tool="aspect" aria-label="Escolher proporcao"><i class="fa-solid fa-expand"></i></button>
            <button type="button" class="${activeTool === 'zoom' ? 'active' : ''}" data-ig-crop-tool="zoom" aria-label="Ajustar zoom"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
          </div>
          <div class="ig-crop-overlay-tools ig-crop-tools-right">
            <button type="button" class="${activeTool === 'carousel' ? 'active' : ''}" data-ig-crop-tool="carousel" aria-label="Adicionar ao carrossel"><i class="fa-regular fa-clone"></i></button>
          </div>
        ` : ''}
      </div>
      ${isCropStep ? renderPostCropPopover(main, activeTool) : ''}
      ${isCropStep ? `<div class="mobile-composer-media-controls">
        <div class="composer-media-meta">${renderMediaDimensionMeta(main)}</div>
        <select class="form-input form-select" data-mobile-edit-field="aspect" aria-label="Proporção da mídia">
          ${mediaAspectOptions.map(([value, label]) => `<option value="${value}" ${main.editState?.aspect === value ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
        <label>Zoom <input type="range" min="0.5" max="3" step="0.01" value="${Number(main.editState?.zoom || 1)}" data-mobile-edit-field="zoom"></label>
        <label>Rotacao <input type="range" min="0" max="360" step="1" value="${Number(main.editState?.rotation || 0)}" data-mobile-edit-field="rotation"></label>
      </div>` : ''}
      ${isCropStep ? `<div class="mobile-composer-strip">
        ${state.previews.length > 1 ? `
          ${state.previews.map((item, index) => `
            <span class="ig-strip-item">
              <button type="button" class="${index === 0 ? 'active' : ''}" data-focus-mobile-preview="${item.id}">
              ${mediaNode(item)}
              </button>
              <span class="ig-strip-controls">
                <button type="button" data-mobile-media-move="${item.id}" data-direction="-1" ${index === 0 ? 'disabled' : ''} aria-label="Mover para esquerda"><i class="fa-solid fa-chevron-left"></i></button>
                <button type="button" data-mobile-media-move="${item.id}" data-direction="1" ${index === state.previews.length - 1 ? 'disabled' : ''} aria-label="Mover para direita"><i class="fa-solid fa-chevron-right"></i></button>
              </span>
            </span>`).join('')}` : ''}
        <button type="button" class="ig-add-thumb" data-mobile-pick-media aria-label="Adicionar midia"><i class="fa-solid fa-plus"></i></button>
      </div>` : ''}
    </div>`;
}

function renderPostCropPopover(main, activeTool) {
  if (!activeTool || !main) return '';
  const editState = ensureMediaEditState(main, 'original');
  if (activeTool === 'aspect') {
    const icons = {
      original: 'fa-regular fa-image',
      '1:1': 'fa-regular fa-square',
      '4:5': 'fa-regular fa-rectangle-list',
      '16:9': 'fa-regular fa-window-maximize',
    };
    const options = mediaAspectOptions.filter(([value]) => value !== '9:16');
    return `
      <div class="ig-crop-popover ig-crop-aspect-popover">
        ${options.map(([value, label]) => `
          <button type="button" class="${editState.aspect === value ? 'active' : ''}" data-ig-aspect-option="${value}">
            <span>${label}</span>
            <i class="${icons[value] || 'fa-regular fa-square'}"></i>
          </button>`).join('')}
      </div>`;
  }
  if (activeTool === 'zoom') {
    return `
      <div class="ig-crop-popover ig-crop-zoom-popover">
        <input type="range" min="0.5" max="3" step="0.01" value="${Number(editState.zoom || 1)}" data-ig-zoom-range aria-label="Zoom">
      </div>`;
  }
  if (activeTool === 'carousel') {
    const mediaNode = (item) => item.media_type === 'video'
      ? `<video src="${item.url}" muted playsinline></video>`
      : `<img src="${item.url}" alt="">`;
    return `
      <div class="ig-crop-popover ig-crop-carousel-popover">
        <div class="ig-crop-carousel-strip">
          ${state.previews.map((item, index) => `
            <span class="ig-crop-carousel-item">
              <button type="button" class="${index === 0 ? 'active' : ''}" data-focus-mobile-preview="${item.id}" aria-label="Selecionar midia ${index + 1}">
                ${mediaNode(item)}
              </button>
              ${state.previews.length > 1 ? `<button type="button" class="ig-crop-carousel-remove" data-remove-mobile-preview="${item.id}" aria-label="Remover midia"><i class="fa-solid fa-xmark"></i></button>` : ''}
            </span>`).join('')}
          <button type="button" class="ig-crop-carousel-add" data-mobile-pick-media aria-label="Adicionar midia"><i class="fa-solid fa-plus"></i></button>
        </div>
      </div>`;
  }
  return '';
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
  const buttons = [document.getElementById('publishBtn'), document.querySelector('[data-mobile-publish]')].filter(Boolean);
  const rawContent = document.getElementById('composerText').value.trim();
  const location = String(state.composerLocation || '').trim();
  const content = [rawContent, location ? `📍 ${location}` : ''].filter(Boolean).join('\n');
  if (!content && !state.previews.length) return Utils.showToast('Escreva algo ou adicione uma midia.', 'error');
  buttons.forEach((btn) => Utils.setButtonLoading?.(btn, true, '<i class="fa-solid fa-circle-notch fa-spin"></i> Publicando...'));
  const uploadedPaths = [];
  try {
    const media = [];
    for (const item of state.previews) {
      const editState = ensureMediaEditState(item, 'original');
      let uploadFile = item.file;
      let skipCompression = false;
      if (item.media_type === 'image') {
        uploadFile = await exportStoryImageFile(item.file, editState);
        skipCompression = true;
      } else if (item.media_type === 'video' && item.editState?.exportSupported) {
        uploadFile = await exportStoryVideoFile(item.file, editState);
        skipCompression = true;
      }
      const uploaded = await uploadSocialMedia(db, state.profile.id, uploadFile, 'posts', { skipCompression });
      uploaded.alt_text = item.alt_text || null;
      uploaded.media_meta = { ...editState, exported: true };
      if (item.media_type === 'image') {
        const exportedImage = await loadImage(uploadFile);
        uploaded.media_meta.exportedWidth = exportedImage.width;
        uploaded.media_meta.exportedHeight = exportedImage.height;
        uploaded.width = exportedImage.width;
        uploaded.height = exportedImage.height;
      } else if (item.media_type === 'video') {
        uploaded.media_meta.exportedAspect = editState.aspect === 'original'
          ? Number(editState.originalAspect || 0) || null
          : getStoryAspectRatioValue(editState.aspect);
      }
      media.push(uploaded);
      if (uploaded.storage_path) uploadedPaths.push(uploaded.storage_path);
    }
    await state.service.createPost({ content, media });
    revokePreviews(state.previews);
    state.previews = [];
    state.composerLocation = '';
    state.postComposerStep = 'crop';
    document.getElementById('composerText').value = '';
    renderPreviews();
    closeSocialModals();
    state.posts = await state.service.loadPosts();
    syncPostPaginationState();
    renderPosts();
    const newest = state.posts[0]?.id;
    if (newest) {
      const node = document.getElementById(`post-${newest}`);
      node?.classList.add('post-just-created');
      setTimeout(() => node?.classList.remove('post-just-created'), 2200);
    }
    Utils.showToast('Publicado no Feed!');
  } catch (err) {
    console.error('[MSY][feed-social] Erro ao publicar post:', err);
    if (uploadedPaths.length) {
      await removeSocialMedia(db, uploadedPaths).catch((cleanupErr) => {
        console.warn('[MSY][feed-social] Rollback parcial do upload do post falhou:', cleanupErr);
      });
    }
    Utils.showToast(err.message || 'Erro ao publicar no feed.', 'error');
  } finally {
    buttons.forEach((btn) => Utils.setButtonLoading?.(btn, false));
  }
}

async function createStoryFromFile(e = null) {
  if (!state.hasSocialTables) {
    Utils.showToast('Aplique a migration social no Supabase antes de criar stories.', 'error');
    return;
  }
  const input = e?.currentTarget || e?.target || document.getElementById('storyFiles');
  const files = [...(input.files || [])];
  if (!files.length) return;
  try {
    const prepared = [];
    for (const file of files) {
      validateMediaFile(file);
      const preview = filePreview(file);
      preview.caption = '';
      preview.editState = createStoryMediaEditState(file);
      if (preview.media_type === 'video') {
        preview.editState.exportSupported = supportsVideoEditing();
        try {
          const thumb = await captureStoryVideoThumbnail(file, 0, 0);
          preview.thumbnail_url = thumb.url;
          preview.editState.thumbnailTime = thumb.time;
        } catch (thumbErr) {
          console.warn('[MSY][feed-social] Miniatura inicial do story em video indisponivel:', thumbErr);
        }
      } else {
        try {
          const image = await loadImage(file);
          preview.editState.originalAspect = image.width / image.height;
          preview.editState.originalWidth = image.width;
          preview.editState.originalHeight = image.height;
          preview.editState.detectedFormat = detectMediaFormat(image.width, image.height);
          preview.editState.aspect = 'original';
          preview.editState.zoom = 1;
          preview.editState.offsetX = 0;
          preview.editState.offsetY = 0;
        } catch (imageErr) {
          console.warn('[MSY][feed-social] Proporcao original da imagem indisponivel:', imageErr);
        }
      }
      prepared.push(preview);
    }
    state.storyPreviews = prepared;
    openStoryComposer();
  } catch (err) {
    console.error('[MSY][feed-social] Erro ao preparar story:', err);
    Utils.showToast(err.message || 'Erro ao preparar story.', 'error');
  } finally {
    input.value = '';
  }
}

function activeStoryComposerItem() {
  return state.storyPreviews[state.activeStoryComposerIndex] || null;
}

const mediaAspectOptions = [
  ['original', 'Original'],
  ['1:1', '1:1'],
  ['4:5', '4:5'],
  ['9:16', 'Story'],
  ['16:9', '16:9'],
];

function mediaAspectCss(aspect = 'original', originalAspect = null) {
  if (aspect === 'original' && Number(originalAspect) > 0) return `${Number(originalAspect)} / 1`;
  const map = {
    '9:16': '9 / 16',
    '1:1': '1 / 1',
    '4:5': '4 / 5',
    '16:9': '16 / 9',
    original: 'var(--editor-original-aspect, 9 / 16)',
  };
  return map[aspect] || map.original;
}

function detectMediaFormat(width, height) {
  const ratio = Number(width) / Math.max(Number(height), 1);
  if (!Number.isFinite(ratio) || ratio <= 0) return 'Formato desconhecido';
  if (Math.abs(ratio - 1) < 0.04) return 'Quadrado';
  if (ratio < 1) return 'Retrato';
  return 'Paisagem';
}

function renderMediaDimensionMeta(item) {
  const editState = ensureMediaEditState(item, 'original');
  const width = Number(editState?.originalWidth || 0);
  const height = Number(editState?.originalHeight || 0);
  const dimensions = width && height ? `${width}x${height}` : 'Carregando dimensões';
  const format = editState?.detectedFormat || (editState?.originalAspect ? detectMediaFormat(editState.originalAspect, 1) : 'Formato original');
  return `
    <div><strong>Dimensão original:</strong> ${Utils.escapeHtml(dimensions)}</div>
    <div><strong>Formato:</strong> ${Utils.escapeHtml(format)}</div>`;
}

function isMediaEditActive(editState = {}) {
  const normalized = normalizeMediaEditState(editState);
  return normalized.aspect !== 'original'
    || Math.abs(Number(normalized.zoom || 1) - 1) > 0.01
    || Math.abs(Number(normalized.offsetX || 0)) > 0.01
    || Math.abs(Number(normalized.offsetY || 0)) > 0.01
    || Math.abs(Number(normalized.rotation || 0)) > 0.01;
}

function ensureMediaEditState(item, fallbackAspect = 'original') {
  if (!item) return null;
  item.editState = normalizeMediaEditState({
    aspect: fallbackAspect,
    ...(item.media_meta || {}),
    ...(item.editState || {}),
  }, item.media_type || 'image');
  return item.editState;
}

function mediaEditorTransform(editState = {}) {
  const stateValue = normalizeMediaEditState(editState);
  return `translate(calc(-50% + ${stateValue.offsetX * 42}%), calc(-50% + ${stateValue.offsetY * 42}%)) scale(${stateValue.zoom}) rotate(${stateValue.rotation}deg)`;
}

function mediaEditorSelector(id) {
  const safeId = window.CSS?.escape ? CSS.escape(String(id)) : String(id).replace(/["\\]/g, '\\$&');
  return `[data-media-editor="${safeId}"]`;
}

function renderEditableMediaNode(item, { scope = 'story', controls = true } = {}) {
  if (!item) return '<div class="social-empty"><i class="fa-regular fa-image"></i>Nenhuma mídia.</div>';
  const editState = ensureMediaEditState(item, scope === 'post' ? 'original' : '9:16');
  const aspect = mediaAspectCss(editState.aspect, editState.originalAspect);
  const style = `--editor-aspect:${aspect};--editor-transform:${mediaEditorTransform(editState)}`;
  const activeClass = isMediaEditActive(editState) ? ' is-edited' : ' is-original';
  const media = item.media_type === 'video'
    ? `<video class="media-editor-media" src="${Utils.escapeHtml(item.url)}" ${scope === 'story' ? 'controls' : 'muted'} playsinline preload="metadata"></video>`
    : `<img class="media-editor-media" src="${Utils.escapeHtml(item.url)}" alt="Preview da mídia">`;
  return `
    <div class="media-editor-crop${activeClass}" style="${style}" data-media-editor="${Utils.escapeHtml(item.id)}" data-media-editor-scope="${scope}">
      <div class="media-editor-viewport">
        ${media}
        ${controls ? '<div class="media-editor-mask" aria-hidden="true"></div>' : ''}
        <div class="media-editor-load-error" data-media-load-error hidden>
          <i class="fa-regular fa-image"></i>
          <span>Não foi possível carregar esta imagem.</span>
        </div>
      </div>
    </div>`;
}

function bindMediaPreviewDiagnostics(root, item) {
  if (!root || !item || item.media_type !== 'image') return;
  const editor = root.querySelector?.(mediaEditorSelector(item.id));
  const img = editor?.querySelector?.('img.media-editor-media');
  if (!editor || !img || img.dataset.previewDiagnosticsBound === '1') return;
  img.dataset.previewDiagnosticsBound = '1';
  const errorNode = editor.querySelector('[data-media-load-error]');
  const payload = () => ({
    id: item.id,
    url: img.currentSrc || img.src || item.url || '',
    media_type: item.media_type,
    aspect: item.editState?.aspect,
    originalAspect: item.editState?.originalAspect,
    naturalWidth: img.naturalWidth || 0,
    naturalHeight: img.naturalHeight || 0,
  });
  const markLoaded = () => {
    editor.classList.remove('load-error');
    if (errorNode) errorNode.hidden = true;
    console.info('[MSY][feed-social][image-preview] imagem carregada', payload());
  };
  const markError = () => {
    editor.classList.add('load-error');
    if (errorNode) errorNode.hidden = false;
    console.warn('[MSY][feed-social][image-preview] falha ao carregar imagem', payload());
    Utils.showToast?.('Não foi possível carregar a imagem selecionada.', 'error');
  };
  img.addEventListener('load', markLoaded, { once: true });
  img.addEventListener('error', markError, { once: true });
  if (img.complete) {
    if (img.naturalWidth > 0) markLoaded();
    else markError();
  } else {
    console.info('[MSY][feed-social][image-preview] aguardando carregamento', payload());
  }
}

function applyMediaEditorTransform(root, item) {
  const editor = root?.querySelector?.(mediaEditorSelector(item.id));
  if (!editor) return;
  const editState = ensureMediaEditState(item, editor.dataset.mediaEditorScope === 'post' ? 'original' : '9:16');
  const aspect = mediaAspectCss(editState.aspect, editState.originalAspect);
  editor.style.setProperty('--editor-aspect', aspect);
  editor.style.setProperty('--editor-transform', mediaEditorTransform(editState));
  editor.closest('.composer-preview-main,.mobile-composer-preview-main')?.style.setProperty('--editor-aspect', aspect);
  const active = isMediaEditActive(editState);
  editor.classList.toggle('is-edited', active);
  editor.classList.toggle('is-original', !active);
}

function bindMediaEditorGestures(root, item, onChange = () => {}) {
  const editor = root?.querySelector?.(mediaEditorSelector(item.id));
  if (!editor) return;
  ensureMediaEditState(item, editor.dataset.mediaEditorScope === 'post' ? 'original' : '9:16');
  const pointers = new Map();
  let start = null;
  const pointDistance = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const pointAngle = (a, b) => Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX) * 180 / Math.PI;
  const schedule = () => requestAnimationFrame(() => {
    applyMediaEditorTransform(root, item);
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

function renderStoryComposerMedia(item) {
  return renderEditableMediaNode(item, { scope: 'story' });
}

function renderStoryComposerControls(item) {
  if (!item) return '';
  ensureMediaEditState(item);
  const aspectControl = `
    <div class="form-group story-compose-control">
      <label class="form-label">Proporção</label>
      <select class="form-input form-select" data-story-edit-field="aspect">
        ${mediaAspectOptions.map(([value, label]) => `<option value="${value}" ${item.editState?.aspect === value ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
    </div>`;
  const transformControls = `
    <div class="form-group story-compose-control">
      <label class="form-label">Zoom <span data-story-zoom-label>${Number(item.editState?.zoom || 1).toFixed(2)}x</span></label>
      <input type="range" min="0.5" max="3" step="0.01" value="${Number(item.editState?.zoom || 1)}" data-story-edit-field="zoom">
    </div>
    <div class="form-group story-compose-control">
      <label class="form-label">Rotação <span data-story-rotation-label>${Math.round(Number(item.editState?.rotation || 0))}°</span></label>
      <input type="range" min="0" max="360" step="1" value="${Number(item.editState?.rotation || 0)}" data-story-edit-field="rotation">
    </div>
    <button type="button" class="follow-btn media-editor-reset" data-media-edit-reset><i class="fa-solid fa-rotate-left"></i> Resetar enquadramento</button>`;
  if (item.media_type === 'video') {
    const duration = Number(item.editState?.duration || 0);
    const trimStart = Number(item.editState?.trimStart || 0);
    const trimEnd = Number(item.editState?.trimEnd ?? duration ?? 0);
    return `
      <div class="story-compose-tools">
        ${aspectControl}
        ${transformControls}
        <div class="form-group story-compose-control">
          <label class="form-label">Início do vídeo</label>
          <input type="range" min="0" max="${Math.max(duration, 0)}" step="0.1" value="${trimStart}" data-story-edit-field="trimStart">
        </div>
        <div class="form-group story-compose-control">
          <label class="form-label">Fim do vídeo</label>
          <input type="range" min="0.1" max="${Math.max(duration || 0.1, 0.1)}" step="0.1" value="${trimEnd || duration || 0.1}" data-story-edit-field="trimEnd">
        </div>
        <div class="form-group story-compose-control">
          <label class="form-label">Thumbnail</label>
          <input type="range" min="0" max="${Math.max(duration, 0)}" step="0.1" value="${Number(item.editState?.thumbnailTime || 0)}" data-story-edit-field="thumbnailTime">
        </div>
        <div class="message-sub">${item.editState?.exportSupported ? 'Exportação local ativa.' : 'Seu navegador não suporta exportação local segura de vídeo.'}</div>
      </div>`;
  }
  return `
    <div class="story-compose-tools">
      ${aspectControl}
      ${transformControls}
    </div>`;
}

function renderStoryComposerThumb(item, index) {
  const active = index === state.activeStoryComposerIndex ? ' active' : '';
  const thumb = item.media_type === 'video'
    ? (item.thumbnail_url ? `<img src="${Utils.escapeHtml(item.thumbnail_url)}" alt="Thumb do vídeo">` : '<i class="fa-solid fa-play"></i>')
    : `<img src="${Utils.escapeHtml(item.url)}" alt="Thumb">`;
  return `<button type="button" class="story-compose-thumb${active}" data-story-thumb="${index}">${thumb}</button>`;
}

function syncStoryComposerCaption() {
  const input = document.getElementById('storyCaptionInput');
  const counter = document.getElementById('storyCaptionCount');
  const item = activeStoryComposerItem();
  if (!input || !item) return;
  item.caption = input.value;
  if (counter) counter.textContent = String(input.value.length);
}

function renderStoryComposerBody() {
  const modal = document.getElementById('storyComposerModal');
  const item = activeStoryComposerItem();
  if (!modal || !item) return;
  modal.innerHTML = `
    <div class="story-compose-panel social-story-editor-panel">
      <div class="story-compose-preview" id="storyComposePreview">
        <div class="story-compose-slide-preview active" data-story-preview-slide="${state.activeStoryComposerIndex}">
          ${renderStoryComposerMedia(item)}
        </div>
      </div>
      <div class="story-compose-side">
        <div class="story-compose-head">
          <div>
            <div class="social-title" style="font-size:1.05rem">${state.activeStoryEditId ? 'Editar story' : 'Novo story'}</div>
            <div class="social-subtitle">Ajuste a midia e publique no feed social.</div>
          </div>
          <button class="social-icon-btn story-compose-close" data-close-story-composer aria-label="Fechar"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="story-compose-strip">
          ${state.storyPreviews.map((preview, index) => renderStoryComposerThumb(preview, index)).join('')}
        </div>
        ${renderStoryComposerControls(item)}
        <div class="story-compose-caption-wrap">
          <textarea id="storyCaptionInput" class="story-caption-input" maxlength="160" placeholder="Adicionar legenda...">${Utils.escapeHtml(item.caption || '')}</textarea>
          <div class="story-caption-count"><span id="storyCaptionCount">${(item.caption || '').length}</span>/160</div>
        </div>
        <div class="message-sub">${item.media_type === 'video' ? 'Videos serao exportados localmente antes do upload quando suportado.' : 'Imagens mantem qualidade alta com compressao apenas quando necessaria.'}</div>
        <div class="story-compose-actions">
          <button class="follow-btn" type="button" data-story-replace-media><i class="fa-solid fa-image"></i> Substituir midia</button>
          <input id="storyComposerFile" type="file" accept="image/*,video/*" hidden>
          <button class="btn btn-primary social-submit story-publish-btn" id="publishStoryBtn"><i class="fa-solid fa-paper-plane"></i> ${state.activeStoryEditId ? 'Salvar story' : 'Enviar story'}</button>
        </div>
      </div>
    </div>`;
	  openModal(modal);
	  bindMediaPreviewDiagnostics(modal, item);
	  bindMediaEditorGestures(modal, item, () => {
    const zoomLabel = modal.querySelector('[data-story-zoom-label]');
    const rotationLabel = modal.querySelector('[data-story-rotation-label]');
    const zoomInput = modal.querySelector('[data-story-edit-field="zoom"]');
    const rotationInput = modal.querySelector('[data-story-edit-field="rotation"]');
    if (zoomLabel) zoomLabel.textContent = `${Number(item.editState.zoom || 1).toFixed(2)}x`;
    if (rotationLabel) rotationLabel.textContent = `${Math.round(Number(item.editState.rotation || 0))}°`;
    if (zoomInput) zoomInput.value = item.editState.zoom;
    if (rotationInput) rotationInput.value = item.editState.rotation;
  });
  modal.querySelector('[data-close-story-composer]')?.addEventListener('click', closeStoryComposer);
  modal.querySelectorAll('[data-story-thumb]').forEach((btn) => btn.addEventListener('click', () => {
    state.activeStoryComposerIndex = Number(btn.dataset.storyThumb);
    renderStoryComposerBody();
  }));
  modal.querySelector('#storyCaptionInput')?.addEventListener('input', syncStoryComposerCaption);
  const syncStoryEditField = async (event) => {
    const current = activeStoryComposerItem();
    if (!current) return;
    const key = event.currentTarget.dataset.storyEditField;
    const value = event.currentTarget.value;
    if (key === 'zoom' || key === 'rotation' || key === 'trimStart' || key === 'trimEnd' || key === 'thumbnailTime') current.editState[key] = Number(value);
    else current.editState[key] = value;
    if (['zoom', 'rotation', 'aspect'].includes(key)) {
      applyMediaEditorTransform(modal, current);
      const zoomLabel = modal.querySelector('[data-story-zoom-label]');
      const rotationLabel = modal.querySelector('[data-story-rotation-label]');
      if (zoomLabel) zoomLabel.textContent = `${Number(current.editState.zoom || 1).toFixed(2)}x`;
      if (rotationLabel) rotationLabel.textContent = `${Math.round(Number(current.editState.rotation || 0))}°`;
      return;
    }
    if (key === 'thumbnailTime' && current.media_type === 'video') {
      try {
        const thumb = await captureStoryVideoThumbnail(current.file || current.url, current.editState.thumbnailTime, current.editState.rotation || 0);
        if (current.thumbnail_url?.startsWith('blob:')) URL.revokeObjectURL(current.thumbnail_url);
        current.thumbnail_url = thumb.url;
        renderStoryComposerBody();
      } catch (err) {
        console.warn('[MSY][feed-social] Falha ao atualizar thumbnail do story:', err);
      }
      return;
    }
  };
  modal.querySelectorAll('[data-story-edit-field]').forEach((field) => {
    field.addEventListener('input', syncStoryEditField);
    field.addEventListener('change', syncStoryEditField);
  });
  modal.querySelector('[data-media-edit-reset]')?.addEventListener('click', () => {
    const current = activeStoryComposerItem();
    if (!current) return;
    current.editState = normalizeMediaEditState({ ...current.editState, zoom: 1, rotation: 0, offsetX: 0, offsetY: 0 }, current.media_type);
    renderStoryComposerBody();
  });
  modal.querySelector('[data-story-replace-media]')?.addEventListener('click', () => modal.querySelector('#storyComposerFile')?.click());
  modal.querySelector('#storyComposerFile')?.addEventListener('change', async (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      validateMediaFile(file);
      const nextPreview = { ...filePreview(file), isNew: true };
      nextPreview.editState = createStoryMediaEditState(file);
      nextPreview.caption = activeStoryComposerItem()?.caption || '';
      if (nextPreview.media_type === 'video') {
        nextPreview.editState.exportSupported = supportsVideoEditing();
        const thumb = await captureStoryVideoThumbnail(file, 0, 0);
        nextPreview.thumbnail_url = thumb.url;
      } else {
        const image = await loadImage(file);
        nextPreview.editState.originalAspect = image.width / image.height;
        nextPreview.editState.aspect = 'original';
        nextPreview.editState.zoom = 1;
        nextPreview.editState.offsetX = 0;
        nextPreview.editState.offsetY = 0;
      }
      const current = activeStoryComposerItem();
      if (current) revokePreviews([current]);
      state.storyPreviews[state.activeStoryComposerIndex] = nextPreview;
      await hydrateStoryComposerVideoMetadata();
      renderStoryComposerBody();
    } catch (err) {
      console.error('[MSY][feed-social] Erro ao substituir mídia do story:', err);
      Utils.showToast(err.message || 'Erro ao substituir mídia do story.', 'error');
    } finally {
      event.currentTarget.value = '';
    }
  });
  modal.querySelector('#publishStoryBtn')?.addEventListener('click', state.activeStoryEditId ? saveStoryEditor : publishStoryFromPreview);
}

async function hydrateStoryComposerVideoMetadata() {
  await Promise.all(state.storyPreviews.map(async (item) => {
    if (item.media_type !== 'video' || item.editState?.duration) return;
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = item.url;
    await new Promise((resolve) => {
      video.onloadedmetadata = () => {
        item.editState.duration = Number.isFinite(video.duration) ? video.duration : 0;
        item.editState.trimEnd = item.editState.trimEnd ?? item.editState.duration;
        if (video.videoWidth && video.videoHeight) item.editState.originalAspect = video.videoWidth / video.videoHeight;
        resolve();
      };
      video.onerror = () => resolve();
    });
  }));
}

async function openStoryComposer() {
  if (!state.storyPreviews.length) return;
  if (!state.storyPreviews.every((item) => typeof item.caption === 'string')) {
    state.storyPreviews = state.storyPreviews.map((item) => ({ ...item, caption: item.caption || '' }));
  }
  state.activeStoryComposerIndex = 0;
  await hydrateStoryComposerVideoMetadata();
  renderStoryComposerBody();
}

function closeStoryComposer() {
  if (state.storyPreviews?.length) revokePreviews(state.storyPreviews);
  state.storyPreviews = [];
  state.activeStoryComposerIndex = 0;
  closeSocialModals();
}

async function buildStoryUploadPayload(item) {
  if (!item?.file) throw new Error('Selecione uma midia para enviar o story.');
  const aspect = item.editState?.aspect || '9:16';
  if (item.media_type === 'video') {
    if (!item.editState?.exportSupported) {
      throw new Error('Seu navegador não suporta exportação local segura de vídeo para stories editados.');
    }
    const editedFile = await exportStoryVideoFile(item.file, item.editState);
    const media = await uploadSocialMedia(db, state.profile.id, editedFile, 'stories', { skipCompression: true });
    return {
      media,
      options: {
        media_meta: {
          kind: 'video',
          aspect,
          zoom: 1,
          rotation: 0,
          offsetX: 0,
          offsetY: 0,
          trimStart: 0,
          trimEnd: 0,
          thumbnailTime: Number(item.editState?.thumbnailTime || 0),
          originalAspect: Number(item.editState?.originalAspect || 0) || null,
          exported: true,
        },
        thumbnail_url: item.thumbnail_url?.startsWith('blob:') ? media.url : (item.thumbnail_url || media.url),
      },
    };
  }

  const editedFile = await exportStoryImageFile(item.file, item.editState);
  const media = await uploadSocialMedia(db, state.profile.id, editedFile, 'stories', { skipCompression: true });
  return {
    media,
    options: {
      media_meta: {
        kind: 'image',
        aspect,
        zoom: 1,
        rotation: 0,
        offsetX: 0,
        offsetY: 0,
        originalAspect: Number(item.editState?.originalAspect || 0) || null,
        exported: true,
      },
    },
  };
}

async function publishStoryFromPreview() {
  if (!state.storyPreviews?.length) {
    Utils.showToast('Selecione uma midia para enviar o story.', 'error');
    return;
  }
  const btn = document.getElementById('publishStoryBtn');
  const invalid = state.storyPreviews.find((item) => !item?.file || !item?.url || !['image', 'video'].includes(item.media_type));
  if (invalid) {
    Utils.showToast('Selecione uma imagem ou video valido para enviar o story.', 'error');
    return;
  }
  const longCaption = state.storyPreviews.find((item) => String(item.caption || '').length > 160);
  if (longCaption) {
    Utils.showToast('A legenda do story deve ter no maximo 160 caracteres.', 'error');
    return;
  }
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Publicando...';
  const uploadedPaths = [];
  try {
    for (const item of state.storyPreviews) {
      const { media, options } = await buildStoryUploadPayload(item);
      if (media.storage_path) uploadedPaths.push(media.storage_path);
      await state.service.createStory(media, item.caption || '', options);
    }
    revokePreviews(state.storyPreviews);
    state.storyPreviews = [];
    state.activeStoryComposerIndex = 0;
    closeSocialModals();
    state.stories = await state.service.loadStories();
    renderStories();
    Utils.showToast('Stories publicados por 24 horas!');
  } catch (err) {
    console.error('[MSY][feed-social] Erro ao publicar story:', err);
    if (uploadedPaths.length) {
      await removeSocialMedia(db, uploadedPaths).catch((cleanupErr) => {
        console.warn('[MSY][feed-social] Rollback parcial do upload do story falhou:', cleanupErr);
      });
    }
    Utils.showToast(err.message || 'Erro ao publicar story.', 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-circle-plus"></i> Publicar stories';
  }
}

async function toggleLike(postId, btn) {
  const post = state.posts.find((p) => p.id === postId);
  if (!post || post.legacy) return;
  if (btn?.disabled) return;
  const previousLiked = Boolean(post.liked_by_me);
  const previousCount = Number(post.likes_count || 0);
  const optimisticLiked = !previousLiked;
  try {
    if (btn) {
      btn.disabled = true;
      btn.classList.add('is-loading');
      btn.classList.toggle('active', optimisticLiked);
      btn.innerHTML = `<i class="fa-${optimisticLiked ? 'solid' : 'regular'} fa-heart"></i>`;
      btn.classList.add('like-pop');
      setTimeout(() => btn.classList.remove('like-pop'), 380);
    }
    post.liked_by_me = optimisticLiked;
    post.likes_count = Math.max(0, previousCount + (optimisticLiked ? 1 : -1));
    updatePostStatsNode(post);
    const liked = await state.service.toggleLike({ ...post, liked_by_me: previousLiked });
    post.liked_by_me = liked;
    post.likes_count = Math.max(0, previousCount + (liked === previousLiked ? 0 : (liked ? 1 : -1)));
    if (btn) {
      btn.classList.toggle('active', liked);
      btn.innerHTML = `<i class="fa-${liked ? 'solid' : 'regular'} fa-heart"></i>`;
    }
    updatePostStatsNode(post);
  } catch {
    post.liked_by_me = previousLiked;
    post.likes_count = previousCount;
    if (btn) {
      btn.classList.toggle('active', previousLiked);
      btn.innerHTML = `<i class="fa-${previousLiked ? 'solid' : 'regular'} fa-heart"></i>`;
    }
    updatePostStatsNode(post);
    Utils.showToast('Erro ao curtir.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('is-loading');
    }
  }
}

async function toggleSave(postId, btn = null) {
  const post = state.posts.find((p) => p.id === postId);
  if (!post || post.legacy) return;
  if (btn?.disabled) return;
  try {
    if (btn) {
      btn.disabled = true;
      btn.classList.add('is-loading');
    }
    const saved = await state.service.toggleSave(post);
    post.saved_by_me = saved;
    if (btn) {
      btn.classList.toggle('active', saved);
      btn.innerHTML = `<i class="fa-${saved ? 'solid' : 'regular'} fa-bookmark"></i>`;
      btn.classList.add('save-pop');
      setTimeout(() => btn.classList.remove('save-pop'), 360);
    } else {
      updatePostNode(postId);
    }
    Utils.showToast(saved ? 'Publicacao salva.' : 'Publicacao removida dos salvos.');
  } catch {
    Utils.showToast('Erro ao salvar.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('is-loading');
    }
  }
}

async function addComment(e) {
  e.preventDefault();
  const form = e.target.closest('[data-comment-form]');
  if (!form) return;
  const post = state.posts.find((p) => p.id === form.dataset.commentForm);
  const input = form.elements.comment;
  if (!post || !input.value.trim()) return;
  const btn = form.querySelector('button[type="submit"]');
  try {
    Utils.setButtonLoading?.(btn, true);
    await submitComment(post.id, input.value);
    const createdId = post.comments.at(-1)?.id;
    input.value = '';
    closeMentionDropdown();
    updatePostNode(post.id);
    document.getElementById(`comment-${createdId}`)?.classList.add('comment-just-created');
  } catch (err) {
    console.error('[MSY][feed-social] Erro ao comentar:', err);
    Utils.showToast('Erro ao comentar.', 'error');
  } finally {
    Utils.setButtonLoading?.(btn, false);
  }
}

async function deleteComment(postId, commentId) {
  const post = state.posts.find((p) => p.id === postId);
  const comment = post?.comments?.find((item) => item.id === commentId);
  if (!post || !comment) return;
  if (!canManageComment(comment, post)) return Utils.showToast('Sem permissao para excluir este comentario.', 'error');
  if (!await MSYConfirm.show('Excluir este comentario?', { title: 'Excluir comentario', type: 'danger', confirmText: 'Excluir' })) return;
  try {
    await state.service.deleteComment(commentId);
    post.comments = (post.comments || []).filter((item) => item.id !== commentId);
    post.comments_count = Math.max(0, Number(post.comments_count || 0) - 1);
    const modal = document.getElementById('postCommentsModal');
    const list = document.getElementById('postCommentsSheetList');
    if (modal?.classList.contains('open') && modal.dataset.postId === postId && list) {
      list.innerHTML = post.comments.length
        ? renderCommentRows(post, { full: true })
        : '<div class="social-empty"><i class="fa-regular fa-comment"></i>Nenhum comentario ainda.</div>';
    }
    updatePostStatsNode(post);
    updatePostNode(post.id);
    Utils.showToast('Comentario excluido.');
  } catch (err) {
    console.error('[MSY][feed-social] Erro ao excluir comentario:', err);
    Utils.showToast(err.message || 'Erro ao excluir comentario.', 'error');
  }
}

async function deletePost(postId) {
  const post = state.posts.find((p) => p.id === postId);
  if (!post || !canManage(post)) return Utils.showToast('Sem permissao para excluir esta publicacao.', 'error');
  if (!await MSYConfirm.show('Excluir esta publicacao? Esta acao remove o post do feed e as midias do storage.', { title: 'Excluir publicacao', type: 'danger', confirmText: 'Excluir' })) return;
  try {
    const paths = await state.service.deletePost(postId);
    await removeSocialMedia(db, paths).catch((err) => console.warn('[MSY][feed-social] Post excluido, mas storage manteve midias:', err));
    state.posts = state.posts.filter((p) => p.id !== postId);
    state.activeProfilePosts = state.activeProfilePosts.filter((p) => p.id !== postId);
    state.activeProfileLikedPosts = state.activeProfileLikedPosts.filter((p) => p.id !== postId);
    state.activeProfileSavedPosts = state.activeProfileSavedPosts.filter((p) => p.id !== postId);
    document.getElementById(`post-${postId}`)?.remove();
    Utils.showToast('Publicacao excluida.');
  } catch (err) {
    console.error('[MSY][feed-social] Erro ao excluir post:', err);
    Utils.showToast(err.message || 'Erro ao excluir publicacao.', 'error');
  }
}

async function editPost(postId) {
  const post = state.posts.find((p) => p.id === postId);
  if (!post || !canEditPost(post)) return Utils.showToast('Sem permissao para editar esta publicacao.', 'error');
  openPostEditor(post);
}

function editorMediaNode(item) {
  return item.media_type === 'video'
    ? `<video src="${Utils.escapeHtml(item.url)}" muted playsinline controls></video>`
    : `<img src="${Utils.escapeHtml(item.url)}" alt="Midia da publicacao">`;
}

function openPostEditor(post) {
  const modal = document.getElementById('postEditorModal');
  if (!modal) return;
  state.activePostEditId = post.id;
  state.postEditPreviews = (post.media || []).map((item) => ({
    ...item,
    isNew: false,
    editState: normalizeMediaEditState(item.media_meta || {}, item.media_type),
  }));
  modal.innerHTML = `
    <div class="social-edit-post-panel">
      <div class="social-edit-post-head">
        <div>
          <strong>Editar publicacao</strong>
          <span>Atualize legenda, hashtags, mencoes e carrossel.</span>
        </div>
        <button class="social-icon-btn" data-close-modal><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="social-edit-post-body">
        <textarea id="postEditContent" class="story-caption-input" maxlength="1600" placeholder="Escreva uma legenda...">${Utils.escapeHtml(post.content || '')}</textarea>
        <input id="postEditFiles" type="file" accept="image/*,video/*" multiple hidden>
        <div class="social-edit-media-toolbar">
          <button type="button" class="follow-btn" data-post-edit-add-media><i class="fa-solid fa-image"></i> Adicionar midias</button>
          <span id="postEditMediaCount">${state.postEditPreviews.length}/10 midias</span>
        </div>
        <div class="social-edit-media-list" id="postEditMediaList"></div>
      </div>
      <div class="social-edit-post-actions">
        <button type="button" class="follow-btn" data-close-modal>Cancelar</button>
        <button type="button" class="btn btn-primary social-submit" id="postEditSave"><i class="fa-solid fa-check"></i> Salvar alteracoes</button>
      </div>
    </div>`;
  openModal(modal);
  bindMentionAutocomplete(modal.querySelector('#postEditContent'), { minChars: 1 });
  renderPostEditMediaList();
  modal.querySelector('[data-post-edit-add-media]')?.addEventListener('click', () => modal.querySelector('#postEditFiles')?.click());
  modal.querySelector('#postEditFiles')?.addEventListener('change', (e) => {
    try {
      [...(e.currentTarget.files || [])].forEach((file) => {
	        validateMediaFile(file);
	        if (state.postEditPreviews.length >= 10) throw new Error('Limite de 10 midias por publicacao.');
	        const preview = { ...filePreview(file), isNew: true };
	        preview.editState = normalizeMediaEditState(createStoryMediaEditState(file), preview.media_type);
	        preview.editState.aspect = 'original';
	        preview.editState.zoom = 1;
	        preview.editState.offsetX = 0;
	        preview.editState.offsetY = 0;
	        state.postEditPreviews.push(preview);
	        if (preview.media_type === 'image') {
	          loadImage(file).then((image) => {
	            preview.editState.originalAspect = image.width / image.height;
	            preview.editState.originalWidth = image.width;
	            preview.editState.originalHeight = image.height;
	            preview.editState.detectedFormat = detectMediaFormat(image.width, image.height);
	            renderPostEditMediaList();
	          }).catch((imageErr) => {
	            console.warn('[MSY][feed-social][image-preview] dimensoes da imagem de edicao indisponiveis:', imageErr);
	          });
	        }
	      });
      renderPostEditMediaList();
    } catch (err) {
      Utils.showToast(err.message || 'Erro ao adicionar midia.', 'error');
    } finally {
      e.currentTarget.value = '';
    }
  });
  modal.querySelector('#postEditSave')?.addEventListener('click', savePostEditor);
}

function renderPostEditMediaList() {
  const list = document.getElementById('postEditMediaList');
  const count = document.getElementById('postEditMediaCount');
  if (count) count.textContent = `${state.postEditPreviews.length}/10 midias`;
  if (!list) return;
  if (!state.postEditPreviews.length) {
    list.innerHTML = '<button type="button" class="social-edit-empty-media" data-post-edit-add-media><i class="fa-regular fa-image"></i><span>Adicionar fotos ou videos</span></button>';
    list.querySelector('[data-post-edit-add-media]')?.addEventListener('click', () => document.getElementById('postEditFiles')?.click());
    return;
  }
  list.innerHTML = state.postEditPreviews.map((item, index) => `
    <div class="social-edit-media-item" data-edit-media-id="${item.id}">
      <div class="social-edit-media-preview">${renderEditableMediaNode(item, { scope: 'post' })}</div>
      <div class="social-edit-media-controls">
        <select class="form-input form-select" data-post-media-edit-field="aspect">
          ${mediaAspectOptions.map(([value, label]) => `<option value="${value}" ${item.editState?.aspect === value ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
        <label>Zoom <input type="range" min="0.5" max="3" step="0.01" value="${Number(item.editState?.zoom || 1)}" data-post-media-edit-field="zoom"></label>
        <label>Rotação <input type="range" min="0" max="360" step="1" value="${Number(item.editState?.rotation || 0)}" data-post-media-edit-field="rotation"></label>
      </div>
      <div class="social-edit-media-actions">
        <span>${index + 1}</span>
        <button type="button" class="social-icon-btn" data-edit-media-move="-1" ${index === 0 ? 'disabled' : ''} title="Mover para esquerda"><i class="fa-solid fa-arrow-left"></i></button>
        <button type="button" class="social-icon-btn" data-edit-media-move="1" ${index === state.postEditPreviews.length - 1 ? 'disabled' : ''} title="Mover para direita"><i class="fa-solid fa-arrow-right"></i></button>
        <button type="button" class="social-icon-btn danger" data-edit-media-remove title="Remover"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`).join('');
  list.querySelectorAll('[data-edit-media-remove]').forEach((btn) => btn.addEventListener('click', () => {
    const id = btn.closest('[data-edit-media-id]')?.dataset.editMediaId;
    const item = state.postEditPreviews.find((media) => media.id === id);
    if (item?.isNew) revokePreviews([item]);
    state.postEditPreviews = state.postEditPreviews.filter((media) => media.id !== id);
    renderPostEditMediaList();
  }));
	  state.postEditPreviews.forEach((item) => {
	    bindMediaEditorGestures(list, item);
	    bindMediaPreviewDiagnostics(list, item);
	  });
  list.querySelectorAll('[data-post-media-edit-field]').forEach((field) => field.addEventListener('input', (event) => {
    const id = event.currentTarget.closest('[data-edit-media-id]')?.dataset.editMediaId;
    const item = state.postEditPreviews.find((media) => media.id === id);
    if (!item) return;
    const key = event.currentTarget.dataset.postMediaEditField;
    const value = event.currentTarget.value;
    if (key === 'zoom' || key === 'rotation') item.editState[key] = Number(value);
    else item.editState[key] = value;
    applyMediaEditorTransform(list, item);
  }));
  list.querySelectorAll('[data-edit-media-move]').forEach((btn) => btn.addEventListener('click', () => {
    const id = btn.closest('[data-edit-media-id]')?.dataset.editMediaId;
    const from = state.postEditPreviews.findIndex((media) => media.id === id);
    const to = from + Number(btn.dataset.editMediaMove);
    if (from < 0 || to < 0 || to >= state.postEditPreviews.length) return;
    const [item] = state.postEditPreviews.splice(from, 1);
    state.postEditPreviews.splice(to, 0, item);
    renderPostEditMediaList();
  }));
}

async function savePostEditor() {
  const postId = state.activePostEditId;
  const post = state.posts.find((p) => p.id === postId);
  if (!post) return;
  if (!canEditPost(post)) return Utils.showToast('Apenas quem publicou pode editar esta publicacao.', 'error');
  const btn = document.getElementById('postEditSave');
  const content = document.getElementById('postEditContent')?.value.trim() || '';
  if (!content && !state.postEditPreviews.length) return Utils.showToast('Mantenha uma legenda ou ao menos uma midia.', 'error');
  try {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Salvando...';
    }
    const media = [];
    for (const item of state.postEditPreviews) {
      const editState = ensureMediaEditState(item, '4:5');
      if (item.isNew) {
        let uploadFile = item.file;
        let skipCompression = false;
        if (item.media_type === 'image') {
          uploadFile = await exportStoryImageFile(item.file, editState);
          skipCompression = true;
        } else if (item.media_type === 'video' && item.editState?.exportSupported) {
          uploadFile = await exportStoryVideoFile(item.file, editState);
          skipCompression = true;
        }
        const uploaded = await uploadSocialMedia(db, state.profile.id, uploadFile, 'posts', { skipCompression });
        uploaded.media_meta = { ...editState, exported: true };
        if (item.media_type === 'image') {
          const exportedImage = await loadImage(uploadFile);
          uploaded.media_meta.exportedWidth = exportedImage.width;
          uploaded.media_meta.exportedHeight = exportedImage.height;
          uploaded.width = exportedImage.width;
          uploaded.height = exportedImage.height;
        } else if (item.media_type === 'video') {
          uploaded.media_meta.exportedAspect = editState.aspect === 'original'
            ? Number(editState.originalAspect || 0) || null
            : getStoryAspectRatioValue(editState.aspect);
        }
        media.push(uploaded);
      } else {
        media.push({ ...item, media_meta: editState });
      }
    }
    const { removedStoragePaths } = await state.service.updatePost(postId, { content, media });
    await removeSocialMedia(db, removedStoragePaths).catch((err) => console.warn('[MSY][feed-social] Post atualizado, mas storage manteve midias antigas:', err));
    revokePreviews(state.postEditPreviews.filter((item) => item.isNew));
    const fresh = await state.service.loadPostById(postId);
    if (fresh) {
      replacePostEverywhere(fresh);
    } else {
      post.content = content;
      post.edited_at = new Date().toISOString();
      post.media = media;
    }
    closeSocialModals();
    updatePostNode(postId);
    if (state.activeProfileId) renderProfileRoute();
    Utils.showToast('Publicacao atualizada.');
  } catch (err) {
    console.error('[MSY][feed-social] Erro ao editar publicacao:', err);
    Utils.showToast(err.message || 'Erro ao editar publicacao.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Salvar alteracoes';
    }
  }
}

function replacePostEverywhere(post) {
  [
    state.posts,
    state.activeProfilePosts,
    state.activeProfileLikedPosts,
    state.activeProfileSavedPosts,
  ].forEach((collection) => {
    const index = collection.findIndex((item) => item.id === post.id);
    if (index >= 0) collection[index] = post;
  });
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
  { key: 'likes', label: 'Curtidas' },
  { key: 'comments', label: 'Comentários' },
  { key: 'followers', label: 'Seguidores' },
  { key: 'story_replies', label: 'Stories' },
  { key: 'direct', label: 'Direct' },
  { key: 'mentions', label: 'Menções' },
  { key: 'activities', label: 'Atividades' },
];

function notificationIcon(category) {
  const map = {
    likes: 'fa-heart',
    stories: 'fa-circle-play',
    story_replies: 'fa-reply',
    comments: 'fa-comment',
    followers: 'fa-user-plus',
    mentions: 'fa-at',
    direct: 'fa-paper-plane',
    activities: 'fa-bolt',
  };
  return map[category] || 'fa-heart';
}

function notificationLabel(notification) {
  const actorName = notification.actor?.name || 'Alguem';
  const event = notification.metadata?.event;
  if (event === 'story_reply') return `${actorName} respondeu seu story.`;
  if (notification.category === 'likes') return `${actorName} curtiu sua publicacao.`;
  if (notification.category === 'stories') return `${actorName} interagiu com seu story.`;
  if (notification.category === 'comments') return `${actorName} comentou em uma publicacao.`;
  if (notification.category === 'followers') return `${actorName} comecou a seguir voce.`;
  if (notification.category === 'mentions') return `${actorName} mencionou voce.`;
  if (notification.category === 'direct') return notification.message || `${actorName} enviou uma mensagem.`;
  return notification.message || 'Nova interacao social.';
}

function renderSocialNotifications() {
  const unread = state.socialNotifications.filter((item) => !item.read && item.category !== 'direct').length;
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
  const unreadByCategory = state.socialNotifications.reduce((acc, item) => {
    if (!item.read) acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});
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
      ${notificationFilters.map((filter) => {
        const count = filter.key === 'all'
          ? state.socialNotifications.filter((item) => !item.read).length
          : unreadByCategory[filter.key] || 0;
        return `<button type="button" class="${state.notificationFilter === filter.key ? 'active' : ''}" data-notification-filter="${filter.key}"><i class="fa-solid ${notificationIcon(filter.key)}"></i>${filter.label}${count ? `<span>${count > 9 ? '9+' : count}</span>` : ''}</button>`;
      }).join('')}
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
    refreshDirectUnreadCount();
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
        if (state.service.isDirectNotification(item)) refreshDirectUnreadCount();
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

function subscribeStoriesRealtime() {
  if (!state.hasSocialTables || state.socialStoriesChannel) return;
  try {
    state.socialStoriesChannel = db
      .channel('feed-social-stories')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'social_stories',
      }, () => {
        clearTimeout(state.directActivityRefreshTimer);
        state.directActivityRefreshTimer = setTimeout(async () => {
          try {
            state.stories = await state.service.loadStories();
            renderStories();
          } catch (err) {
            console.warn('[MSY][feed-social] Realtime de stories indisponível:', err);
          }
        }, 180);
      })
      .subscribe();
  } catch (err) {
    console.warn('[MSY][feed-social] Assinatura realtime de stories falhou:', err);
  }
}

function renderSuggestions(query = '') {
  const el = document.getElementById('suggestionsList');
  if (!el) return;
  const followedIds = new Set(state.follows.filter((f) => f.follower_id === state.profile.id).map((f) => f.following_id));
  const cleanQuery = String(query || '').trim().toLowerCase().replace(/^@+/, '');
  if (!cleanQuery) {
    el.innerHTML = '<div class="side-member-empty"><i class="fa-solid fa-magnifying-glass"></i>Pesquise um @username para encontrar membros.</div>';
    bindSideMemberSearch();
    return;
  }
  const items = state.members
    .filter((m) => m.id !== state.profile.id)
    .filter((m) => {
      return displayUsername(m).includes(cleanQuery)
        || String(m.name || '').toLowerCase().includes(cleanQuery)
        || String(m.role || '').toLowerCase().includes(cleanQuery);
    })
    .sort((a, b) => Number(followedIds.has(a.id)) - Number(followedIds.has(b.id)))
    .sort((a, b) => memberSearchScore(b, cleanQuery) - memberSearchScore(a, cleanQuery))
    .slice(0, 10);
  el.innerHTML = items.length ? items.map((m) => `
    <div class="member-suggestion">
      <div data-open-member-profile="${m.id}" style="cursor:pointer">${avatar(m, 36)}</div>
      <div class="member-copy"><div class="member-name">${Utils.escapeHtml(m.name)}</div><div class="member-role">@${Utils.escapeHtml(displayUsername(m))} · ${Utils.escapeHtml(m.role || 'Membro')}</div></div>
      <button class="follow-btn ${isFollowing(m.id) ? 'following' : ''}" data-follow="${m.id}">${isFollowing(m.id) ? 'Seguindo' : 'Seguir'}</button>
    </div>`).join('') : '<div class="side-member-empty"><i class="fa-regular fa-user"></i>Nenhum membro encontrado.</div>';
  el.querySelectorAll('[data-follow]').forEach((btn) => btn.addEventListener('click', () => toggleFollow(btn.dataset.follow)));
  el.querySelectorAll('[data-open-member-profile]').forEach((node) => node.addEventListener('click', () => openProfile(node.dataset.openMemberProfile)));
  bindSideMemberSearch();
}

function bindSideMemberSearch() {
  const input = document.getElementById('sideMemberSearchInput');
  if (!input || input.dataset.bound === 'true') return;
  input.dataset.bound = 'true';
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const value = input.value;
    timer = setTimeout(() => renderSuggestions(value), 90);
  });
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
    renderSuggestions(document.getElementById('sideMemberSearchInput')?.value || '');
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
  closeMobileActions();
  const card = document.querySelector('.social-member-search-card');
  const input = document.getElementById('socialSearchInput');
  const box = document.getElementById('socialSearchResults');
  if (!input || !box) return;
  document.body.classList.add('social-search-open');
  renderSocialSearchSuggestions(box);
  if (!isMobileSocial()) card?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  document.getElementById('closeSocialSearchBtn')?.addEventListener('click', () => {
    close();
    input.blur();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.social-member-search-card') && !e.target.closest('#openSearchBtn,#openSearchMobileBtn,[data-mobile-action="search"]')) close();
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
  modal.querySelectorAll('[data-start-direct]').forEach((btn) => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    openDirectInbox(btn.dataset.startDirect || memberId);
  }));
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
  state.activeProfileLikedPosts = [];
  state.activeProfileSavedPosts = [];
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
  const canViewPrivateTabs = isMe || state.profile.tier === 'diretoria';
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
        ${canViewPrivateTabs ? `<button class="${state.activeProfileTab === 'liked' ? 'active' : ''}" data-profile-tab="liked"><i class="fa-regular fa-heart"></i><span>Curtidos</span></button>
        <button class="${state.activeProfileTab === 'saved' ? 'active' : ''}" data-profile-tab="saved"><i class="fa-regular fa-bookmark"></i><span>Salvos</span></button>` : ''}
        <button class="${state.activeProfileTab === 'about' ? 'active' : ''}" data-profile-tab="about"><i class="fa-regular fa-user"></i><span>Sobre</span></button>
      </nav>
      <section class="social-profile-content">
        ${renderProfileTab(member, posts, mediaItems, canViewPrivateTabs)}
      </section>
    </div>`;
  bindProfileRoute(route);
  hydrateFeedEnhancements(route);
  requestAnimationFrame(() => {
    route.scrollTo?.({ top: 0, behavior: 'auto' });
    document.getElementById('pageContent')?.scrollTo?.({ top: 0, behavior: 'auto' });
  });
}

function renderProfileTab(member, posts, mediaItems, canViewPrivateTabs = false) {
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
  if (state.activeProfileTab === 'liked' || state.activeProfileTab === 'saved') {
    if (!canViewPrivateTabs) return '<div class="social-empty"><i class="fa-solid fa-lock"></i>Esta aba e privada.</div>';
    const items = state.activeProfileTab === 'liked' ? state.activeProfileLikedPosts : state.activeProfileSavedPosts;
    const label = state.activeProfileTab === 'liked' ? 'curtidos' : 'salvos';
    if (!items) return '<div class="social-empty"><i class="fa-solid fa-circle-notch fa-spin"></i>Carregando posts...</div>';
    return items.length
      ? `<div class="social-feed-list profile-post-list">${items.map(renderPost).join('')}</div>`
      : `<div class="social-empty"><i class="fa-regular fa-bookmark"></i>Nenhum post ${label} ainda.</div>`;
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
  route.querySelectorAll('[data-start-direct]').forEach((btn) => btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openDirectInbox(btn.dataset.startDirect);
  }));
  route.querySelector('[data-edit-social-profile]')?.addEventListener('click', openSocialProfileEditor);
  route.querySelectorAll('[data-profile-tab]').forEach((btn) => btn.addEventListener('click', () => switchProfileTab(btn.dataset.profileTab)));
  route.querySelectorAll('[data-open-followers]').forEach((btn) => btn.addEventListener('click', () => openFollowList(btn.dataset.openFollowers, 'followers')));
  route.querySelectorAll('[data-open-following]').forEach((btn) => btn.addEventListener('click', () => openFollowList(btn.dataset.openFollowing, 'following')));
  route.querySelectorAll('[data-open-profile-media]').forEach((btn) => btn.addEventListener('click', () => {
    const post = state.activeProfilePosts.find((item) => item.id === btn.dataset.openProfileMedia);
    if (post) openMediaViewer(post, Number(btn.dataset.mediaIndex || 0));
  }));
}

async function switchProfileTab(tab) {
  const memberId = state.activeProfileId;
  const canViewPrivateTabs = memberId === state.profile.id || state.profile.tier === 'diretoria';
  if ((tab === 'liked' || tab === 'saved') && !canViewPrivateTabs) {
    Utils.showToast('Esta aba e privada.', 'error');
    return;
  }
  state.activeProfileTab = tab;
  if (tab === 'liked' && !state.activeProfileLikedPosts.length) {
    renderProfileRoute();
    try {
      state.activeProfileLikedPosts = await state.service.loadProfileLikedPosts(memberId, { limit: 24 });
      mergeProfilePosts(state.activeProfileLikedPosts);
    } catch (err) {
      console.error('[MSY][feed-social] Erro ao carregar curtidos:', err);
      Utils.showToast(err.message || 'Erro ao carregar curtidos.', 'error');
    }
  }
  if (tab === 'saved' && !state.activeProfileSavedPosts.length) {
    renderProfileRoute();
    try {
      state.activeProfileSavedPosts = await state.service.loadProfileSavedPosts(memberId, { limit: 24 });
      mergeProfilePosts(state.activeProfileSavedPosts);
    } catch (err) {
      console.error('[MSY][feed-social] Erro ao carregar salvos:', err);
      Utils.showToast(err.message || 'Erro ao carregar salvos.', 'error');
    }
  }
  renderProfileRoute();
}

function closeProfileRoute({ replace = false } = {}) {
  state.activeProfileId = null;
  state.activeProfilePosts = [];
  state.activeProfileLikedPosts = [];
  state.activeProfileSavedPosts = [];
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

function updateStorySoundControl(modal, video = null) {
  const btn = modal.querySelector('[data-story-sound-toggle]');
  const storyVideo = video || modal.querySelector('.story-media video');
  if (!btn || !(storyVideo instanceof HTMLVideoElement)) return;
  const muted = storyVideo.muted || storyVideo.volume === 0;
  btn.classList.toggle('muted', muted);
  btn.setAttribute('aria-label', muted ? 'Ativar som do story' : 'Silenciar story');
  btn.setAttribute('title', muted ? 'Ativar som' : 'Silenciar');
  btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
  btn.innerHTML = `<i class="fa-solid fa-${muted ? 'volume-xmark' : 'volume-high'}"></i>`;
}

function applyStorySoundPreference(video) {
  if (!(video instanceof HTMLVideoElement)) return;
  if (video.dataset.storyAudioFallback === 'true' && !state.storySoundMuted) return;
  video.defaultMuted = false;
  video.muted = Boolean(state.storySoundMuted);
  if (!video.muted && video.volume === 0) video.volume = 1;
}

function playStoryVideo(video, modal, { allowMutedFallback = true } = {}) {
  if (!(video instanceof HTMLVideoElement)) return Promise.resolve();
  applyStorySoundPreference(video);
  updateStorySoundControl(modal, video);
  const playPromise = video.play?.();
  if (!playPromise?.catch) return Promise.resolve();
  return playPromise.catch((err) => {
    if (!video.muted && allowMutedFallback) {
      video.muted = true;
      video.dataset.storyAudioFallback = 'true';
      updateStorySoundControl(modal, video);
      const mutedPlay = video.play?.();
      if (mutedPlay?.catch) {
        mutedPlay.catch((mutedErr) => {
          console.warn('[MSY][feed-social] Video do story nao iniciou mudo:', mutedErr);
        });
      }
      return;
    }
    console.warn('[MSY][feed-social] Video do story nao iniciou:', err);
  });
}

function bindStorySoundControl(modal) {
  const video = modal.querySelector('.story-media video');
  const btn = modal.querySelector('[data-story-sound-toggle]');
  if (!(video instanceof HTMLVideoElement) || !btn) return;
  applyStorySoundPreference(video);
  updateStorySoundControl(modal, video);
  video.addEventListener('volumechange', () => updateStorySoundControl(modal, video));
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    delete video.dataset.storyAudioFallback;
    state.storySoundMuted = !video.muted;
    video.muted = state.storySoundMuted;
    if (!video.muted && video.volume === 0) video.volume = 1;
    updateStorySoundControl(modal, video);
    playStoryVideo(video, modal, { allowMutedFallback: false });
  });
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
    playStoryVideo(media, modal);
    return;
  }
  media.addEventListener('load', ready, { once: true });
  media.addEventListener('loadeddata', () => {
    ready();
    playStoryVideo(media, modal);
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
  clearStoryTimer(modal);
  delete modal.dataset.storyActivityOpen;
  modal.innerHTML = `
    <div class="story-panel story-panel-instagram">
      ${renderStoryProgress(group, storyIndex)}
      <button type="button" class="story-tap-zone story-tap-prev" data-story-prev aria-label="Story anterior"></button>
      <button type="button" class="story-tap-zone story-tap-next" data-story-next aria-label="Proximo story"></button>
      <div class="story-media story-media-premium is-loading">
        <div class="story-media-loader"><i class="fa-solid fa-circle-notch fa-spin"></i></div>
        ${renderStoryMediaElement(story, story.media_type === 'video' ? 'preload="auto"' : 'decoding="async" fetchpriority="high"')}
      </div>
      <div class="story-top story-top-instagram">
        <div class="story-top-identity">
          ${avatar(group.author, 38)}
          <div class="story-author-copy">
            <strong>${Utils.escapeHtml(displayUsername(group.author || {}))}</strong>
            <span>${timeAgo(story.created_at)}</span>
          </div>
          ${renderContentBadge('story')}
        </div>
        <div class="story-top-actions">
          ${story.media_type === 'video' ? '<button type="button" class="story-sound-toggle" data-story-sound-toggle aria-label="Ativar som do story"><i class="fa-solid fa-volume-high"></i></button>' : ''}
          ${canViewReactions ? '<button class="story-social-icon story-activity-icon" data-toggle-story-reactions title="Atividade do story" aria-label="Curtidas e visualizacoes do story"><i class="fa-regular fa-eye"></i><span id="storyReactionsCount"></span></button>' : ''}
          ${canManageStory(story) ? `<button class="social-icon-btn story-close" data-edit-story="${story.id}" title="Editar story"><i class="fa-solid fa-pen"></i></button><button class="social-icon-btn story-close" data-delete-story="${story.id}" title="Excluir story"><i class="fa-solid fa-trash"></i></button>` : ''}
          <button class="social-icon-btn story-close" data-close-modal><i class="fa-solid fa-xmark"></i></button>
        </div>
      </div>
      ${story.caption ? `<div class="story-caption story-caption-instagram">${richText(story.caption)}</div>` : ''}
      <div class="story-bottom story-bottom-instagram">
        <form class="story-inline-reply" id="storyInlineReply">
          <input id="storyReplyInput" maxlength="180" autocomplete="off" inputmode="text" enterkeyhint="send" placeholder="Enviar mensagem...">
          <button type="submit" class="story-inline-send" aria-label="Enviar resposta"><i class="fa-regular fa-paper-plane"></i></button>
        </form>
        <button class="story-social-icon" data-story-reaction="heart" title="Curtir story"><i class="fa-regular fa-heart"></i><span></span></button>
      </div>
      ${canViewReactions ? `<div class="story-reactions-panel" id="storyReactionsPanel" aria-hidden="true">
        <div class="story-activity-head">
          <div>
            <strong>Atividade</strong>
            <span>Curtidas e visualizacoes</span>
          </div>
          <button type="button" class="story-activity-close" data-close-story-activity aria-label="Fechar atividade"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div id="storyReactionsContent" class="message-sub">Carregando...</div>
      </div>` : ''}
    </div>`;

  openModal(modal);
  bindStoryViewport(modal);
  bindStorySoundControl(modal);
  mediaReady.finally(() => markStoryMediaReady(modal));
  markStoryMediaReady(modal);

  const go = (direction) => {
    if (isStoryReplyInteractionLocked(modal)) return false;
    return advanceStoryOrClose(groupIndex, storyIndex, direction, openStoryPremium);
  };
  modal.querySelector('[data-story-prev]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (shouldSuppressStoryTap(modal)) return;
    go(-1);
  });
  modal.querySelector('[data-story-next]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (shouldSuppressStoryTap(modal)) return;
    go(1);
  });
  modal.querySelector('[data-story-focus-reply]')?.addEventListener('click', () => modal.querySelector('#storyReplyInput')?.focus({ preventScroll: true }));
  modal.querySelector('[data-share-story]')?.addEventListener('click', () => modal.querySelector('#storyReplyInput')?.focus({ preventScroll: true }));
  modal.querySelector('[data-story-reaction]')?.addEventListener('click', async (e) => {
    stopStoryInteractiveEvent(e);
    await toggleStoryReaction(story, 'heart', e.currentTarget, canViewReactions);
  });
  modal.querySelectorAll('[data-close-modal]').forEach((btn) => btn.addEventListener('click', (e) => {
    stopStoryInteractiveEvent(e);
    closeSocialModals();
  }));
  modal.querySelector('#storyInlineReply')?.addEventListener('submit', async (e) => {
    stopStoryInteractiveEvent(e);
    e.preventDefault();
    if (modal.dataset.storyReplySending === 'true') return;
    const input = modal.querySelector('#storyReplyInput');
    const button = modal.querySelector('.story-inline-send');
    const text = input?.value.trim();
    if (!text) return;
    try {
      modal.dataset.storyReplySending = 'true';
      if (input) input.disabled = true;
      Utils.setButtonLoading?.(button, true, '<i class="fa-solid fa-circle-notch fa-spin"></i>');
      const targetUserId = group?.author?.id;
      if (!targetUserId) throw new Error('Nao foi possivel identificar o autor do story.');
      const conversationId = await state.service.ensureDirectConversation(targetUserId);
      await state.service.sendStoryReplyDirect(conversationId, {
        ...story,
        author: group.author,
      }, text);
      input.value = '';
      input.blur();
      Utils.showToast('Resposta enviada no Direct.');
    } catch (err) {
      console.error('[MSY Feed Error]', err);
      Utils.showToast(err.message || 'Erro ao responder story.', 'error');
    } finally {
      modal.dataset.storyReplySettledAt = String(Date.now());
      delete modal.dataset.storyReplySending;
      if (input) input.disabled = false;
      Utils.setButtonLoading?.(button, false);
    }
  });
  modal.querySelector('[data-toggle-story-reactions]')?.addEventListener('click', (e) => {
    stopStoryInteractiveEvent(e);
    toggleStoryActivityPanel(modal);
  });
  modal.querySelector('[data-close-story-activity]')?.addEventListener('click', (e) => {
    stopStoryInteractiveEvent(e);
    closeStoryActivityPanel(modal);
  });
  modal.querySelector('[data-delete-story]')?.addEventListener('click', (e) => {
    stopStoryInteractiveEvent(e);
    deleteStory(story.id);
  });
  modal.querySelector('[data-edit-story]')?.addEventListener('click', (e) => {
    stopStoryInteractiveEvent(e);
    openStoryEditor(story.id);
  });
  bindStoryInteractiveGuards(modal);
  bindStoryGestures(modal, go);
  startStoryProgress(modal, groupIndex, storyIndex, story, go);
  hydrateStoryMeta(story.id, canViewReactions);
}

function openStoryActivityPanel(modal = document.getElementById('storyViewer')) {
  const panel = modal?.querySelector('#storyReactionsPanel');
  if (!modal || !panel) return;
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  modal.dataset.storyActivityOpen = 'true';
  pauseStoryPlayback(modal);
}

function closeStoryActivityPanel(modal = document.getElementById('storyViewer')) {
  const panel = modal?.querySelector('#storyReactionsPanel');
  if (!modal || !panel) return;
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  delete modal.dataset.storyActivityOpen;
  resumeStoryPlayback(modal);
}

function toggleStoryActivityPanel(modal = document.getElementById('storyViewer')) {
  const panel = modal?.querySelector('#storyReactionsPanel');
  if (!panel) return;
  if (panel.classList.contains('open')) closeStoryActivityPanel(modal);
  else openStoryActivityPanel(modal);
}

function pauseStoryPlayback(modal) {
  const bar = modal.querySelector('.story-progress-stack .active i, .story-progress span');
  const video = modal.querySelector('.story-media video');
  if (bar) bar.style.animationPlayState = 'paused';
  if (video instanceof HTMLVideoElement) video.pause();
  modal.dataset.storyPaused = 'true';
}

function resumeStoryPlayback(modal) {
  if (modal?.dataset.storyActivityOpen === 'true') return;
  const bar = modal.querySelector('.story-progress-stack .active i, .story-progress span');
  const video = modal.querySelector('.story-media video');
  if (bar) bar.style.animationPlayState = 'running';
  if (video instanceof HTMLVideoElement) playStoryVideo(video, modal).catch(() => {});
  modal.dataset.storyTickAt = String(Date.now());
  delete modal.dataset.storyPaused;
}

function stopStoryInteractiveEvent(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
}

function isStoryReplyInteractionLocked(modal = document.getElementById('storyViewer')) {
  const settledAt = Number(modal?.dataset.storyReplySettledAt || 0);
  return modal?.dataset.storyReplySending === 'true' || (settledAt && Date.now() - settledAt < 450);
}

function isStoryInteractiveTarget(target) {
  if (target?.closest?.('.story-tap-zone')) return false;
  return Boolean(target?.closest?.([
    '.story-inline-reply',
    '.story-inline-send',
    '.story-social-icon',
    '.story-sound-toggle',
    '.story-close',
    '.story-reactions-panel',
    '.story-activity-close',
    '[data-toggle-story-reactions]',
    '[data-close-story-activity]',
    '[data-edit-story]',
    '[data-delete-story]',
    '[data-close-modal]',
    'input',
    'textarea',
    'select',
    'button',
  ].join(',')));
}

function shouldSuppressStoryTap(modal = document.getElementById('storyViewer')) {
  return Number(modal?.dataset.storySuppressTapUntil || 0) > Date.now();
}

async function toggleStoryReaction(story, reaction, button, canViewReactions = false) {
  const wasActive = button?.classList.contains('active');
  button?.classList.toggle('active', !wasActive);
  const icon = button?.querySelector('i');
  if (icon && reaction === 'heart') {
    icon.classList.toggle('fa-solid', !wasActive);
    icon.classList.toggle('fa-regular', wasActive);
  }
  try {
    if (wasActive) {
      await state.service.removeStoryReaction(story.id);
    } else {
      await state.service.reactToStory(story, reaction);
    }
    hydrateStoryMeta(story.id, canViewReactions);
  } catch (err) {
    button?.classList.toggle('active', wasActive);
    if (icon && reaction === 'heart') {
      icon.classList.toggle('fa-solid', wasActive);
      icon.classList.toggle('fa-regular', !wasActive);
    }
    console.error('[MSY][feed-social] Erro ao alternar reacao do story:', err);
    Utils.showToast(err.message || 'Erro ao atualizar curtida.', 'error');
  }
}

function bindStoryInteractiveGuards(modal) {
  const selectors = [
    '.story-inline-reply',
    '.story-inline-reply input',
    '.story-inline-send',
    '.story-social-icon',
    '.story-sound-toggle',
    '.story-close',
    '.story-reactions-panel',
  ].join(',');
  modal.querySelectorAll(selectors).forEach((node) => {
    ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click'].forEach((eventName) => {
      node.addEventListener(eventName, (event) => {
        event.stopPropagation();
      }, { passive: true });
    });
  });
}

function clearStoryTimer(modal = document.getElementById('storyViewer')) {
  if (!modal) return;
  if (modal.dataset.storyTimer) clearInterval(Number(modal.dataset.storyTimer));
  delete modal.dataset.storyTimer;
  delete modal.dataset.storyPaused;
  delete modal.dataset.storySuppressTapUntil;
  delete modal.dataset.storyTickAt;
}

function advanceStoryOrClose(groupIndex, storyIndex, direction = 1, opener = openStoryPremium) {
  const next = getNextStoryCursor(groupIndex, storyIndex, direction);
  if (next) {
    clearStoryTimer();
    opener(next.groupIndex, next.storyIndex);
    return true;
  }
  if (direction > 0) {
    clearStoryTimer();
    closeSocialModals();
    return true;
  }
  return false;
}

function bindStoryGestures(modal, go) {
  let startX = 0;
  let startY = 0;
  let startAt = 0;
  let startedOnStorySurface = false;
  const panel = modal.querySelector('.story-panel');
  if (!panel) return;
  const startHold = (event) => {
    if (isStoryReplyInteractionLocked(modal) || isStoryInteractiveTarget(event.target)) return;
    const point = event.touches?.[0] || event;
    startX = point?.clientX || 0;
    startY = point?.clientY || 0;
    startAt = Date.now();
    startedOnStorySurface = true;
    pauseStoryPlayback(modal);
  };
  const endHold = (event) => {
    if (!startedOnStorySurface || isStoryReplyInteractionLocked(modal) || isStoryInteractiveTarget(event.target)) return;
    startedOnStorySurface = false;
    const point = event.changedTouches?.[0] || event;
    const dx = (point?.clientX || 0) - startX;
    const dy = (point?.clientY || 0) - startY;
    const heldFor = Date.now() - startAt;
    resumeStoryPlayback(modal);
    if (heldFor > 260 && Math.abs(dx) < 18 && Math.abs(dy) < 18) {
      modal.dataset.storySuppressTapUntil = String(Date.now() + 420);
      return;
    }
    if (Math.abs(dx) > 54 && Math.abs(dx) > Math.abs(dy) * 1.4) go(dx < 0 ? 1 : -1);
    else if (dy > 76 && Math.abs(dy) > Math.abs(dx) * 1.2) closeSocialModals();
  };
  panel.addEventListener('touchstart', startHold, { passive: true });
  panel.addEventListener('touchend', endHold, { passive: true });
  panel.addEventListener('pointerdown', startHold, { passive: true });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((eventName) => panel.addEventListener(eventName, (event) => {
    if (modal.dataset.storyPaused !== 'true') return;
    endHold(event);
  }, { passive: true }));
}

function bindStoryViewport(modal) {
  if (!modal || modal.dataset.storyViewportBound === 'true') return;
  if (typeof state.storyViewportCleanup === 'function') state.storyViewportCleanup();
  modal.dataset.storyViewportBound = 'true';

  const sync = () => {
    const viewport = window.visualViewport;
    const height = viewport?.height || window.innerHeight;
    const keyboard = Math.max(0, window.innerHeight - height - (viewport?.offsetTop || 0));
    modal.style.setProperty('--story-vh', `${Math.round(height)}px`);
    modal.style.setProperty('--story-keyboard', `${Math.round(keyboard)}px`);
    modal.classList.toggle('story-keyboard-open', keyboard > 80);
    modal.scrollTop = 0;
  };

  const settle = () => {
    sync();
    window.scrollTo({ top: state.modalScrollY, left: 0, behavior: 'auto' });
    modal.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    modal.querySelector('.story-panel')?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  };

  const onFocusIn = (event) => {
    if (!event.target.closest('#storyViewer input,#storyViewer textarea')) return;
    pauseStoryPlayback(modal);
    sync();
  };

  const onFocusOut = (event) => {
    if (!event.target.closest('#storyViewer input,#storyViewer textarea')) return;
    setTimeout(settle, 80);
    setTimeout(settle, 280);
    resumeStoryPlayback(modal);
  };

  sync();
  window.visualViewport?.addEventListener('resize', sync, { passive: true });
  window.visualViewport?.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync, { passive: true });
  modal.addEventListener('focusin', onFocusIn);
  modal.addEventListener('focusout', onFocusOut);

  state.storyViewportCleanup = () => {
    window.visualViewport?.removeEventListener('resize', sync);
    window.visualViewport?.removeEventListener('scroll', sync);
    window.removeEventListener('resize', sync);
    modal.removeEventListener('focusin', onFocusIn);
    modal.removeEventListener('focusout', onFocusOut);
    modal.classList.remove('story-keyboard-open');
    modal.style.removeProperty('--story-vh');
    modal.style.removeProperty('--story-keyboard');
    delete modal.dataset.storyViewportBound;
  };
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
  clearStoryTimer(modal);
  modal.innerHTML = `
    <div class="story-panel story-panel-stable">
      <div class="story-progress"><span></span></div>
      <button type="button" class="story-tap-zone story-tap-prev" data-story-prev aria-label="Story anterior"></button>
      <button type="button" class="story-tap-zone story-tap-next" data-story-next aria-label="Proximo story"></button>
      <div class="story-media">${renderStoryMediaElement(story, story.media_type === 'video' ? 'controls preload="auto"' : 'decoding="async" fetchpriority="high"')}</div>
      <div class="story-top">
        ${avatar(group.author, 34)}
        <div class="story-author-copy"><strong>${Utils.escapeHtml(group.author?.name || 'Membro')}</strong><span>@${Utils.escapeHtml(displayUsername(group.author || {}))} · ${timeAgo(story.created_at)}</span></div>
        ${canManageStory(story) ? `<button class="social-icon-btn story-close" data-edit-story="${story.id}" title="Editar story"><i class="fa-solid fa-pen"></i></button><button class="social-icon-btn story-close" data-delete-story="${story.id}" title="Excluir story"><i class="fa-solid fa-trash"></i></button>` : ''}
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
  bindStoryViewport(modal);
  requestAnimationFrame(() => {
    modal.scrollTop = 0;
    modal.querySelector('.story-panel')?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  });
  modal.querySelectorAll('[data-story-reaction]').forEach((btn) => btn.addEventListener('click', async (e) => {
    stopStoryInteractiveEvent(e);
    await toggleStoryReaction(story, btn.dataset.storyReaction, btn, canViewReactions);
  }));
  modal.querySelectorAll('[data-close-modal]').forEach((btn) => btn.addEventListener('click', (e) => {
    stopStoryInteractiveEvent(e);
    closeSocialModals();
  }));
  modal.querySelectorAll('[data-story-prev]').forEach((node) => node.addEventListener('click', (e) => {
    e.stopPropagation();
    if (shouldSuppressStoryTap(modal)) return;
    if (storyIndex > 0) openStoryFast(groupIndex, storyIndex - 1);
    else if (groupIndex > 0) {
      const prevGroup = state.stories[groupIndex - 1];
      openStoryFast(groupIndex - 1, prevGroup.stories.length - 1);
    }
  }));
  modal.querySelectorAll('[data-story-next]').forEach((node) => node.addEventListener('click', (e) => {
    e.stopPropagation();
    if (shouldSuppressStoryTap(modal)) return;
    advanceStoryOrClose(groupIndex, storyIndex, 1, openStoryFast);
  }));
  modal.querySelector('[data-story-reply]')?.addEventListener('click', (e) => {
    stopStoryInteractiveEvent(e);
    const composer = document.getElementById('storyReplyComposer');
    if (composer) composer.style.display = 'block';
    composer?.querySelector('#storyReplyInput')?.focus({ preventScroll: true });
  });
  modal.querySelector('[data-close-story-reply]')?.addEventListener('click', (e) => {
    stopStoryInteractiveEvent(e);
    const composer = document.getElementById('storyReplyComposer');
    if (composer) composer.style.display = 'none';
  });
  modal.querySelector('[data-send-story-reply]')?.addEventListener('click', async (e) => {
    stopStoryInteractiveEvent(e);
    const input = document.getElementById('storyReplyInput');
    const text = input?.value.trim();
    if (!text) return;
    try {
      const targetUserId = group?.author?.id;
      if (!targetUserId) throw new Error('Nao foi possivel identificar o autor do story.');
      const conversationId = await state.service.ensureDirectConversation(targetUserId);
      await state.service.sendStoryReplyDirect(conversationId, {
        ...story,
        author: group.author,
      }, text);
      input.value = '';
      input.blur();
      const composer = document.getElementById('storyReplyComposer');
      if (composer) composer.style.display = 'none';
      Utils.showToast('Resposta enviada no Direct.');
    } catch (err) {
      console.error('[MSY Feed Error]', err);
      Utils.showToast(err.message || 'Erro ao responder story.', 'error');
    }
  });
  modal.querySelector('[data-toggle-story-reactions]')?.addEventListener('click', (e) => {
    stopStoryInteractiveEvent(e);
    document.getElementById('storyReactionsPanel')?.classList.toggle('open');
  });
  modal.querySelector('[data-delete-story]')?.addEventListener('click', (e) => {
    stopStoryInteractiveEvent(e);
    deleteStory(story.id);
  });
  modal.querySelector('[data-edit-story]')?.addEventListener('click', (e) => {
    stopStoryInteractiveEvent(e);
    openStoryEditor(story.id);
  });
  bindStoryInteractiveGuards(modal);
  bindStoryGestures(modal, (direction) => {
    advanceStoryOrClose(groupIndex, storyIndex, direction, openStoryFast);
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
      playStoryVideo(video, modal);
    };
    if (video.readyState >= 1) syncVideoProgress();
    else video.addEventListener('loadedmetadata', syncVideoProgress, { once: true });
    video.addEventListener('ended', () => {
      if (!modal.classList.contains('open')) return;
      if (go) go(1);
      else advanceStoryOrClose(groupIndex, storyIndex, 1, openStoryFast);
    }, { once: true });
  }
  if (story.media_type !== 'image') return;
  let elapsed = 0;
  const tickAt = Date.now();
  const timer = setInterval(() => {
    if (!modal.classList.contains('open')) {
      clearInterval(timer);
      return;
    }
    if (modal.dataset.storyPaused === 'true') return;
    elapsed += Date.now() - (Number(modal.dataset.storyTickAt || tickAt));
    modal.dataset.storyTickAt = String(Date.now());
    if (elapsed < 6000) return;
    clearInterval(timer);
    if (go) return go(1);
    advanceStoryOrClose(groupIndex, storyIndex, 1, openStoryFast);
  }, 180);
  modal.dataset.storyTickAt = String(tickAt);
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
  const myReaction = reactions.find((row) => row.user?.id === state.profile?.id)?.reaction || null;
  modal.querySelectorAll('[data-story-reaction]').forEach((btn) => {
    const isMine = Boolean(myReaction && btn.dataset.storyReaction === myReaction);
    btn.classList.toggle('active', isMine);
    const icon = btn.querySelector('i');
    if (icon && btn.dataset.storyReaction === 'heart') {
      icon.classList.toggle('fa-solid', isMine);
      icon.classList.toggle('fa-regular', !isMine);
    }
    const span = btn.querySelector('span');
    if (span) span.textContent = reactionSummary[btn.dataset.storyReaction] || '';
  });
  if (!canViewReactions) return;
  try {
    views = await state.service.loadStoryViews(storyId);
  } catch (err) {
    console.warn('[MSY][feed-social] Views do story indisponiveis:', err);
  }
  const likes = reactions.filter((row) => row.reaction === 'heart' || row.reaction === '❤️');
  const counter = document.getElementById('storyReactionsCount');
  if (counter) counter.textContent = `${likes.length} curtida${likes.length === 1 ? '' : 's'} · ${views.length} view${views.length === 1 ? '' : 's'}`;
  const content = document.getElementById('storyReactionsContent');
  if (!content) return;
  content.innerHTML = `
    <div class="story-activity-tabs" role="tablist" aria-label="Atividade do story">
      <button type="button" class="active" data-story-activity-tab="likes"><i class="fa-solid fa-heart"></i><span>${likes.length}</span> Curtidas</button>
      <button type="button" data-story-activity-tab="views"><i class="fa-regular fa-eye"></i><span>${views.length}</span> Visualizacoes</button>
    </div>
    <div class="story-activity-pane active" data-story-activity-pane="likes">
      <div class="story-reactions-summary">${likes.length ? `<span>${likes.length} curtida${likes.length === 1 ? '' : 's'}</span>` : '<span>Nenhuma curtida ainda</span>'}</div>
      ${likes.length ? likes.map((r) => `
        <div class="story-reaction-row">
          ${avatar(r.user || {}, 34)}
          <div><strong>${Utils.escapeHtml(r.user?.name || 'Membro')}</strong><span>${timeAgo(r.created_at)}</span></div>
          <em><i class="fa-solid fa-heart"></i></em>
        </div>`).join('') : '<div class="message-sub">Ninguem curtiu este story ainda.</div>'}
    </div>
    <div class="story-activity-pane" data-story-activity-pane="views">
      <div class="story-reactions-summary">${views.length ? `<span>${views.length} visualizacao${views.length === 1 ? '' : 'es'}</span>` : '<span>Nenhuma visualizacao ainda</span>'}</div>
      ${views.length ? views.map((view) => `
      <div class="story-reaction-row">
        ${avatar(view.user || {}, 34)}
        <div><strong>${Utils.escapeHtml(view.user?.name || 'Membro')}</strong><span>${timeAgo(view.viewed_at)}</span></div>
        <em><i class="fa-regular fa-eye"></i></em>
      </div>`).join('') : '<div class="message-sub">Ninguem viu este story ainda.</div>'}
    </div>`;
  content.querySelectorAll('[data-story-activity-tab]').forEach((tab) => tab.addEventListener('click', () => {
    const target = tab.dataset.storyActivityTab;
    content.querySelectorAll('[data-story-activity-tab]').forEach((node) => node.classList.toggle('active', node === tab));
    content.querySelectorAll('[data-story-activity-pane]').forEach((pane) => pane.classList.toggle('active', pane.dataset.storyActivityPane === target));
  }));
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
      <div class="story-media">${renderStoryMediaElement(story, story.media_type === 'video' ? 'autoplay controls' : '')}</div>
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
  bindStoryViewport(modal);
  requestAnimationFrame(() => {
    modal.scrollTop = 0;
    const panel = modal.querySelector('.story-panel');
    const media = modal.querySelector('.story-media');
    if (panel) panel.scrollTop = 0;
    if (media) media.scrollLeft = 0;
  });
  modal.querySelectorAll('[data-story-reaction]').forEach((btn) => btn.addEventListener('click', async (e) => {
    stopStoryInteractiveEvent(e);
    await toggleStoryReaction(story, btn.dataset.storyReaction, btn, canViewReactions);
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
    advanceStoryOrClose(groupIndex, storyIndex, 1, openStory);
  });
  modal.querySelector('[data-story-reply]')?.addEventListener('click', (e) => {
    stopStoryInteractiveEvent(e);
    const composer = document.getElementById('storyReplyComposer');
    composer?.style && (composer.style.display = 'block');
    composer?.querySelector('#storyReplyInput')?.focus({ preventScroll: true });
  });
  modal.querySelector('[data-close-story-reply]')?.addEventListener('click', (e) => {
    stopStoryInteractiveEvent(e);
    const composer = document.getElementById('storyReplyComposer');
    if (composer) composer.style.display = 'none';
  });
  modal.querySelector('[data-send-story-reply]')?.addEventListener('click', async (e) => {
    stopStoryInteractiveEvent(e);
    const input = document.getElementById('storyReplyInput');
    const text = input?.value.trim();
    if (!text) return;
    try {
      const targetUserId = group?.author?.id;
      if (!targetUserId) throw new Error('Não foi possível identificar o autor do story.');
      const conversationId = await state.service.ensureDirectConversation(targetUserId);
      await state.service.sendStoryReplyDirect(conversationId, {
        ...story,
        author: group.author,
      }, text);
      input.value = '';
      input.blur();
      const composer = document.getElementById('storyReplyComposer');
      if (composer) composer.style.display = 'none';
      Utils.showToast('Resposta enviada no Direct.');
    } catch (err) {
      console.error('[MSY Feed Error]', err);
      Utils.showToast(err.message || 'Erro ao responder story.', 'error');
    }
  });
  modal.querySelector('[data-toggle-story-reactions]')?.addEventListener('click', (e) => {
    stopStoryInteractiveEvent(e);
    document.getElementById('storyReactionsPanel')?.classList.toggle('open');
  });
  modal.querySelector('[data-delete-story]')?.addEventListener('click', (e) => {
    stopStoryInteractiveEvent(e);
    deleteStory(story.id);
  });
  bindStoryInteractiveGuards(modal);
}

async function deleteStory(storyId) {
  const story = findStoryById(storyId);
  if (!story || !canManageStory(story)) return Utils.showToast('Sem permissao para excluir este story.', 'error');
  const modal = document.getElementById('storyViewer');
  const wasViewerOpen = modal?.classList.contains('open');
  const deletedCursor = findStoryCursorById(storyId);
  const deletedFlatIndex = deletedCursor ? getStoryPosition(deletedCursor.groupIndex, deletedCursor.storyIndex) : -1;
  if (wasViewerOpen) pauseStoryPlayback(modal);
  const confirmed = await MSYConfirm.show('Excluir este story?', { title: 'Excluir story', type: 'danger', confirmText: 'Excluir' });
  if (!confirmed) {
    if (wasViewerOpen) resumeStoryPlayback(modal);
    return;
  }
  try {
    const paths = await state.service.deleteStory(storyId);
    if (paths.length) {
      await removeSocialMedia(db, paths).catch((err) => console.warn('[MSY][feed-social] Story excluido, mas storage manteve midias:', err));
    }
    state.stories = await state.service.loadStories();
    renderStories();
    if (wasViewerOpen) {
      const nextCursor = deletedFlatIndex >= 0
        ? (getStoryByFlatIndex(deletedFlatIndex) || getStoryByFlatIndex(deletedFlatIndex - 1))
        : null;
      if (nextCursor) openStory(nextCursor.groupIndex, nextCursor.storyIndex);
      else closeSocialModals();
    }
    Utils.showToast('Story excluido.');
  } catch (err) {
    if (wasViewerOpen) resumeStoryPlayback(modal);
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

async function openStoryEditor(storyId) {
  const story = findStoryById(storyId);
  if (!story || !canManageStory(story)) return Utils.showToast('Sem permissao para editar este story.', 'error');
  state.activeStoryEditId = storyId;
  state.storyEditPreview = {
    id: story.id,
    file: null,
    url: story.media_url,
    storage_path: story.storage_path,
    thumbnail_url: story.thumbnail_url || story.media_url,
    media_type: story.media_type,
    isNew: false,
    caption: story.caption || '',
    editState: story.media_type === 'video'
      ? {
        ...createStoryMediaEditState(new File([], 'story.mp4', { type: 'video/mp4' })),
        ...story.media_meta,
        exportSupported: supportsVideoEditing(),
      }
      : {
        ...createStoryMediaEditState(new File([], 'story.webp', { type: 'image/webp' })),
        ...story.media_meta,
      },
  };
  state.storyPreviews = [state.storyEditPreview];
  state.activeStoryComposerIndex = 0;
  await hydrateStoryComposerVideoMetadata();
  renderStoryComposerBody();
}

async function saveStoryEditor() {
  const story = findStoryById(state.activeStoryEditId);
  const item = activeStoryComposerItem();
  if (!story || !item) return;
  const btn = document.getElementById('publishStoryBtn');
  const cleanupPaths = [];
  try {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Salvando...';
    }
    let media = null;
    let options = {
      media_meta: item.editState || {},
      thumbnail: item.thumbnail_url ? { url: item.thumbnail_url } : null,
    };
    if (item.isNew && item.file) {
      const payload = await buildStoryUploadPayload(item);
      media = payload.media;
      options = { ...payload.options, thumbnail: payload.options.thumbnail_url ? { url: payload.options.thumbnail_url } : null };
      if (media.storage_path) cleanupPaths.push(media.storage_path);
    }
    const updated = await state.service.updateStory(story.id, {
      caption: item.caption || '',
      elements: story.elements || [],
      media,
      media_meta: options.media_meta || item.editState || {},
      thumbnail: options.thumbnail || null,
    });
    if (media && story.storage_path && story.storage_path !== media.storage_path) {
      const oldPaths = [story.storage_path, story.thumbnail_storage_path].filter(Boolean);
      await removeSocialMedia(db, oldPaths).catch((err) => console.warn('[MSY][feed-social] Story atualizado, mas storage manteve mídia antiga:', err));
    }
    patchStoryInState(story.id, {
      caption: updated.caption,
      elements: updated.elements || story.elements || [],
      media_url: updated.media_url,
      media_type: updated.media_type,
      storage_path: updated.storage_path,
      thumbnail_url: updated.thumbnail_url || item.thumbnail_url,
      thumbnail_storage_path: updated.thumbnail_storage_path || null,
      media_meta: updated.media_meta || item.editState || {},
      edited_at: updated.edited_at,
      updated_at: updated.updated_at,
    });
    revokePreviews(state.storyPreviews.filter((preview) => preview.isNew));
    state.storyPreviews = [];
    state.activeStoryComposerIndex = 0;
    state.activeStoryEditId = null;
    state.storyEditPreview = null;
    closeSocialModals();
    renderStories();
    const cursor = state.storyCursor;
    if (cursor) {
      state.stories = await state.service.loadStories();
      renderStories();
      openStory(cursor.groupIndex, cursor.storyIndex);
    }
    Utils.showToast('Story atualizado.');
  } catch (err) {
    console.error('[MSY][feed-social] Erro ao editar story:', err);
    if (cleanupPaths.length) {
      await removeSocialMedia(db, cleanupPaths).catch((cleanupErr) => {
        console.warn('[MSY][feed-social] Rollback parcial do upload do story editado falhou:', cleanupErr);
      });
    }
    Utils.showToast(err.message || 'Erro ao editar story.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-circle-plus"></i> Salvar story';
    }
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

function findStoryCursorById(storyId) {
  for (let groupIndex = 0; groupIndex < state.stories.length; groupIndex += 1) {
    const storyIndex = state.stories[groupIndex]?.stories?.findIndex((item) => item.id === storyId) ?? -1;
    if (storyIndex >= 0) return { groupIndex, storyIndex };
  }
  return null;
}

function resolveStoryReplyState(message) {
  const attachment = message.attachment || {};
  const storyId = attachment.story_id || message.metadata?.story_id || null;
  const cursor = storyId ? findStoryCursorById(storyId) : null;
  const story = cursor ? state.stories[cursor.groupIndex]?.stories?.[cursor.storyIndex] : null;
  return {
    available: Boolean(story && cursor),
    cursor,
    story,
    storyId,
    attachment,
  };
}

function renderDirectMessageAttachment(message) {
  if (message.attachment?.kind === 'deleted' || message.deleted_at) {
    return '<div class="direct-message-deleted">Mensagem apagada</div>';
  }
  if (message.attachment?.kind === 'media') {
    return `<div class="direct-message-media">${message.attachment.media_type === 'video' ? `<video src="${Utils.escapeHtml(message.attachment.url)}" controls playsinline></video>` : `<img src="${Utils.escapeHtml(message.attachment.url)}" alt="Anexo do Direct">`}</div>`;
  }
  if (message.attachment?.kind === 'post_share') {
    const attachment = message.attachment || {};
    const post = state.posts.find((item) => item.id === attachment.post_id);
    const authorName = post?.author?.name || attachment.post_author_name || 'Membro MSY';
    const username = post?.author ? displayUsername(post.author) : (attachment.post_author_username || 'membro');
    const excerpt = post?.content || attachment.content_excerpt || 'Abrir publicacao compartilhada';
    const firstMedia = post?.media?.[0] || null;
    const mediaUrl = firstMedia?.url || attachment.media_url || '';
    const mediaType = firstMedia?.media_type || attachment.media_type || 'image';
    const thumb = mediaUrl
      ? (mediaType === 'video'
        ? `<video src="${Utils.escapeHtml(mediaUrl)}" muted playsinline preload="metadata"></video><i class="fa-solid fa-play"></i>`
        : `<img src="${Utils.escapeHtml(mediaUrl)}" alt="Preview da publicacao" loading="lazy" decoding="async">`)
      : '<i class="fa-regular fa-newspaper"></i>';
    return `
      <button type="button" class="direct-post-share-card" data-open-post-reference="${Utils.escapeHtml(attachment.post_id || '')}" data-post-url="${Utils.escapeHtml(attachment.url || '')}">
        <div class="direct-post-share-thumb">${thumb}</div>
        <div class="direct-post-share-copy">
          <strong>${Utils.escapeHtml(authorName)}</strong>
          <span>@${Utils.escapeHtml(username)}</span>
          <p>${Utils.escapeHtml(excerpt.slice(0, 180))}</p>
        </div>
      </button>`;
  }
  if (message.attachment?.kind === 'story_reply') {
    const reply = resolveStoryReplyState(message);
    const previewUrl = reply.story?.thumbnail_url || reply.story?.media_url || reply.attachment.thumbnail_url || reply.attachment.story_url || reply.attachment.media_url || '';
    const authorName = reply.story?.author?.name || reply.attachment.story_author_name || 'Story';
    const caption = reply.story?.caption || reply.attachment.caption_excerpt || reply.attachment.caption || '';
    const mediaType = reply.story?.media_type || reply.attachment.media_type || 'image';
    const thumb = previewUrl
      ? (mediaType === 'video'
        ? `<video src="${Utils.escapeHtml(previewUrl)}" muted playsinline preload="metadata"></video><i class="fa-solid fa-play"></i>`
        : `<img src="${Utils.escapeHtml(previewUrl)}" alt="Preview do story" loading="lazy" decoding="async">`)
      : '<i class="fa-regular fa-image"></i>';
    return `
      <button type="button" class="direct-story-reply-card${reply.available ? '' : ' unavailable'}" data-open-story-reference="${Utils.escapeHtml(reply.storyId || '')}" ${reply.available ? '' : 'disabled'}>
        <div class="direct-story-reply-thumb">${thumb}</div>
        <div class="direct-story-reply-copy">
          <strong>${Utils.escapeHtml(authorName)}</strong>
          <span>${Utils.escapeHtml(caption || (reply.available ? 'Abrir story original' : 'Story indisponível'))}</span>
          <em>${reply.available ? 'Abrir story' : 'Story indisponível'}</em>
        </div>
      </button>`;
  }
  return '';
}

function renderDirectMessageBubble(message, { mine = false, showDate = false } = {}) {
  const edited = message.edited_at && !message.deleted_at ? '<span class="direct-message-status">editada</span>' : '';
  const deleted = message.deleted_at || message.attachment?.kind === 'deleted';
  const canDeleteForAll = mine && !deleted;
  const canEdit = mine && !deleted && Boolean(message.body);
  const canCopy = Boolean(message.body) && !deleted;
  return `
    ${showDate ? `<div class="direct-date-divider"><span>${Utils.formatDate(message.created_at)}</span></div>` : ''}
    <div class="direct-message-row ${mine ? 'mine' : 'theirs'}" data-direct-message-row="${message.id}">
      <div class="direct-message-bubble${deleted ? ' is-deleted' : ''}" data-direct-message-bubble="${message.id}">
        <button type="button" class="social-icon-btn direct-message-menu-btn" data-open-direct-message-menu="${message.id}" aria-label="Mais opções"><i class="fa-solid fa-ellipsis"></i></button>
        ${renderDirectMessageAttachment(message)}
        ${message.body ? `<div class="direct-message-text">${Utils.escapeHtml(message.body || '')}</div>` : ''}
        <div class="direct-message-meta-line">
          ${edited}
          <div class="direct-message-time">${new Date(message.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
        <div class="post-menu direct-message-menu" data-direct-message-menu="${message.id}">
          ${canEdit ? `<button data-direct-edit="${message.id}"><i class="fa-solid fa-pen"></i> Editar</button>` : ''}
          ${canCopy ? `<button data-direct-copy="${message.id}"><i class="fa-solid fa-copy"></i> Copiar</button>` : ''}
          <button data-direct-delete-me="${message.id}"><i class="fa-solid fa-eye-slash"></i> Apagar para mim</button>
          ${canDeleteForAll ? `<button class="danger" data-direct-delete-all="${message.id}"><i class="fa-solid fa-trash"></i> Apagar para todos</button>` : ''}
        </div>
      </div>
    </div>`;
}

async function openDirectStoryReference(storyId) {
  const cursor = findStoryCursorById(storyId);
  if (!cursor) {
    Utils.showToast('Story indisponível.', 'error');
    return;
  }
  closeSocialModals();
  await openStory(cursor.groupIndex, cursor.storyIndex);
}

function openDirectPostReference(postId, fallbackUrl = '') {
  closeSocialModals();
  const node = postId ? document.getElementById(`post-${postId}`) : null;
  if (node) {
    focusPost(postId);
    return;
  }
  if (fallbackUrl) window.location.href = fallbackUrl;
}

async function handleDirectArchiveConversation(conversationId) {
  if (!conversationId) return;
  try {
    await state.service.setDirectConversationArchived(conversationId, true);
    if (state.activeDirectConversationId === conversationId) {
      state.activeDirectConversationId = null;
      state.directEditingMessageId = null;
      await subscribeDirectConversation(null);
    }
    state.directConversations = state.directConversations.filter((conversation) => conversation.id !== conversationId);
    state.directUnreadCount = state.service.getDirectUnreadCount(state.directConversations);
    renderDirectUnreadBadges();
    closeDirectConversationMenu();
    renderDirectInbox();
    Utils.showToast('Conversa apagada da sua lista.');
  } catch (err) {
    console.error('[MSY][feed-social] Erro ao apagar conversa do direct:', err);
    Utils.showToast(err.message || 'Erro ao apagar conversa.', 'error');
  }
}

async function handleDirectCopy(messageId) {
  const { message } = findDirectMessage(state.activeDirectConversationId, messageId);
  if (!message?.body) return;
  await navigator.clipboard.writeText(message.body);
  Utils.showToast('Mensagem copiada.');
}

async function handleDirectEdit(messageId) {
  const { message } = findDirectMessage(state.activeDirectConversationId, messageId);
  if (!message?.body || message.deleted_at) return;
  const input = document.getElementById('directMessageInput');
  if (!input) return;
  state.directEditingMessageId = messageId;
  input.value = message.body;
  document.querySelector('.direct-composer-send')?.toggleAttribute('disabled', !input.value.trim());
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  Utils.showToast('Editando mensagem.');
}

async function handleDirectDeleteForMe(messageId) {
  await state.service.deleteDirectMessageForMe(messageId);
  removeDirectMessageForViewer(state.activeDirectConversationId, messageId);
  renderDirectInbox();
  Utils.showToast('Mensagem removida para você.');
}

async function handleDirectDeleteForAll(messageId) {
  if (!await MSYConfirm.show('Apagar esta mensagem para todos?', { title: 'Apagar mensagem', type: 'danger', confirmText: 'Apagar' })) return;
  const updated = await state.service.deleteDirectMessageForAll(messageId);
  upsertDirectMessage(updated.conversation_id, updated);
  renderDirectInbox();
  Utils.showToast('Mensagem apagada para todos.');
}

function bindDirectMessageActions(modal) {
  if (!modal) return;
  if (modal.dataset.directActionsBound === 'true') return;
  modal.dataset.directActionsBound = 'true';
  const holdTimers = new Map();
  const openMenu = (messageId) => {
    const menu = modal.querySelector(`[data-direct-message-menu="${messageId}"]`);
    modal.querySelectorAll('.direct-message-menu.open').forEach((node) => { if (node !== menu) node.classList.remove('open'); });
    menu?.classList.toggle('open');
  };
  const stopHold = (messageId) => {
    if (!messageId) return;
    clearTimeout(holdTimers.get(messageId));
    holdTimers.delete(messageId);
  };

  modal.addEventListener('click', async (event) => {
    const menuBtn = event.target.closest('[data-open-direct-message-menu]');
    if (menuBtn) {
      event.stopPropagation();
      openMenu(menuBtn.dataset.openDirectMessageMenu);
      return;
    }
    const storyBtn = event.target.closest('[data-open-story-reference]');
    if (storyBtn) {
      await openDirectStoryReference(storyBtn.dataset.openStoryReference);
      return;
    }
    const postBtn = event.target.closest('[data-open-post-reference]');
    if (postBtn) {
      openDirectPostReference(postBtn.dataset.openPostReference, postBtn.dataset.postUrl || '');
      return;
    }
    const copyBtn = event.target.closest('[data-direct-copy]');
    if (copyBtn) {
      try {
        await handleDirectCopy(copyBtn.dataset.directCopy);
      } catch (err) {
        console.error('[MSY][feed-social] Erro ao copiar mensagem direct:', err);
        Utils.showToast(err.message || 'Erro ao copiar mensagem.', 'error');
      }
      return;
    }
    const editBtn = event.target.closest('[data-direct-edit]');
    if (editBtn) {
      handleDirectEdit(editBtn.dataset.directEdit);
      return;
    }
    const deleteMeBtn = event.target.closest('[data-direct-delete-me]');
    if (deleteMeBtn) {
      try {
        await handleDirectDeleteForMe(deleteMeBtn.dataset.directDeleteMe);
      } catch (err) {
        console.error('[MSY][feed-social] Erro ao apagar mensagem para mim:', err);
        Utils.showToast(err.message || 'Erro ao apagar mensagem.', 'error');
      }
      return;
    }
    const deleteAllBtn = event.target.closest('[data-direct-delete-all]');
    if (deleteAllBtn) {
      try {
        await handleDirectDeleteForAll(deleteAllBtn.dataset.directDeleteAll);
      } catch (err) {
        console.error('[MSY][feed-social] Erro ao apagar mensagem para todos:', err);
        Utils.showToast(err.message || 'Erro ao apagar mensagem para todos.', 'error');
      }
    }
  });

  modal.addEventListener('pointerdown', (event) => {
    const row = event.target.closest('[data-direct-message-row]');
    if (!row || event.target.closest('button,input,textarea,video,a')) return;
    const messageId = row.dataset.directMessageRow;
    clearTimeout(holdTimers.get(messageId));
    holdTimers.set(messageId, setTimeout(() => openMenu(messageId), 420));
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((eventName) => modal.addEventListener(eventName, (event) => {
    stopHold(event.target.closest('[data-direct-message-row]')?.dataset.directMessageRow);
  }));
}

async function subscribeDirectConversation(conversationId) {
  if (!state.hasSocialTables) return;
  if (state.directMessagesChannel) {
    try { await db.removeChannel(state.directMessagesChannel); } catch {}
    state.directMessagesChannel = null;
  }
  if (!conversationId) return;
  try {
    state.directMessagesChannel = db
      .channel(`feed-social-direct-${conversationId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'direct_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, async (payload) => {
        try {
          const messages = await state.service.loadDirectMessages(conversationId);
          const conversation = getActiveDirectConversation();
          if (conversation) {
            conversation.messages = messages;
            conversation.lastMessage = messages.at(-1) || conversation.lastMessage;
            conversation.last_message_at = conversation.lastMessage?.created_at || conversation.last_message_at;
          }
          renderDirectInbox();
        } catch (err) {
          console.warn('[MSY][feed-social] Realtime do direct indisponível:', err);
        }
      })
      .subscribe();
  } catch (err) {
    console.warn('[MSY][feed-social] Falha ao assinar realtime do direct:', err);
  }
}

async function openDirectInbox(targetId = null) {
  if (!state.hasSocialTables) {
    Utils.showToast('Aplique as migrations sociais antes de usar o Direct.', 'error');
    return;
  }
  closeDirectConversationMenu();

  const maybeUuid = typeof targetId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetId)
    ? targetId
    : null;

  try {
    setDirectConversations(await state.service.loadDirectConversations());
    if (!maybeUuid) state.activeDirectConversationId = null;

    if (maybeUuid) {
      const directConversation = state.directConversations.find((conversation) => conversation.id === maybeUuid);
      if (directConversation) {
        state.activeDirectConversationId = directConversation.id;
        directConversation.messages = await state.service.loadDirectMessages(directConversation.id);
        await state.service.markDirectConversationRead(directConversation.id);
        directConversation.unread_count = 0;
        state.directUnreadCount = state.service.getDirectUnreadCount(state.directConversations);
        renderDirectUnreadBadges();
      } else if (maybeUuid !== state.profile.id) {
        state.activeDirectConversationId = await state.service.ensureDirectConversation(maybeUuid);
        setDirectConversations(await state.service.loadDirectConversations());
      }
    }

    const activeConversation = getActiveDirectConversation();
    if (activeConversation) {
      activeConversation.messages = await state.service.loadDirectMessages(activeConversation.id);
      if (activeConversation.unread_count) {
        await state.service.markDirectConversationRead(activeConversation.id);
        activeConversation.unread_count = 0;
        state.directUnreadCount = state.service.getDirectUnreadCount(state.directConversations);
        renderDirectUnreadBadges();
      }
      await subscribeDirectConversation(activeConversation.id);
    }

    renderDirectInbox();
  } catch (err) {
    console.error('[MSY][feed-social] Erro ao abrir direct:', err);
    Utils.showToast(err.message || 'Erro ao abrir Direct.', 'error');
  }
}

function renderDirectInbox() {
  const modal = document.getElementById('directViewer');
  const activeConversation = getActiveDirectConversation();
  const activeMessages = activeConversation?.messages || [];
  const peer = activeConversation?.otherParticipants?.[0]?.profile || {};
  const streak = activeConversation?.streak || { days: 0, active: false, level: 'apagado' };
  const streakMeta = directStreakMeta(streak);
  const directMenuConversation = state.directConversationMenu
    ? state.directConversations.find((conversation) => conversation.id === state.directConversationMenu.conversationId)
    : null;
  const directMenuStyle = directMenuConversation && !window.matchMedia('(max-width: 640px)').matches
    ? ` style="left:${state.directConversationMenu.left}px;top:${state.directConversationMenu.top}px"`
    : '';
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
            const preview = state.service.getDirectMessagePreview(conversation.lastMessage || {});
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
        ${directMenuConversation ? `
          <div class="post-menu direct-thread-menu open"${directMenuStyle}>
            <button type="button" class="danger" data-archive-direct-conversation="${directMenuConversation.id}"><i class="fa-solid fa-trash"></i> Apagar conversa</button>
          </div>` : ''}
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
            return renderDirectMessageBubble(message, { mine, showDate });
          }).join('') : '<div class="social-empty"><i class="fa-regular fa-paper-plane"></i>Nenhuma mensagem ainda.</div>'}
        </div>
        <form id="directComposer" class="direct-composer">
          <button type="button" class="direct-composer-icon" aria-label="Emoji"><i class="fa-regular fa-face-smile"></i></button>
          <button type="button" class="direct-composer-icon" aria-label="Anexo"><i class="fa-regular fa-square-plus"></i></button>
          <input type="file" id="directMediaInput" accept="image/*,video/mp4,video/webm,video/quicktime" hidden>
          <input id="directMessageInput" class="direct-composer-input" placeholder="${state.directEditingMessageId ? 'Editar mensagem...' : 'Enviar mensagem...'}" ${activeConversation ? '' : 'disabled'}>
          <button class="direct-composer-send" type="submit" disabled><i class="fa-solid fa-paper-plane"></i></button>
        </form>
      </section>
    </div>`;

  openModal(modal);
  bindDirectViewport(modal);
  bindDirectMessageActions(modal);
  if (modal.dataset.directThreadActionsBound !== 'true') {
    modal.dataset.directThreadActionsBound = 'true';
    const longPressTimers = new WeakMap();
    modal.addEventListener('contextmenu', (event) => {
      const thread = getDirectConversationNode(event.target);
      if (!thread) return;
      event.preventDefault();
      event.stopPropagation();
      openDirectConversationMenu(thread.dataset.openDirectConversation, thread);
    }, true);
    modal.addEventListener('pointerdown', (event) => {
      const thread = getDirectConversationNode(event.target);
      if (!thread || event.pointerType === 'mouse') return;
      const stateEntry = { x: event.clientX, y: event.clientY, timer: null };
      longPressTimers.set(thread, stateEntry);
      stateEntry.timer = setTimeout(() => {
        state.directThreadMenuSuppressClickId = thread.dataset.openDirectConversation;
        openDirectConversationMenu(thread.dataset.openDirectConversation, thread);
      }, 440);
    }, true);
    modal.addEventListener('pointermove', (event) => {
      const thread = getDirectConversationNode(event.target);
      const stateEntry = thread ? longPressTimers.get(thread) : null;
      if (!thread || !stateEntry || event.pointerType === 'mouse') return;
      if (Math.abs(event.clientX - stateEntry.x) > 10 || Math.abs(event.clientY - stateEntry.y) > 10) {
        clearTimeout(stateEntry.timer);
        longPressTimers.delete(thread);
      }
    }, true);
    ['pointerup', 'pointercancel', 'pointerleave', 'pointerout'].forEach((eventName) => {
      modal.addEventListener(eventName, (event) => {
        const thread = getDirectConversationNode(event.target);
        const stateEntry = thread ? longPressTimers.get(thread) : null;
        if (!thread || !stateEntry) return;
        clearTimeout(stateEntry.timer);
        longPressTimers.delete(thread);
      }, true);
    });
  }
  modal.querySelectorAll('[data-open-direct-conversation]').forEach((node) => node.addEventListener('click', async () => {
    if (state.directThreadMenuSuppressClickId === node.dataset.openDirectConversation) {
      state.directThreadMenuSuppressClickId = null;
      return;
    }
    closeDirectConversationMenu();
    state.activeDirectConversationId = node.dataset.openDirectConversation;
    const conversation = getActiveDirectConversation();
    if (conversation) {
      conversation.messages = await state.service.loadDirectMessages(conversation.id);
      await state.service.markDirectConversationRead(conversation.id);
      conversation.unread_count = 0;
      state.directUnreadCount = state.service.getDirectUnreadCount(state.directConversations);
      renderDirectUnreadBadges();
      if (!conversation.streak || !conversation.streak.active) {
        conversation.streak = state.service.calculateDirectStreak(conversation.messages, conversation.otherParticipants.map((participant) => participant.user_id));
      }
      await subscribeDirectConversation(conversation.id);
    }
    renderDirectInbox();
  }));
  modal.querySelector('[data-archive-direct-conversation]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    handleDirectArchiveConversation(e.currentTarget.dataset.archiveDirectConversation);
  });
  modal.querySelector('[data-direct-back]')?.addEventListener('click', async () => {
    state.activeDirectConversationId = null;
    state.directEditingMessageId = null;
    await subscribeDirectConversation(null);
    closeDirectConversationMenu();
    renderDirectInbox();
  });
  modal.querySelector('#directComposer')?.addEventListener('submit', sendDirectMessage);
  const directInput = modal.querySelector('#directMessageInput');
  const directSend = modal.querySelector('.direct-composer-send');
  directInput?.addEventListener('input', () => {
    directSend?.toggleAttribute('disabled', !directInput.value.trim() || !state.activeDirectConversationId);
  });
  modal.querySelector('.direct-composer-icon[aria-label="Anexo"]')?.addEventListener('click', () => modal.querySelector('#directMediaInput')?.click());
  modal.querySelector('.direct-composer-icon[aria-label="Emoji"]')?.addEventListener('click', () => {
    const input = modal.querySelector('#directMessageInput');
    if (!input) return;
    input.value += input.value.endsWith(' ') || !input.value ? '✨ ' : ' ✨ ';
    modal.querySelector('.direct-composer-send')?.toggleAttribute('disabled', !input.value.trim() || !state.activeDirectConversationId);
    input.focus();
  });
  modal.querySelector('#directMediaInput')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file || !state.activeDirectConversationId) return;
    try {
      validateMediaFile(file);
      const media = await uploadSocialMedia(db, state.profile.id, file, 'direct', { skipCompression: true });
      const message = await state.service.sendDirectMessage(state.activeDirectConversationId, '', { kind: 'media', ...media });
      upsertDirectMessage(state.activeDirectConversationId, message);
      renderDirectInbox();
      scrollDirectToBottom({ animated: true });
    } catch (err) {
      console.error('[MSY][feed-social] Erro ao enviar mídia no direct:', err);
      Utils.showToast(err.message || 'Erro ao enviar mídia no direct.', 'error');
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

  scheduleDirectInitialScroll(activeConversation?.id || null);
  requestAnimationFrame(() => {
    if (state.directEditingMessageId) {
      const input = document.getElementById('directMessageInput');
      input?.focus({ preventScroll: true });
      input?.setSelectionRange(input.value.length, input.value.length);
      modal.querySelector('.direct-composer-send')?.toggleAttribute('disabled', !input.value.trim());
    }
  });
}

function scrollDirectToBottom({ animated = true } = {}) {
  const list = document.getElementById('directMessagesList');
  if (!list) return;
  const top = Math.max(0, list.scrollHeight - list.clientHeight);
  if (!animated) {
    const previousBehavior = list.style.scrollBehavior;
    list.style.scrollBehavior = 'auto';
    list.scrollTop = top;
    list.scrollTo?.({ top, behavior: 'auto' });
    list.style.scrollBehavior = previousBehavior;
    return;
  }
  list.scrollTo?.({ top, behavior: 'smooth' });
  if (!list.scrollTo) list.scrollTop = top;
}

function directMediaSettled(list, timeout = 420) {
  const pendingMedia = [...list.querySelectorAll('img,video')]
    .filter((media) => {
      if (media instanceof HTMLImageElement) return !media.complete || media.naturalWidth === 0;
      if (media instanceof HTMLVideoElement) return media.readyState < 1;
      return false;
    });
  if (!pendingMedia.length) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    let remaining = pendingMedia.length;
    const cleanupFns = [];
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanupFns.forEach((cleanup) => cleanup());
      resolve();
    };
    const doneOne = () => {
      remaining -= 1;
      if (remaining <= 0) finish();
    };
    const timer = setTimeout(finish, timeout);
    cleanupFns.push(() => clearTimeout(timer));
    pendingMedia.forEach((media) => {
      let mediaDone = false;
      const events = media instanceof HTMLVideoElement
        ? ['loadedmetadata', 'loadeddata', 'error']
        : ['load', 'error'];
      const settleMedia = () => {
        if (mediaDone) return;
        mediaDone = true;
        doneOne();
      };
      events.forEach((eventName) => media.addEventListener(eventName, settleMedia, { once: true }));
      cleanupFns.push(() => events.forEach((eventName) => media.removeEventListener(eventName, settleMedia)));
    });
  });
}

function scheduleDirectInitialScroll(conversationId) {
  if (typeof state.directInitialScrollCleanup === 'function') {
    state.directInitialScrollCleanup();
    state.directInitialScrollCleanup = null;
  }
  const list = document.getElementById('directMessagesList');
  if (!list || !conversationId) return;
  const requestId = ++state.directScrollRequestId;
  let cancelled = false;
  let resizeObserver = null;
  let settleTimer = null;
  const isCurrent = () => !cancelled
    && requestId === state.directScrollRequestId
    && state.activeDirectConversationId === conversationId
    && document.getElementById('directMessagesList') === list;
  const forceBottom = () => {
    if (isCurrent()) scrollDirectToBottom({ animated: false });
  };
  const raf = (callback) => requestAnimationFrame(() => {
    if (isCurrent()) callback();
  });

  state.directInitialScrollCleanup = () => {
    cancelled = true;
    resizeObserver?.disconnect();
    if (settleTimer) clearTimeout(settleTimer);
  };

  raf(() => {
    forceBottom();
    raf(async () => {
      forceBottom();
      await directMediaSettled(list);
      forceBottom();
      if (!isCurrent() || typeof ResizeObserver === 'undefined') return;
      resizeObserver = new ResizeObserver(forceBottom);
      resizeObserver.observe(list);
      list.querySelectorAll('img,video,.direct-message-row').forEach((node) => resizeObserver.observe(node));
      settleTimer = setTimeout(() => {
        resizeObserver?.disconnect();
        if (state.directInitialScrollCleanup && isCurrent()) state.directInitialScrollCleanup = null;
      }, 900);
    });
  });
}

function bindDirectViewport(modal) {
  const shell = modal.querySelector('.direct-shell');
  if (!shell || shell.dataset.viewportBound === 'true') return;
  if (typeof state.directViewportCleanup === 'function') state.directViewportCleanup();
  shell.dataset.viewportBound = 'true';
  const sync = () => {
    const viewport = window.visualViewport;
    const height = viewport?.height || window.innerHeight;
    shell.style.setProperty('--direct-vh', `${Math.round(height)}px`);
    const keyboard = Math.max(0, window.innerHeight - height - (viewport?.offsetTop || 0));
    shell.style.setProperty('--direct-keyboard', `${Math.round(keyboard)}px`);
    shell.classList.toggle('keyboard-open', keyboard > 24);
    requestAnimationFrame(() => scrollDirectToBottom({ animated: false }));
  };
  sync();
  window.visualViewport?.addEventListener('resize', sync, { passive: true });
  window.visualViewport?.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync, { passive: true });
  state.directViewportCleanup = () => {
    window.visualViewport?.removeEventListener('resize', sync);
    window.visualViewport?.removeEventListener('scroll', sync);
    window.removeEventListener('resize', sync);
  };
}

async function sendDirectMessage(e) {
  e.preventDefault();
  const input = document.getElementById('directMessageInput');
  const body = input?.value?.trim() || '';
  if (!body || !state.activeDirectConversationId) return;
  try {
    const editingMessageId = state.directEditingMessageId;
    const message = editingMessageId
      ? await state.service.updateDirectMessage(editingMessageId, body)
      : await state.service.sendDirectMessage(state.activeDirectConversationId, body);
    const conversation = upsertDirectMessage(state.activeDirectConversationId, message);
    if (conversation) {
      conversation.streak = message.metadata?.direct_streak || conversation.streak;
    }
    input.value = '';
    state.directEditingMessageId = null;
    if (editingMessageId) {
      renderDirectInbox();
    } else {
      appendDirectMessageToDom(message);
    }
    Utils.showToast(message.edited_at ? 'Mensagem atualizada.' : 'Mensagem enviada.');
  } catch (err) {
    console.error('[MSY][feed-social] Erro ao enviar mensagem direct:', err);
    Utils.showToast(err.message || 'Erro ao enviar direct.', 'error');
  }
}

function appendDirectMessageToDom(message) {
  const list = document.getElementById('directMessagesList');
  const activeConversation = getActiveDirectConversation();
  if (!list || !message || message.conversation_id !== state.activeDirectConversationId) {
    renderDirectInbox();
    requestAnimationFrame(() => scrollDirectToBottom({ animated: true }));
    return;
  }
  const previous = [...(activeConversation?.messages || [])]
    .filter((item) => item.id !== message.id && item.created_at <= message.created_at)
    .at(-1);
  const showDate = !previous || new Date(previous.created_at).toDateString() !== new Date(message.created_at).toDateString();
  list.querySelector('.social-empty')?.remove();
  list.querySelector(`[data-direct-message-row="${message.id}"]`)?.remove();
  list.insertAdjacentHTML('beforeend', renderDirectMessageBubble(message, {
    mine: message.sender_id === state.profile.id,
    showDate,
  }));
  bindDirectMessageActions(document.getElementById('directViewer'));
  requestAnimationFrame(() => scrollDirectToBottom({ animated: true }));
}

function bindModals() {
  document.addEventListener('click', (e) => {
    if (state.directConversationMenu && !e.target.closest('.direct-thread-menu')) {
      closeDirectConversationMenu();
    }
    const postComposer = document.getElementById('mobilePostComposerModal');
    if (postComposer?.classList.contains('open') && e.target === postComposer) {
      cancelPostComposer();
      return;
    }
    if (e.target.matches('.story-viewer,.profile-viewer,.story-composer-modal,.media-viewer,.post-comments-modal,[data-close-modal]') || e.target.closest('[data-close-modal]')) {
      closeSocialModals();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const postComposer = document.getElementById('mobilePostComposerModal');
    if (postComposer?.classList.contains('open')) cancelPostComposer();
    else closeSocialModals();
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
