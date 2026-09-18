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
    <div className={cn('flex flex-wrap items-center gap-2', className)} data-event-contacts={people.length}>
      <span className={cn('text-[0.7rem] font-extrabold uppercase tracking-wider', quiet)}>
        {t('events.contactsOnBoard')}
      </span>
      {people.map((person, index) => (
        <span
          key={`${person.name}-${index}`}
          className={cn('inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-xl px-2.5 py-1 text-sm font-bold', chip)}
        >
          <UserRound className={cn('h-3.5 w-3.5 shrink-0', quiet)} />
          <span className="break-words">{person.name}</span>
          {person.role && <span className={cn('text-xs font-semibold', quiet)}>{person.role}</span>}
          {person.phone && (
            <a href={`tel:${person.phone.replace(/\s+/g, '')}`} className={cn('inline-flex items-center gap-1 text-xs font-semibold tabular-nums', link)}>
              <Phone className="h-3 w-3" /> {person.phone}
            </a>
          )}
          {person.email && (
            <a href={`mailto:${person.email}`} className={cn('inline-flex items-center gap-1 text-xs font-semibold', link)}>
              <Mail className="h-3 w-3" /> {person.email}
            </a>
          )}
        </span>
      ))}
    </div>
  );
}
