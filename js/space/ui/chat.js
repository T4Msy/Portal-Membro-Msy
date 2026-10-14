// Canal de texto do MSY Space. Lógica portada de useMessages/ChatView da Plataforma:
// envio otimista com nonce, tempo real por postgres_changes ('space:chat:<id>'),
// reenvio ao falhar, carregar antigas ao rolar para cima, agrupamento por autor.
import { supabase } from '../lib/supabase.js';
import { mergeMessages } from '../chat/mergeMessages.js';
import { avatarHtml, displayName, esc, formatFull, formatMessageTime, formatTime, icon, linkify, safeColor, toast } from './dom.js';

const PAGE_SIZE = 50;
const MAX_LENGTH = 4000;
const GROUP_WINDOW_MS = 5 * 60_000;
const STICK_THRESHOLD = 120;

function errorText(e) {
  const msg = e?.message || '';
  if (/RATE_LIMITED/.test(msg)) return 'Calma! Muitas mensagens seguidas. Espere alguns segundos.';
  if (/FORBIDDEN|permission|policy/i.test(msg)) return 'Você não tem permissão para isso.';
  return 'Não foi possível concluir. Verifique sua internet.';
}

export class ChatView {
  constructor(container, channel, { workspace, me, onToggleNav }) {
    this.el = container;
    this.channel = channel;
    this.workspace = workspace;
    this.me = me;
    this.onToggleNav = onToggleNav;
    this.items = [];
    this.loading = true;
    this.loadingOlder = false;
    this.hasMore = true;
    this.live = false;
    this.stick = true;
    this.rt = null;
    this.destroyed = false;
    this.editingId = null;
  }

  mount() {
    const c = this.channel;
    this.el.innerHTML = `
      <header class="sp-main-head">
        <button class="sp-icon-btn sp-nav-toggle" data-act="nav" aria-label="Canais">${icon('fa-bars')}</button>
        <span class="sp-head-icon">${icon('fa-hashtag')}</span>
        <h2 class="sp-head-title">${esc(c.name)}</h2>
        ${c.is_private ? `<span class="sp-head-badge" title="Canal privado">${icon('fa-lock')}</span>` : ''}
        <span class="sp-live-off" data-live hidden>Reconectando…</span>
        <span class="sp-grow"></span>
        ${this.workspace.canManage ? `<button class="sp-icon-btn sp-danger-hover" data-act="purge" title="Apagar todas as mensagens deste canal">${icon('fa-broom')}</button>` : ''}
      </header>
      <div class="sp-chat">
        <div class="sp-chat-scroll" role="log" aria-live="polite" aria-label="Mensagens de #${esc(c.name)}">
          <div class="sp-chat-list"><div class="sp-loading">${icon('fa-circle-notch fa-spin')}</div></div>
        </div>
        <button class="sp-jump" data-act="jump" hidden>${icon('fa-arrow-down')} Novas mensagens</button>
      </div>
      <form class="sp-composer" autocomplete="off">
        <textarea rows="1" maxlength="${MAX_LENGTH}" placeholder="Conversar em #${esc(c.name)}" aria-label="Mensagem"></textarea>
        <button type="submit" class="sp-send" aria-label="Enviar">${icon('fa-paper-plane')}</button>
      </form>`;

    this.scrollEl = this.el.querySelector('.sp-chat-scroll');
    this.listEl = this.el.querySelector('.sp-chat-list');
    this.input = this.el.querySelector('.sp-composer textarea');

    this.scrollEl.addEventListener('scroll', () => this.onScroll());
    // Teclado abrindo encolhe a lista: quem estava no fim continua vendo a última mensagem.
    this.resizeObs = new ResizeObserver(() => { if (this.stick) this.scrollEl.scrollTop = this.scrollEl.scrollHeight; });
    this.resizeObs.observe(this.scrollEl);
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.querySelector('.sp-composer').addEventListener('submit', (e) => { e.preventDefault(); this.submit(); });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); this.submit(); }
    });
    this.input.addEventListener('input', () => this.autosize());

    this.fetchLatest()
      .then((list) => { this.items = mergeMessages(this.items, list); this.hasMore = list.length >= PAGE_SIZE; })
      .catch((e) => { console.error('[MSY][space] Erro ao carregar mensagens:', e); toast('Erro ao carregar mensagens.', 'error'); })
      .finally(() => { this.loading = false; this.render(); });
    this.subscribe();
    if (!matchMedia('(pointer: coarse)').matches) this.input.focus();
  }

  destroy() {
    this.destroyed = true;
    this.resizeObs?.disconnect();
    if (this.rt) supabase.removeChannel(this.rt);
    this.rt = null;
  }

  // ── Dados ─────────────────────────────────────────────────
  async fetchLatest() {
    const { data, error } = await supabase.from('space_messages').select('*').eq('channel_id', this.channel.id)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE);
    if (error) throw error;
    return (data || []).reverse();
  }

  async fetchOlder(before) {
    const { data, error } = await supabase.from('space_messages').select('*').eq('channel_id', this.channel.id)
      .lte('created_at', before.created_at)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE + 1);
    if (error) throw error;
    return (data || []).filter((m) => m.id !== before.id).reverse();
  }

  async fetchNewer(after) {
    const { data, error } = await supabase.from('space_messages').select('*').eq('channel_id', this.channel.id)
      .gt('created_at', after).order('created_at', { ascending: true }).limit(200);
    if (error) throw error;
    return data || [];
  }

  subscribe() {
    let subscribedOnce = false;
    const filter = `channel_id=eq.${this.channel.id}`;
    this.rt = supabase.channel(`space:chat:${this.channel.id}`, { config: { private: true } })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'space_messages', filter }, (p) => this.apply([p.new]))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'space_messages', filter }, (p) => this.apply([p.new]))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'space_messages' }, (p) => {
        const id = p.old?.id;
        if (id && this.items.some((m) => m.id === id)) { this.items = this.items.filter((m) => m.id !== id); this.render(); }
      })
      .subscribe((status) => {
        if (this.destroyed) return;
        this.live = status === 'SUBSCRIBED';
        const badge = this.el.querySelector('[data-live]');
        if (badge) badge.hidden = this.live || this.loading;
        if (status === 'SUBSCRIBED') {
          // Reconectou: busca o que chegou enquanto estava fora.
          if (subscribedOnce) {
            const confirmed = this.items.filter((m) => !m.status);
            const last = confirmed[confirmed.length - 1];
            (last ? this.fetchNewer(last.created_at) : this.fetchLatest()).then((l) => this.apply(l)).catch(() => undefined);
          }
          subscribedOnce = true;
        }
      });
  }

  apply(incoming) {
    if (this.destroyed) return;
    this.items = mergeMessages(this.items, incoming);
    this.render();
  }

  submit() {
    const text = this.input.value.trim();
    if (!text) return;
    this.input.value = '';
    this.autosize();
    this.stick = true;
    const nonce = crypto.randomUUID();
    const item = {
      id: `tmp-${nonce}`, channel_id: this.channel.id, author_id: this.me.id,
      content: text.slice(0, MAX_LENGTH), client_nonce: nonce,
      created_at: new Date().toISOString(), edited_at: null, status: 'sending',
    };
    this.apply([item]);
    this.deliver(item);
  }

  async deliver(item) {
    try {
      const { data, error } = await supabase.from('space_messages')
        .insert({ channel_id: item.channel_id, author_id: item.author_id, content: item.content, client_nonce: item.client_nonce })
        .select('*').single();
      if (error) {
        // Reenvio de uma mensagem que já tinha sido gravada: busca a existente.
        if (error.code === '23505') {
          const existing = await supabase.from('space_messages').select('*').eq('author_id', item.author_id).eq('client_nonce', item.client_nonce).single();
          if (!existing.error) return this.apply([existing.data]);
        }
        throw error;
      }
      this.apply([data]);
    } catch (e) {
      console.error('[MSY][space] Falha ao enviar mensagem:', e);
      this.items = this.items.map((m) => (m.id === item.id ? { ...m, status: 'failed' } : m));
      this.render();
      toast(errorText(e), 'error');
    }
  }

  async loadOlder() {
    const oldest = this.items.find((m) => !m.status);
    if (!oldest || this.loadingOlder || !this.hasMore) return;
    this.loadingOlder = true;
    const prevHeight = this.scrollEl.scrollHeight;
    try {
      const older = await this.fetchOlder(oldest);
      this.items = mergeMessages(this.items, older);
      this.hasMore = older.length >= PAGE_SIZE;
      this.render({ keepFrom: prevHeight });
    } catch (e) {
      console.error('[MSY][space] Erro ao carregar antigas:', e);
    } finally {
      this.loadingOlder = false;
    }
  }

  // ── Interface ─────────────────────────────────────────────
  onScroll() {
    const el = this.scrollEl;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD;
    this.stick = nearBottom;
    if (nearBottom) this.el.querySelector('[data-act="jump"]').hidden = true;
    if (el.scrollTop < 200 && this.hasMore && !this.loading) this.loadOlder();
  }

  async onClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.closest('[data-msg]')?.dataset.msg;
    const msg = id ? this.items.find((m) => m.id === id) : null;
    const act = btn.dataset.act;
    try {
      if (act === 'nav') this.onToggleNav?.();
      if (act === 'jump') { this.stick = true; this.scrollEl.scrollTo({ top: this.scrollEl.scrollHeight, behavior: 'smooth' }); btn.hidden = true; }
      if (act === 'retry' && msg) { this.items = this.items.map((m) => (m.id === msg.id ? { ...m, status: 'sending' } : m)); this.render(); this.deliver(msg); }
      if (act === 'discard' && msg) { this.items = this.items.filter((m) => m.id !== msg.id); this.render(); }
      if (act === 'edit' && msg) { this.editingId = msg.id; this.render(); this.el.querySelector('.sp-edit textarea')?.focus(); }
      if (act === 'edit-cancel') { this.editingId = null; this.render(); }
      if (act === 'edit-save' && msg) await this.saveEdit(msg);
      if (act === 'delete' && msg) await this.remove(msg);
      if (act === 'purge') await this.purge();
    } catch (err) {
      console.error('[MSY][space] Ação no chat falhou:', act, err);
      toast(errorText(err), 'error');
    }
  }

  async saveEdit(msg) {
    const text = this.el.querySelector('.sp-edit textarea')?.value.trim();
    if (!text) return;
    if (text !== msg.content) {
      const { error } = await supabase.from('space_messages').update({ content: text }).eq('id', msg.id);
      if (error) throw error;
      this.items = this.items.map((m) => (m.id === msg.id ? { ...m, content: text, edited_at: new Date().toISOString() } : m));
    }
    this.editingId = null;
    this.render();
  }

  async remove(msg) {
    if (!(await MSYConfirm.show('Apagar esta mensagem?', { title: 'Apagar mensagem' }))) return;
    const { error, count } = await supabase.from('space_messages').delete({ count: 'exact' }).eq('id', msg.id);
    if (error) throw error;
    if (count === 0) throw new Error('FORBIDDEN');
    this.items = this.items.filter((m) => m.id !== msg.id);
    this.render();
  }

  async purge() {
    if (!(await MSYConfirm.show(`Apagar TODAS as mensagens de #${this.channel.name}? Não dá para desfazer.`, { title: 'Apagar tudo' }))) return;
    const { data, error } = await supabase.rpc('space_purge_channel', { p_channel: this.channel.id });
    if (error) throw error;
    this.items = [];
    this.hasMore = false;
    this.render();
    toast(`${Number(data || 0)} mensagens apagadas.`);
  }

  autosize() {
    this.input.style.height = 'auto';
    this.input.style.height = `${Math.min(this.input.scrollHeight, 160)}px`;
  }

  render({ keepFrom = null } = {}) {
    if (this.destroyed) return;
    const el = this.scrollEl;
    const badge = this.el.querySelector('[data-live]');
    if (badge) badge.hidden = this.live || this.loading;

    if (this.loading) return;
    let html = '';
    if (this.loadingOlder) html += `<div class="sp-loading sp-loading-sm">${icon('fa-circle-notch fa-spin')}</div>`;
    if (!this.hasMore) {
      html += `<div class="sp-chat-welcome">
        <span class="sp-welcome-icon">${icon('fa-hashtag')}</span>
        <h3>Bem-vindo a #${esc(this.channel.name)}</h3>
        <p>Este é o começo do canal.</p>
      </div>`;
    }
    this.items.forEach((m, i) => {
      const prev = this.items[i - 1];
      const grouped = Boolean(prev) && prev.author_id === m.author_id && !prev.status === !m.status
        && new Date(m.created_at) - new Date(prev.created_at) < GROUP_WINDOW_MS;
      html += this.messageHtml(m, grouped);
    });
    this.listEl.innerHTML = html;

    if (keepFrom !== null) el.scrollTop += el.scrollHeight - keepFrom;
    else if (this.stick) el.scrollTop = el.scrollHeight;
    else this.el.querySelector('[data-act="jump"]').hidden = false;
  }

  messageHtml(m, grouped) {
    const author = m.author_id ? this.workspace.profile(m.author_id) : null;
    const mine = m.author_id === this.me.id;
    const canDelete = mine || this.workspace.canManage;
    const editing = this.editingId === m.id;
    const state = m.status === 'sending' ? ' is-sending' : m.status === 'failed' ? ' is-failed' : '';
    const body = editing
      ? `<div class="sp-edit"><textarea rows="2" maxlength="${MAX_LENGTH}">${esc(m.content)}</textarea>
          <div class="sp-edit-actions"><button class="btn btn-ghost btn-sm" data-act="edit-cancel">Cancelar</button><button class="btn btn-primary btn-sm" data-act="edit-save">Salvar</button></div></div>`
      : `<div class="sp-msg-text">${linkify(m.content)}${m.edited_at ? ' <span class="sp-msg-edited" title="Editada">(editada)</span>' : ''}</div>`;
    const actions = m.status === 'failed'
      ? `<div class="sp-msg-failed">Não enviada. <button data-act="retry">Tentar de novo</button> · <button data-act="discard">Descartar</button></div>`
      : !m.status && !editing && (mine || canDelete)
        ? `<div class="sp-msg-tools">${mine ? `<button data-act="edit" title="Editar">${icon('fa-pen')}</button>` : ''}${canDelete ? `<button data-act="delete" title="Apagar">${icon('fa-trash')}</button>` : ''}</div>`
        : '';
    if (grouped) {
      return `<div class="sp-msg sp-msg-grouped${state}" data-msg="${esc(m.id)}">
        <span class="sp-msg-hover-time" title="${esc(formatFull(m.created_at))}">${esc(formatTime(m.created_at))}</span>
        <div class="sp-msg-body">${body}${actions}</div></div>`;
    }
    return `<div class="sp-msg${state}" data-msg="${esc(m.id)}">
      ${avatarHtml(author, 38, 'sp-msg-avatar')}
      <div class="sp-msg-body">
        <div class="sp-msg-head"><span class="sp-msg-author" style="--sp-c:${safeColor(author?.color, '#d9d9d9')}">${esc(displayName(author))}</span>
        <span class="sp-msg-time" title="${esc(formatFull(m.created_at))}">${esc(formatMessageTime(m.created_at))}</span></div>
        ${body}${actions}
      </div></div>`;
  }
}
