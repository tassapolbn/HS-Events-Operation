import type { TKey } from '../../i18n';
import type { PrepWords } from '../../lib/calendarDays';

/** The words a setup or pack-up day falls back on when its session has no name */
export function prepWords(t: (key: TKey) => string): PrepWords {
  return {
    setupBegins: t('events.setupStart'),
    before: t('calendar.prepDay'),
    after: t('calendar.afterDay'),
    session: t('calendar.session')
  };
}
