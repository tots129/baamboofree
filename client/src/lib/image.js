import { api } from './api.js';

const MAX_DIM = 1280;
const MAX_BYTES = 2 * 1024 * 1024;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível abrir esta imagem.'));
    };
    img.src = url;
  });
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Reduz e comprime no navegador antes de enviar, para economizar espaço e dados móveis. */
export async function prepareImage(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error('Escolha um arquivo de imagem (JPG, PNG, WEBP ou GIF).');
  if (file.type === 'image/gif' && file.size <= MAX_BYTES) return file;
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  let blob = await toBlob(canvas, 'image/webp', 0.82);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', 0.85);
  if (blob.size > MAX_BYTES) blob = await toBlob(canvas, 'image/jpeg', 0.6);
  if (blob.size > MAX_BYTES) throw new Error('A imagem continua grande demais. Tente outra menor.');
  return blob;
}

export async function uploadImage(file) {
  const blob = await prepareImage(file);
  const { id } = await api.upload('/api/images', blob);
  return id;
}

export function pickFile(accept = 'image/*') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files && input.files[0] ? input.files[0] : null);
    input.click();
  });
}
