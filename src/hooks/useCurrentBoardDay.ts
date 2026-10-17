import { useEffect, useState } from 'react';

/**
 * The day being read on the board's date ordered view: the last day whose
 * section has scrolled up to a line a little below the board's pinned search
 * bar. It changes as the page scrolls, so the board can show that a new day
 * has started. Null above the first day.
 *
 * `watch` is anything that changes what the board shows (a filter, the data),
 * so the day is worked out again then too.
 */
export function useCurrentBoardDay(enabled: boolean, watch: string): string | null {
  const [day, setDay] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setDay(null);
      return;
    }
    let frame = 0;
    const measure = () => {
      frame = 0;
      const bar = document.querySelector('[data-board-sticky]');
      const top = bar ? bar.getBoundingClientRect().bottom : 0;
      // A little below the bar, so the new day shows while its banner is on screen
      const line = top + Math.min(120, window.innerHeight * 0.2);
      let current: string | null = null;
      for (const section of document.querySelectorAll<HTMLElement>('[data-board-day]')) {
        if (section.getBoundingClientRect().top > line) break;
        current = section.dataset.boardDay ?? null;
      }
      setDay(current);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [enabled, watch]);

  return day;
}
