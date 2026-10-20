// Download do app Android do MSY Space (APK guardado no Storage do portal, bucket privado 'space-app').
// Só quem tem acesso ao Space consegue o link (assinado, vale 10 min). Ver docs/msy-space/APP_ANDROID.md.
import { supabase } from '../lib/supabase.js';
import { getCapabilities } from '../voice/media/capabilities.js';
import { toast } from './dom.js';

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
