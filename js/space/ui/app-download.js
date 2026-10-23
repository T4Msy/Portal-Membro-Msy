// Download do app Android do MSY Space (APK guardado no Storage do portal, bucket privado 'space-app').
// Só quem tem acesso ao Space consegue o link (assinado, vale 10 min). Ver docs/msy-space/APP_ANDROID.md.
import { supabase } from '../lib/supabase.js';
import { getCapabilities } from '../voice/media/capabilities.js';
import { icon, toast } from './dom.js';

const BUCKET = 'space-app';
const FILE = 'MSY-Space.apk';

/** Versão publicada (latest.json: { version, size, date }) — null se ainda não houver. */
export async function latestAppInfo() {
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl('latest.json', 60);
    if (error) return null;
    const res = await fetch(data.signedUrl, { cache: 'no-store' });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export async function downloadAndroidApp() {
  if (getCapabilities().isIOS) {
    toast('O app é só para Android. No iPhone, use o MSY Space pelo Safari.', 'warning');
    return;
  }
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(FILE, 600, { download: FILE });
    if (error) throw error;
    window.location.href = data.signedUrl;
    toast('Baixando o app… Depois abra o arquivo e permita instalar.', 'success');
  } catch (err) {
    console.error('[MSY][space] Falha ao baixar o app:', err);
    toast('O app ainda não está disponível para download.', 'error');
  }
}

/** Janela com as informações do app e o botão de baixar (aberta pelo ícone ao lado de "MSY Space"). */
export function openAppDownload() {
  if (document.querySelector('.sp-appdl-modal')) return;
  const el = document.createElement('div');
  el.className = 'modal-overlay open sp-modal sp-appdl-modal';
  el.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="App Android do MSY Space">
    <div class="modal-body">
      <button class="sp-appdl-close" data-close aria-label="Fechar">${icon('fa-xmark')}</button>
      <div class="sp-appdl-hero">
        <div class="sp-appdl-icon"><i class="fa-brands fa-android" aria-hidden="true"></i></div>
        <div><h3>App Android do MSY Space</h3><p data-version>Carregando versão…</p></div>
      </div>
      <ul class="sp-appdl-list">
        <li>${icon('fa-phone-volume')}<span><b>Chamada em segundo plano</b>: continua com o celular bloqueado ou em outro app.</span></li>
        <li>${icon('fa-clone')}<span><b>Janelinha flutuante</b> por cima dos outros apps ao sair da call.</span></li>
        <li>${icon('fa-video')}<span><b>Câmera em HD</b>, tela cheia e transmitir a tela do celular.</span></li>
        <li>${icon('fa-volume-high')}<span><b>Alto-falante ou "do ouvido"</b>, como no Discord.</span></li>
      </ul>
      <div class="sp-appdl-how">
        <b>Como instalar</b>
        <ol>
          <li>Baixe o arquivo no celular Android.</li>
          <li>Abra o arquivo e permita "instalar apps desta fonte".</li>
          <li>Entre com o mesmo e-mail e senha do portal.</li>
        </ol>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-close>Fechar</button>
      <button class="btn btn-primary sp-appdl-go" data-go>${icon('fa-download')} Baixar app</button>
    </div>
  </div>`;
  const close = () => el.remove();
  el.addEventListener('click', (e) => {
    if (e.target === el || e.target.closest('[data-close]')) close();
    if (e.target.closest('[data-go]')) { downloadAndroidApp(); close(); }
  });
  document.body.appendChild(el);
  latestAppInfo().then((info) => {
    const v = el.querySelector('[data-version]');
    if (!v) return;
    const size = info?.size ? ` · ${Math.round(info.size / 1048576)} MB` : '';
    const date = info?.date ? ` · ${info.date.split('-').reverse().join('/')}` : '';
    v.textContent = info?.version ? `Versão ${info.version}${size}${date}` : 'Ainda não há versão publicada.';
  });
}
