// Coluna de canais do MSY Space (portado de ChannelSidebar/UserPanel/RoomDialogs da Plataforma).
import { supabase } from '../lib/supabase.js';
import { avatarHtml, displayName, esc, icon, toast } from './dom.js';

export class SpaceNav {
  constructor(container, { workspace, voice, online, me, onSelect }) {
    this.el = container;
    this.workspace = workspace;
    this.voice = voice;
    this.online = online;
    this.me = me;
    this.onSelect = onSelect;
    this.selectedId = null;
    this.collapsed = new Set(JSON.parse(localStorage.getItem('msy_space_collapsed') || '[]'));
    this.onChange = () => this.render();
  }

  mount() {
    this.el.addEventListener('click', (e) => this.onClick(e));
    for (const src of [this.workspace, this.voice, this.online]) src.addEventListener('change', this.onChange);
    this.render();
  }

  select(id) { this.selectedId = id; this.render(); }

  render() {
    const { groups, rooms } = this.workspace.grouped();
    const voiceMap = this.online.voiceByChannel();
    const snap = this.voice.snapshot;
    // Quem está falando agora na sala em que estou (o resto vem da presença global).
    const speaking = new Set();
    if (snap && this.voice.active) {
      if (snap.local.speaking && !snap.local.muted) speaking.add(this.me.id);
      snap.participants.forEach((p) => { if (p.speaking && !p.meta.muted) speaking.add(p.userId); });
    }

    const channelItem = (c) => {
      const inVoice = c.kind === 'voice' ? (voiceMap.get(c.id) || []) : [];
      // Na sala atual, a lista vem da própria sala (mais rápida que a presença global).
      const people = c.kind === 'voice' && this.voice.channelId === c.id && snap
        ? [{ userId: this.me.id, muted: snap.local.muted, deafened: snap.local.deafened, screen: Boolean(snap.local.screen) },
          ...snap.participants.map((p) => ({ userId: p.userId, muted: p.meta.muted, deafened: p.meta.deafened, screen: p.meta.screen }))]
        : inVoice;
      const unique = people.filter((p, i) => people.findIndex((x) => x.userId === p.userId) === i);
      return `<li>
        <button class="sp-ch ${this.selectedId === c.id ? 'is-active' : ''} ${this.voice.channelId === c.id ? 'is-connected' : ''}" data-act="select" data-id="${esc(c.id)}">
          ${icon(c.kind === 'voice' ? 'fa-volume-high' : 'fa-hashtag')}
          <span class="sp-ch-name">${esc(c.name)}</span>
          ${c.is_private ? `<span class="sp-ch-lock">${icon('fa-lock')}</span>` : ''}
          ${c.kind === 'voice' && unique.length ? `<span class="sp-ch-count">${unique.length}</span>` : ''}
        </button>
        ${unique.length ? `<ul class="sp-ch-people">${unique.map((p) => {
          const prof = this.workspace.profile(p.userId);
          return `<li class="${speaking.has(p.userId) ? 'is-speaking' : ''}">${avatarHtml(prof, 22)}<span>${esc(displayName(prof))}</span>
            ${p.screen ? `<i class="fa-solid fa-display sp-live" title="Transmitindo"></i>` : ''}
            ${p.deafened ? icon('fa-volume-xmark') : p.muted ? icon('fa-microphone-slash') : ''}</li>`;
        }).join('')}</ul>` : ''}
      </li>`;
    };

    const groupHtml = groups.map(({ category, channels }) => {
      const key = category?.id || 'sem-categoria';
      const closed = this.collapsed.has(key);
      return `<section class="sp-group">
        ${category ? `<button class="sp-group-head" data-act="toggle-group" data-key="${esc(key)}" aria-expanded="${!closed}">
          ${icon(closed ? 'fa-chevron-right' : 'fa-chevron-down')}<span>${esc(category.name)}</span></button>` : ''}
        ${closed ? '' : `<ul class="sp-ch-list">${channels.map(channelItem).join('') || '<li class="sp-empty-line">Nenhum canal</li>'}</ul>`}
      </section>`;
    }).join('');

    const me = this.workspace.profile(this.me.id) || this.me;
    const vs = this.voice.snapshot;
    const call = this.voice.active ? this.voice.channel : null;

    const html = `
      <div class="sp-nav-head">
        <span class="sp-brand"><i class="fa-solid fa-satellite-dish"></i> MSY Space</span>
        <a class="sp-icon-btn sp-nav-home" href="dashboard.html" title="Voltar ao Portal" aria-label="Voltar ao Portal">${icon('fa-house')}</a>
        <button class="sp-icon-btn sp-nav-close" data-act="close-nav" aria-label="Fechar">${icon('fa-xmark')}</button>
      </div>
      <div class="sp-nav-actions">
        <button class="sp-pill" data-act="create-room">${icon('fa-plus')} Criar sala</button>
        <button class="sp-pill" data-act="join-room">${icon('fa-key')} Usar código</button>
      </div>
      <div class="sp-nav-scroll">
        ${groupHtml}
        ${rooms.length ? `<section class="sp-group"><div class="sp-group-head is-static">${icon('fa-key')}<span>Salas com código</span></div>
          <ul class="sp-ch-list">${rooms.map(channelItem).join('')}</ul></section>` : ''}
      </div>
      ${call ? `<div class="sp-callbar">
        <div class="sp-callbar-info"><span class="sp-callbar-status is-${esc(vs.status)}">${vs.status === 'connected' ? 'Voz conectada' : vs.status === 'reconnecting' ? 'Reconectando…' : 'Conectando…'}</span>
          <button class="sp-callbar-room" data-act="select" data-id="${esc(call.id)}">${esc(call.name)}</button></div>
        <button class="sp-icon-btn sp-danger-hover" data-act="leave" title="Desconectar">${icon('fa-phone-slash')}</button>
      </div>` : ''}
      <div class="sp-me">
        ${avatarHtml(me, 34)}
        <div class="sp-me-name"><b>${esc(displayName(me))}</b><small>${call ? 'Em chamada' : 'Disponível'}</small></div>
        ${call ? `<button class="sp-icon-btn ${vs.local.muted || !vs.local.micAvailable ? 'is-off' : ''}" data-act="mute" title="${vs.local.muted ? 'Ativar microfone' : 'Desativar microfone'}">${icon(vs.local.muted || !vs.local.micAvailable ? 'fa-microphone-slash' : 'fa-microphone')}</button>
          <button class="sp-icon-btn ${vs.local.deafened ? 'is-off' : ''}" data-act="deafen" title="${vs.local.deafened ? 'Ativar som' : 'Desativar som'}">${icon(vs.local.deafened ? 'fa-volume-xmark' : 'fa-headphones')}</button>` : ''}
      </div>`;
    if (html === this.lastHtml) return;
    this.lastHtml = html;
    // Redesenhar não pode fazer a lista pular para o topo.
    const scrollTop = this.el.querySelector('.sp-nav-scroll')?.scrollTop || 0;
    this.el.innerHTML = html;
    const scroller = this.el.querySelector('.sp-nav-scroll');
    if (scroller) scroller.scrollTop = scrollTop;
  }

  async onClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'select') this.onSelect(btn.dataset.id);
    if (act === 'toggle-group') {
      const key = btn.dataset.key;
      this.collapsed.has(key) ? this.collapsed.delete(key) : this.collapsed.add(key);
      try { localStorage.setItem('msy_space_collapsed', JSON.stringify([...this.collapsed])); } catch { /* sem storage */ }
      this.render();
    }
    if (act === 'close-nav') this.el.closest('.sp-app')?.classList.remove('is-nav-open');
    if (act === 'leave') this.voice.leave();
    if (act === 'mute') this.voice.toggleMute();
    if (act === 'deafen') this.voice.toggleDeafen();
    if (act === 'create-room') await this.createRoom();
    if (act === 'join-room') await this.joinRoom();
  }

  async createRoom() {
    const name = await promptDialog({ title: 'Criar sala', label: 'Nome da sala (opcional)', placeholder: 'Ex.: Resenha', confirm: 'Criar' });
    if (name === null) return;
    const { data, error } = await supabase.rpc('space_create_room', { p_name: name });
    if (error) {
      console.error('[MSY][space] Falha ao criar sala:', error);
      return toast(/ROOM_LIMIT/.test(error.message) ? 'Você já tem 3 salas abertas.' : 'Não foi possível criar a sala.', 'error');
    }
    const room = Array.isArray(data) ? data[0] : data;
    await this.workspace.reloadChannels();
    toast(`Sala criada! Código: ${room.join_code}`);
    this.onSelect(room.id);
  }

  async joinRoom(prefill = '') {
    const code = await promptDialog({ title: 'Entrar com código', label: 'Código da sala', placeholder: 'XXXX-XXXX', confirm: 'Entrar', value: prefill });
    if (!code) return;
    await this.joinByCode(code);
  }

  async joinByCode(code) {
    const { data, error } = await supabase.rpc('space_join_room', { p_code: code });
    if (error) {
      console.error('[MSY][space] Falha ao entrar pelo código:', error);
      return toast(/ROOM_NOT_FOUND/.test(error.message) ? 'Código inválido ou sala encerrada.' : 'Não foi possível entrar na sala.', 'error');
    }
    await this.workspace.reloadChannels();
    this.onSelect(data);
  }
}

/** Pequeno diálogo com um campo de texto (resolve null ao cancelar). */
function promptDialog({ title, label, placeholder = '', confirm = 'OK', value = '' }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-overlay open sp-modal';
    wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-header"><div class="modal-title">${esc(title)}</div><button class="modal-close" data-x aria-label="Fechar">${icon('fa-xmark')}</button></div>
      <form class="modal-body"><label class="form-label">${esc(label)}</label><input class="form-input" maxlength="40" placeholder="${esc(placeholder)}" value="${esc(value)}"></form>
      <div class="modal-footer"><button class="btn btn-ghost" data-x>Cancelar</button><button class="btn btn-primary" data-ok>${esc(confirm)}</button></div></div>`;
    document.body.appendChild(wrap);
    const input = wrap.querySelector('input');
    const done = (v) => { wrap.remove(); resolve(v); };
    wrap.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', () => done(null)));
    wrap.querySelector('[data-ok]').addEventListener('click', () => done(input.value.trim()));
    wrap.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); done(input.value.trim()); });
    wrap.addEventListener('click', (e) => { if (e.target === wrap) done(null); });
    setTimeout(() => input.focus(), 30);
  });
}
