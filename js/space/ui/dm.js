import { supabase } from '../lib/supabase.js';
import { mergeMessages } from '../chat/mergeMessages.js';
import { avatarHtml, displayName, esc, formatMessageTime, icon, safeColor, toast } from './dom.js';
import { rpcFailureMessage } from '../lib/rpc-error.js';

const PAGE_SIZE = 50;
const MAX_LENGTH = 4000;

function staticAvatar(profile, size = 34) {
  const name = displayName(profile);
  const image = profile?.avatar_url ? `<img src="${esc(profile.avatar_url)}" alt="" loading="lazy">` : esc(profile?.initials || Utils.getInitials(name));
  return `<span class="sp-avatar" style="--sp-c:${safeColor(profile?.color)};--sp-size:${size}px" aria-hidden="true">${image}</span>`;
}

/** Mensagens diretas: conversas individuais, histórico por cursor e realtime restrito no banco. */
export class DmView {
  constructor(container, { workspace, me, onToggleNav, initialConversation = null }) {
    this.el = container; this.workspace = workspace; this.me = me; this.onToggleNav = onToggleNav;
    this.initialConversation = initialConversation; this.conversations = []; this.current = null;
    this.items = []; this.hasMore = false; this.loading = false; this.rt = null; this.inboxRt = null; this.destroyed = false;
    this.abort = new AbortController();
  }

  async mount() {
    this.el.innerHTML = `<section class="sp-dm-shell"><aside class="sp-dm-side"><header><button class="sp-icon-btn sp-nav-toggle" data-act="nav" aria-label="Canais">${icon('fa-bars')}</button><h2>Mensagens</h2></header><div class="sp-dm-list" data-list><p class="sp-muted">Carregando conversas…</p></div></aside><section class="sp-dm-main" data-main><div class="sp-lobby"><div class="sp-lobby-orb">${icon('fa-message')}</div><h2>Suas mensagens</h2><p class="sp-muted">Selecione uma conversa ou abra o perfil de um membro para iniciar uma DM.</p></div></section></section>`;
    this.el.addEventListener('click', (e) => this.onClick(e), { signal: this.abort.signal });
    this.el.addEventListener('submit', (e) => { if (e.target.matches('[data-dm-form]')) { e.preventDefault(); this.send(); } }, { signal: this.abort.signal });
    this.el.addEventListener('keydown', (e) => {
      if (e.target.matches('[data-dm-form] textarea') && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); this.send(); }
    }, { signal: this.abort.signal });
    let data, error;
    try { ({ data, error } = await supabase.rpc('space_dm_list_conversations')); }
    catch (e) { error = e; }
    if (this.destroyed) return;
    if (error) { console.error('[MSY][space] Falha ao listar DMs:', error); this.el.querySelector('[data-list]').innerHTML = `<p class="sp-muted">${esc(rpcFailureMessage(error, 'space_dm_list_conversations', 'Não foi possível carregar as conversas.'))}</p>`; return; }
    this.conversations = data || []; this.renderList();
    this.subscribeInbox();
    if (this.initialConversation) await this.open(this.initialConversation);
    else if (this.conversations[0]) await this.open(this.conversations[0].conversation_id);
  }

  destroy() { this.destroyed = true; this.abort.abort(); this.closeRealtime(); if (this.inboxRt) supabase.removeChannel(this.inboxRt); this.inboxRt = null; }
  closeRealtime() { if (this.rt) supabase.removeChannel(this.rt); this.rt = null; }

  renderList() {
    const list = this.el.querySelector('[data-list]'); if (!list) return;
    list.innerHTML = this.conversations.length ? this.conversations.map((c) => {
      const person = this.workspace.profile(c.peer_user_id);
      return `<button class="sp-dm-item ${this.current?.conversation_id === c.conversation_id ? 'is-active' : ''}" data-act="open-dm" data-id="${esc(c.conversation_id)}">${staticAvatar(person)}<span>${esc(displayName(person))}</span></button>`;
    }).join('') : '<p class="sp-muted sp-dm-empty">Nenhuma conversa ainda.</p>';
  }

  async open(id) {
    const conversation = this.conversations.find((c) => c.conversation_id === id)
      || { conversation_id: id, peer_user_id: null };
    this.current = conversation; this.items = []; this.hasMore = false; this.loading = true; this.closeRealtime(); this.renderList();
    const peer = this.workspace.profile(conversation.peer_user_id);
    const main = this.el.querySelector('[data-main]');
    main.innerHTML = `<header class="sp-main-head"><h2 class="sp-head-title">${esc(displayName(peer))}</h2><span class="sp-grow"></span></header>
      <div class="sp-chat"><div class="sp-chat-scroll" data-dm-scroll role="log" aria-live="polite" aria-label="Mensagens diretas com ${esc(displayName(peer))}"><div class="sp-chat-list" data-dm-items><div class="sp-loading">${icon('fa-circle-notch fa-spin')}</div></div></div></div>
      <form class="sp-composer" data-dm-form><textarea rows="1" maxlength="${MAX_LENGTH}" placeholder="Mensagem para ${esc(displayName(peer))}" aria-label="Mensagem direta"></textarea><button type="submit" class="sp-send" aria-label="Enviar">${icon('fa-paper-plane')}</button></form>`;
    this.scroll = main.querySelector('[data-dm-scroll]'); this.renderMessages();
    this.scroll.addEventListener('scroll', () => { if (this.scroll.scrollTop < 160) this.loadOlder(); }, { signal: this.abort.signal });
    try {
      const rows = await this.fetchLatest();
      if (this.destroyed || this.current?.conversation_id !== id) return;
      this.items = mergeMessages(this.items, rows); this.hasMore = rows.length >= PAGE_SIZE;
    } catch (e) { console.error('[MSY][space] Erro ao carregar histórico DM:', e); toast('Não foi possível carregar o histórico.', 'error'); }
    this.loading = false; this.renderMessages(true); this.subscribe(id);
    if (!matchMedia('(pointer: coarse)').matches) main.querySelector('[data-dm-form] textarea')?.focus({ preventScroll: true });
  }

  async fetchLatest() {
    const { data, error } = await supabase.from('space_dm_messages').select('*').eq('conversation_id', this.current.conversation_id)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE);
    if (error) throw error; return (data || []).reverse();
  }

  async loadOlder() {
    if (this.loading || !this.hasMore || !this.items.length) return;
    this.loading = true; const oldest = this.items.find((m) => !m.status); const height = this.scroll.scrollHeight;
    try {
      const { data, error } = await supabase.from('space_dm_messages').select('*').eq('conversation_id', this.current.conversation_id)
        .lt('created_at', oldest.created_at).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE + 1);
      if (error) throw error;
      const rows = data || []; this.hasMore = rows.length > PAGE_SIZE; this.items = mergeMessages(this.items, rows.slice(0, PAGE_SIZE).reverse());
      this.renderMessages(); this.scroll.scrollTop = this.scroll.scrollHeight - height;
    } catch (e) { console.error('[MSY][space] Falha ao paginar DM:', e); toast('Erro ao carregar mensagens antigas.', 'error'); }
    finally { this.loading = false; }
  }

  subscribe(id) {
    this.rt = supabase.channel(`space:dm:${id}`, { config: { private: true } })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'space_dm_messages', filter: `conversation_id=eq.${id}` }, (p) => {
        if (!this.destroyed && this.current?.conversation_id === id) { this.items = mergeMessages(this.items, [p.new]); this.renderMessages(true); }
      }).subscribe((status) => { if (status === 'CHANNEL_ERROR') toast('A conexão da DM foi interrompida.', 'error'); });
  }

  subscribeInbox() {
    this.inboxRt = supabase.channel(`space:dm-inbox:${this.me.id}`, { config: { private: true } })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'space_dm_messages' }, (p) => {
        const conversation = this.conversations.find((c) => c.conversation_id === p.new.conversation_id);
        if (conversation) {
          conversation.last_message_at = p.new.created_at;
          this.conversations.sort((a, b) => b.last_message_at.localeCompare(a.last_message_at)); this.renderList();
        } else void this.reloadConversations();
        if (this.current?.conversation_id === p.new.conversation_id) {
          this.items = mergeMessages(this.items, [p.new]); this.renderMessages(true);
        }
      }).subscribe((status) => { if (status === 'CHANNEL_ERROR') console.warn('[MSY][space] Inbox DM indisponível.'); });
  }

  async reloadConversations() {
    const { data, error } = await supabase.rpc('space_dm_list_conversations');
    if (this.destroyed) return;
    if (error) {
      console.error('[MSY][space] Falha ao atualizar lista de DMs:', error);
      const list = this.el.querySelector('[data-list]');
      if (list) list.innerHTML = `<p class="sp-muted">${esc(rpcFailureMessage(error, 'space_dm_list_conversations', 'Não foi possível atualizar as conversas.'))}</p>`;
      return;
    }
    this.conversations = data || []; this.renderList();
  }

  send() {
    const input = this.el.querySelector('[data-dm-form] textarea'); const content = input.value.trim().slice(0, MAX_LENGTH);
    if (!content || !this.current) return;
    input.value = ''; const nonce = crypto.randomUUID();
    const pending = { id: `tmp-${nonce}`, conversation_id: this.current.conversation_id, sender_id: this.me.id, content, client_nonce: nonce, created_at: new Date().toISOString(), status: 'sending' };
    this.items = mergeMessages(this.items, [pending]); this.renderMessages(true);
    supabase.from('space_dm_messages').insert({ conversation_id: pending.conversation_id, sender_id: this.me.id, content, client_nonce: nonce }).select('*').single()
      .then(({ data, error }) => {
        if (error) throw error;
        this.items = mergeMessages(this.items, [data]); this.renderMessages(true);
        const c = this.conversations.find((x) => x.conversation_id === data.conversation_id);
        if (c) c.last_message_at = data.created_at;
        this.conversations.sort((a, b) => b.last_message_at.localeCompare(a.last_message_at)); this.renderList();
      }).catch((e) => {
        console.error('[MSY][space] Falha ao enviar DM:', e);
        this.items = this.items.map((m) => m.id === pending.id ? { ...m, status: 'failed' } : m); this.renderMessages();
        toast(/FORBIDDEN|policy|permission/i.test(e.message || '') ? 'Você não tem acesso a esta conversa.' : 'Falha ao enviar. Verifique sua internet.', 'error');
      });
  }

  renderMessages(stick = false) {
    const list = this.el.querySelector('[data-dm-items]'); if (!list) return;
    list.innerHTML = this.items.length ? this.items.map((m) => {
      const person = this.workspace.profile(m.sender_id);
      return `<article class="sp-msg ${m.sender_id === this.me.id ? 'is-mine' : ''}" data-status="${m.status || ''}">
        ${avatarHtml(person, 30)}<div class="sp-msg-body"><div class="sp-msg-head"><b>${esc(displayName(person))}</b><time>${esc(formatMessageTime(m.created_at))}</time></div><div class="sp-msg-content">${esc(m.content)}</div>${m.status === 'sending' ? '<small>Enviando…</small>' : ''}${m.status === 'failed' ? '<small class="sp-dm-error">Não enviada</small>' : ''}</div></article>`;
    }).join('') : (this.loading ? '<div class="sp-loading">Carregando…</div>' : '<div class="sp-dm-empty">Esta conversa ainda não tem mensagens.</div>');
    if (stick || !this.items.length) this.scroll.scrollTop = this.scroll.scrollHeight;
  }

  async onClick(e) {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    if (btn.dataset.act === 'nav') this.onToggleNav?.();
    if (btn.dataset.act === 'open-dm') await this.open(btn.dataset.id);
  }
}
