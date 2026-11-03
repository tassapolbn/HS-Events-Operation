import { useEffect } from 'react';
import { nextAutoScroll } from '../lib/presentation';

export function useAutoScroll(active: boolean, intervalMs = 15000, pauseMs = 60000) {
  useEffect(() => {
    if (!active) return;
    let pausedUntil = 0;
    let waitingAtBottom = false;
    const pause = () => {
      pausedUntil = Date.now() + pauseMs;
      waitingAtBottom = false;
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((event) => window.addEventListener(event, pause, { passive: true, capture: true }));
    const timer = window.setInterval(() => {
      if (Date.now() < pausedUntil) return;
      const next = nextAutoScroll(window.scrollY, window.innerHeight, document.documentElement.scrollHeight);
      // Leave a full extra interval to read the last screen before wrapping.
      if (next.wrap && !waitingAtBottom) {
        waitingAtBottom = true;
        return;
      }
      waitingAtBottom = false;
      window.scrollTo({
        top: next.top,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
      });
    }, intervalMs);
    return () => {
      window.clearInterval(timer);
      events.forEach((event) => window.removeEventListener(event, pause, true));
    };
  }, [active, intervalMs, pauseMs]);
}
