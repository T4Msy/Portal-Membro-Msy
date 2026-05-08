/* ============================================================
   MSY PORTAL — SOCIAL SERVICE
   Camada de dados para Feed social interno.
   ============================================================ */

export class SocialService {
  constructor(db, profile, utils) {
    this.db = db;
    this.profile = profile;
    this.Utils = utils;
    this.pageSize = 12;
  }

  async loadBootstrap() {
    const [posts, stories, members, follows, messages] = await Promise.all([
      this.loadPosts({ limit: this.pageSize }),
      this.loadStories(),
      this.loadMembers(),
      this.loadFollows(),
      this.loadUnreadMessages(),
    ]);
    return { posts, stories, members, follows, messages };
  }

  async loadPosts({ limit = this.pageSize, before = null, query = '', authorId = null } = {}) {
    let request = this.db
      .from('social_posts')
      .select(`
        *,
        author:author_id(id,name,username,role,tier,initials,color,avatar_url,banner_url,bio,social_bio),
        media:social_post_media(id,url,storage_path,media_type,width,height,position,alt_text),
        comments:social_comments(id,parent_id,author_id,content,created_at,edited_at,author:author_id(id,name,username,initials,color,avatar_url,role,tier))
      `)
      .eq('is_deleted', false)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (before) request = request.lt('created_at', before);
    if (authorId) request = request.eq('author_id', authorId);
    if (query) request = request.or(`content.ilike.%${query}%,author.name.ilike.%${query}%`);

    const { data, error } = await request;
    if (error) throw error;

    const posts = (data || []).map((post) => this.normalizePost(post));
    await this.hydratePostStats(posts);
    return posts;
  }

  async loadLegacyFeed() {
    const { data, error } = await this.db
      .from('feed_atividade')
      .select('*, autor:autor_id(id,name,initials,color,avatar_url,role,tier)')
      .order('created_at', { ascending: false })
      .limit(80);
    if (error) throw error;
    return (data || []).map((item) => ({
      id: item.id,
      legacy: true,
      content: [item.titulo, item.descricao].filter(Boolean).join('\n\n'),
      created_at: item.created_at,
      edited_at: item.updated_at,
      is_pinned: false,
      author_id: item.autor_id,
      author: item.autor || { name: 'MSY', role: 'Portal', initials: 'MS' },
      media: [],
      comments: [],
      comments_count: 0,
      likes_count: 0,
      saves_count: 0,
      liked_by_me: false,
      saved_by_me: false,
      link: item.link,
      tipo: item.tipo,
      icone: item.icone,
    }));
  }

  normalizePost(post) {
    return {
      ...post,
      media: [...(post.media || [])].sort((a, b) => (a.position || 0) - (b.position || 0)),
      comments: [...(post.comments || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
      likes_count: 0,
      comments_count: 0,
      saves_count: 0,
      liked_by_me: false,
      saved_by_me: false,
    };
  }

  async hydratePostStats(posts) {
    const ids = posts.map((p) => p.id);
    if (!ids.length) return;

    const [likesRes, savesRes, commentsRes] = await Promise.all([
      this.db.from('social_likes').select('post_id,user_id').eq('target_type', 'post').in('post_id', ids),
      this.db.from('social_saved_posts').select('post_id,user_id').in('post_id', ids),
      this.db.from('social_comments').select('post_id,id').is('deleted_at', null).in('post_id', ids),
    ]);

    const countBy = (rows, key) => (rows || []).reduce((acc, row) => {
      acc[row[key]] = (acc[row[key]] || 0) + 1;
      return acc;
    }, {});

    const likes = countBy(likesRes.data, 'post_id');
    const saves = countBy(savesRes.data, 'post_id');
    const comments = countBy(commentsRes.data, 'post_id');
    const myLiked = new Set((likesRes.data || []).filter((l) => l.user_id === this.profile.id).map((l) => l.post_id));
    const mySaved = new Set((savesRes.data || []).filter((s) => s.user_id === this.profile.id).map((s) => s.post_id));

    posts.forEach((post) => {
      post.likes_count = likes[post.id] || 0;
      post.saves_count = saves[post.id] || 0;
      post.comments_count = comments[post.id] || 0;
      post.liked_by_me = myLiked.has(post.id);
      post.saved_by_me = mySaved.has(post.id);
    });
  }

  async createPost({ content, media = [] }) {
    if (!content && !media.length) throw new Error('Escreva algo ou adicione uma midia.');

    const { data: post, error } = await this.db
      .from('social_posts')
      .insert({ author_id: this.profile.id, content: content || null })
      .select('*')
      .single();
    if (error) throw error;

    if (media.length) {
      const rows = media.map((item, index) => ({
        post_id: post.id,
        author_id: this.profile.id,
        url: item.url,
        storage_path: item.storage_path || null,
        media_type: item.media_type,
        width: item.width || null,
        height: item.height || null,
        position: index,
      }));
      const { error: mediaError } = await this.db.from('social_post_media').insert(rows);
      if (mediaError) throw mediaError;
    }

    return post;
  }

  async updatePost(postId, content) {
    const { error } = await this.db
      .from('social_posts')
      .update({ content, edited_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', postId);
    if (error) throw error;
  }

  async deletePost(postId) {
    const { error } = await this.db
      .from('social_posts')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', postId);
    if (error) throw error;
  }

  async togglePin(postId, pinned) {
    const { error } = await this.db
      .from('social_posts')
      .update({ is_pinned: pinned, updated_at: new Date().toISOString() })
      .eq('id', postId);
    if (error) throw error;
  }

  async toggleLike(post) {
    if (post.liked_by_me) {
      const { error } = await this.db
        .from('social_likes')
        .delete()
        .eq('target_type', 'post')
        .eq('post_id', post.id)
        .eq('user_id', this.profile.id);
      if (error) throw error;
      return false;
    }

    const { error } = await this.db.from('social_likes').insert({
      user_id: this.profile.id,
      target_type: 'post',
      post_id: post.id,
    });
    if (error) throw error;
    await this.notify(post.author_id, {
      message: `${this.profile.name} curtiu sua publicacao.`,
      type: 'social_like',
      icon: '❤️',
      target_type: 'post',
      target_id: post.id,
      target_url: `feed.html?post=${post.id}`,
    });
    return true;
  }

  async toggleSave(post) {
    if (post.saved_by_me) {
      const { error } = await this.db
        .from('social_saved_posts')
        .delete()
        .eq('post_id', post.id)
        .eq('user_id', this.profile.id);
      if (error) throw error;
      return false;
    }

    const { error } = await this.db.from('social_saved_posts').insert({
      user_id: this.profile.id,
      post_id: post.id,
    });
    if (error) throw error;
    return true;
  }

  async addComment(post, content, parentId = null) {
    const clean = (content || '').trim();
    if (!clean) throw new Error('Comentario vazio.');

    const { data, error } = await this.db
      .from('social_comments')
      .insert({
        post_id: post.id,
        parent_id: parentId,
        author_id: this.profile.id,
        content: clean,
      })
      .select('*, author:author_id(id,name,username,initials,color,avatar_url,role,tier)')
      .single();
    if (error) throw error;

    await this.notify(post.author_id, {
      message: `${this.profile.name} comentou na sua publicacao.`,
      type: 'social_comment',
      icon: '💬',
      target_type: 'comment',
      target_id: data.id,
      target_url: `feed.html?post=${post.id}&comment=${data.id}`,
      anchor: `comment-${data.id}`,
    });
    return data;
  }

  async deleteComment(commentId) {
    const { error } = await this.db
      .from('social_comments')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', commentId);
    if (error) throw error;
  }

  async loadStories() {
    const { data, error } = await this.db
      .from('social_stories')
      .select('*, author:author_id(id,name,username,role,tier,initials,color,avatar_url)')
      .is('deleted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(80);
    if (error) throw error;

    const grouped = new Map();
    (data || []).forEach((story) => {
      const key = story.author_id;
      if (!grouped.has(key)) grouped.set(key, { author: story.author, stories: [] });
      grouped.get(key).stories.push(story);
    });
    return Array.from(grouped.values());
  }

  async createStory(media, caption = '') {
    const { data, error } = await this.db
      .from('social_stories')
      .insert({
        author_id: this.profile.id,
        media_url: media.url,
        storage_path: media.storage_path || null,
        media_type: media.media_type,
        caption: caption || null,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  async markStoryViewed(storyId) {
    await this.db.from('social_story_views').upsert({
      story_id: storyId,
      user_id: this.profile.id,
      viewed_at: new Date().toISOString(),
    }, { onConflict: 'story_id,user_id' });
  }

  async reactToStory(story, reaction) {
    const { error } = await this.db.from('social_story_reactions').insert({
      story_id: story.id,
      user_id: this.profile.id,
      reaction,
    });
    if (error) throw error;
    await this.notify(story.author_id, {
      message: `${this.profile.name} reagiu ao seu story com ${reaction}.`,
      type: 'social_story',
      icon: reaction,
      target_type: 'story',
      target_id: story.id,
      target_url: `feed.html?story=${story.id}`,
    });
  }

  async loadMembers() {
    const { data, error } = await this.db
      .from('profiles')
      .select('id,name,username,role,tier,initials,color,avatar_url,banner_url,bio,social_bio,social_links,profile_highlights,selected_badges')
      .eq('status', 'ativo')
      .order('name');
    if (error) throw error;
    return data || [];
  }

  async loadFollows() {
    const { data, error } = await this.db
      .from('social_follows')
      .select('*')
      .or(`follower_id.eq.${this.profile.id},following_id.eq.${this.profile.id}`);
    if (error) throw error;
    return data || [];
  }

  async toggleFollow(memberId, isFollowing) {
    if (isFollowing) {
      const { error } = await this.db
        .from('social_follows')
        .delete()
        .eq('follower_id', this.profile.id)
        .eq('following_id', memberId);
      if (error) throw error;
      return false;
    }

    const { error } = await this.db.from('social_follows').insert({
      follower_id: this.profile.id,
      following_id: memberId,
    });
    if (error) throw error;
    await this.notify(memberId, {
      message: `${this.profile.name} comecou a seguir voce.`,
      type: 'social_follow',
      icon: '👤',
      target_type: 'profile',
      target_id: this.profile.id,
      target_url: `feed.html?profile=${this.profile.id}`,
    });
    return true;
  }

  async sharePost(post, recipientId, body = '') {
    const { error } = await this.db.from('social_messages').insert({
      sender_id: this.profile.id,
      recipient_id: recipientId,
      post_id: post.id,
      body: body || null,
    });
    if (error) throw error;
    await this.notify(recipientId, {
      message: `${this.profile.name} enviou uma publicacao para voce.`,
      type: 'social_share',
      icon: '📨',
      target_type: 'message',
      target_id: post.id,
      target_url: `feed.html?message=latest&post=${post.id}`,
    });
  }

  async loadUnreadMessages() {
    const { data, error } = await this.db
      .from('social_messages')
      .select('*, sender:sender_id(id,name,username,initials,color,avatar_url), post:post_id(id,content)')
      .eq('recipient_id', this.profile.id)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(12);
    if (error) throw error;
    return data || [];
  }

  async search(query) {
    const q = (query || '').trim();
    if (!q) return { posts: [], members: [], hashtags: [] };
    const like = `%${q.replace(/^#|^@/, '')}%`;
    const [postsRes, membersRes] = await Promise.all([
      this.db.from('social_posts')
        .select('id,content,created_at,author:author_id(id,name,username,initials,color,avatar_url)')
        .eq('is_deleted', false)
        .ilike('content', like)
        .limit(8),
      this.db.from('profiles')
        .select('id,name,username,role,initials,color,avatar_url,tier')
        .eq('status', 'ativo')
        .or(`name.ilike.${like},username.ilike.${like},role.ilike.${like}`)
        .limit(8),
    ]);
    if (postsRes.error) throw postsRes.error;
    if (membersRes.error) throw membersRes.error;
    const tags = new Set();
    (postsRes.data || []).forEach((p) => {
      (p.content || '').match(/#[\p{L}\p{N}_-]+/gu)?.forEach((tag) => tags.add(tag));
    });
    return {
      posts: postsRes.data || [],
      members: membersRes.data || [],
      hashtags: [...tags].slice(0, 8),
    };
  }

  async notify(userId, payload) {
    if (!userId || userId === this.profile.id) return;
    try {
      await this.db.rpc('notify_social', {
        p_user_id: userId,
        p_actor_id: this.profile.id,
        p_message: payload.message,
        p_type: payload.type || 'social',
        p_icon: payload.icon || '🔔',
        p_target_type: payload.target_type || null,
        p_target_id: payload.target_id || null,
        p_target_url: payload.target_url || null,
        p_anchor: payload.anchor || null,
        p_metadata: payload.metadata || {},
      });
    } catch (err) {
      console.warn('[MSY][social] Notificacao contextual indisponivel:', err);
    }
  }
}

