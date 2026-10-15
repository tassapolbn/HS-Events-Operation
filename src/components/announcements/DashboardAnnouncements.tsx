import { useState } from 'react';
import { MonitorPlay } from 'lucide-react';
import { useAnnouncements } from '../../hooks/useAnnouncements';
import { useLanguage } from '../../i18n';
import { AnnouncementBanner } from './AnnouncementBanner';
import { bangkokToday, dashboardAnnouncements, dismissKey } from '../../lib/announcements';
import { formatDate } from '../../lib/utils';
import type { Campus } from '../../types';

const DISMISSED_KEY = 'eventops.dismissed-announcements';

function readDismissed(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeDismissed(keys: string[]) {
  try {
    // Only the most recent ones matter; older notices have ended anyway
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(keys.slice(-50)));
  } catch {
    // Storage can be blocked; the notice then simply comes back next visit
  }
}

/**
 * Today's announcements at the top of the Dashboard, for the campus chosen in
 * the header. Anyone can hide one on their own device; it comes back if it is
 * edited.
 */
export function DashboardAnnouncements({ campus }: { campus?: Campus }) {
  const { t, lang } = useLanguage();
  const { data } = useAnnouncements();
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);

  const showing = dashboardAnnouncements(data ?? [], bangkokToday(), campus).filter(
    (item) => !dismissed.includes(dismissKey(item))
  );
  if (showing.length === 0) return null;

  return (
    <section className="space-y-2" aria-label={t('announcements.title')}>
      {showing.map((item) => (
        <AnnouncementBanner
          key={item.id}
          message={item.message}
          tone={item.tone}
          dismissLabel={t('announcements.dismiss')}
          onDismiss={() => {
            const next = [...dismissed, dismissKey(item)];
            setDismissed(next);
            writeDismissed(next);
          }}
          meta={
            <>
              {item.ends_on && <span>{t('announcements.until')} {formatDate(item.ends_on, lang, 'd MMM yyyy')}</span>}
              {item.campus && <span>{item.campus}</span>}
              {item.show_on_board && (
                <span className="inline-flex items-center gap-1"><MonitorPlay className="h-3 w-3" /> {t('announcements.onBoard')}</span>
              )}
            </>
          }
        />
      ))}
    </section>
  );
}
