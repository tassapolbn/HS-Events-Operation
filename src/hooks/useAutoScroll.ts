import { useEffect, useState } from 'react';
import { nextAutoScroll } from '../lib/presentation';

export interface AutoScrollCycle {
  cycleStart: number;
  intervalMs: number;
  paused: boolean;
}

export function useAutoScroll(active: boolean, intervalMs = 15000, pauseMs = 60000): AutoScrollCycle {
  const [cycle, setCycle] = useState(() => ({ cycleStart: Date.now(), paused: false }));
  useEffect(() => {
    if (!active) return;
    let waitingAtBottom = false;
    let timer: number | undefined;
    let fadeTimer: number | undefined;
    let restoreMain: (() => void) | undefined;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const cancelFade = () => {
      window.clearTimeout(fadeTimer);
      restoreMain?.();
      restoreMain = undefined;
    };
    const beginWait = () => {
      setCycle({ cycleStart: Date.now(), paused: false });
      timer = window.setTimeout(step, intervalMs);
    };
    const pause = () => {
      window.clearTimeout(timer);
      cancelFade();
      setCycle(current => ({ ...current, paused: true }));
      waitingAtBottom = false;
      timer = window.setTimeout(beginWait, pauseMs);
    };
    const step = () => {
      const next = nextAutoScroll(window.scrollY, window.innerHeight, document.documentElement.scrollHeight);
      // Leave a full extra interval to read the last screen before wrapping.
      if (next.wrap && !waitingAtBottom) {
        waitingAtBottom = true;
        beginWait();
        return;
      }
      waitingAtBottom = false;
      const main = document.querySelector<HTMLElement>('[data-board-main]');
      if (motion.matches || !main || next.top === window.scrollY) {
        window.scrollTo({ top: next.top, behavior: 'instant' });
        beginWait();
        return;
      }
      const { opacity, transition } = main.style;
      restoreMain = () => {
        main.style.transition = 'none';
        main.style.opacity = opacity;
        // Apply the restored opacity before restoring any existing transition.
        void main.offsetWidth;
        main.style.transition = transition;
      };
      main.style.transition = 'opacity 200ms ease-out';
      main.style.opacity = '0';
      fadeTimer = window.setTimeout(() => {
        window.scrollTo({ top: next.top, behavior: 'instant' });
        main.style.transition = 'opacity 300ms ease-in';
        main.style.opacity = '1';
        fadeTimer = window.setTimeout(() => {
          cancelFade();
          beginWait();
        }, 300);
      }, 200);
    };
    const onMotionChange = () => {
      if (restoreMain) {
        cancelFade();
        beginWait();
      }
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((event) => window.addEventListener(event, pause, { passive: true, capture: true }));
    motion.addEventListener('change', onMotionChange);
    beginWait();
    return () => {
      window.clearTimeout(timer);
      cancelFade();
      motion.removeEventListener('change', onMotionChange);
      events.forEach((event) => window.removeEventListener(event, pause, true));
    };
  }, [active, intervalMs, pauseMs]);
  return { ...cycle, intervalMs };
}
