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
    this.directPageSize = 24;
  }

  normalizeUsername(username = '') {
    return String(username || '')
      .trim()
      .toLowerCase()
      .replace(/^@+/, '')
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9._-]/g, '')
      .replace(/\.{2,}/g, '.');
  }

  getDisplayUsername(member = {}) {
    const normalized = this.normalizeUsername(member?.username);
    if (normalized) return normalized;
    const base = this.normalizeUsername(member?.name || this.profile?.name || 'membro');
    return (base || 'membro').replace(/[^a-z0-9._]+/g, '').slice(0, 24) || 'membro';
  }

  async loadBootstrap() {
    const [posts, stories, members, follows] = await Promise.all([
      this.loadPosts({ limit: this.pageSize }),
      this.loadStories(),
      this.loadMembers(),
      this.loadFollows(),
    ]);
    return { posts, stories, members, follows, messages: [] };
  }

  async loadProfileSocialSummary(memberId) {
    const [postsRes, followersRes, followingRes] = await Promise.all([
      this.db.from('social_posts')
        .select('id', { count: 'exact', head: true })
        .eq('author_id', memberId)
        .eq('is_deleted', false),
      this.db.from('social_follows')
        .select('follower_id', { count: 'exact', head: true })
        .eq('following_id', memberId),
      this.db.from('social_follows')
        .select('following_id', { count: 'exact', head: true })
        .eq('follower_id', memberId),
    ]);

    if (postsRes.error) throw postsRes.error;
    if (followersRes.error) throw followersRes.error;
    if (followingRes.error) throw followingRes.error;

    const { data: followRow, error: followError } = await this.db
      .from('social_follows')
      .select('follower_id')
      .eq('follower_id', this.profile.id)
      .eq('following_id', memberId)
      .maybeSingle();

    if (followError) throw followError;

    return {
      postsCount: postsRes.count || 0,
      followersCount: followersRes.count || 0,
      followingCount: followingRes.count || 0,
      isFollowing: Boolean(followRow),
    };
  }

  async loadProfilePosts(memberId, { limit = 10 } = {}) {
    return this.loadPosts({ authorId: memberId, limit });
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
    if (query) request = request.ilike('content', `%${query}%`);

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
    const author = post.author || {};
    const comments = [...(post.comments || [])].map((comment) => ({
      ...comment,
      author: comment.author || {},
    }));

    return {
      ...post,
      author: {
        ...author,
        username: this.getDisplayUsername(author),
      },
      media: [...(post.media || [])].sort((a, b) => (a.position || 0) - (b.position || 0)),
      comments: comments.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map((comment) => ({
        ...comment,
        author: {
          ...comment.author,
          username: this.getDisplayUsername(comment.author),
        },
      })),
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
    const myLiked = new Set(
      (likesRes.data || [])
        .filter((like) => like.user_id === this.profile.id)
        .map((like) => like.post_id)
    );
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

    await this.persistPostMentions(post.id, content || '');

    const { data: followers } = await this.db
      .from('social_follows')
      .select('follower_id')
      .eq('following_id', this.profile.id)
      .neq('follower_id', this.profile.id);

    await Promise.all((followers || []).map((row) => this.notify(row.follower_id, {
      message: `${this.profile.name} publicou algo novo.`,
      type: 'social_post',
      icon: '📝',
      target_type: 'post',
      target_id: post.id,
      target_url: `feed.html?post=${post.id}`,
    })));

    return post;
  }

  async updatePost(postId, content) {
    const { data, error } = await this.db
      .from('social_posts')
      .update({ content, edited_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', postId)
      .eq('author_id', this.profile.id)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Sem permissao para editar esta publicacao.');
  }

  async deletePost(postId) {
    const { error } = await this.db.rpc('delete_social_post', { p_post_id: postId });
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
      type: 'info',
      icon: '❤️',
      target_type: 'post',
      target_id: post.id,
      target_url: `feed.html?post=${post.id}`,
      metadata: { event: 'social_like' },
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
      .select('*')
      .single();
    if (error) throw error;

    data.author = {
      id: this.profile.id,
      name: this.profile.name,
      username: this.getDisplayUsername(this.profile),
      initials: this.profile.initials,
      color: this.profile.color,
      avatar_url: this.profile.avatar_url,
      role: this.profile.role,
      tier: this.profile.tier,
    };

    await this.notify(post.author_id, {
      message: `${this.profile.name} comentou na sua publicacao.`,
      type: 'social_comment',
      icon: '💬',
      target_type: 'comment',
      target_id: data.id,
      target_url: `feed.html?post=${post.id}&comment=${data.id}`,
      anchor: `comment-${data.id}`,
    });

    if (parentId) {
      const { data: parentComment } = await this.db
        .from('social_comments')
        .select('id,author_id')
        .eq('id', parentId)
        .maybeSingle();

      if (parentComment?.author_id && parentComment.author_id !== this.profile.id) {
        await this.notify(parentComment.author_id, {
          message: `${this.profile.name} respondeu seu comentario.`,
          type: 'social_comment',
          icon: '↩️',
          target_type: 'comment',
          target_id: data.id,
          target_url: `feed.html?post=${post.id}&comment=${data.id}`,
          anchor: `comment-${data.id}`,
          metadata: { reply_to: parentId },
        });
      }
    }

    await this.persistCommentMentions(data.id, post.id, clean);
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
    const { error } = await this.db.from('social_story_reactions').upsert({
      story_id: story.id,
      user_id: this.profile.id,
      reaction,
      created_at: new Date().toISOString(),
    }, {
      onConflict: 'story_id,user_id',
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

  async deleteStory(storyId) {
    const { data: story, error: storyError } = await this.db
      .from('social_stories')
      .select('id,author_id,storage_path')
      .eq('id', storyId)
      .maybeSingle();
    if (storyError) throw storyError;
    if (!story || (this.profile.tier !== 'diretoria' && story.author_id !== this.profile.id)) {
      throw new Error('Sem permissao para excluir este story.');
    }

    let request = this.db
      .from('social_stories')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', storyId);
    if (this.profile.tier !== 'diretoria') request = request.eq('author_id', this.profile.id);
    const { error } = await request;
    if (error) throw error;
    if (story.storage_path) {
      try {
        await this.db.storage.from('social-media').remove([story.storage_path]);
      } catch (err) {
        console.warn('[MSY][social] Story removido do feed, mas a midia nao foi removida do storage:', err);
      }
    }
  }

  async loadStoryReactions(storyId) {
    const { data, error } = await this.db
      .from('social_story_reactions')
      .select('id,reaction,created_at,user:user_id(id,name,username,initials,color,avatar_url)')
      .eq('story_id', storyId)
      .order('created_at', { ascending: false })
      .limit(80);
    if (error) throw error;
    return data || [];
  }

  async loadStoryViews(storyId) {
    const { data, error } = await this.db
      .from('social_story_views')
      .select('viewed_at,user:user_id(id,name,username,initials,color,avatar_url)')
      .eq('story_id', storyId)
      .order('viewed_at', { ascending: false })
      .limit(80);
    if (error) throw error;
    return data || [];
  }

  async loadMembers() {
    const { data, error } = await this.db
      .from('profiles')
      .select('id,name,username,role,tier,initials,color,avatar_url,banner_url,bio,social_bio,social_links,profile_highlights,selected_badges')
      .eq('status', 'ativo')
      .order('name');
    if (error) throw error;
    return (data || []).map((member) => ({
      ...member,
      username: this.getDisplayUsername(member),
    }));
  }

  async searchMembersForMention(query, { limit = 5 } = {}) {
    const clean = this.normalizeUsername(query);
    if (!clean) return [];
    const like = `%${clean}%`;
    const { data, error } = await this.db
      .from('profiles')
      .select('id,name,username,role,initials,color,avatar_url')
      .eq('status', 'ativo')
      .not('username', 'is', null)
      .neq('username', '')
      .or(`username.ilike.${like},name.ilike.${like}`)
      .limit(limit);
    if (error) throw error;
    return (data || []).map((member) => ({
      ...member,
      username: this.getDisplayUsername(member),
    }));
  }

  extractMentions(text = '') {
    return [...new Set(
      ((text || '').match(/(^|\s)@([\p{L}\p{N}_.-]+)/gu) || [])
        .map((raw) => this.normalizeUsername(raw.trim().slice(1)))
        .filter(Boolean)
    )];
  }

  async resolveMentionedMembers(text = '') {
    const usernames = this.extractMentions(text);
    if (!usernames.length) return [];
    const { data, error } = await this.db
      .from('profiles')
      .select('id,name,username')
      .eq('status', 'ativo')
      .in('username', usernames);
    if (error) throw error;
    return (data || [])
      .filter((member) => member.id !== this.profile.id)
      .map((member) => ({
        ...member,
        username: this.getDisplayUsername(member),
      }));
  }

  async persistPostMentions(postId, text = '') {
    const mentionedMembers = await this.resolveMentionedMembers(text);
    if (!mentionedMembers.length) return;

    const rows = mentionedMembers.map((member) => ({
      mentioned_user_id: member.id,
      mentioned_by_user_id: this.profile.id,
      post_id: postId,
      mention_text: `@${member.username}`,
    }));

    const { error } = await this.db.from('social_mentions').upsert(rows, {
      onConflict: 'mentioned_user_id,post_id',
      ignoreDuplicates: true,
    });
    if (error) throw error;

    await Promise.all(mentionedMembers.map((member) => this.notify(member.id, {
      message: `${this.profile.name} mencionou voce em uma publicacao.`,
      type: 'mention',
      icon: '@',
      target_type: 'post',
      target_id: postId,
      target_url: `feed.html?post=${postId}`,
      metadata: { mention: member.username },
    })));
  }

  async persistCommentMentions(commentId, postId, text = '') {
    const mentionedMembers = await this.resolveMentionedMembers(text);
    if (!mentionedMembers.length) return;

    const rows = mentionedMembers.map((member) => ({
      mentioned_user_id: member.id,
      mentioned_by_user_id: this.profile.id,
      comment_id: commentId,
      mention_text: `@${member.username}`,
    }));

    const { error } = await this.db.from('social_mentions').upsert(rows, {
      onConflict: 'mentioned_user_id,comment_id',
      ignoreDuplicates: true,
    });
    if (error) throw error;

    await Promise.all(mentionedMembers.map((member) => this.notify(member.id, {
      message: `${this.profile.name} mencionou voce em um comentario.`,
      type: 'mention',
      icon: '@',
      target_type: 'comment',
      target_id: commentId,
      target_url: `feed.html?post=${postId}&comment=${commentId}`,
      anchor: `comment-${commentId}`,
      metadata: { mention: member.username },
    })));
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
      if (p.author) p.author.username = this.getDisplayUsername(p.author);
    });
    return {
      posts: postsRes.data || [],
      members: (membersRes.data || []).map((member) => ({
        ...member,
        username: this.getDisplayUsername(member),
      })),
      hashtags: [...tags].slice(0, 8),
    };
  }

  async loadDirectConversations() {
    const { data, error } = await this.db
      .from('direct_participants')
      .select(`
        conversation_id,
        joined_at,
        last_read_at,
        last_notified_at,
        is_archived,
        is_muted,
        conversation:conversation_id(
          id,
          kind,
          title,
          metadata,
          last_message_at,
          created_at,
          updated_at,
          participants:direct_participants(
            user_id,
            joined_at,
            last_read_at,
            is_archived,
            is_muted,
            profile:user_id(id,name,username,role,tier,initials,color,avatar_url,banner_url,social_bio,bio)
          ),
          messages:direct_messages(
            id,
            body,
            attachment,
            metadata,
            created_at,
            deleted_at,
            sender:sender_id(id,name,username,initials,color,avatar_url)
          )
        )
      `)
      .eq('user_id', this.profile.id)
      .eq('is_archived', false)
      .order('last_message_at', { referencedTable: 'conversation', ascending: false, nullsFirst: false });

    if (error) throw error;

    return (data || [])
      .map((row) => this.normalizeDirectConversation(row.conversation, row))
      .filter(Boolean);
  }

  normalizeDirectConversation(conversation, participantRow = null) {
    if (!conversation?.id) return null;

    const participants = (conversation.participants || []).map((participant) => ({
      ...participant,
      profile: participant.profile ? {
        ...participant.profile,
        username: this.getDisplayUsername(participant.profile),
      } : null,
    }));

    const messages = [...(conversation.messages || [])]
      .filter((message) => !message.deleted_at)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map((message) => ({
        ...message,
        sender: message.sender ? {
          ...message.sender,
          username: this.getDisplayUsername(message.sender),
        } : null,
      }));

    const lastMessage = messages.at(-1) || null;
    const otherParticipants = participants.filter((participant) => participant.user_id !== this.profile.id);
    const streak = this.normalizeDirectStreak(conversation.metadata?.direct_streak || this.calculateDirectStreak(messages, otherParticipants.map((participant) => participant.user_id)));

    return {
      id: conversation.id,
      kind: conversation.kind || 'dm',
      title: conversation.title || otherParticipants.map((participant) => participant.profile?.name).filter(Boolean).join(', ') || 'Nova conversa',
      metadata: conversation.metadata || {},
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
      last_message_at: conversation.last_message_at || lastMessage?.created_at || conversation.created_at,
      participants,
      otherParticipants,
      lastMessage,
      unread_count: this.countUnreadMessages(messages, participantRow?.last_read_at || null),
      is_muted: Boolean(participantRow?.is_muted),
      is_archived: Boolean(participantRow?.is_archived),
      my_last_read_at: participantRow?.last_read_at || null,
      streak,
    };
  }

  normalizeDirectStreak(streak = null) {
    const days = Number(streak?.days || 0);
    const active = Boolean(streak?.active && days >= 2);
    return {
      days: active ? days : 0,
      active,
      level: active ? (streak?.level || this.getDirectStreakLevel(days, true)) : 'apagado',
      updated_at: streak?.updated_at || null,
    };
  }

  countUnreadMessages(messages, lastReadAt = null) {
    return (messages || []).filter((message) => (
      message.sender_id !== this.profile.id
      && (!lastReadAt || new Date(message.created_at) > new Date(lastReadAt))
    )).length;
  }

  getDirectStreakLevel(days = 0, active = false) {
    if (!active) return 'apagado';
    if (days >= 30) return 'lendario';
    if (days >= 15) return 'forte';
    if (days >= 7) return 'medio';
    if (days >= 3) return 'pequeno';
    return 'nascimento';
  }

  dayKey(dateStr) {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  }

  diffDays(later, earlier) {
    const a = new Date(`${later}T00:00:00Z`).getTime();
    const b = new Date(`${earlier}T00:00:00Z`).getTime();
    return Math.round((a - b) / 86400000);
  }

  calculateDirectStreak(messages = [], participantIds = []) {
    const eligible = new Map();
    const allParticipantIds = new Set([this.profile.id, ...(participantIds || [])].filter(Boolean));

    (messages || [])
      .filter((message) => message.sender_id && allParticipantIds.has(message.sender_id))
      .forEach((message) => {
        const dayKey = this.dayKey(message.created_at);
        if (!dayKey) return;
        if (!eligible.has(dayKey)) eligible.set(dayKey, new Set());
        eligible.get(dayKey).add(message.sender_id);
      });

    const sortedDays = [...eligible.keys()].sort().reverse();
    if (!sortedDays.length) return { days: 0, active: false, level: 'apagado', updated_at: null };

    let streak = 0;
    let cursor = null;

    for (const day of sortedDays) {
      const dayParticipants = eligible.get(day);
      if (!dayParticipants || dayParticipants.size < 2) break;
      if (cursor && this.diffDays(cursor, day) !== 1) break;
      streak += 1;
      cursor = day;
    }

    const active = streak >= 2;
    const level = this.getDirectStreakLevel(streak, active);
    return {
      days: streak,
      active,
      level,
      updated_at: cursor ? `${cursor}T23:59:59Z` : null,
    };
  }

  async ensureDirectConversation(otherUserId) {
    const { data, error } = await this.db.rpc('ensure_direct_dm_conversation', {
      p_other_user_id: otherUserId,
    });
    if (error) throw error;
    return data;
  }

  async loadDirectMessages(conversationId, { limit = this.directPageSize } = {}) {
    const { data, error } = await this.db
      .from('direct_messages')
      .select('id,conversation_id,sender_id,body,attachment,metadata,edited_at,deleted_at,created_at,sender:sender_id(id,name,username,initials,color,avatar_url)')
      .eq('conversation_id', conversationId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) throw error;

    return (data || []).map((message) => ({
      ...message,
      sender: message.sender ? {
        ...message.sender,
        username: this.getDisplayUsername(message.sender),
      } : null,
    }));
  }

  async sendDirectMessage(conversationId, body, attachment = null) {
    const cleanBody = (body || '').trim();
    if (!cleanBody && !attachment) throw new Error('Mensagem vazia.');

    const payloadAttachment = attachment && Object.keys(attachment || {}).length ? attachment : null;

    const { data, error } = await this.db
      .from('direct_messages')
      .insert({
        conversation_id: conversationId,
        sender_id: this.profile.id,
        body: cleanBody || null,
        attachment: payloadAttachment || {},
      })
      .select('id,conversation_id,sender_id,body,attachment,metadata,edited_at,deleted_at,created_at,sender:sender_id(id,name,username,initials,color,avatar_url)')
      .single();

    if (error) throw error;

    const { data: streakData, error: streakError } = await this.db
      .rpc('recalculate_direct_streak', { p_conversation_id: conversationId });

    if (streakError) console.warn('[MSY][social] streak do direct indisponivel:', streakError);
    if (streakData && typeof streakData === 'object') data.metadata = { ...(data.metadata || {}), direct_streak: streakData };

    const { data: participantRows } = await this.db
      .from('direct_participants')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .neq('user_id', this.profile.id);

    await Promise.all((participantRows || []).map((row) => this.notify(row.user_id, {
      message: `${this.profile.name} enviou uma mensagem no Direct.`,
      type: 'direct_message',
      icon: '✉️',
      target_type: 'direct_conversation',
      target_id: conversationId,
      target_url: `feed.html?direct=${conversationId}`,
      metadata: { conversation_id: conversationId, message_id: data.id },
    })));

    return {
      ...data,
      sender: data.sender ? {
        ...data.sender,
        username: this.getDisplayUsername(data.sender),
      } : null,
    };
  }

  async markDirectConversationRead(conversationId) {
    const { error } = await this.db
      .from('direct_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', this.profile.id);

    if (error) throw error;
  }

  async updateSocialProfile(payload = {}) {
    const { data, error } = await this.db.rpc('update_social_profile', {
      p_username: payload.username ?? null,
      p_social_bio: payload.social_bio ?? null,
      p_banner_url: payload.banner_url ?? null,
      p_social_links: payload.social_links ?? null,
      p_profile_highlights: payload.profile_highlights ?? null,
    });

    if (error) throw error;

    const nextProfile = {
      ...this.profile,
      ...data,
      username: this.getDisplayUsername(data || this.profile),
    };

    this.profile = nextProfile;
    return nextProfile;
  }

  async notify(userId, payload) {
    if (!userId || userId === this.profile.id) return;
    const message = payload.message || 'Nova notificação social';
    const icon = payload.icon || '🔔';
    const targetUrl = payload.target_url || null;
    try {
      await this.db.rpc('notify_social', {
        p_user_id: userId,
        p_actor_id: this.profile.id,
        p_message: message,
        p_type: payload.type || 'social',
        p_icon: icon,
        p_target_type: payload.target_type || null,
        p_target_id: payload.target_id || null,
        p_target_url: targetUrl,
        p_anchor: payload.anchor || null,
        p_metadata: payload.metadata || {},
      });
    } catch (err) {
      console.warn('[MSY][social] Notificacao contextual indisponivel:', err);
    }

    try {
      await fetch(`${MSY_CONFIG.SUPABASE_URL}/functions/v1/send-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(await this.db.auth.getSession()).data.session?.access_token || MSY_CONFIG.SUPABASE_ANON_KEY}`,
          apikey: MSY_CONFIG.SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          userId,
          title: 'MSY Portal',
          body: message,
          url: targetUrl || '/feed.html',
          icon,
        }),
      });
    } catch (err) {
      console.warn('[MSY][social] Push de dispositivo indisponivel:', err);
    }
  }
}
