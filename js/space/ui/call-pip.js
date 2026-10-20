// Janela flutuante da chamada (picture-in-picture): fica por cima de outros apps e abas.
// Fechar a janela NÃO sai da chamada; sair da chamada fecha a janela.
//
// Dois jeitos, conforme o navegador:
//  1. Document Picture-in-Picture (Chrome/Edge/Brave no computador): uma mini sala de verdade,
//     com câmeras, quem está falando e botões de microfone, som, câmera e sair.
//  2. Picture-in-picture de vídeo (celular Android, iPhone, Safari, Firefox): a mini sala é
//     desenhada num <canvas> e vira um vídeo. No Chrome os botões de microfone, câmera e
//     desligar aparecem na própria janelinha (Media Session).
//
// O site não consegue pedir a permissão "sobrepor a outros apps" do Android (isso é só para
// app instalado — fica para o app Android do Space). O navegador, porém, pode abrir a janela
// sozinho quando você sai da aba durante a chamada (Chrome: "picture-in-picture automático",
// ele pergunta uma vez) — por isso registramos o `enterpictureinpicture` da Media Session.
import { avatarHtml, bindVideo, displayName, esc, icon, liveCamera, safeColor, toast } from './dom.js';

const W = 480;
const H = 270;

export class CallPip {
  constructor({ voice, workspace, me }) {
    this.voice = voice;
    this.workspace = workspace;
    this.me = me;
    this.win = null; // janela do Document PiP
    this.video = null; // vídeo do PiP de vídeo
    this.timer = null;
    this.camVideos = new Map(); // stream.id -> <video> escondido (fonte do canvas)
    this.onChange = () => this.update();
    voice.addEventListener('change', this.onChange);
    this.syncMediaSession();
  }

  get supported() {
    return 'documentPictureInPicture' in window || Boolean(document.pictureInPictureEnabled);
  }

  get isOpen() { return Boolean(this.win || (this.video && document.pictureInPictureElement === this.video)); }

  /** Precisa vir de um clique (ou do pedido automático do navegador). */
  async open() {
    if (!this.voice.active) return;
    if (this.isOpen) return;
    try {
      if ('documentPictureInPicture' in window) await this.openDocument();
      else if (document.pictureInPictureEnabled) await this.openVideo();
      else toast('Este navegador não tem janela flutuante.', 'warning');
    } catch (err) {
      console.warn('[MSY][space] Janela flutuante falhou:', err);
      toast(/Android/.test(navigator.userAgent)
        ? 'O Android não abriu a janela flutuante. Libere em Configurações → Apps → Chrome → Picture-in-picture → Permitir.'
        : `O navegador não abriu a janela flutuante (${err?.name || 'erro'}).`, 'warning');
    }
  }

  toggle() { return this.isOpen ? this.close() : this.open(); }

  close() {
    if (this.win) { const w = this.win; this.win = null; w.close(); }
    if (this.video) {
      if (document.pictureInPictureElement === this.video) document.exitPictureInPicture().catch(() => undefined);
      this.stopVideo();
    }
  }

  // ── 1. Document PiP: mini sala com HTML ────────────────────
  async openDocument() {
    const win = await window.documentPictureInPicture.requestWindow({ width: 360, height: 300 });
    this.win = win;
    // Copia os estilos da página (portal + Space + ícones) para a janelinha.
    document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => win.document.head.appendChild(node.cloneNode(true)));
    win.document.title = 'MSY Space';
    win.document.body.className = 'space-body sp-pip-body';
    win.document.body.dataset.page = 'space';
    win.document.body.innerHTML = '<div class="sp-pip"><div class="sp-pip-people" data-people></div><div class="sp-pip-bar" data-bar></div></div>';
    win.document.body.addEventListener('click', (e) => this.onPipClick(e));
    win.addEventListener('pagehide', () => { if (this.win === win) this.win = null; this.syncMediaSession(); });
    this.tiles = new Map();
    this.renderDocument();
  }

  renderDocument() {
    const doc = this.win?.document;
    if (!doc) return;
    const people = this.people();
    const box = doc.querySelector('[data-people]');
    box.dataset.count = String(Math.min(people.length, 4));
    const keep = new Set(people.map((p) => p.key));
    for (const [key, node] of this.tiles) if (!keep.has(key)) { node.remove(); this.tiles.delete(key); }
    people.forEach((p, i) => {
      let node = this.tiles.get(p.key);
      if (!node) {
        node = doc.createElement('div');
        node.className = 'sp-pip-tile';
        node.innerHTML = '<div class="sp-pip-media"></div><span class="sp-pip-name"></span>';
        this.tiles.set(p.key, node);
      }
      if (box.children[i] !== node) box.insertBefore(node, box.children[i] || null);
      node.classList.toggle('is-speaking', p.speaking);
      node.hidden = i >= 4;
      const media = node.querySelector('.sp-pip-media');
      if (p.camera) {
        let v = media.querySelector('video');
        if (!v) { media.innerHTML = '<video autoplay playsinline muted></video>'; v = media.querySelector('video'); }
        v.classList.toggle('is-mirror', p.isLocal);
        bindVideo(v, p.camera);
      } else if (media.dataset.avatarFor !== p.userId || media.querySelector('video')) {
        media.innerHTML = avatarHtml(p.profile, 54);
        media.dataset.avatarFor = p.userId;
      }
      const name = node.querySelector('.sp-pip-name');
      const html = `${p.muted ? `${icon('fa-microphone-slash')} ` : ''}${esc(p.isLocal ? 'Você' : p.name)}`;
      if (name._h !== html) { name.innerHTML = html; name._h = html; }
    });
    const local = this.voice.snapshot.local;
    const micOff = local.muted || !local.micAvailable;
    const bar = `
      <button class="sp-ctl sp-ctl-sm ${micOff ? 'is-off' : ''}" data-act="mute" title="${micOff ? 'Ativar microfone' : 'Desativar microfone'}">${icon(micOff ? 'fa-microphone-slash' : 'fa-microphone')}</button>
      <button class="sp-ctl sp-ctl-sm ${local.deafened ? 'is-off' : ''}" data-act="deafen" title="${local.deafened ? 'Ativar som' : 'Desativar som'}">${icon(local.deafened ? 'fa-volume-xmark' : 'fa-headphones')}</button>
      <button class="sp-ctl sp-ctl-sm ${local.camera ? 'is-on' : ''}" data-act="camera" title="${local.camera ? 'Desligar câmera' : 'Ligar câmera'}">${icon(local.camera ? 'fa-video' : 'fa-video-slash')}</button>
      <button class="sp-ctl sp-ctl-sm is-danger" data-act="leave" title="Sair da chamada">${icon('fa-phone-slash')}</button>`;
    const barEl = doc.querySelector('[data-bar]');
    if (barEl._h !== bar) { barEl.innerHTML = bar; barEl._h = bar; }
  }

  onPipClick(e) {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'mute') this.voice.toggleMute();
    if (act === 'deafen') this.voice.toggleDeafen();
    if (act === 'camera') this.voice.toggleCamera();
    if (act === 'leave') this.voice.leave();
  }

  // ── 2. PiP de vídeo: mini sala desenhada num canvas ────────
  async openVideo() {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.draw();
    const video = document.createElement('video');
    video.className = 'sp-pip-source';
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('autopictureinpicture', ''); // Safari: entra sozinho ao sair do app
    video.srcObject = canvas.captureStream(10);
    document.body.appendChild(video);
    this.video = video;
    // Fora da aba o navegador só deixa timers lentos, mas aba com chamada (áudio) não é congelada.
    this.timer = setInterval(() => this.draw(), 100);
    video.addEventListener('leavepictureinpicture', () => this.stopVideo(), { once: true });
    await video.play();
    await video.requestPictureInPicture();
  }

  stopVideo() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.video) { this.video.srcObject = null; this.video.remove(); }
    this.video = null;
    for (const v of this.camVideos.values()) { v.srcObject = null; v.remove(); }
    this.camVideos.clear();
    this.syncMediaSession();
  }

  camVideo(stream) {
    let v = this.camVideos.get(stream.id);
    if (!v) {
      v = document.createElement('video');
      v.className = 'sp-pip-source';
      v.muted = true;
      v.playsInline = true;
      document.body.appendChild(v);
      this.camVideos.set(stream.id, v);
    }
    bindVideo(v, stream);
    return v;
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx || !this.voice.active) return;
    const people = this.people().slice(0, 4);
    ctx.fillStyle = '#0b0a12';
    ctx.fillRect(0, 0, W, H);
    const cols = people.length <= 1 ? 1 : 2;
    const rows = people.length <= 2 ? 1 : 2;
    const cw = W / cols;
    const ch = H / rows;
    const usedStreams = new Set();
    people.forEach((p, i) => {
      const x = (i % cols) * cw;
      const y = Math.floor(i / cols) * ch;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 3, y + 3, cw - 6, ch - 6);
      ctx.clip();
      ctx.fillStyle = '#171722';
      ctx.fillRect(x, y, cw, ch);
      const v = p.camera ? this.camVideo(p.camera) : null;
      if (v) usedStreams.add(p.camera.id);
      if (v && v.videoWidth) {
        // "contain": mostra a câmera inteira, de pé ou deitada.
        const s = Math.min(cw / v.videoWidth, ch / v.videoHeight);
        const dw = v.videoWidth * s;
        const dh = v.videoHeight * s;
        ctx.drawImage(v, x + (cw - dw) / 2, y + (ch - dh) / 2, dw, dh);
      } else {
        const r = Math.min(cw, ch) * 0.22;
        ctx.fillStyle = safeColor(p.profile?.color, '#7f1d1d');
        ctx.beginPath();
        ctx.arc(x + cw / 2, y + ch / 2 - 8, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `700 ${Math.round(r * 0.8)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.initials, x + cw / 2, y + ch / 2 - 8);
      }
      ctx.restore();
      if (p.speaking) {
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 4.5, y + 4.5, cw - 9, ch - 9);
      }
      ctx.fillStyle = 'rgba(0,0,0,.65)';
      ctx.fillRect(x + 3, y + ch - 26, cw - 6, 23);
      ctx.fillStyle = '#eee';
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${p.muted ? '🔇 ' : ''}${p.isLocal ? 'Você' : p.name}`.slice(0, 28), x + 10, y + ch - 14);
    });
    for (const [id, v] of this.camVideos) if (!usedStreams.has(id)) { v.srcObject = null; v.remove(); this.camVideos.delete(id); }
  }

  // ── Comum ──────────────────────────────────────────────────
  /** Quem aparece na janelinha: quem fala e quem tem câmera primeiro. */
  people() {
    const snap = this.voice.snapshot;
    if (!snap) return [];
    const look = (userId) => {
      const profile = this.workspace.profile(userId);
      const name = displayName(profile);
      return { profile, name, initials: profile?.initials || window.MSY.Utils.getInitials(name) };
    };
    const list = [
      { key: snap.local.sessionId, userId: this.me.id, isLocal: true, ...look(this.me.id), camera: snap.local.camera,
        muted: snap.local.muted || !snap.local.micAvailable, speaking: snap.local.speaking && !snap.local.muted },
      ...snap.participants.map((p) => ({ key: p.sessionId, userId: p.userId, isLocal: false, ...look(p.userId),
        camera: liveCamera(p.camera), muted: p.meta.muted, speaking: p.speaking && !p.meta.muted })),
    ];
    const score = (p) => (p.speaking ? 2 : 0) + (p.camera ? 1 : 0) + (p.isLocal ? -0.5 : 0);
    return list.map((p, i) => ({ p, i })).sort((a, b) => score(b.p) - score(a.p) || a.i - b.i).map(({ p }) => p);
  }

  update() {
    if (!this.voice.active) { this.close(); this.syncMediaSession(); return; }
    if (this.win) this.renderDocument();
    this.syncMediaSession();
  }

  /** Botões da janelinha (Chrome) e abertura automática ao sair da aba durante a chamada. */
  syncMediaSession() {
    const ms = navigator.mediaSession;
    if (!ms?.setActionHandler) return;
    const active = this.voice.active;
    if (this.msActive !== active) {
      this.msActive = active;
      const set = (action, fn) => { try { ms.setActionHandler(action, active ? fn : null); } catch { /* ação não suportada */ } };
      set('enterpictureinpicture', () => this.open());
      set('togglemicrophone', () => this.voice.toggleMute());
      set('togglecamera', () => this.voice.toggleCamera());
      set('hangup', () => this.voice.leave());
      try {
        ms.metadata = active ? new MediaMetadata({ title: this.voice.channel?.name || 'Chamada', artist: 'MSY Space' }) : null;
      } catch { /* sem suporte */ }
    }
    if (!active) { this.msMic = undefined; this.msCam = undefined; return; }
    const local = this.voice.snapshot.local;
    const mic = !(local.muted || !local.micAvailable);
    const cam = Boolean(local.camera);
    if (mic !== this.msMic) { this.msMic = mic; try { ms.setMicrophoneActive?.(mic); } catch { /* sem suporte */ } }
    if (cam !== this.msCam) { this.msCam = cam; try { ms.setCameraActive?.(cam); } catch { /* sem suporte */ } }
  }
}
