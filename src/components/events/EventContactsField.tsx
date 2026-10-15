import { useState } from 'react';
import { BookUser, Check, ExternalLink, Plus, Search, Trash2, UserRound } from 'lucide-react';
import { useLanguage } from '../../i18n';
import { useAuth } from '../../contexts/AuthContext';
import { useSavedContactMutations, useSavedContacts } from '../../hooks/useSavedContacts';
import { Input } from '../ui/Input';
import { useToast } from '../ui/Toast';
import { findDuplicate, isPicked, matchesContact, MAX_EVENT_CONTACTS, togglePicked } from '../../lib/savedContacts';
import { cn, fillTemplate } from '../../lib/utils';
import type { EventContact } from '../../types';

const blank = (): EventContact => ({ name: '', role: '', phone: '', email: '' });

/**
 * The people to ask about an event.
 *
 * None is a perfectly good answer, so there is no empty row waiting to be
 * filled and nothing is required until a row exists. Once a row exists only the
 * name matters; the rest is whatever happens to be useful for that person.
 *
 * People asked often are kept in the saved contacts list and simply ticked,
 * instead of being typed again for every event. A typed row can be saved to
 * that list for next time.
 */
export function EventContactsField({
  value,
  onChange
}: {
  value: EventContact[];
  onChange: (next: EventContact[]) => void;
}) {
  const { t } = useLanguage();
  const { profile } = useAuth();
  const { toast } = useToast();
  const contacts = value ?? [];
  const saved = useSavedContacts();
  const { create } = useSavedContactMutations();
  const [query, setQuery] = useState('');
  const [savingIndex, setSavingIndex] = useState<number | null>(null);

  const full = contacts.length >= MAX_EVENT_CONTACTS;
  const savedList = saved.data ?? [];
  const shown = savedList.filter((item) => matchesContact(item, query));

  const update = (index: number, patch: Partial<EventContact>) =>
    onChange(contacts.map((item, position) => (position === index ? { ...item, ...patch } : item)));

  /** Keeps a typed row in the saved list, or links it to the one already there */
  const saveForNextTime = async (index: number) => {
    const row = contacts[index];
    if (!row?.name.trim() || !profile) return;
    const existing = findDuplicate(savedList, { name: row.name, phone: row.phone ?? '' });
    if (existing) {
      update(index, { contact_id: existing.id });
      toast(t('contacts.alreadySaved'), 'info');
      return;
    }
    setSavingIndex(index);
    try {
      const created = await create.mutateAsync({
        input: { name: row.name, role: row.role ?? '', phone: row.phone ?? '', email: row.email ?? '' },
        userId: profile.id
      });
      update(index, { contact_id: created.id });
      toast(t('contacts.savedForNextTime'));
    } catch {
      toast(t('common.errorGeneric'), 'error');
    } finally {
      setSavingIndex(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Saved contacts, ticked straight onto the event. Hidden until the database has the list. */}
      {saved.isSuccess && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700" data-saved-contacts-picker>
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
            <BookUser className="h-4 w-4 text-slate-400" />
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t('contacts.pickTitle')}</span>
            <a
              href="/contacts"
              target="_blank"
              rel="noopener"
              className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-navy-600 hover:underline dark:text-gold-400"
            >
              {t('contacts.manage')} <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          {savedList.length === 0 ? (
            <p className="px-3 py-3 text-xs text-slate-400">{t('contacts.pickEmpty')}</p>
          ) : (
            <>
              <div className="relative px-3 pt-2">
                <Search className="pointer-events-none absolute left-5 top-[calc(50%+0.25rem)] h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('contacts.searchPlaceholder')}
                  aria-label={t('contacts.searchPlaceholder')}
                  className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2 text-sm focus:border-navy-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <ul className="max-h-56 overflow-y-auto p-1.5">
                {shown.length === 0 && <li className="px-2 py-2 text-xs text-slate-400">{t('common.noResults')}</li>}
                {shown.map((item) => {
                  const picked = isPicked(contacts, item);
                  const blocked = !picked && full;
                  return (
                    <li key={item.id}>
                      <label
                        className={cn(
                          'flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors',
                          picked ? 'bg-navy-50 dark:bg-navy-900/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60',
                          blocked && 'cursor-not-allowed opacity-50'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={picked}
                          disabled={blocked}
                          onChange={() => onChange(togglePicked(contacts, item))}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded"
                          aria-label={item.name}
                        />
                        <span className="min-w-0">
                          <span className="block font-semibold text-slate-800 dark:text-slate-100">{item.name}</span>
                          <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                            {[item.role, item.phone, item.email].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              {full && (
                <p className="border-t border-slate-100 px-3 py-1.5 text-xs text-amber-700 dark:border-slate-800 dark:text-amber-300">
                  {fillTemplate(t('contacts.full'), { n: MAX_EVENT_CONTACTS })}
                </p>
              )}
            </>
          )}
        </div>
      )}

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
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <UserRound className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t('events.contactNumber')} {index + 1}
            </span>
            {contact.contact_id ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                <Check className="h-3 w-3" /> {t('contacts.fromSaved')}
              </span>
            ) : (
              saved.isSuccess &&
              contact.name.trim() !== '' && (
                <button
                  type="button"
                  onClick={() => void saveForNextTime(index)}
                  disabled={savingIndex !== null}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 transition-colors hover:border-navy-400 hover:text-navy-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:text-gold-300"
                >
                  <BookUser className="h-3 w-3" /> {savingIndex === index ? t('common.saving') : t('contacts.saveForNextTime')}
                </button>
              )
            )}
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

      {!full && (
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
      email: (item.email ?? '').trim(),
      ...(item.contact_id ? { contact_id: item.contact_id } : {})
    }))
    .filter((item) => item.name !== '');
}
