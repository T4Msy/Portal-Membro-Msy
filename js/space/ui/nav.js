// Coluna de canais do MSY Space (portado de ChannelSidebar/UserPanel/RoomDialogs da Plataforma).
import { supabase } from '../lib/supabase.js';
import { avatarHtml, displayName, esc, icon, toast } from './dom.js';
import { openVoiceSettings } from './settings.js';
import { listDevices } from '../voice/media/devices.js';
import { getCapabilities } from '../voice/media/capabilities.js';
import { downloadAndroidApp, latestAppInfo } from './app-download.js';

export class SpaceNav {
  constructor(container, { workspace, voice, online, me, onSelect }) {
    this.el = container;
    this.workspace = workspace;
    this.voice = voice;
    this.online = online;
    this.me = me;
    this.onSelect = onSelect;
    this.selectedId = null;
    this.deviceMenu = null;
    this.devices = { inputs: [], outputs: [], cameras: [] };
    // Dado do navegador pode estar corrompido ou bloqueado: nunca impede o Space de abrir.
    this.collapsed = new Set((() => {
      try {
        const saved = JSON.parse(localStorage.getItem('msy_space_collapsed') || '[]');
        return Array.isArray(saved) ? saved.filter((k) => typeof k === 'string') : [];
      } catch { return []; }
    })());
    this.onChange = () => this.render();
  }

  mount() {
    this.el.addEventListener('click', (e) => this.onClick(e));
    document.addEventListener('click', (e) => {
      if (this.deviceMenu && !this.el.contains(e.target)) { this.deviceMenu = null; this.render(); }
    });
    for (const src of [this.workspace, this.voice, this.online]) src.addEventListener('change', this.onChange);
    this.render();
    // Versão do app publicada (aparece no botão de download).
    latestAppInfo().then((info) => { if (info?.version) { this.appVersion = info.version; this.render(); } });
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
      // Sala com código: quem criou (ou a gestão do Space) pode encerrar direto pela lista.
      const canDelete = c.is_temporary && (c.created_by === this.me.id || this.workspace.canManage);
      return `<li class="${canDelete ? 'sp-ch-deletable' : ''}">
        <button class="sp-ch ${this.selectedId === c.id ? 'is-active' : ''} ${this.voice.channelId === c.id ? 'is-connected' : ''}" data-act="select" data-id="${esc(c.id)}">
          ${icon(c.kind === 'voice' ? 'fa-volume-high' : 'fa-hashtag')}
          <span class="sp-ch-name">${esc(c.name)}</span>
          ${c.is_private ? `<span class="sp-ch-lock">${icon('fa-lock')}</span>` : ''}
          ${c.kind === 'voice' && unique.length ? `<span class="sp-ch-count">${unique.length}</span>` : ''}
        </button>
        ${canDelete ? `<button class="sp-ch-del" data-act="delete-room" data-id="${esc(c.id)}" title="Encerrar sala" aria-label="Encerrar sala ${esc(c.name)}">${icon('fa-trash')}</button>` : ''}
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
      ${getCapabilities().isIOS ? '' : `<button class="sp-app-dl" data-act="app-download" title="A chamada continua com o celular bloqueado ou em outro app">
        <i class="fa-brands fa-android" aria-hidden="true"></i><span><b>Baixar app Android</b><small>${this.appVersion ? `Versão ${esc(this.appVersion)} · ` : ''}chamada em segundo plano</small></span></button>`}
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
      ${this.userPanelHtml(me, call)}`;
    if (html === this.lastHtml) return;
    this.lastHtml = html;
    // Redesenhar não pode fazer a lista pular para o topo.
    const scrollTop = this.el.querySelector('.sp-nav-scroll')?.scrollTop || 0;
    this.el.innerHTML = html;
    const scroller = this.el.querySelector('.sp-nav-scroll');
    if (scroller) scroller.scrollTop = scrollTop;
  }

  /** Painel do usuário no estilo Discord: mic e fone com setinha para trocar o dispositivo. */
  userPanelHtml(me, call) {
    const muted = this.voice.selfMuted || (call && !this.voice.snapshot.local.micAvailable);
    const deafened = this.voice.selfDeafened;
    const prefs = this.voice.prefs.get();
    const caps = getCapabilities();
    const menu = this.deviceMenu;
    const list = menu === 'input' ? this.devices.inputs : menu === 'output' ? this.devices.outputs : [];
    const current = menu === 'input' ? prefs.inputDeviceId : prefs.outputDeviceId;
    const canPickOutput = caps.outputSelection && this.devices.outputs.length > 0;
    // Sem permissão de microfone o navegador esconde os dispositivos (vem só um item sem id/nome).
    const needsPermission = menu && [...this.devices.inputs, ...this.devices.outputs].some((d) => !d.deviceId || !d.label);
    const popover = menu ? `<div class="sp-dev-pop" role="menu">
        <div class="sp-dev-title">${menu === 'input' ? 'Dispositivo de entrada' : 'Dispositivo de saída'}</div>
        ${menu === 'output' && !canPickOutput
          ? `<p class="sp-dev-note">${caps.isMobile
            ? 'No celular quem escolhe alto-falante ou o "do ouvido" é o sistema: use o botão de alto-falante do aparelho, fone ou Bluetooth.'
            : 'Este navegador não deixa escolher a saída. Use Chrome, Edge ou Brave no computador.'}</p>`
          : [{ deviceId: '', label: 'Padrão do sistema' }, ...list.filter((d) => d.deviceId && d.deviceId !== 'default')]
            .map((d, i) => `<button class="sp-dev-item ${(current || '') === d.deviceId ? 'is-on' : ''}" data-act="pick-device" data-kind="${menu}" data-id="${esc(d.deviceId)}">
              <span>${esc(d.label || `${menu === 'input' ? 'Microfone' : 'Saída'} ${i}`)}</span>${icon((current || '') === d.deviceId ? 'fa-circle-dot' : 'fa-circle')}</button>`).join('')}
        ${needsPermission ? `<button class="sp-dev-item sp-dev-allow" data-act="allow-devices"><span>Permitir acesso aos dispositivos</span>${icon('fa-lock-open')}</button>` : ''}
        <div class="sp-dev-sep"></div>
        <button class="sp-dev-item" data-act="settings"><span>Configurações de voz</span>${icon('fa-gear')}</button>
      </div>` : '';
    return `<div class="sp-me">
      ${popover}
      <span class="sp-me-avatar">${avatarHtml(me, 34)}<span class="sp-me-status ${call ? 'is-call' : ''}"></span></span>
      <div class="sp-me-name"><b>${esc(displayName(me))}</b><small>${call ? 'Em chamada' : 'Disponível'}</small></div>
      <span class="sp-me-group ${muted ? 'is-off' : ''} ${menu === 'input' ? 'is-open' : ''}">
        <button data-act="mute" title="${muted ? 'Ativar microfone' : 'Desativar microfone'}" aria-label="${muted ? 'Ativar microfone' : 'Desativar microfone'}">${icon(muted ? 'fa-microphone-slash' : 'fa-microphone')}</button>
        <button class="sp-me-chev" data-act="device-menu" data-kind="input" title="Escolher microfone" aria-label="Escolher microfone">${icon('fa-chevron-down')}</button>
      </span>
      <span class="sp-me-group ${deafened ? 'is-off' : ''} ${menu === 'output' ? 'is-open' : ''}">
        <button data-act="deafen" title="${deafened ? 'Ativar som' : 'Desativar som'}" aria-label="${deafened ? 'Ativar som' : 'Desativar som'}">${icon(deafened ? 'fa-volume-xmark' : 'fa-headphones')}</button>
        <button class="sp-me-chev" data-act="device-menu" data-kind="output" title="Escolher saída de áudio" aria-label="Escolher saída de áudio">${icon('fa-chevron-down')}</button>
      </span>
    </div>`;
  }

  async openDeviceMenu(kind) {
    if (this.deviceMenu === kind) { this.deviceMenu = null; this.render(); return; }
    this.devices = await listDevices().catch(() => ({ inputs: [], outputs: [], cameras: [] }));
    this.deviceMenu = kind;
    this.render();
  }

  /** Pede a permissão do microfone só para o navegador revelar a lista de dispositivos. */
  /** Encerra uma sala com código (some para todos; quem estava nela sai). */
  async deleteRoom(id) {
    const room = this.workspace.getChannel(id);
    if (!room) return;
    if (!(await MSYConfirm.show(`Encerrar a sala "${room.name}"? Ela e o código ${room.join_code || ''} deixam de existir para todos.`, { title: 'Encerrar sala' }))) return;
    try {
      if (this.voice.channelId === id) this.voice.leave();
      const { error } = await supabase.rpc('space_delete_room', { p_channel: id });
      if (error) throw error;
      await this.workspace.reloadChannels();
      toast('Sala encerrada.');
    } catch (err) {
      console.error('[MSY][space] Falha ao encerrar sala:', err);
      toast(/FORBIDDEN|42501/.test(err?.message || err?.code || '') ? 'Só quem criou a sala (ou a gestão) pode encerrar.' : 'Não foi possível encerrar a sala.', 'error');
    }
  }

  async allowDevices() {
    const kind = this.deviceMenu;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch (err) {
      console.warn('[MSY][space] Permissão de dispositivos negada:', err);
      toast('O navegador não liberou o acesso. Libere no cadeado da barra de endereço.', 'error');
      return;
    }
    this.devices = await listDevices().catch(() => this.devices);
    this.deviceMenu = kind;
    this.render();
  }

  async pickDevice(kind, deviceId) {
    this.deviceMenu = null;
    try {
      if (kind === 'input') {
        const prefs = this.voice.prefs.update({ inputDeviceId: deviceId || undefined });
        if (this.voice.active) await this.voice.changeInputDevice(prefs);
      } else {
        this.voice.prefs.update({ outputDeviceId: deviceId || undefined });
        if (this.voice.active) await this.voice.changeOutputDevice(deviceId || undefined);
      }
      toast(kind === 'input' ? 'Microfone trocado.' : 'Saída de áudio trocada.');
    } catch (err) {
      console.error('[MSY][space] Falha ao trocar dispositivo:', err);
      toast(err?.message || 'Não foi possível trocar o dispositivo.', 'error');
    }
    this.render();
  }

  async onClick(e) {
    const btn = e.target.closest('[data-act]');
    // Clique fora do menu de dispositivos fecha o menu.
    if (this.deviceMenu && !e.target.closest('.sp-dev-pop') && btn?.dataset.act !== 'device-menu') { this.deviceMenu = null; this.render(); }
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'device-menu') await this.openDeviceMenu(btn.dataset.kind);
    if (act === 'pick-device') await this.pickDevice(btn.dataset.kind, btn.dataset.id);
    if (act === 'allow-devices') await this.allowDevices();
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
    if (act === 'settings') { this.deviceMenu = null; this.render(); openVoiceSettings({ prefs: this.voice.prefs, voice: this.voice }); }
    if (act === 'create-room') await this.createRoom();
    if (act === 'join-room') await this.joinRoom();
    if (act === 'app-download') await downloadAndroidApp();
    if (act === 'delete-room') await this.deleteRoom(btn.dataset.id);
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
