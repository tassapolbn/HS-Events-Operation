/**
 * Photo and floor plan links that stay the same for days instead of minutes.
 *
 * The attachments bucket is private, so every picture needs a signed link. A
 * new link is a new address, and a browser treats a new address as a new
 * picture: renewing links every 45 minutes made every open board download
 * every photo again, around 30 times a day each. Reusing one link for most of
 * a week lets the browser keep the picture it already has, and keeping the
 * links in local storage carries that over a page reload.
 *
 * No React or Supabase in here, so it can be tested on its own.
 */

export interface SignedUrlEntry {
  url: string;
  /** When the link stops working, in milliseconds */
  expiresAt: number;
}

export interface SignedUrlCacheOptions {
  /** Ask the server for a link valid this many seconds */
  sign: (storagePath: string, expiresInSeconds: number) => Promise<string>;
  /** Where links survive a page reload. Leave out, or pass null, to keep them in memory only. */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  now?: () => number;
  /** How long a new link lasts. Default: 7 days. */
  ttlSeconds?: number;
  /** Sign a new link once less than this is left. Default: 1 day. */
  renewBeforeMs?: number;
  storageKey?: string;
  /** Most links kept in storage */
  maxEntries?: number;
}

export interface SignedUrlCache {
  /** A working link, reusing the one already handed out when it has time left */
  get: (storagePath: string) => Promise<string>;
  /** Drop a link that stopped working, so the next get signs a new one */
  forget: (storagePath: string) => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function createSignedUrlCache(options: SignedUrlCacheOptions): SignedUrlCache {
  const now = options.now ?? (() => Date.now());
  const ttlSeconds = options.ttlSeconds ?? 7 * 24 * 60 * 60;
  const renewBeforeMs = options.renewBeforeMs ?? DAY_MS;
  const storageKey = options.storageKey ?? 'eventops.signedUrls.v1';
  const maxEntries = options.maxEntries ?? 300;
  const inflight = new Map<string, Promise<string>>();
  let entries: Record<string, SignedUrlEntry> | null = null;

  function load(): Record<string, SignedUrlEntry> {
    if (entries) return entries;
    const loaded: Record<string, SignedUrlEntry> = {};
    try {
      const raw = options.storage?.getItem(storageKey);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object') {
        for (const [path, value] of Object.entries(parsed as Record<string, Partial<SignedUrlEntry>>)) {
          if (value && typeof value.url === 'string' && typeof value.expiresAt === 'number') {
            loaded[path] = { url: value.url, expiresAt: value.expiresAt };
          }
        }
      }
    } catch {
      // Storage blocked or unreadable: start empty and keep links in memory
    }
    entries = loaded;
    return loaded;
  }

  function persist() {
    const current = load();
    const time = now();
    const keep = Object.entries(current)
      .filter(([, entry]) => entry.expiresAt > time)
      .sort((a, b) => b[1].expiresAt - a[1].expiresAt)
      .slice(0, maxEntries);
    entries = Object.fromEntries(keep);
    if (!options.storage) return;
    try {
      options.storage.setItem(storageKey, JSON.stringify(entries));
    } catch {
      // Storage full or blocked: the links still work for this visit
    }
  }

  function get(storagePath: string): Promise<string> {
    const hit = load()[storagePath];
    if (hit && hit.expiresAt - now() > renewBeforeMs) return Promise.resolve(hit.url);
    const running = inflight.get(storagePath);
    if (running) return running;
    // Counted from before the request, so the link never outlives our record of it
    const requestedAt = now();
    const job = options
      .sign(storagePath, ttlSeconds)
      .then((url) => {
        load()[storagePath] = { url, expiresAt: requestedAt + ttlSeconds * 1000 };
        persist();
        return url;
      })
      .finally(() => {
        inflight.delete(storagePath);
      });
    inflight.set(storagePath, job);
    return job;
  }

  function forget(storagePath: string) {
    const current = load();
    if (!(storagePath in current)) return;
    delete current[storagePath];
    persist();
  }

  return { get, forget };
}
