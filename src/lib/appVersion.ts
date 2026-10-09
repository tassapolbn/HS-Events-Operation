/**
 * Lets a display board that stays open for weeks pick up new releases.
 *
 * Every build writes version.json with its own build id, and the running page
 * knows the id it was built with. When the two differ, a newer release is live
 * and the board reloads itself, once nobody is using it. Without this a board
 * page keeps running whatever code it was opened with.
 *
 * No React here, so the rules can be tested on their own.
 */

export interface ReloadAttempt {
  build: string;
  at: number;
}

/** Leave a page alone for this long after someone touched it */
export const IDLE_MS = 2 * 60_000;
/** Do not reload for the same release again within this time */
export const RETRY_MS = 30 * 60_000;

/** The build id of the release that is live now, or null when it cannot be read */
export async function fetchLiveBuild(fetcher: typeof fetch = fetch): Promise<string | null> {
  try {
    const response = await fetcher(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const build = (body as { build?: unknown } | null)?.build;
    return typeof build === 'string' && build ? build : null;
  } catch {
    // Offline, or an older release without version.json (the site answers with the app page)
    return null;
  }
}

/**
 * Whether the page should reload now: another release is live, nobody has used
 * the page for a while, and it has not just reloaded for that same release (a
 * cached old page must not reload over and over).
 */
export function shouldReload({
  running,
  live,
  lastAttempt,
  lastInteraction,
  now,
  busy = false
}: {
  running: string;
  live: string | null;
  lastAttempt: ReloadAttempt | null;
  lastInteraction: number;
  now: number;
  busy?: boolean;
}): boolean {
  if (!live || live === running || busy) return false;
  if (now - lastInteraction < IDLE_MS) return false;
  if (lastAttempt && lastAttempt.build === live && now - lastAttempt.at < RETRY_MS) return false;
  return true;
}

/** Reads a saved reload attempt, ignoring anything malformed */
export function parseAttempt(raw: string | null): ReloadAttempt | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ReloadAttempt>;
    return typeof value.build === 'string' && typeof value.at === 'number' ? { build: value.build, at: value.at } : null;
  } catch {
    return null;
  }
}
