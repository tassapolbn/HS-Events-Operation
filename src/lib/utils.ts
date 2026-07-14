import { clsx, type ClassValue } from 'clsx';
import { format, parseISO } from 'date-fns';
import { enGB } from 'date-fns/locale/en-GB';
import { th } from 'date-fns/locale/th';
import DOMPurify from 'dompurify';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

const locales = { en: enGB, th };

export type Lang = 'en' | 'th';

export function formatDate(value: string | Date | null | undefined, lang: Lang, pattern = 'EEE d MMM yyyy'): string {
  if (!value) return '-';
  const date = typeof value === 'string' ? parseISO(value) : value;
  return format(date, pattern, { locale: locales[lang] });
}

export function formatTime(value: string | Date | null | undefined, lang: Lang): string {
  if (!value) return '-';
  const date = typeof value === 'string' ? parseISO(value) : value;
  return format(date, 'HH:mm', { locale: locales[lang] });
}

export function formatDateTime(value: string | Date | null | undefined, lang: Lang): string {
  if (!value) return '-';
  const date = typeof value === 'string' ? parseISO(value) : value;
  return format(date, 'd MMM yyyy HH:mm', { locale: locales[lang] });
}

/** ISO string -> value usable in <input type="datetime-local"> */
export function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return '';
  const date = parseISO(value);
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

/** datetime-local input value -> ISO string (or null) */
export function fromDateTimeLocal(value: string): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

/** Combine a date (yyyy-MM-dd) and time (HH:mm) into an ISO string */
export function combineDateTime(date: string, time: string | null): string | null {
  if (!date || !time) return null;
  return new Date(`${date}T${time}:00`).toISOString();
}

/** Extract HH:mm from an ISO string */
export function extractTime(value: string | null): string | null {
  if (!value) return null;
  return format(parseISO(value), 'HH:mm');
}

/** Extract the local yyyy-MM-dd date from an ISO string */
export function extractDate(value: string | null): string | null {
  if (!value) return null;
  return format(parseISO(value), 'yyyy-MM-dd');
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'span', 'div'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'class']
  });
}

export function isRichTextEmpty(html: string): boolean {
  if (!html) return true;
  const stripped = html.replace(/<[^>]*>/g, '').trim();
  return stripped.length === 0;
}

export type FileKind = 'image' | 'pdf' | 'office' | 'other';

export function getFileKind(mimeType: string): FileKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
    return 'office';
  return 'other';
}

export const ACCEPTED_FILE_TYPES =
  '.pdf,.png,.jpg,.jpeg,.docx,.xlsx,application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

export function randomId(): string {
  return crypto.randomUUID();
}

/** Darken a hex color by a factor (0..1). Used for gradient headers. */
export function darkenColor(hex: string, factor = 0.72): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const parts = [0, 2, 4].map((i) => {
    const channel = Math.round(parseInt(clean.slice(i, i + 2), 16) * factor);
    return Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0');
  });
  return `#${parts.join('')}`;
}

/** Pick dark-navy or white text for good contrast on a solid hex background. */
export function readableTextColor(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return '#ffffff';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#0e1f31' : '#ffffff';
}
