// Helpers de interface do MSY Space (padrão do portal: tudo que é dinâmico passa por escapeHtml).
const { Utils } = window.MSY;

export const esc = (value) => Utils.escapeHtml(String(value ?? ''));

export function toast(message, type = 'success') {
  Utils.showToast(message, type === 'warning' ? 'info' : type);
}

const SAFE_COLOR = /^#[0-9a-f]{3,8}$/i;

/** Cor vinda do banco só entra num style se for #hex (evita injeção de CSS). */
export function safeColor(color, fallback = '#7f1d1d') {
  return SAFE_COLOR.test(color || '') ? color : fallback;
}

/** Avatar do perfil do portal (foto ou iniciais com a cor do membro). */
export function avatarHtml(profile, size = 32, extraClass = '') {
  const color = safeColor(profile?.color);
  const initials = profile?.initials || Utils.getInitials(profile?.name || '?');
  const inner = profile?.avatar_url ? `<img src="${esc(profile.avatar_url)}" alt="" loading="lazy">` : esc(initials);
  return `<span class="sp-avatar ${extraClass}" style="--sp-c:${color};--sp-size:${size}px" title="${esc(profile?.name || '')}">${inner}</span>`;
}

export function displayName(profile) {
  return profile?.name || 'Membro';
}

const timeFmt = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fullFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short' });

export function formatMessageTime(iso, now = new Date()) {
  const d = new Date(iso);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return `Hoje às ${timeFmt.format(d)}`;
  if (d.toDateString() === yesterday.toDateString()) return `Ontem às ${timeFmt.format(d)}`;
  return `${dateFmt.format(d)} ${timeFmt.format(d)}`;
}
export const formatTime = (iso) => timeFmt.format(new Date(iso));
export const formatFull = (iso) => fullFmt.format(new Date(iso));

export function formatKbps(kbps) {
  return kbps >= 1000 ? `${(kbps / 1000).toFixed(1)} Mbps` : `${Math.round(kbps)} kbps`;
}

const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

/** Texto da mensagem com links clicáveis — cada parte é escapada antes de virar HTML. */
export function linkify(text) {
  let out = '';
  let last = 0;
  for (const m of String(text).matchAll(URL_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out += esc(text.slice(last, idx));
    out += `<a href="${esc(m[0])}" target="_blank" rel="noopener noreferrer">${esc(m[0])}</a>`;
    last = idx + m[0].length;
  }
  if (last < text.length) out += esc(text.slice(last));
  return out;
}

/** Câmera que está mandando imagem. Pausada (celular saiu do app) ou encerrada → null (mostra a foto). */
export function liveCamera(stream) {
  const track = stream?.getVideoTracks()[0];
  return track && track.readyState === 'live' && !track.muted ? stream : null;
}

/** <video> ligado a um MediaStream (o áudio toca separado, no AudioOutput). */
export function bindVideo(video, stream) {
  if (!video) return;
  if (video.srcObject !== stream) video.srcObject = stream || null;
  if (stream) video.play().catch(() => undefined);
}

export function icon(name) {
  return `<i class="fa-solid ${name}" aria-hidden="true"></i>`;
}
