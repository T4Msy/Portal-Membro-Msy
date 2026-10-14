// Estrutura do MSY Space: categorias, canais e perfis do portal.
// Atualiza ao vivo pelo tópico privado 'space:workspace' (postgres_changes filtrado por RLS).
import { supabase } from './lib/supabase.js';

const PROFILE_FIELDS = 'id,name,initials,color,avatar_url,tier';

export class Workspace extends EventTarget {
  constructor(me) {
    super();
    this.me = me;
    this.categories = [];
    this.channels = [];
    this.profiles = new Map();
    this.canManage = false;
    this.channel = null;
    this.reloadTimer = null;
  }

  async load() {
    const [cats, chans, profs, manage] = await Promise.all([
      supabase.from('space_categories').select('*').order('position'),
      supabase.from('space_channels').select('*').order('position').order('created_at'),
      supabase.from('profiles').select(PROFILE_FIELDS).eq('status', 'ativo'),
      supabase.rpc('space_can_manage'),
    ]);
    if (cats.error) throw cats.error;
    if (chans.error) throw chans.error;
    if (profs.error) throw profs.error;
    this.categories = cats.data || [];
    this.channels = chans.data || [];
    this.profiles = new Map((profs.data || []).map((p) => [p.id, p]));
    this.canManage = manage.data === true;
    this.emit();
  }

  async reloadChannels() {
    const [cats, chans] = await Promise.all([
      supabase.from('space_categories').select('*').order('position'),
      supabase.from('space_channels').select('*').order('position').order('created_at'),
    ]);
    if (cats.error || chans.error) {
      console.warn('[MSY][space] Falha ao atualizar canais:', cats.error || chans.error);
      return;
    }
    this.categories = cats.data || [];
    this.channels = chans.data || [];
    this.emit();
  }

  /** Mudanças de estrutura chegam agrupadas (vários eventos seguidos = 1 recarga). */
  subscribe() {
    const schedule = () => {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = setTimeout(() => this.reloadChannels(), 300);
    };
    let ch = supabase.channel('space:workspace', { config: { private: true } });
    for (const table of ['space_channels', 'space_categories', 'space_channel_members']) {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table }, schedule);
    }
    this.channel = ch.subscribe((status) => {
      if (status === 'CHANNEL_ERROR') console.warn('[MSY][space] Canal de estrutura indisponível.');
    });
  }

  close() {
    clearTimeout(this.reloadTimer);
    if (this.channel) supabase.removeChannel(this.channel);
    this.channel = null;
  }

  getChannel(id) { return this.channels.find((c) => c.id === id) || null; }
  profile(id) { return this.profiles.get(id) || null; }

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
