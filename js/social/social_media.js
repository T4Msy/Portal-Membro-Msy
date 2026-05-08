/* ============================================================
   MSY PORTAL — SOCIAL MEDIA HELPERS
   Compressao de imagens, preview e upload no Supabase Storage.
   ============================================================ */

const SOCIAL_BUCKET = 'social-media';

export async function compressImage(file, options = {}) {
  const {
    maxWidth = 1600,
    maxHeight = 1600,
    quality = 0.82,
    mimeType = 'image/webp',
  } = options;

  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;

  const img = await loadImage(file);
  const scale = Math.min(1, maxWidth / img.width, maxHeight / img.height);
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality));
  if (!blob) return file;

  const baseName = file.name.replace(/\.[^.]+$/, '');
  return new File([blob], `${baseName}.webp`, { type: mimeType, lastModified: Date.now() });
}

export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Imagem invalida.'));
    };
    img.src = url;
  });
}

export function getMediaType(file) {
  if (file.type.startsWith('video/')) return 'video';
  return 'image';
}

export function validateMediaFile(file, { maxImages = 10, maxImageMB = 12, maxVideoMB = 50 } = {}) {
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  if (!isImage && !isVideo) throw new Error('Use apenas imagens ou videos.');
  const max = isVideo ? maxVideoMB : maxImageMB;
  if (file.size > max * 1024 * 1024) throw new Error(`Arquivo muito grande. Maximo ${max}MB.`);
  return { maxImages };
}

export async function uploadSocialMedia(db, userId, file, folder = 'posts') {
  const mediaType = getMediaType(file);
  const uploadFile = mediaType === 'image' ? await compressImage(file) : file;
  const ext = (uploadFile.name.split('.').pop() || (mediaType === 'image' ? 'webp' : 'mp4')).toLowerCase();
  const safeName = uploadFile.name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42) || 'media';
  const path = `${userId}/${folder}/${Date.now()}-${crypto.randomUUID()}-${safeName}.${ext}`;

  const { error } = await db.storage.from(SOCIAL_BUCKET).upload(path, uploadFile, {
    cacheControl: '31536000',
    upsert: false,
    contentType: uploadFile.type,
  });
  if (error) throw error;

  const { data } = db.storage.from(SOCIAL_BUCKET).getPublicUrl(path);
  return {
    url: data.publicUrl,
    storage_path: path,
    media_type: mediaType,
    size: uploadFile.size,
  };
}

export function filePreview(file) {
  return {
    id: crypto.randomUUID(),
    file,
    url: URL.createObjectURL(file),
    media_type: getMediaType(file),
  };
}

export function revokePreviews(items = []) {
  items.forEach((item) => {
    if (item?.url?.startsWith('blob:')) URL.revokeObjectURL(item.url);
  });
}

