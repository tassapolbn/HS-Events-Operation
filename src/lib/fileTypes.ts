/**
 * Which files can be attached, and which pictures are turned into JPEG or PNG
 * on the way in.
 *
 * The attachments bucket stores PDF, Word, Excel, PowerPoint, JPEG and PNG.
 * Pictures in other formats (an iPhone's HEIC, a WebP or AVIF saved from a web
 * page, a GIF or BMP) are converted in the browser before upload, so nobody
 * has to convert them by hand first. No DOM here, so the rules can be tested.
 */

export const PDF = 'application/pdf';
export const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
export const PPT = 'application/vnd.ms-powerpoint';

/** What the attachments bucket accepts */
export const STORED_TYPES = new Set([PDF, 'image/png', 'image/jpeg', DOCX, XLSX, PPTX, PPT]);

/** Pictures converted to JPEG or PNG before upload */
export const CONVERTED_PICTURES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/x-ms-bmp',
  'image/gif'
]);

const BY_EXTENSION: Record<string, string> = {
  pdf: PDF,
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  docx: DOCX,
  xlsx: XLSX,
  pptx: PPTX,
  ppt: PPT,
  heic: 'image/heic',
  heif: 'image/heif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  gif: 'image/gif'
};

/**
 * The type of a file. Browsers leave it blank for some formats (HEIC on
 * Windows, for one), so the extension decides then.
 */
export function fileType(file: { name: string; type?: string }): string {
  const given = (file.type ?? '').toLowerCase();
  if (given && given !== 'application/octet-stream') return given === 'image/jpg' ? 'image/jpeg' : given;
  const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  return BY_EXTENSION[extension] ?? given;
}

export function isHeic(type: string): boolean {
  return /^image\/hei[cf](?:-sequence)?$/.test(type);
}

/** Converted to JPEG or PNG before upload */
export function needsConversion(type: string): boolean {
  return CONVERTED_PICTURES.has(type);
}

/** Can be attached, as it is or after conversion */
export function canAttach(type: string): boolean {
  return STORED_TYPES.has(type) || needsConversion(type);
}

/** Can go with a request as a reference: a picture of any kind, or a PDF */
export function canAttachToRequestPhotos(type: string): boolean {
  return type === PDF || type === 'image/png' || type === 'image/jpeg' || needsConversion(type);
}

/**
 * iPhones and iPads turn a HEIC photo into a JPEG themselves when a page only
 * asks for JPEG, so the file picker leaves HEIC out there. Everywhere else it
 * is offered and converted here.
 */
export function isAppleMobile(userAgent: string, maxTouchPoints = 0): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

const PICTURE_ACCEPT = ['.png', '.jpg', '.jpeg', 'image/png', 'image/jpeg'];
const CONVERTED_ACCEPT = ['.webp', '.avif', '.gif', '.bmp', 'image/webp', 'image/avif', 'image/gif', 'image/bmp'];
const HEIC_ACCEPT = ['.heic', '.heif', 'image/heic', 'image/heif'];
const DOCUMENT_ACCEPT = ['.pdf', '.docx', '.xlsx', '.pptx', '.ppt', PDF, DOCX, XLSX, PPTX, PPT];

/** The file picker's accept list: everything that can be attached */
export function attachmentAccept(appleMobile: boolean): string {
  return [...DOCUMENT_ACCEPT, ...PICTURE_ACCEPT, ...CONVERTED_ACCEPT, ...(appleMobile ? [] : HEIC_ACCEPT)].join(',');
}

/** The accept list for pictures with an optional PDF (request photos, floor plans) */
export function pictureAccept(appleMobile: boolean, withPdf: boolean): string {
  return [...(withPdf ? ['.pdf', PDF] : []), ...PICTURE_ACCEPT, ...CONVERTED_ACCEPT, ...(appleMobile ? [] : HEIC_ACCEPT)].join(',');
}
