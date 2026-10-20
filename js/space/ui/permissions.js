// Permissões de microfone e câmera do MSY Space.
//
// Quem decide se o navegador pergunta de novo é o próprio navegador — o site não consegue
// marcar "permitir sempre". O que dá para fazer (e é feito aqui):
//  - antes da janela do navegador aparecer, explicar qual opção escolher para ele não
//    perguntar mais ("Permitir ao visitar o site" no Chrome/Brave/Edge, "Lembrar" no Firefox,
//    "Permitir" nos Ajustes do Site do iPhone);
//  - pedir microfone e câmera juntos (uma pergunta só) pelo botão "Permitir sempre";
//  - mostrar o estado atual de cada permissão e como liberar quando estiver bloqueada.
import { getCapabilities } from '../voice/media/capabilities.js';
import { esc, icon } from './dom.js';

const SEEN_KEY = 'msy_space_perm_tip';

/** 'granted' | 'denied' | 'prompt' | 'unknown' (navegador sem a API de permissões). */
export async function permissionState(name) {
  try {
    const status = await navigator.permissions.query({ name });
    return status.state;
  } catch {
    return 'unknown';
  }
}

function browserKind() {
  const caps = getCapabilities();
  const ua = navigator.userAgent;
  if (caps.isIOS) return 'ios';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Android/.test(ua)) return 'android';
  if (/Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua)) return 'safari';
  return 'chromium';
}

/** O que escolher na janela do navegador para não perguntar de novo. */
export function allowAlwaysTip() {
  switch (browserKind()) {
    case 'ios':
      return 'No iPhone, toque em <b>Permitir</b>. Para nunca mais perguntar: no Safari, toque em <b>aA</b> (barra de endereço) → <b>Ajustes do Site</b> → Câmera e Microfone → <b>Permitir</b>.';
    case 'safari':
      return 'Toque em <b>Permitir</b>. Para nunca mais perguntar: menu <b>Safari → Ajustes → Sites</b> → Câmera e Microfone → portalmsy.site → <b>Permitir</b>.';
    case 'firefox':
      return 'Marque <b>Lembrar esta decisão</b> e clique em <b>Permitir</b>.';
    case 'android':
      return 'Escolha <b>Permitir ao visitar o site</b> (não "Somente desta vez").';
    default:
      return 'Escolha <b>Permitir ao visitar o site</b> (não "Permitir desta vez").';
  }
}

/** Como desbloquear depois de ter negado. */
export function unblockTip() {
  switch (browserKind()) {
    case 'ios':
      return 'No Safari, toque em <b>aA</b> → <b>Ajustes do Site</b> → Câmera e Microfone → <b>Permitir</b>. Depois recarregue a página.';
    case 'safari':
      return 'Menu <b>Safari → Ajustes → Sites</b> → Câmera e Microfone → <b>Permitir</b> para portalmsy.site.';
    case 'firefox':
      return 'Clique no ícone de câmera/microfone na barra de endereço e remova o bloqueio.';
    default:
      return 'Toque no <b>cadeado</b> (ou ícone de ajustes) ao lado do endereço → <b>Permissões</b> → Microfone e Câmera → <b>Permitir</b>.';
  }
}

/**
 * Chamado antes de pedir microfone/câmera. Se o navegador ainda vai perguntar, mostra
 * antes qual opção escolher. Resolve `true` para seguir (o navegador pergunta em seguida).
 */
export async function explainBeforeAsking(kinds) {
  const states = await Promise.all(kinds.map((k) => permissionState(k === 'camera' ? 'camera' : 'microphone')));
  if (states.every((s) => s === 'granted' || s === 'denied')) return true;
  // Sem a API de permissões (ex.: Safari antigo): explica só uma vez por navegador.
  if (states.every((s) => s === 'unknown' || s === 'granted')) {
    try { if (localStorage.getItem(SEEN_KEY)) return true; localStorage.setItem(SEEN_KEY, '1'); } catch { return true; }
  }
  const what = kinds.length > 1 ? 'o microfone e a câmera' : kinds[0] === 'camera' ? 'a câmera' : 'o microfone';
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'modal-overlay open sp-modal sp-perm-modal';
    el.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Permissão">
      <div class="modal-body">
        <div class="sp-perm-orb">${icon(kinds.includes('camera') ? 'fa-video' : 'fa-microphone')}</div>
        <h3>O navegador vai pedir ${esc(what)}</h3>
        <p class="sp-perm-tip">${allowAlwaysTip()}</p>
        <p class="sp-hint">Assim ele não pergunta de novo toda vez que você entrar numa sala.</p>
      </div>
      <div class="modal-footer"><button class="btn btn-primary" data-ok>Entendi, continuar</button></div>
    </div>`;
    const done = () => { el.remove(); resolve(true); };
    el.querySelector('[data-ok]').addEventListener('click', done);
    el.addEventListener('click', (e) => { if (e.target === el) done(); });
    document.body.appendChild(el);
    el.querySelector('[data-ok]').focus();
  });
}

/** Pede microfone e câmera numa pergunta só (botão "Permitir sempre" das configurações). */
export async function requestBoth() {
  const caps = getCapabilities();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: caps.camera });
  stream.getTracks().forEach((t) => t.stop());
}
