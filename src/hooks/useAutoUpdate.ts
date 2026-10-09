import { useEffect, useRef } from 'react';
import { fetchLiveBuild, parseAttempt, shouldReload } from '../lib/appVersion';

/** How often an open board looks for a new release (a tiny file from Netlify, not Supabase) */
const CHECK_MS = 10 * 60_000;
const ATTEMPT_KEY = 'hs-auto-update';

function readAttempt() {
  try {
    return parseAttempt(window.sessionStorage.getItem(ATTEMPT_KEY));
  } catch {
    return null;
  }
}

function saveAttempt(build: string) {
  try {
    window.sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify({ build, at: Date.now() }));
  } catch {
    // Storage blocked: the reload still happens, it just cannot be rate limited
  }
}

/**
 * Reloads the page when a newer release of the app is live, so a board left
 * open on a screen never runs old code for long. Waits while `busy` (an editor
 * is open) and for two minutes after anyone touches the page.
 */
export function useAutoUpdate(busy: boolean) {
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    if (import.meta.env.DEV) return;
    let cancelled = false;
    let lastInteraction = 0;
    const touched = () => {
      lastInteraction = Date.now();
    };

    const check = async () => {
      if (document.visibilityState === 'hidden') return;
      const live = await fetchLiveBuild();
      if (cancelled || !live) return;
      const reload = shouldReload({
        running: __BUILD_ID__,
        live,
        lastAttempt: readAttempt(),
        lastInteraction,
        now: Date.now(),
        busy: busyRef.current
      });
      if (!reload) return;
      saveAttempt(live);
      window.location.reload();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void check();
    };
    const timer = window.setInterval(() => void check(), CHECK_MS);
    const inputs = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    for (const name of inputs) window.addEventListener(name, touched, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      for (const name of inputs) window.removeEventListener(name, touched);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
}
