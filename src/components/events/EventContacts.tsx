import { Mail, Phone, UserRound } from 'lucide-react';
import { useLanguage } from '../../i18n';
import { cn } from '../../lib/utils';
import type { EventContact } from '../../types';

/**
 * Who to ask about this event, shown where the event is identified.
 *
 * A phone number on a board is only useful if it can be dialled from the phone
 * in someone's hand, so the number and the address are links rather than text.
 * On the dark event bar the chips carry their own light background, because a
 * name has to stay readable whatever colour the event was given.
 */
export function EventContacts({
  contacts,
  tone = 'plain',
  className
}: {
  contacts: EventContact[] | undefined;
  /** 'onDark' sits on a coloured event bar, 'plain' on a white card */
  tone?: 'onDark' | 'plain';
  className?: string;
}) {
  const { t } = useLanguage();
  const people = (contacts ?? []).filter((item) => item.name?.trim());
  if (people.length === 0) return null;

  const chip =
    tone === 'onDark'
      ? 'bg-white/15 text-white ring-1 ring-inset ring-white/25'
      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
  const quiet = tone === 'onDark' ? 'text-white/70' : 'text-slate-500 dark:text-slate-400';
  const link =
    tone === 'onDark'
      ? 'underline decoration-white/40 underline-offset-2 hover:decoration-white'
      : 'underline decoration-slate-400 underline-offset-2 hover:text-navy-700 dark:hover:text-gold-300';

  return (
    <div className={cn('flex min-w-0 max-w-full flex-wrap items-center gap-2', className)} data-event-contacts={people.length}>
      <span className={cn('text-[0.7rem] font-extrabold uppercase tracking-wider', quiet)}>
        {t('events.contactsOnBoard')}
      </span>
      {people.map((person, index) => (
        <span
          key={`${person.name}-${index}`}
          className={cn('inline-flex w-full min-w-0 max-w-full flex-col items-start gap-x-2 gap-y-0.5 rounded-xl px-2.5 py-1 text-sm font-bold md:w-auto md:flex-row md:flex-wrap md:items-center', chip)}
        >
          <span className="flex min-w-0 max-w-full items-center gap-2 [overflow-wrap:anywhere]">
            <UserRound className={cn('h-3.5 w-3.5 shrink-0', quiet)} />
            <span className="min-w-0 [overflow-wrap:anywhere]">{person.name}</span>
            {person.role && <span className={cn('min-w-0 text-xs font-semibold', quiet)}>{person.role}</span>}
          </span>
          {person.phone && (
            <a href={`tel:${person.phone.replace(/\s+/g, '')}`} className={cn('inline-flex min-h-9 min-w-0 max-w-full items-center gap-1 rounded px-1 py-1 text-xs font-semibold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current md:min-h-0 md:p-0', link)}>
              <Phone className="h-3 w-3 shrink-0" /> <span className="min-w-0 break-all">{person.phone}</span>
            </a>
          )}
          {person.email && (
            <a href={`mailto:${person.email}`} className={cn('inline-flex min-h-9 min-w-0 max-w-full items-center gap-1 rounded px-1 py-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current md:min-h-0 md:p-0', link)}>
              <Mail className="h-3 w-3 shrink-0" /> <span className="min-w-0 [overflow-wrap:anywhere]">{person.email}</span>
            </a>
          )}
        </span>
      ))}
    </div>
  );
}
