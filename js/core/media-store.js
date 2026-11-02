/* ============================================================
   MSY PORTAL — MEDIA STORE (Cloudflare R2 via Worker msy-media)
   Arquivos públicos (anexos de atividades, avatares, feed, Jornal, perfil do Space) moram
   no R2 porque lá o download (egress) é grátis; no Supabase Free ele estourava a cota.
   Mesmo formato do db.storage.from(bucket) do Supabase, então quem chama troca só o cliente:
     const media = createMediaStorage(db);
     await media.from('activity-files').upload(path, file, { upsert, contentType });
     media.from('activity-files').getPublicUrl(path).data.publicUrl;
     await media.from('activity-files').remove([path]);
   Worker: cloudflare/media-worker/worker.js. Privados (atas, APK do Space) seguem no Supabase.
   ============================================================ */

export const MEDIA_BASE_URL = 'https://msy-media.miguelalvesmm08.workers.dev';
export const MEDIA_BUCKETS = new Set(['activity-files', 'social-media', 'jornal-media', 'space-profile-media']);

const SUPABASE_PUBLIC_MARKER = '/storage/v1/object/public/';

const encodePath = (path) => String(path).split('/').map(encodeURIComponent).join('/');

/** URL pública do R2 para bucket/caminho. */
export function mediaPublicUrl(bucket, path) {
  return `${MEDIA_BASE_URL}/${bucket}/${encodePath(path)}`;
}

// ---------- Versão leve de imagens (Jornal) ----------
// Ao lado de "foto.webp" fica "foto.sm.webp" (~800px). Quem está nos dados móveis ou com
// "Economia de dados" recebe a leve; no Wi-Fi (e sem a API de rede, ex. iPhone) vem a original.
const LIGHT_IMAGE_EXT = /\.(webp|jpe?g|png)$/i;

/** "pasta/foto.webp" -> "pasta/foto.sm.webp" (null para vídeo, GIF ou o que já é leve). */
export function lightVariantPath(path) {
  const value = String(path || '');
  if (!LIGHT_IMAGE_EXT.test(value) || /\.sm\.[^./]+$/i.test(value)) return null;
  return value.replace(LIGHT_IMAGE_EXT, '.sm.$1');
}

/** URL da versão leve, só para imagens no R2; null se não se aplica. */
export function lightVariantUrl(url) {
  const value = String(url || '').split('?')[0];
  if (!value.startsWith(`${MEDIA_BASE_URL}/`)) return null;
  return lightVariantPath(value);
}

/** true quando vale economizar: Economia de dados ligada, rede celular ou conexão lenta. */
export function prefersLightMedia() {
  const connection = globalThis.navigator?.connection;
  if (!connection) return false;
  if (connection.saveData) return true;
  if (connection.type === 'cellular') return true;
  return ['slow-2g', '2g', '3g'].includes(connection.effectiveType);
}

/** Para fundo em CSS (sem onerror): devolve a leve se ela existir e carregar, senão a original. */
export async function pickLightImageUrl(url, timeoutMs = 3000) {
  const light = prefersLightMedia() ? lightVariantUrl(url) : null;
  if (!light) return url;
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(url), timeoutMs);
    img.onload = () => { clearTimeout(timer); resolve(light); };
    img.onerror = () => { clearTimeout(timer); resolve(url); };
    img.src = light;
  });
}

/** Descobre { bucket, path } de uma URL do R2 ou de uma URL pública antiga do Supabase. */
export function parseMediaUrl(url) {
  const value = String(url || '');
  let rest = null;
  if (value.startsWith(`${MEDIA_BASE_URL}/`)) rest = value.slice(MEDIA_BASE_URL.length + 1);
  else if (value.includes(SUPABASE_PUBLIC_MARKER)) rest = value.split(SUPABASE_PUBLIC_MARKER)[1];
  if (!rest) return null;
  const [bucket, ...parts] = rest.split('?')[0].split('/');
  if (!bucket || !parts.length) return null;
  return { bucket, path: decodeURIComponent(parts.join('/')) };
}

export function createMediaStorage(db) {
  async function authHeaders() {
    const { data } = await db.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) throw new Error('Sessão expirada. Entre de novo para enviar arquivos.');
    return { Authorization: `Bearer ${token}`, apikey: db.supabaseKey };
  }

  return {
    from(bucket) {
      if (!MEDIA_BUCKETS.has(bucket)) throw new Error(`Bucket ${bucket} não está no R2.`);
      return {
        async upload(path, file, options = {}) {
          try {
            const headers = {
              ...(await authHeaders()),
              'Content-Type': options.contentType || file.type || 'application/octet-stream',
            };
            if (options.upsert) headers['x-upsert'] = 'true';
            if (options.cacheControl) headers['x-cache-control'] = /^\d+$/.test(String(options.cacheControl))
              ? `public, max-age=${options.cacheControl}`
              : String(options.cacheControl);
            const res = await fetch(`${MEDIA_BASE_URL}/${bucket}/${encodePath(path)}`, { method: 'PUT', headers, body: file });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) return { data: null, error: Object.assign(new Error(body.error || `Upload falhou (${res.status})`), { statusCode: res.status }) };
            return { data: { path, fullPath: `${bucket}/${path}` }, error: null };
          } catch (error) {
            return { data: null, error };
          }
        },

        getPublicUrl(path) {
          return { data: { publicUrl: mediaPublicUrl(bucket, path) } };
        },

        // Remove no R2 e, se ainda existir, a cópia antiga no Supabase (arquivos de antes da migração).
        async remove(paths = []) {
          const clean = [...new Set((paths || []).filter(Boolean))];
          if (!clean.length) return { data: [], error: null };
          try {
            const headers = await authHeaders();
            const results = await Promise.all(clean.map((path) =>
              fetch(`${MEDIA_BASE_URL}/${bucket}/${encodePath(path)}`, { method: 'DELETE', headers }).then((res) => res.ok)));
            await db.storage.from(bucket).remove(clean).catch(() => null);
            const failed = clean.filter((_, i) => !results[i]);
            return failed.length
              ? { data: null, error: new Error(`Não foi possível remover: ${failed.join(', ')}`) }
              : { data: clean.map((name) => ({ name })), error: null };
          } catch (error) {
            return { data: null, error };
          }
        },
      };
    },
  };
}
