// Estrutura do MSY Space: categorias, canais e perfis do portal.
// Atualiza ao vivo: alterações de canais por Postgres Changes; membresias via broadcast sem dados.
import { supabase } from './lib/supabase.js';

const PROFILE_FIELDS = 'id,name,initials,tier';
const SPACE_PROFILE_FIELDS = 'user_id,display_name,bio,accent_color,avatar_path,banner_path';

export class Workspace extends EventTarget {
  constructor(me) {
    super();
    this.me = me;
    this.categories = [];
    this.channels = [];
    this.channelMembers = new Map();
    this.profiles = new Map();
    this.canManage = false;
    this.channel = null;
    this.reloadTimer = null;
    this.channelIssue = null;
  }

  async load() {
    const [cats, chans, profs, spaceProfiles, manage, memberships] = await Promise.all([
      supabase.from('space_categories').select('*').order('position'),
      supabase.from('space_channels').select('*').order('position').order('created_at'),
      supabase.from('profiles').select(PROFILE_FIELDS).eq('status', 'ativo'),
      supabase.from('space_profiles').select(SPACE_PROFILE_FIELDS),
      supabase.rpc('space_can_manage'),
      supabase.from('space_channel_members').select('channel_id,user_id'),
    ]);
    if (cats.error) throw cats.error;
    if (chans.error) throw chans.error;
    if (profs.error) throw profs.error;
    if (spaceProfiles.error) throw spaceProfiles.error;
    if (memberships.error) throw memberships.error;
    this.categories = cats.data || [];
    this.channels = chans.data || [];
    const custom = new Map((spaceProfiles.data || []).map((p) => [p.user_id, p]));
    this.profiles = new Map((profs.data || []).map((p) => {
      const extra = custom.get(p.id) || {};
      const publicUrl = (path) => path ? supabase.storage.from('space-profile-media').getPublicUrl(path).data.publicUrl : null;
      return [p.id, {
        ...p,
        name: extra.display_name || p.name,
        bio: extra.bio || '',
        color: extra.accent_color || '#a855f7',
        avatar_url: publicUrl(extra.avatar_path),
        banner_url: publicUrl(extra.banner_path),
        avatar_path: extra.avatar_path || null,
        banner_path: extra.banner_path || null,
      }];
    }));
    this.canManage = manage.data === true;
    this.channelMembers = new Map();
    for (const row of memberships.data || []) {
      if (!this.channelMembers.has(row.channel_id)) this.channelMembers.set(row.channel_id, []);
      this.channelMembers.get(row.channel_id).push(row.user_id);
    }
    this.emit();
  }

  async reloadChannels() {
    const [cats, chans, memberships] = await Promise.all([
      supabase.from('space_categories').select('*').order('position'),
      supabase.from('space_channels').select('*').order('position').order('created_at'),
      supabase.from('space_channel_members').select('channel_id,user_id'),
    ]);
    if (cats.error || chans.error || memberships.error) {
      console.warn('[MSY][space] Falha ao atualizar canais:', cats.error || chans.error || memberships.error);
      return;
    }
    this.categories = cats.data || [];
    this.channels = chans.data || [];
    this.channelMembers = new Map();
    for (const row of memberships.data || []) {
      if (!this.channelMembers.has(row.channel_id)) this.channelMembers.set(row.channel_id, []);
      this.channelMembers.get(row.channel_id).push(row.user_id);
    }
    this.emit();
  }

  /** Mudanças de estrutura chegam agrupadas (vários eventos seguidos = 1 recarga). */
  subscribe() {
    const schedule = () => {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = setTimeout(() => this.reloadChannels(), 300);
    };
    if (this.channel) supabase.removeChannel(this.channel);
    let ch = supabase.channel('space:workspace', { config: { private: true } });
    for (const table of ['space_channels', 'space_categories']) {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, schedule);
    }
    ch = ch.on('broadcast', { event: 'membership_changed' }, schedule);
    this.channel = ch.subscribe((status, error) => {
      if (status === 'SUBSCRIBED') {
        if (this.channelIssue) {
          console.info('[MSY][space] Canal de estrutura restabelecido; atualizando estrutura após a reconexão.');
          schedule();
        }
        this.channelIssue = null;
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        const message = typeof error === 'string' ? error : error?.message || null;
        const details = typeof error === 'string' ? null : error?.details || error?.hint || null;
        const issue = `${status}:${error?.code || ''}:${message || ''}:${details || ''}`;
        if (issue === this.channelIssue) return;
        this.channelIssue = issue;
        console.warn('[MSY][space] Falha ao assinar space:workspace:', {
          status, code: error?.code || null, message, details,
        });
      }
    });
  }

  close() {
    clearTimeout(this.reloadTimer);
    if (this.channel) supabase.removeChannel(this.channel);
    this.channel = null;
  }

  getChannel(id) { return this.channels.find((c) => c.id === id) || null; }
  profile(id) { return this.profiles.get(id) || null; }

  applySpaceProfile(userId, extra) {
    const current = this.profiles.get(userId);
    if (!current) return;
    const publicUrl = (path) => path ? supabase.storage.from('space-profile-media').getPublicUrl(path).data.publicUrl : null;
    this.profiles.set(userId, { ...current, ...extra,
      name: extra.display_name || current.name,
      color: extra.accent_color || current.color,
      avatar_url: publicUrl(extra.avatar_path) || (extra.avatar_path === null ? null : current.avatar_url),
      banner_url: publicUrl(extra.banner_path),
    });
    this.emit();
  }

  /** Canais fixos agrupados por categoria + salas com código à parte. */
  grouped() {
    const fixed = this.channels.filter((c) => !c.is_temporary);
    const groups = this.categories.map((cat) => ({ category: cat, channels: fixed.filter((c) => c.category_id === cat.id) }));
    const loose = fixed.filter((c) => !c.category_id || !this.categories.some((cat) => cat.id === c.category_id));
    if (loose.length) groups.unshift({ category: null, channels: loose });
    return { groups, rooms: this.channels.filter((c) => c.is_temporary) };
  }

  emit() { this.dispatchEvent(new Event('change')); }
}
