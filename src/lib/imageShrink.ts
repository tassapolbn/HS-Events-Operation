/**
 * Shrinks photos and screenshots in the browser before they are uploaded.
 *
 * A phone photo is often 3-4 MB, and everyone who opens the board downloads
 * it. Scaled to at most 3000 px on its longest side, it usually comes to a few
 * hundred KB and looks the same on a TV or a phone, floor plans included.
 *
 * The result is JPEG, or PNG when the picture has see-through parts. Never
 * WebP: the attachments bucket only accepts PNG and JPEG pictures, and task
 * emails show the photos, which some email programs (Outlook on Windows)
 * cannot do for WebP. Anything else (PDFs, GIFs, small pictures, formats the
 * browser cannot open) is uploaded exactly as it was, and so is any picture
 * that would not get much smaller.
 */

/** Longest side, in pixels, after shrinking */
export const MAX_SIDE = 3000;
/** Pictures smaller than this are uploaded as they are */
export const MIN_BYTES = 400 * 1024;
/** Keep the shrunk copy only when it is at most this share of the original */
export const KEEP_RATIO = 0.8;
const JPEG_QUALITY = 0.86;

const SHRINKABLE = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/bmp']);

export type ShrunkType = 'image/jpeg' | 'image/png';

/** Whether a file is a picture worth trying to shrink */
export function isShrinkable(type: string, size: number): boolean {
  return SHRINKABLE.has(type.toLowerCase()) && size >= MIN_BYTES;
}

/** The size to draw at: the longest side at most `maxSide`, never larger than the original */
export function fitWithin(width: number, height: number, maxSide = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** The file name with the extension of its new format, e.g. IMG_1234.HEIC -> IMG_1234.jpg */
export function renameForType(name: string, type: ShrunkType): string {
  const base = name.replace(/\.[^./\\]*$/, '') || 'photo';
  return `${base}.${type === 'image/png' ? 'png' : 'jpg'}`;
}

/** Whether any pixel is see-through (RGBA data, as from getImageData) */
export function hasTransparency(rgba: ArrayLike<number>): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 255) return true;
  return false;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This browser cannot open the picture'));
    };
    image.src = url;
  });
}

function encode(canvas: HTMLCanvasElement, type: ShrunkType): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, type === 'image/jpeg' ? JPEG_QUALITY : undefined));
}

/**
 * A smaller copy of a photo or screenshot, or the original file when shrinking
 * is not possible or not worth it. Never fails: on any problem the original
 * is uploaded.
 */
export async function shrinkImage(file: File): Promise<File> {
  if (typeof document === 'undefined' || !isShrinkable(file.type, file.size)) return file;
  try {
    // Browsers draw photos the right way up (EXIF orientation) when drawing an <img>
    const image = await loadImage(file);
    const { width, height } = fitWithin(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return file;
    context.drawImage(image, 0, 0, width, height);

    const opaqueSource = /jpe?g/i.test(file.type);
    const transparent = !opaqueSource && hasTransparency(context.getImageData(0, 0, width, height).data);
    const type: ShrunkType = transparent ? 'image/png' : 'image/jpeg';
    const blob = await encode(canvas, type);
    if (!blob || blob.type !== type || blob.size > file.size * KEEP_RATIO) return file;
    return new File([blob], renameForType(file.name, type), { type, lastModified: file.lastModified });
  } catch {
    return file;
  }
}
