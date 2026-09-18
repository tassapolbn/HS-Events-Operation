import { Plus, Trash2, UserRound } from 'lucide-react';
import { useLanguage } from '../../i18n';
import { Input } from '../ui/Input';
import type { EventContact } from '../../types';

const MAX_CONTACTS = 8;

const blank = (): EventContact => ({ name: '', role: '', phone: '', email: '' });

/**
 * The people to ask about an event.
 *
 * None is a perfectly good answer, so there is no empty row waiting to be
 * filled and nothing is required until a row exists. Once a row exists only the
 * name matters; the rest is whatever happens to be useful for that person.
 */
export function EventContactsField({
  value,
  onChange
}: {
  value: EventContact[];
  onChange: (next: EventContact[]) => void;
}) {
  const { t } = useLanguage();
  const contacts = value ?? [];

  const update = (index: number, patch: Partial<EventContact>) =>
    onChange(contacts.map((item, position) => (position === index ? { ...item, ...patch } : item)));

  return (
    <div className="space-y-3">
      {contacts.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 px-3.5 py-4 text-center text-sm text-slate-400 dark:border-slate-700">
          {t('events.contactsEmpty')}
        </p>
      )}

      {contacts.map((contact, index) => (
        <div
          key={index}
          className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2 dark:border-slate-700 dark:bg-slate-800/40"
        >
          <div className="flex items-center gap-2 sm:col-span-2">
            <UserRound className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t('events.contactNumber')} {index + 1}
            </span>
            <button
              type="button"
              onClick={() => onChange(contacts.filter((_, position) => position !== index))}
              className="ml-auto rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-950/50"
              title={t('events.contactRemove')}
              aria-label={`${t('events.contactRemove')} ${index + 1}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <Input
            label={t('events.contactName')}
            required
            value={contact.name}
            onChange={(event) => update(index, { name: event.target.value })}
          />
          <Input
            label={t('events.contactRole')}
            placeholder={t('events.contactRolePlaceholder')}
            value={contact.role ?? ''}
            onChange={(event) => update(index, { role: event.target.value })}
          />
          <Input
            label={t('events.contactPhone')}
            type="tel"
            inputMode="tel"
            value={contact.phone ?? ''}
            onChange={(event) => update(index, { phone: event.target.value })}
          />
          <Input
            label={t('events.contactEmail')}
            type="email"
            value={contact.email ?? ''}
            onChange={(event) => update(index, { email: event.target.value })}
          />
        </div>
      ))}

      {contacts.length < MAX_CONTACTS && (
        <button
          type="button"
          onClick={() => onChange([...contacts, blank()])}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-600 transition-colors hover:border-navy-400 hover:text-navy-700 dark:border-slate-700 dark:text-slate-300 dark:hover:text-gold-300"
        >
          <Plus className="h-4 w-4" /> {contacts.length === 0 ? t('events.contactAddFirst') : t('events.contactAdd')}
        </button>
      )}
    </div>
  );
}

/** Drops the rows nobody filled in, and trims what is left. */
export function cleanContacts(contacts: EventContact[]): EventContact[] {
  return contacts
    .map((item) => ({
      name: (item.name ?? '').trim(),
      role: (item.role ?? '').trim(),
      phone: (item.phone ?? '').trim(),
      email: (item.email ?? '').trim()
    }))
    .filter((item) => item.name !== '');
}
