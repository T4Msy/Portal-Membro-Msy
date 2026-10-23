// Sala de voz do MSY Space (portado de VoiceRoomView, ParticipantTile, ScreenStage e
// VoiceControls da Plataforma). Os quadros são reaproveitados entre atualizações para os
// <video> não piscarem: o snapshot muda muitas vezes por segundo (quem está falando).
import { supabase } from '../lib/supabase.js';
import { REACTIONS } from '../voice/VoiceSession.js';
import { getCapabilities, screenShareUnsupportedReason } from '../voice/media/capabilities.js';
import { SCREEN_PRESETS } from '../voice/media/screen.js';
import { avatarHtml, bindVideo, displayName, esc, formatKbps, icon, liveCamera, safeColor, toast } from './dom.js';
import { openVoiceSettings } from './settings.js';

/** Só troca o HTML quando mudou (evita perder foco/hover a cada atualização de fala). */
function setHtml(el, html) {
  if (el._spHtml !== html) { el.innerHTML = html; el._spHtml = html; }
}

/** Tela cheia (ou sai dela). iPhone: só o próprio <video> entra em tela cheia. */
async function enterFullscreen(el, video, portrait) {
  try {
    if (document.fullscreenElement) { await document.exitFullscreen(); return; }
    if (el.requestFullscreen) {
      await el.requestFullscreen({ navigationUI: 'hide' });
      lockOrientation(portrait);
    } else if (video?.webkitEnterFullscreen) {
      video.webkitEnterFullscreen();
    }
  } catch { /* usuário cancelou ou navegador recusou */ }
}

/** No celular, gira a tela para o formato do vídeo (Android; o iPhone gira pelo sensor). */
function lockOrientation(portrait) {
  try { screen.orientation?.lock?.(portrait ? 'portrait' : 'landscape').catch(() => undefined); } catch { /* sem suporte */ }
}

function unlockOrientation() {
  try { screen.orientation?.unlock?.(); } catch { /* sem suporte */ }
}

export class VoiceRoomView {
  constructor(container, channel, { workspace, voice, online, pip, me, onToggleNav, onLeftRoom }) {
    this.el = container;
    this.pip = pip;
    this.channel = channel;
    this.workspace = workspace;
    this.voice = voice;
    this.online = online;
    this.me = me;
    this.onToggleNav = onToggleNav;
    this.onLeftRoom = onLeftRoom;
    this.mode = null;
    this.tiles = new Map();
    this.shownReactions = new Set();
    this.selectedScreen = null;
    this.menu = null; // 'screen' | 'react' | null
    this.volumeFor = null;
    this.focusKey = null; // quadro em destaque (clicou na câmera de alguém, como no Discord)
    this.withAudio = true;
    this.onChange = () => this.render();
    // Grade como no Discord/Meet: recalcula o tamanho dos quadros quando a área muda.
    this.gridObs = new ResizeObserver(() => this.layoutGrid());
  }

  get inThisRoom() {
    const s = this.voice.snapshot;
    return Boolean(s && s.channelId === this.channel.id && s.status !== 'idle' && s.status !== 'error');
  }

  mount() {
    // O container (.sp-main) é reaproveitado entre canais: os ouvintes saem junto com a view.
    this.events = new AbortController();
    const { signal } = this.events;
    this.el.addEventListener('click', (e) => this.onClick(e), { signal });
    this.el.addEventListener('input', (e) => this.onInput(e), { signal });
    // Dois toques/cliques na câmera de alguém: tela cheia.
    this.el.addEventListener('dblclick', (e) => {
      const tile = e.target.closest('.sp-tile.has-video');
      if (tile) this.fullscreenTile(tile);
    }, { signal });
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) unlockOrientation(); }, { signal });
    // Botão direito (ou toque longo) no quadro de alguém: volume dessa pessoa.
    this.el.addEventListener('contextmenu', (e) => {
      const tile = e.target.closest('.sp-tile[data-remote]');
      if (!tile) return;
      e.preventDefault();
      this.volumeFor = this.volumeFor === tile.dataset.key ? null : tile.dataset.key;
      this.render();
    }, { signal });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.focusKey && !document.fullscreenElement) { this.focusKey = null; this.render(); }
    }, { signal });
    this.voice.addEventListener('change', this.onChange);
    this.online.addEventListener('change', this.onChange);
    this.render();
  }

  destroy() {
    this.gridObs.disconnect();
    this.events?.abort();
    this.voice.removeEventListener('change', this.onChange);
    this.online.removeEventListener('change', this.onChange);
    this.el.querySelectorAll('video').forEach((v) => { v.srcObject = null; });
  }

  // ── Render ─────────────────────────────────────────────────
  render() {
    const mode = this.inThisRoom ? 'room' : 'lobby';
    if (mode !== this.mode) {
      this.mode = mode;
      this.tiles.clear();
      this.shownReactions.clear();
      this.el.innerHTML = mode === 'room' ? this.roomSkeleton() : '';
      this.el._spHtml = null;
    }
    if (mode === 'lobby') this.renderLobby();
    else this.renderRoom();
  }

  headerHtml(extra = '') {
    const c = this.channel;
    return `<header class="sp-main-head">
      <button class="sp-icon-btn sp-nav-toggle" data-act="nav" aria-label="Canais">${icon('fa-bars')}</button>
      <span class="sp-head-icon">${icon('fa-volume-high')}</span>
      <h2 class="sp-head-title">${esc(c.name)}</h2>
      ${c.is_private ? `<span class="sp-head-badge" title="Sala privada">${icon('fa-lock')}</span>` : ''}
      ${c.is_temporary && c.join_code ? this.codeChipHtml() : ''}
      ${extra}
    </header>`;
  }

  codeChipHtml() {
    const c = this.channel;
    const canClose = c.created_by === this.me.id || this.workspace.canManage;
    return `<span class="sp-code-chip">${icon('fa-key')}<b>${esc(c.join_code)}</b>
      <button data-act="copy-code" title="Copiar código" aria-label="Copiar código">${icon('fa-copy')}</button>
      <button data-act="copy-link" title="Copiar link" aria-label="Copiar link">${icon('fa-link')}</button>
      ${canClose ? `<button data-act="close-room" class="sp-danger-hover" title="Encerrar sala" aria-label="Encerrar sala">${icon('fa-trash')}</button>` : ''}
    </span>`;
  }

  renderLobby() {
    const inside = this.online.voiceByChannel().get(this.channel.id) || [];
    const caps = getCapabilities();
    const joining = this.voice.snapshot?.status === 'joining' && this.voice.snapshot.channelId === this.channel.id;
    const busyElsewhere = this.voice.active && this.voice.channelId !== this.channel.id;
    setHtml(this.el, `${this.headerHtml()}
      <div class="sp-lobby">
        <div class="sp-lobby-orb">${icon('fa-volume-high')}</div>
        <h2>${esc(this.channel.name)}</h2>
        <p class="sp-muted">${inside.length === 0 ? 'Ninguém na sala agora.' : `${inside.length} ${inside.length === 1 ? 'pessoa' : 'pessoas'} na sala`}</p>
        ${inside.length ? `<div class="sp-lobby-people">${inside.map((v) => avatarHtml(this.workspace.profile(v.userId), 44)).join('')}</div>` : ''}
        <button class="btn btn-primary sp-join-btn" data-act="join" ${joining ? 'disabled' : ''}>
          ${joining ? `${icon('fa-circle-notch fa-spin')} Entrando…` : `${icon('fa-phone')} ${busyElsewhere ? 'Trocar para esta sala' : 'Entrar na sala'}`}
        </button>
        ${busyElsewhere ? '<p class="sp-hint">Você vai sair da sala atual.</p>' : ''}
        ${caps.isMobile ? '<p class="sp-hint">No celular você pode falar, ouvir, usar a câmera e assistir transmissões. Compartilhar a tela só no computador.</p>' : ''}
      </div>`);
  }

  roomSkeleton() {
    return `${this.headerHtml('<span class="sp-count" data-count></span><span class="sp-grow"></span><span class="sp-conn" data-conn></span>')}
      <div class="sp-join-hint" data-join-hint hidden>${icon('fa-microphone')} Se o navegador perguntar, permita o uso do microfone para entrar na conversa.</div>
      <button class="sp-audio-blocked" data-act="resume-audio" hidden>${icon('fa-volume-xmark')} O navegador bloqueou o som. Toque aqui para ativar o áudio.</button>
      <div class="sp-room-body" data-body></div>
      <div class="sp-controls" data-controls></div>`;
  }

  renderRoom() {
    const snap = this.voice.snapshot;
    const tiles = this.tileModels(snap);
    const screens = this.screenModels(snap);

    this.el.querySelector('[data-count]').textContent = `${tiles.length}/${this.channel.user_limit}`;
    const conn = this.el.querySelector('[data-conn]');
    conn.className = `sp-conn is-${snap.status}`;
    conn.innerHTML = snap.status === 'joining' ? `${icon('fa-circle-notch fa-spin')} Conectando…`
      : snap.status === 'reconnecting' ? 'Reconectando…'
        : `<span class="sp-dot"></span> Conectado`;
    conn.title = snap.turnAvailable ? 'Conexão direta com TURN de reserva' : 'Conexão direta (sem servidor TURN de reserva)';
    this.el.querySelector('[data-act="resume-audio"]').hidden = !snap.audioBlocked;
    this.el.querySelector('[data-join-hint]').hidden = snap.status !== 'joining';

    const body = this.el.querySelector('[data-body]');
    if (this.focusKey && !tiles.some((t) => t.key === this.focusKey)) this.focusKey = null; // a pessoa saiu
    const layout = this.focusKey ? 'focus' : screens.length ? 'stage' : 'grid';
    if (body.dataset.layout !== layout) {
      body.dataset.layout = layout;
      // Os quadros (e seus <video>) são reaproveitados: só mudam de lugar, sem piscar.
      for (const node of this.tiles.values()) node.remove();
      body.innerHTML = layout === 'stage'
        ? '<div class="sp-stage" data-stage></div><div class="sp-tile-strip" data-tiles></div>'
        : layout === 'focus'
          ? '<div class="sp-tile-grid sp-focus" data-focus></div><div class="sp-tile-strip" data-tiles></div>'
          : '<div class="sp-tile-grid" data-tiles></div>';
      this.gridObs.disconnect();
      this.gridKey = null;
      const grid = body.querySelector('.sp-tile-grid');
      if (grid) this.gridObs.observe(grid);
    }
    if (layout === 'stage') this.renderStage(body.querySelector('[data-stage]'), screens, snap);
    if (layout === 'focus') {
      this.renderTiles([
        { container: body.querySelector('[data-focus]'), tiles: tiles.filter((t) => t.key === this.focusKey), compact: false },
        { container: body.querySelector('[data-tiles]'), tiles: tiles.filter((t) => t.key !== this.focusKey), compact: true },
      ], snap);
    } else {
      this.renderTiles([{ container: body.querySelector('[data-tiles]'), tiles, compact: layout === 'stage' }], snap);
    }
    if (layout !== 'stage') this.layoutGrid();
    this.renderControls(snap);
  }

  tileModels(snap) {
    const vol = this.voice.prefs.get().userVolumes || {};
    const look = (userId) => {
      const p = this.workspace.profile(userId);
      return { profile: p, name: displayName(p), color: safeColor(p?.color, '#d9d9d9') };
    };
    const local = {
      key: snap.local.sessionId, userId: this.me.id, ...look(this.me.id), isLocal: true,
      muted: snap.local.muted || !snap.local.micAvailable, deafened: snap.local.deafened,
      speaking: snap.local.speaking && !snap.local.muted, sharing: Boolean(snap.local.screen),
      camera: snap.local.camera, link: null, stats: null, voiceVolume: 1, streamVolume: 1,
    };
    return [local, ...snap.participants.map((p) => ({
      key: p.sessionId, userId: p.userId, ...look(p.userId), isLocal: false,
      muted: p.meta.muted, deafened: p.meta.deafened, speaking: p.speaking && !p.meta.muted,
      sharing: p.meta.screen, camera: liveCamera(p.camera), link: p.link, stats: p.stats,
      voiceVolume: vol[p.userId] ?? 1, streamVolume: vol[`${p.userId}:stream`] ?? 1,
    }))];
  }

  screenModels(snap) {
    const list = snap.participants.filter((p) => p.meta.screen).map((p) => ({
      sessionId: p.sessionId, name: displayName(this.workspace.profile(p.userId)), label: p.meta.screenLabel,
      stream: p.screen, isLocal: false, hasAudio: p.meta.screenAudio, watching: !snap.notWatching.includes(p.sessionId),
    }));
    if (snap.local.screen) {
      list.push({ sessionId: snap.local.sessionId, name: 'Você', label: snap.local.screenLabel, stream: snap.local.screen,
        isLocal: true, hasAudio: snap.local.screenHasAudio, watching: true });
    }
    return list;
  }

  /** places: [{ container, tiles, compact }] — grade, destaque ou faixa de baixo. */
  renderTiles(places, snap) {
    const keep = new Set(places.flatMap((p) => p.tiles.map((t) => t.key)));
    for (const [key, node] of this.tiles) if (!keep.has(key)) { node.querySelector('video')?.remove(); node.remove(); this.tiles.delete(key); }
    for (const place of places) this.renderTilesIn(place.container, place.tiles, snap, place.compact);
  }

  renderTilesIn(container, tiles, snap, compact) {
    tiles.forEach((t, index) => {
      let node = this.tiles.get(t.key);
      if (!node) {
        node = document.createElement('div');
        node.className = 'sp-tile';
        node.dataset.key = t.key;
        node.innerHTML = `<div class="sp-tile-media"></div>
          <div class="sp-tile-foot"><span class="sp-tile-name"></span><span class="sp-grow"></span><span class="sp-tile-icons"></span></div>
          <div class="sp-tile-conn" hidden></div><div class="sp-tile-stats" hidden></div><div class="sp-tile-fx"></div>
          <button class="sp-tile-full" data-act="tile-full" title="Tela cheia" aria-label="Ver câmera em tela cheia">${icon('fa-expand')}</button>
          ${t.isLocal ? '' : `<button class="sp-tile-vol" data-act="tile-volume" title="Volume desta pessoa" aria-label="Volume desta pessoa">${icon('fa-sliders')}</button>`}`;
        if (!t.isLocal) node.dataset.remote = '1';
        this.tiles.set(t.key, node);
      }
      if (container.children[index] !== node) container.insertBefore(node, container.children[index] || null);
      node.classList.toggle('is-speaking', t.speaking);
      node.classList.toggle('is-compact', compact);
      // Na faixa de baixo o tamanho vem do CSS (o da grade é calculado em layoutGrid).
      if (compact && node.style.height) { node.style.width = ''; node.style.height = ''; }
      node.classList.toggle('is-clickable', true);
      node.classList.toggle('is-focused', t.key === this.focusKey);
      node.title = t.key === this.focusKey ? 'Clique para voltar à grade' : 'Clique para destacar';
      node.dataset.user = t.userId;

      const media = node.querySelector('.sp-tile-media');
      if (t.camera) {
        let video = media.querySelector('video');
        if (!video) {
          media.innerHTML = '<video autoplay playsinline muted></video>';
          video = media.querySelector('video');
          // O quadro toma o formato da câmera: de pé (celular em pé) ou deitado.
          const fit = () => this.fitTile(node, video);
          video.addEventListener('loadedmetadata', fit);
          video.addEventListener('resize', fit);
        }
        // Sem espelho por padrão: você vê a sua câmera igual os outros veem (opção nas configurações).
        video.classList.toggle('is-mirror', t.isLocal && Boolean(this.voice.prefs.get().mirrorCamera));
        bindVideo(video, t.camera);
      } else if (media.dataset.avatarFor !== t.userId || media.querySelector('video')) {
        if (document.fullscreenElement === node) document.exitFullscreen().catch(() => undefined);
        node.classList.remove('has-video', 'is-portrait');
        node.style.removeProperty('--sp-ar');
        node._ar = null;
        media.innerHTML = avatarHtml(t.profile, compact ? 48 : 76, 'sp-tile-avatar');
        media.dataset.avatarFor = t.userId;
      }
      media.querySelector('.sp-tile-avatar')?.classList.toggle('is-speaking', t.speaking);

      const name = node.querySelector('.sp-tile-name');
      name.style.setProperty('--sp-c', t.color);
      setHtml(name, `${esc(t.name)}${t.isLocal ? ' <small>(você)</small>' : ''}`);
      setHtml(node.querySelector('.sp-tile-icons'),
        (t.sharing ? `<span title="Transmitindo a tela">${icon('fa-display')}</span>` : '')
        + (t.deafened ? `<span title="Som desativado">${icon('fa-volume-xmark')}</span>` : t.muted ? `<span title="Microfone desativado">${icon('fa-microphone-slash')}</span>` : ''));

      const connecting = t.link === 'connecting' || t.link === 'new';
      const reconnecting = t.link === 'reconnecting' || t.link === 'failed';
      const conn = node.querySelector('.sp-tile-conn');
      conn.hidden = !(connecting || reconnecting);
      if (!conn.hidden) conn.innerHTML = connecting ? `${icon('fa-circle-notch fa-spin')} Conectando` : `${icon('fa-wifi')} Reconectando`;
      const stats = node.querySelector('.sp-tile-stats');
      stats.hidden = !t.stats || compact;
      if (t.stats && !compact) stats.textContent = `${t.stats.rttMs !== null ? `${t.stats.rttMs} ms · ` : ''}${formatKbps(t.stats.inKbps)}${t.stats.relayed ? ' · TURN' : ''}`;

      this.renderReactions(node.querySelector('.sp-tile-fx'), snap.reactions.filter((r) => r.sessionId === t.key));
      this.renderVolumeMenu(node, t);
    });
  }

  renderVolumeMenu(node, t) {
    let menu = node.querySelector('.sp-volume');
    if (this.volumeFor !== t.key || t.isLocal) { menu?.remove(); return; }
    if (!menu) {
      menu = document.createElement('div');
      menu.className = 'sp-volume';
      menu.innerHTML = `
        <label>Voz <span data-v="voice"></span><input type="range" min="0" max="2" step="0.05" data-vol="voice"></label>
        <label>Áudio da transmissão <span data-v="stream"></span><input type="range" min="0" max="3" step="0.05" data-vol="stream"></label>
        <button class="btn btn-ghost btn-sm" data-act="volume-close">Fechar</button>`;
      menu.querySelector('[data-vol="voice"]').value = t.voiceVolume;
      menu.querySelector('[data-vol="stream"]').value = t.streamVolume;
      node.appendChild(menu);
    }
    menu.querySelector('[data-v="voice"]').textContent = `${Math.round(t.voiceVolume * 100)}%`;
    menu.querySelector('[data-v="stream"]').textContent = `${Math.round(t.streamVolume * 100)}%`;
  }

  renderReactions(fx, reactions) {
    for (const r of reactions) {
      if (this.shownReactions.has(r.id)) continue;
      this.shownReactions.add(r.id);
      const span = document.createElement('span');
      span.className = 'sp-reaction';
      span.textContent = r.emoji;
      span.addEventListener('animationend', () => span.remove());
      fx.appendChild(span);
    }
  }

  renderStage(stage, screens, snap) {
    if (!screens.some((s) => s.sessionId === this.selectedScreen)) {
      this.selectedScreen = (screens.find((s) => !s.isLocal) || screens[0]).sessionId;
    }
    const active = screens.find((s) => s.sessionId === this.selectedScreen);
    if (!stage.firstChild) {
      stage.innerHTML = `<div class="sp-stage-bar" data-bar></div>
        <div class="sp-stage-view" data-view><video autoplay playsinline muted></video><div class="sp-stage-msg" data-msg hidden></div>
        <span class="sp-stage-preview" data-preview hidden>Prévia da sua transmissão</span><div class="sp-tile-fx sp-stage-fx" data-fx></div></div>`;
    }
    setHtml(stage.querySelector('[data-bar]'), `${icon('fa-display')}
      ${screens.length > 1
        ? `<div class="sp-stage-tabs">${screens.map((s) => `<button data-act="pick-screen" data-id="${esc(s.sessionId)}" class="${s.sessionId === active.sessionId ? 'is-on' : ''}">${esc(s.name)}</button>`).join('')}</div>`
        : `<span class="sp-stage-who"><b>${esc(active.isLocal ? 'Você' : active.name)}</b> está transmitindo${active.label ? ` · ${esc(active.label)}` : ''}</span>`}
      ${active.hasAudio ? `<span title="Com áudio">${icon('fa-volume-high')}</span>` : ''}
      <span class="sp-grow"></span>
      ${!active.isLocal ? `<button class="sp-stage-btn" data-act="watch" data-id="${esc(active.sessionId)}" data-watching="${active.watching}" title="${active.watching ? 'Parar de receber esta transmissão (economiza internet)' : 'Voltar a assistir'}">${icon(active.watching ? 'fa-eye-slash' : 'fa-eye')} ${active.watching ? 'Parar de assistir' : 'Assistir'}</button>` : ''}
      <button class="sp-stage-btn" data-act="pip" title="Janela flutuante (continua vendo em outras abas)">${icon('fa-clone')}</button>
      <button class="sp-stage-btn" data-act="fullscreen" title="Tela cheia">${icon('fa-expand')}</button>`);

    const video = stage.querySelector('[data-view] video');
    const msg = stage.querySelector('[data-msg]');
    const show = active.watching && active.stream;
    video.hidden = !show;
    bindVideo(video, show ? active.stream : null);
    msg.hidden = Boolean(show);
    msg.textContent = active.watching ? 'Aguardando vídeo da transmissão…' : 'Você não está assistindo esta transmissão.';
    stage.querySelector('[data-preview]').hidden = !active.isLocal;
    this.renderReactions(stage.querySelector('[data-fx]'), snap.reactions.filter((r) => r.sessionId === active.sessionId));
  }

  renderControls(snap) {
    const box = this.el.querySelector('[data-controls]');
    const { local } = snap;
    const caps = getCapabilities();
    const screenBlocked = screenShareUnsupportedReason();
    const viewers = snap.participants.length;
    const preset = SCREEN_PRESETS[snap.screenPreset];
    const estimate = (preset.maxBitrate / 1000) * viewers;
    const micOff = !local.micAvailable || local.muted;
    const btn = (act, ico, label, tone = '', disabled = false) =>
      `<button class="sp-ctl ${tone}" data-act="${act}" title="${esc(label)}" aria-label="${esc(label)}" ${disabled ? 'disabled' : ''}>${icon(ico)}</button>`;

    setHtml(box, `
      ${btn('mute', micOff ? 'fa-microphone-slash' : 'fa-microphone', !local.micAvailable ? (local.micError || 'Microfone indisponível') : local.muted ? 'Ativar microfone' : 'Desativar microfone', micOff ? 'is-off' : '')}
      ${btn('deafen', local.deafened ? 'fa-volume-xmark' : 'fa-headphones', local.deafened ? 'Ativar som' : 'Desativar som (ensurdecer)', local.deafened ? 'is-off' : '')}
      ${btn('camera', local.camera ? 'fa-video' : 'fa-video-slash', !caps.camera ? 'Câmera não suportada neste navegador' : local.camera ? 'Desligar câmera' : 'Ligar câmera', local.camera ? 'is-on' : '', !caps.camera)}
      ${local.screen ? btn('stop-screen', 'fa-display', 'Parar transmissão', 'is-on')
        : btn('screen-menu', 'fa-display', screenBlocked || 'Compartilhar tela', this.menu === 'screen' ? 'is-open' : '', Boolean(screenBlocked))}
      ${btn('react-menu', 'fa-face-smile', 'Reações', this.menu === 'react' ? 'is-open' : '')}
      ${this.pip?.supported ? btn('call-pip', 'fa-clone', 'Janela flutuante: a chamada fica por cima de outros apps e abas', this.pip.isOpen ? 'is-on' : '') : ''}
      ${btn('settings', 'fa-gear', 'Voz e vídeo (microfone, saída, câmera)')}
      ${btn('leave', 'fa-phone-slash', 'Sair da sala', 'is-danger')}
      ${local.screen ? `<span class="sp-upload" title="Upload real medido nas conexões">Enviando ${esc(formatKbps(snap.uploadKbps))} · ${viewers} ${viewers === 1 ? 'espectador' : 'espectadores'}</span>` : ''}
      ${this.menu === 'react' ? `<div class="sp-pop sp-react-pop">${REACTIONS.map((e) => `<button data-act="react" data-emoji="${esc(e)}" aria-label="Reagir com ${esc(e)}">${esc(e)}</button>`).join('')}</div>` : ''}
      ${this.menu === 'screen' && !local.screen ? `<div class="sp-pop sp-screen-pop">
        <h3>Compartilhar tela</h3>
        <p class="sp-hint">Você escolhe tela inteira, janela ou aba na próxima etapa (janela do navegador).</p>
        ${Object.entries(SCREEN_PRESETS).map(([id, p]) => `<label class="sp-preset ${snap.screenPreset === id ? 'is-on' : ''}">
          <input type="radio" name="sp-preset" value="${esc(id)}" ${snap.screenPreset === id ? 'checked' : ''} data-preset>
          <span><b>${esc(p.label)}</b><small>${esc(p.description)}</small></span></label>`).join('')}
        <label class="sp-check"><input type="checkbox" data-with-audio ${this.withAudio ? 'checked' : ''}>
          <span>Incluir áudio do computador/aba<small>${caps.screenAudioLikely
            ? 'No Windows funciona com tela inteira ou aba; em janela, só o áudio de abas. Marque "Compartilhar áudio" no seletor.'
            : 'Seu navegador provavelmente não envia áudio do sistema (só Chrome/Edge/Brave no computador).'}</small></span></label>
        ${viewers > 0 ? `<p class="sp-hint ${estimate > 15000 ? 'is-warn' : ''}">Upload estimado: até ${esc(formatKbps(estimate))} para ${viewers} ${viewers === 1 ? 'pessoa' : 'pessoas'} (conexão direta envia uma cópia para cada).</p>` : ''}
        <button class="btn btn-primary" data-act="start-screen">Escolher o que compartilhar</button>
      </div>` : ''}`);
  }

  // ── Eventos ────────────────────────────────────────────────
  async onClick(e) {
    const btn = e.target.closest('[data-act]');
    const tile = e.target.closest('.sp-tile.is-clickable');
    // Clique no quadro de alguém: vai para o destaque (grande); clicar de novo volta para a grade.
    if (!btn && tile && !e.target.closest('.sp-volume')) {
      this.focusKey = this.focusKey === tile.dataset.key ? null : tile.dataset.key;
      this.render();
      return;
    }
    if (!btn) return;
    const v = this.voice;
    const act = btn.dataset.act;
    switch (act) {
      case 'nav': this.onToggleNav?.(); break;
      case 'join':
        btn.disabled = true;
        try { await v.join(this.channel); } catch (err) {
          console.error('[MSY][space] Falha ao entrar na sala:', err);
          toast('Não foi possível entrar na sala.', 'error');
        }
        this.render();
        break;
      case 'mute': v.toggleMute(); break;
      case 'deafen': v.toggleDeafen(); break;
      case 'camera': v.toggleCamera(); break;
      case 'stop-screen': v.stopScreen(); break;
      case 'screen-menu': this.menu = this.menu === 'screen' ? null : 'screen'; this.render(); break;
      case 'react-menu': this.menu = this.menu === 'react' ? null : 'react'; this.render(); break;
      case 'react': v.react(btn.dataset.emoji); break;
      case 'start-screen': this.menu = null; this.render(); v.startScreen(this.withAudio); break;
      case 'leave': this.menu = null; v.leave(); this.onLeftRoom?.(); break;
      case 'resume-audio': v.resumeAudio(); break;
      case 'settings': this.menu = null; openVoiceSettings({ prefs: v.prefs, voice: v }); break;
      case 'pick-screen': this.selectedScreen = btn.dataset.id; this.render(); break;
      case 'watch': v.setWatching(btn.dataset.id, btn.dataset.watching !== 'true'); break;
      case 'fullscreen': this.toggleFullscreen(); break;
      case 'pip': this.togglePip(); break;
      case 'call-pip': await this.pip?.toggle(); this.render(); break;
      case 'tile-full': this.fullscreenTile(btn.closest('.sp-tile')); break;
      case 'volume-close': this.volumeFor = null; this.render(); break;
      case 'tile-volume': { const k = btn.closest('.sp-tile')?.dataset.key; this.volumeFor = this.volumeFor === k ? null : k; this.render(); break; }
      case 'copy-code': this.copy(this.channel.join_code, 'Código copiado.'); break;
      case 'copy-link': this.copy(`${location.origin}/space.html?sala=${encodeURIComponent(this.channel.join_code)}`, 'Link copiado.'); break;
      case 'close-room': await this.closeRoom(); break;
      default: break;
    }
  }

  onInput(e) {
    const t = e.target;
    if (t.matches('[data-preset]')) this.voice.setScreenPreset(t.value);
    if (t.matches('[data-with-audio]')) this.withAudio = t.checked;
    if (t.matches('[data-vol]')) {
      const userId = t.closest('.sp-tile')?.dataset.user;
      if (userId) this.voice.setUserVolume(userId, Number(t.value), t.dataset.vol);
    }
  }

  async copy(text, ok) {
    try { await navigator.clipboard.writeText(text); toast(ok); } catch { toast('Não foi possível copiar.', 'error'); }
  }

  async closeRoom() {
    if (!(await MSYConfirm.show('A sala e o código deixam de existir para todos.', { title: 'Encerrar sala' }))) return;
    if (this.voice.channelId === this.channel.id) this.voice.leave();
    const { error } = await supabase.rpc('space_delete_room', { p_channel: this.channel.id });
    if (error) { console.error('[MSY][space] Falha ao encerrar sala:', error); toast('Não foi possível encerrar a sala.', 'error'); return; }
    toast('Sala encerrada.');
    this.onLeftRoom?.(true);
  }

  async toggleFullscreen() {
    const view = this.el.querySelector('[data-view]');
    if (!view) return;
    const video = view.querySelector('video');
    await enterFullscreen(view, video, video?.videoHeight > video?.videoWidth);
  }

  /** Câmera de uma pessoa em tela cheia; no celular a tela gira para o formato da câmera. */
  async fullscreenTile(tile) {
    const video = tile?.querySelector('.sp-tile-media video');
    if (!video) return;
    await enterFullscreen(tile, video, tile.classList.contains('is-portrait'));
  }

  fitTile(node, video) {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;
    const portrait = h > w;
    node.classList.add('has-video');
    node.classList.toggle('is-portrait', portrait);
    node.style.setProperty('--sp-ar', `${w} / ${h}`);
    node._ar = w / h;
    this.layoutGrid();
    // Em tela cheia e a pessoa virou o celular: gira junto.
    if (document.fullscreenElement === node) lockOrientation(portrait);
  }

  /**
   * Grade centralizada (como no Discord/Meet): todos os quadros com a mesma altura, cada um com
   * a largura do formato da sua câmera (em pé = estreito, deitado = largo; sem câmera = 16:9),
   * no maior tamanho que cabe na área. Simula a quebra de linha do flex para achar essa altura.
   */
  layoutGrid() {
    const grid = this.el.querySelector('.sp-tile-grid');
    if (!grid || !grid.children.length) return;
    // Destaque: um quadro só, no maior tamanho que couber.
    const tiles = [...grid.children];
    const gap = 12;
    // Folga de 6px em volta (CSS): o brilho e o anel de quem fala não criam barra de rolagem.
    const W = grid.clientWidth - 13;
    const H = grid.clientHeight - 13;
    if (W <= 0 || H <= 0) return;
    const ars = tiles.map((n) => Math.min(21 / 9, Math.max(9 / 16, n._ar || 16 / 9)));
    const key = `${W}x${H}:${tiles.map((n, i) => `${n.dataset.key}=${ars[i].toFixed(3)}`).join(',')}`;
    if (key === this.gridKey) return;
    this.gridKey = key;
    const fits = (h) => {
      let rows = 1;
      let x = 0;
      for (const a of ars) {
        const w = Math.floor(Math.min(a * h, W));
        if (x > 0 && x + gap + w > W) { rows += 1; x = w; } else x += (x > 0 ? gap : 0) + w;
      }
      return rows * h + (rows - 1) * gap <= H;
    };
    const min = matchMedia('(max-width: 640px)').matches ? 90 : 110;
    let lo = min;
    let hi = H;
    if (fits(lo)) {
      for (let i = 0; i < 22; i += 1) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
    }
    const h = Math.floor(lo);
    tiles.forEach((n, i) => {
      n.style.width = `${Math.floor(Math.min(ars[i] * h, W))}px`;
      n.style.height = `${h}px`;
    });
  }

  /** Picture-in-picture: a transmissão continua visível por cima de outros apps/abas. */
  async togglePip() {
    const video = this.el.querySelector('[data-view] video');
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (video && !video.hidden && document.pictureInPictureEnabled) await video.requestPictureInPicture();
      else toast('Janela flutuante indisponível agora.', 'warning');
    } catch { toast('Seu navegador não permitiu a janela flutuante.', 'warning'); }
  }
}
