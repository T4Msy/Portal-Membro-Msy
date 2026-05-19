/* ============================================================
   MSY PORTAL — SOCIAL MEDIA HELPERS
   Compressao, preview, upload e edicao de midia social.
   ============================================================ */

const SOCIAL_BUCKET = 'social-media';
const STORY_IMAGE_EXPORT_MIME = 'image/webp';
const VIDEO_EXPORT_MIME = 'video/webm;codecs=vp9,opus';
const STORY_ASPECT_RATIOS = {
  '9:16': 9 / 16,
  '1:1': 1,
  '4:5': 4 / 5,
  '16:9': 16 / 9,
  original: null,
};

export async function compressImage(file, options = {}) {
  const {
    maxWidth = 1600,
    maxHeight = 1600,
    quality = 0.82,
    mimeType = STORY_IMAGE_EXPORT_MIME,
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

export async function resolveStorageOwnerId(db, fallbackUserId = null) {
  try {
    const { data, error } = await db.auth.getUser();
    if (!error && data?.user?.id) return data.user.id;
  } catch {}

  try {
    const { data } = await db.auth.getSession();
    if (data?.session?.user?.id) return data.session.user.id;
  } catch {}

  if (fallbackUserId) return fallbackUserId;
  throw new Error('Sessao autenticada nao encontrada para upload.');
}

function normalizeSocialUploadError(error, path) {
  const message = String(error?.message || error?.error_description || error?.details || '').toLowerCase();
  if (message.includes('bucket') && message.includes('not')) {
    return new Error(`Bucket social-media nao encontrado para o upload ${path}.`);
  }
  if (message.includes('row-level security') || message.includes('permission')) {
    return new Error(`Permissao negada no storage social-media para o caminho ${path}. Confira auth.uid() e policies.`);
  }
  if (message.includes('mime') || message.includes('content type')) {
    return new Error('Tipo de arquivo nao permitido no bucket social-media.');
  }
  if (message.includes('payload too large') || message.includes('file size')) {
    return new Error('Arquivo excede o limite configurado no bucket social-media.');
  }
  return error instanceof Error ? error : new Error('Erro ao enviar midia social.');
}

export async function uploadSocialMedia(db, userId, file, folder = 'posts', options = {}) {
  const { skipCompression = false } = options;
  const ownerId = await resolveStorageOwnerId(db, userId);
  const mediaType = getMediaType(file);
  const uploadFile = mediaType === 'image' && !skipCompression ? await compressImage(file) : file;
  const ext = (uploadFile.name.split('.').pop() || (mediaType === 'image' ? 'webp' : 'mp4')).toLowerCase();
  const safeName = uploadFile.name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42) || 'media';
  const path = `${ownerId}/${folder}/${Date.now()}-${crypto.randomUUID()}-${safeName}.${ext}`;

  const { error } = await db.storage.from(SOCIAL_BUCKET).upload(path, uploadFile, {
    cacheControl: '31536000',
    upsert: false,
    contentType: uploadFile.type,
  });
  if (error) {
    console.error('[MSY][social-media] Falha no upload:', { folder, ownerId, path, error });
    throw normalizeSocialUploadError(error, path);
  }

  const { data } = db.storage.from(SOCIAL_BUCKET).getPublicUrl(path);
  return {
    url: data.publicUrl,
    storage_path: path,
    media_type: mediaType,
    size: uploadFile.size,
    owner_id: ownerId,
    original_name: file.name,
  };
}

export async function removeSocialMedia(db, paths = []) {
  const cleanPaths = [...new Set((paths || []).filter(Boolean))];
  if (!cleanPaths.length) return;
  const { error } = await db.storage.from(SOCIAL_BUCKET).remove(cleanPaths);
  if (error) throw error;
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
    if (item?.thumbnail_url?.startsWith('blob:')) URL.revokeObjectURL(item.thumbnail_url);
  });
}

export function createStoryImageEditState() {
  return {
    kind: 'image',
    zoom: 1,
    rotation: 0,
    aspect: '9:16',
    offsetX: 0,
    offsetY: 0,
  };
}

export function createStoryVideoEditState() {
  return {
    kind: 'video',
    zoom: 1,
    rotation: 0,
    aspect: '9:16',
    offsetX: 0,
    offsetY: 0,
    trimStart: 0,
    trimEnd: null,
    thumbnailTime: 0,
    duration: 0,
    exportSupported: supportsVideoEditing(),
  };
}

export function createStoryMediaEditState(file) {
  return getMediaType(file) === 'video'
    ? createStoryVideoEditState()
    : createStoryImageEditState();
}

export function getStoryAspectRatioValue(aspect = '9:16') {
  return STORY_ASPECT_RATIOS[aspect] || STORY_ASPECT_RATIOS['9:16'];
}

export function normalizeMediaEditState(editState = {}, mediaType = 'image') {
  const base = mediaType === 'video' ? createStoryVideoEditState() : createStoryImageEditState();
  return {
    ...base,
    ...editState,
    zoom: clamp(Number(editState.zoom ?? base.zoom), 1, 5),
    rotation: clamp(Number(editState.rotation ?? base.rotation), -180, 180),
    offsetX: clamp(Number(editState.offsetX ?? base.offsetX), -1, 1),
    offsetY: clamp(Number(editState.offsetY ?? base.offsetY), -1, 1),
    aspect: editState.aspect || base.aspect,
  };
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export async function exportStoryImageFile(file, editState = {}) {
  const image = await loadImage(file);
  const normalized = normalizeMediaEditState(editState, 'image');
  const aspect = normalized.aspect === 'original' ? image.width / image.height : getStoryAspectRatioValue(normalized.aspect);
  const zoom = clamp(Number(normalized.zoom || 1), 1, 5);
  const rotation = Number(normalized.rotation || 0);
  const sourceAspect = image.width / image.height;

  let cropWidth;
  let cropHeight;
  if (sourceAspect > aspect) {
    cropHeight = image.height / zoom;
    cropWidth = cropHeight * aspect;
  } else {
    cropWidth = image.width / zoom;
    cropHeight = cropWidth / aspect;
  }

  cropWidth = Math.min(cropWidth, image.width);
  cropHeight = Math.min(cropHeight, image.height);

  const maxX = Math.max(0, (image.width - cropWidth) / 2);
  const maxY = Math.max(0, (image.height - cropHeight) / 2);
  const offsetX = clamp(Number(normalized.offsetX || 0), -1, 1) * maxX;
  const offsetY = clamp(Number(normalized.offsetY || 0), -1, 1) * maxY;
  const sx = clamp((image.width - cropWidth) / 2 + offsetX, 0, image.width - cropWidth);
  const sy = clamp((image.height - cropHeight) / 2 + offsetY, 0, image.height - cropHeight);

  const baseTargetWidth = Math.round(Math.min(1080, cropWidth));
  const baseTargetHeight = Math.round(baseTargetWidth / aspect);
  const canvas = document.createElement('canvas');
  canvas.width = baseTargetWidth;
  canvas.height = baseTargetHeight;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(
    image,
    sx,
    sy,
    cropWidth,
    cropHeight,
    -baseTargetWidth / 2,
    -baseTargetHeight / 2,
    baseTargetWidth,
    baseTargetHeight,
  );
  ctx.restore();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, STORY_IMAGE_EXPORT_MIME, 0.92));
  if (!blob) throw new Error('Nao foi possivel exportar a imagem editada.');

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'story';
  return new File([blob], `${baseName}-story.webp`, { type: STORY_IMAGE_EXPORT_MIME, lastModified: Date.now() });
}

export function supportsVideoEditing() {
  return typeof window !== 'undefined'
    && typeof MediaRecorder !== 'undefined'
    && typeof HTMLCanvasElement !== 'undefined'
    && !!HTMLCanvasElement.prototype.captureStream
    && !!HTMLMediaElement.prototype.captureStream;
}

export async function getVideoMetadata(fileOrUrl) {
  const sourceUrl = typeof fileOrUrl === 'string' ? fileOrUrl : URL.createObjectURL(fileOrUrl);
  const shouldRevoke = typeof fileOrUrl !== 'string';
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.playsInline = true;
  video.muted = true;
  video.src = sourceUrl;
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('Video invalido.'));
  });
  const cleanup = () => {
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (shouldRevoke) URL.revokeObjectURL(sourceUrl);
  };
  return {
    url: sourceUrl,
    video,
    width: video.videoWidth || 720,
    height: video.videoHeight || 1280,
    duration: Number.isFinite(video.duration) ? video.duration : 0,
    cleanup,
  };
}

export async function captureStoryVideoThumbnail(file, time = 0, rotation = 0) {
  const meta = await getVideoMetadata(file);
  try {
    const targetTime = clamp(Number(time || 0), 0, Math.max(meta.duration || 0, 0));
    await seekVideo(meta.video, targetTime);
    const frame = drawVideoFrame(meta.video, { rotation });
    const blob = await new Promise((resolve) => frame.canvas.toBlob(resolve, STORY_IMAGE_EXPORT_MIME, 0.9));
    if (!blob) throw new Error('Nao foi possivel capturar a miniatura do video.');
    const url = URL.createObjectURL(blob);
    return {
      blob,
      url,
      time: targetTime,
      width: frame.canvas.width,
      height: frame.canvas.height,
    };
  } finally {
    meta.cleanup();
  }
}

function drawVideoFrame(video, editState = {}) {
  const normalized = normalizeMediaEditState(editState, 'video');
  const width = video.videoWidth || 720;
  const height = video.videoHeight || 1280;
  const aspect = normalized.aspect === 'original' ? width / height : getStoryAspectRatioValue(normalized.aspect);
  const sourceAspect = width / height;
  const targetWidth = Math.min(1080, sourceAspect >= aspect ? height * aspect : width);
  const targetHeight = targetWidth / aspect;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(targetWidth);
  canvas.height = Math.round(targetHeight);
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((normalized.rotation * Math.PI) / 180);
  const baseScale = Math.max(canvas.width / width, canvas.height / height);
  const scale = baseScale * normalized.zoom;
  const maxX = Math.max(0, ((width * scale) - canvas.width) / 2);
  const maxY = Math.max(0, ((height * scale) - canvas.height) / 2);
  ctx.translate(normalized.offsetX * maxX, normalized.offsetY * maxY);
  ctx.drawImage(video, -(width * scale) / 2, -(height * scale) / 2, width * scale, height * scale);
  ctx.restore();
  return { canvas, width: canvas.width, height: canvas.height };
}

async function seekVideo(video, time) {
  if (Math.abs((video.currentTime || 0) - time) < 0.05) return;
  await new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Nao foi possivel posicionar o video para edicao.'));
    };
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });
    video.currentTime = time;
  });
}

export async function exportStoryVideoFile(file, editState = {}) {
  if (!supportsVideoEditing()) {
    throw new Error('Este navegador nao suporta exportacao local de video para stories.');
  }

  const meta = await getVideoMetadata(file);
  const { video, duration } = meta;
  const trimStart = clamp(Number(editState.trimStart || 0), 0, Math.max(duration - 0.25, 0));
  const trimEnd = clamp(Number(editState.trimEnd ?? duration), trimStart + 0.25, duration || trimStart + 0.25);
  const normalized = normalizeMediaEditState(editState, 'video');
  const sourceStream = video.captureStream();
  const frame = drawVideoFrame(video, normalized);
  const canvasStream = frame.canvas.captureStream(30);
  const composedTracks = [
    ...canvasStream.getVideoTracks(),
    ...sourceStream.getAudioTracks(),
  ];
  const recorder = new MediaRecorder(new MediaStream(composedTracks), {
    mimeType: MediaRecorder.isTypeSupported(VIDEO_EXPORT_MIME) ? VIDEO_EXPORT_MIME : 'video/webm',
    videoBitsPerSecond: 5_000_000,
  });

  const chunks = [];
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data?.size) chunks.push(event.data);
  });

  const renderFrame = () => {
    if (video.paused || video.ended) return;
    const nextFrame = drawVideoFrame(video, normalized);
    frame.canvas.width = nextFrame.canvas.width;
    frame.canvas.height = nextFrame.canvas.height;
    frame.canvas.getContext('2d', { alpha: false }).drawImage(nextFrame.canvas, 0, 0);
    requestAnimationFrame(renderFrame);
  };

  try {
    await seekVideo(video, trimStart);
    video.muted = false;
    video.currentTime = trimStart;
    const stopped = new Promise((resolve) => recorder.addEventListener('stop', resolve, { once: true }));
    recorder.start(250);
    await video.play();
    requestAnimationFrame(renderFrame);

    await new Promise((resolve) => {
      const tick = () => {
        if (video.currentTime >= trimEnd || video.ended) {
          video.pause();
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    if (recorder.state !== 'inactive') recorder.stop();
    await stopped;

    const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
    if (!blob.size) throw new Error('Nao foi possivel exportar o video editado.');
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'story-video';
    return new File([blob], `${baseName}-story.webm`, { type: blob.type || 'video/webm', lastModified: Date.now() });
  } finally {
    meta.cleanup();
    canvasStream.getTracks().forEach((track) => track.stop());
    sourceStream.getTracks().forEach((track) => track.stop());
  }
}
