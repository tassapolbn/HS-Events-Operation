/**
 * Tells admins about problems people meet in the app.
 *
 * A refused upload or a save that did not go through used to be seen only by
 * the person in front of the screen, and only reached anyone else if they
 * thought to mention it. Each one is now sent to the database (through
 * log_client_error, which counts repeats and caps the volume) and admins see
 * the list on the Dashboard.
 *
 * Reporting never throws and never reports its own failures, so it cannot
 * make a problem worse. Lost connections are not reported: they say something
 * about the Wi-Fi, not the app, and the report could not be sent anyway.
 *
 * No React or Supabase in here, so the rules can be tested on their own.
 */

export type ProblemKind = 'upload' | 'save' | 'load' | 'crash' | 'script';

export interface ProblemPayload {
  kind: ProblemKind;
  message: string;
  /** Short JSON: error code, HTTP status, file type and size, where it happened */
  detail: string;
  page: string;
  build: string;
  browser: string;
}

export interface ProblemReporterOptions {
  send: (payload: ProblemPayload) => Promise<unknown>;
  context: () => { page: string; build: string; browser: string };
  /** False while the device is offline */
  isOnline?: () => boolean;
  /** The most reports one visit sends; the first few already say what is wrong */
  maxReports?: number;
}

const NOISE: RegExp[] = [
  /failed to fetch/i,
  /networkerror/i,
  /^load failed$/i,
  /network request failed/i,
  /fetch failed/i,
  /aborterror/i,
  /(?:operation|user|request) (?:was )?aborted/i,
  /signal is aborted/i,
  /resizeobserver loop/i,
  /^script error\.?$/i,
  /jwt expired/i
];

/** Problems that say nothing about the app: lost connections, cancelled requests, browser add-ons */
export function isNoise(message: string, stack = ''): boolean {
  if (!message.trim()) return true;
  if (/(?:chrome|moz|safari(?:-web)?)-extension:/i.test(stack)) return true;
  return NOISE.some((pattern) => pattern.test(message.trim()));
}

/** A readable message and the useful details of anything thrown: Supabase, Storage, Error or text */
export function describeProblem(error: unknown): { message: string; detail: Record<string, unknown> } {
  if (typeof error === 'string') return { message: error, detail: {} };
  if (error && typeof error === 'object') {
    const fields = error as Record<string, unknown>;
    const raw = fields.message ?? fields.error_description ?? fields.error ?? '';
    const message = (typeof raw === 'string' ? raw : JSON.stringify(raw)) || (error instanceof Error ? error.name : 'Unknown problem');
    const detail: Record<string, unknown> = {};
    for (const key of ['code', 'status', 'statusCode', 'hint', 'details', 'name']) {
      const value = fields[key];
      if (value === undefined || value === null || value === '') continue;
      if (key === 'name' && (value === 'Error' || value === message)) continue;
      detail[key] = value;
    }
    return { message, detail };
  }
  return { message: error === undefined || error === null ? 'Unknown problem' : String(error), detail: {} };
}

/** The first few lines of a stack, which is all that fits and usually all that helps */
export function firstLines(text: string | undefined | null, count: number): string {
  return (text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, count)
    .join(' | ');
}

/** "Chrome 140 · Windows" from a user agent string */
export function summarizeBrowser(userAgent: string): string {
  const ua = userAgent || '';
  const browser =
    match(ua, /Edg\/(\d+)/, 'Edge') ??
    match(ua, /OPR\/(\d+)/, 'Opera') ??
    match(ua, /SamsungBrowser\/(\d+)/, 'Samsung Internet') ??
    match(ua, /Line\/(\d+)/, 'LINE') ??
    match(ua, /FxiOS\/(\d+)/, 'Firefox') ??
    match(ua, /CriOS\/(\d+)/, 'Chrome') ??
    match(ua, /Firefox\/(\d+)/, 'Firefox') ??
    match(ua, /Chrome\/(\d+)/, 'Chrome') ??
    match(ua, /Version\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari/, 'Safari') ??
    'Other browser';
  const system = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'Mac'
            : /CrOS/.test(ua)
              ? 'ChromeOS'
              : /Linux/.test(ua)
                ? 'Linux'
                : 'Other';
  return `${browser} · ${system}`;
}

function match(ua: string, pattern: RegExp, name: string): string | null {
  const found = ua.match(pattern);
  return found ? `${name} ${found[1]}` : null;
}

function compactJson(value: Record<string, unknown>): string {
  const kept = Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== ''));
  if (Object.keys(kept).length === 0) return '';
  try {
    return JSON.stringify(kept);
  } catch {
    return '';
  }
}

/**
 * Returns report(kind, error, extra): sends one problem, unless it is noise,
 * already sent during this visit, or over the visit's limit. Returns whether
 * it was sent.
 */
export function createProblemReporter(options: ProblemReporterOptions) {
  const seen = new Set<string>();
  const max = options.maxReports ?? 20;
  let sent = 0;

  return function report(kind: ProblemKind, error: unknown, extra: Record<string, unknown> = {}): boolean {
    try {
      if (options.isOnline && !options.isOnline()) return false;
      const { message, detail } = describeProblem(error);
      const stack = error instanceof Error ? error.stack ?? '' : '';
      if (isNoise(message, stack)) return false;
      const key = `${kind}|${message}`;
      if (seen.has(key) || sent >= max) return false;
      seen.add(key);
      sent += 1;
      const where = kind === 'crash' || kind === 'script' ? firstLines(stack, 3) : '';
      const { page, build, browser } = options.context();
      const payload: ProblemPayload = {
        kind,
        message: message.slice(0, 500),
        detail: compactJson({ ...detail, ...extra, where: where || extra.where }).slice(0, 1000),
        page,
        build,
        browser
      };
      void Promise.resolve()
        .then(() => options.send(payload))
        .catch(() => undefined);
      return true;
    } catch {
      return false;
    }
  };
}

/** What is worth knowing about a file that failed: never its contents */
export function fileFacts(file: { name?: string; type?: string; size?: number } | null | undefined): Record<string, unknown> {
  if (!file) return {};
  return {
    file: file.name ?? '',
    type: file.type || 'unknown',
    size: typeof file.size === 'number' ? `${Math.round(file.size / 1024)} KB` : undefined
  };
}
