/**
 * Keeps an open display board current without polling.
 *
 * The database raises a version number for each campus and board whenever
 * something that board shows changes (see the display_signals migration). This
 * controller follows those numbers and reloads a board only when its own
 * number moves:
 *
 * - Realtime delivers each new number within a second or so.
 * - A burst of edits is folded into one reload: it waits for a short quiet
 *   spell, but never holds a change back for long. During a long editing
 *   session a board reloads at most every 20 seconds.
 * - A tiny version check runs every few minutes (every minute while Realtime
 *   is down), so a missed message costs minutes, not hours.
 * - Everything reloads once an hour, and at midnight when yesterday's work
 *   drops off the board.
 * - While the screen is hidden nothing is fetched. The board catches up the
 *   moment it is looked at again.
 *
 * No React or Supabase in here, so the timing rules can be tested on their own.
 */

export type DisplayBoard = 'events' | 'requests';
export type LiveStatus = 'connecting' | 'live' | 'offline';

export interface SignalRow {
  campus: string;
  board: string;
  version: number | string;
}

export interface LiveTimings {
  /** Wait for this much quiet after a change before reloading */
  quietMs: number;
  /** ...but never hold a change back for longer than this */
  maxWaitMs: number;
  /** ...and never reload the same board more often than this */
  minGapMs: number;
  /** Version check while Realtime is connected */
  checkLiveMs: number;
  /** Version check while Realtime is connecting or down */
  checkOfflineMs: number;
  /** Reload everything this often, whatever happens */
  fullRefreshMs: number;
  /** How often the clock is looked at */
  tickMs: number;
}

export const LIVE_TIMINGS: LiveTimings = {
  quietMs: 3_000,
  maxWaitMs: 12_000,
  minGapMs: 20_000,
  checkLiveMs: 5 * 60_000,
  checkOfflineMs: 60_000,
  fullRefreshMs: 60 * 60_000,
  tickMs: 30_000
};

export interface DisplayLiveOptions {
  /** Only follow this campus. Every campus when left out. */
  campus?: string;
  /** Reload one board's data */
  reload: (board: DisplayBoard) => void;
  /** Reload everything the display shows */
  reloadAll: () => void;
  /** Read the current signal rows: a request of a few hundred bytes */
  fetchSignals: () => Promise<SignalRow[]>;
  isHidden: () => boolean;
  onStatus?: (status: LiveStatus) => void;
  /** Local calendar day, such as 2026-09-27. It changes at midnight. */
  today?: () => string;
  timings?: Partial<LiveTimings>;
}

export interface DisplayLive {
  start: () => void;
  dispose: () => void;
  /** A signal row arrived over Realtime */
  signal: (row: Partial<SignalRow> | null | undefined) => void;
  /** Realtime connected, or dropped */
  connection: (state: 'live' | 'offline') => void;
  /** The page became visible again */
  visible: () => void;
  /** The device came back online */
  online: () => void;
  /** Look at the clock once. The controller also does this on its own timer. */
  tick: () => void;
}

/** yyyy-MM-dd in the device's own timezone */
export function localDay(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const BOARDS: readonly string[] = ['events', 'requests'];

export function createDisplayLive(options: DisplayLiveOptions): DisplayLive {
  const timing: LiveTimings = { ...LIVE_TIMINGS, ...options.timings };
  const today = options.today ?? (() => localDay());
  const known = new Map<string, number>();
  const pending = new Map<DisplayBoard, { first: number; timer: ReturnType<typeof setTimeout> }>();
  const lastReload = new Map<DisplayBoard, number>();
  // Changes that arrived while the screen was hidden, replayed when it is shown
  const missed = new Set<DisplayBoard>();
  let missedAll = false;
  let status: LiveStatus = 'connecting';
  let day = today();
  let lastFull = Date.now();
  let lastCheck = 0;
  let checking = false;
  let checkAgain = false;
  let ticker: ReturnType<typeof setInterval> | undefined;
  let disposed = false;

  function setStatus(next: LiveStatus) {
    if (status === next) return;
    status = next;
    options.onStatus?.(next);
  }

  function cancelPending() {
    for (const entry of pending.values()) clearTimeout(entry.timer);
    pending.clear();
  }

  function reloadAll() {
    if (disposed) return;
    if (options.isHidden()) {
      missedAll = true;
      return;
    }
    missedAll = false;
    missed.clear();
    cancelPending();
    lastFull = Date.now();
    lastReload.set('events', lastFull);
    lastReload.set('requests', lastFull);
    options.reloadAll();
  }

  function reload(board: DisplayBoard) {
    if (disposed) return;
    if (options.isHidden()) {
      missed.add(board);
      return;
    }
    lastReload.set(board, Date.now());
    options.reload(board);
  }

  function schedule(board: DisplayBoard) {
    const now = Date.now();
    const current = pending.get(board);
    const first = current ? current.first : now;
    if (current) clearTimeout(current.timer);
    const settled = Math.min(now + timing.quietMs, first + timing.maxWaitMs);
    const earliest = (lastReload.get(board) ?? -Infinity) + timing.minGapMs;
    const wait = Math.max(0, Math.max(settled, earliest) - now);
    const timer = setTimeout(() => {
      pending.delete(board);
      reload(board);
    }, wait);
    pending.set(board, { first, timer });
  }

  function signal(row: Partial<SignalRow> | null | undefined) {
    if (disposed || !row) return;
    if (typeof row.board !== 'string' || !BOARDS.includes(row.board)) return;
    if (typeof row.campus !== 'string') return;
    if (options.campus && row.campus !== options.campus) return;
    const version = Number(row.version);
    if (!Number.isFinite(version)) return;
    const board = row.board as DisplayBoard;
    const key = `${row.campus}:${board}`;
    const before = known.get(key);
    known.set(key, version);
    // The first number seen is only a starting point: the board has just loaded
    if (before !== undefined && before !== version) schedule(board);
  }

  async function check() {
    if (disposed) return;
    if (checking) {
      checkAgain = true;
      return;
    }
    checking = true;
    lastCheck = Date.now();
    try {
      const rows = await options.fetchSignals();
      for (const row of rows) signal(row);
    } catch {
      // Signals out of reach: reload the whole board now and then instead
      if (Date.now() - lastFull >= timing.checkLiveMs) reloadAll();
    } finally {
      checking = false;
      if (checkAgain && !disposed) {
        checkAgain = false;
        void check();
      }
    }
  }

  function tick() {
    if (disposed) return;
    const currentDay = today();
    if (currentDay !== day) {
      // Midnight: yesterday's work leaves the board
      day = currentDay;
      reloadAll();
      return;
    }
    if (options.isHidden()) return;
    const now = Date.now();
    if (now - lastFull >= timing.fullRefreshMs) {
      reloadAll();
      return;
    }
    const every = status === 'live' ? timing.checkLiveMs : timing.checkOfflineMs;
    if (now - lastCheck >= every) void check();
  }

  function visible() {
    if (disposed || options.isHidden()) return;
    if (missedAll || Date.now() - lastFull >= timing.fullRefreshMs) {
      reloadAll();
      return;
    }
    for (const board of missed) reload(board);
    missed.clear();
    // Realtime may have slept with the screen, so ask for the numbers directly
    void check();
  }

  function connection(state: 'live' | 'offline') {
    if (disposed) return;
    setStatus(state);
    // Anything that changed while connecting or reconnecting is picked up here
    if (state === 'live') void check();
  }

  function start() {
    if (disposed || ticker !== undefined) return;
    void check();
    ticker = setInterval(tick, timing.tickMs);
  }

  function dispose() {
    disposed = true;
    if (ticker !== undefined) clearInterval(ticker);
    ticker = undefined;
    cancelPending();
  }

  return {
    start,
    dispose,
    signal,
    connection,
    visible,
    online: () => void check(),
    tick
  };
}
