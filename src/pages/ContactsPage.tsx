import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookUser, Mail, Pencil, Phone, Plus, Search, Trash2 } from 'lucide-react';
import { useSavedContactMutations, useSavedContacts, type SavedContactInput } from '../hooks/useSavedContacts';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n';
import { useToast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Spinner } from '../components/ui/Spinner';
import { findDuplicate, matchesContact, type SavedContact } from '../lib/savedContacts';

const EMPTY: SavedContactInput = { name: '', role: '', phone: '', email: '' };

/**
 * The saved contacts: people and suppliers the Events team asks often. Anyone
 * signed in can look a number up here; the Events team keeps the list, and
 * ticks people from it into an event instead of typing them again.
 */
export function ContactsPage() {
  const { t } = useLanguage();
  const { profile, isEventsTeam } = useAuth();
  const { toast } = useToast();
  const { data, isLoading, isError } = useSavedContacts();
  const { create, update, remove } = useSavedContactMutations();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  // The top bar search opens this page on a contact
  useEffect(() => {
    const q = searchParams.get('q');
    if (q !== null) setQuery(q);
  }, [searchParams]);
  const [editing, setEditing] = useState<SavedContact | 'new' | null>(null);
  const [draft, setDraft] = useState<SavedContactInput>(EMPTY);
  const [toDelete, setToDelete] = useState<SavedContact | null>(null);

  const list = data ?? [];
  const shown = list.filter((item) => matchesContact(item, query));
  const editingId = editing && editing !== 'new' ? editing.id : undefined;
  const duplicate = draft.name.trim() ? findDuplicate(list, draft, editingId) : undefined;

  const openEditor = (item: SavedContact | 'new') => {
    setEditing(item);
    setDraft(item === 'new' ? EMPTY : { name: item.name, role: item.role, phone: item.phone, email: item.email });
  };

  const save = async () => {
    if (!draft.name.trim() || !profile) return;
    try {
      if (editing === 'new') await create.mutateAsync({ input: draft, userId: profile.id });
      else if (editing) await update.mutateAsync({ id: editing.id, input: draft });
      toast(t('common.savedSuccess'));
      setEditing(null);
    } catch {
      toast(t('common.errorGeneric'), 'error');
    }
  };

  if (isLoading) return <Spinner />;

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-navy-800 dark:text-white lg:text-3xl">{t('contacts.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('contacts.subtitle')}</p>
        </div>
        {isEventsTeam && !isError && (
          <Button variant="gold" size="sm" onClick={() => openEditor('new')}>
            <Plus className="h-4 w-4" /> {t('contacts.add')}
          </Button>
        )}
      </div>

      {isError ? (
        <EmptyState icon={BookUser} message={t('contacts.notReady')} />
      ) : (
        <>
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('contacts.searchPlaceholder')}
              aria-label={t('contacts.searchPlaceholder')}
              className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-500/20 dark:border-slate-700 dark:bg-slate-900"
            />
          </div>

          {list.length === 0 ? (
            <EmptyState icon={BookUser} message={t('contacts.empty')} />
          ) : shown.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">{t('common.noResults')}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((item) => (
                <Card key={item.id} className="p-4">
                  <div className="flex items-start gap-3" data-saved-contact={item.id}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-100 text-sm font-bold text-navy-800 dark:bg-navy-800 dark:text-gold-300">
                      {item.name.trim().charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold text-slate-800 dark:text-slate-100">{item.name}</p>
                      {item.role && <p className="text-xs text-slate-500 dark:text-slate-400">{item.role}</p>}
                      <div className="mt-1.5 space-y-1 text-sm">
                        {item.phone && (
                          <a href={`tel:${item.phone.replace(/\s+/g, '')}`} className="flex items-center gap-1.5 text-navy-700 hover:underline dark:text-gold-300">
                            <Phone className="h-3.5 w-3.5 shrink-0" /> <span className="tabular-nums">{item.phone}</span>
                          </a>
                        )}
                        {item.email && (
                          <a href={`mailto:${item.email}`} className="flex items-center gap-1.5 break-all text-navy-700 hover:underline dark:text-gold-300">
                            <Mail className="h-3.5 w-3.5 shrink-0" /> {item.email}
                          </a>
                        )}
                      </div>
                    </div>
                    {isEventsTeam && (
                      <div className="flex shrink-0 flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => openEditor(item)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-navy-700 dark:hover:bg-slate-800 dark:hover:text-gold-300"
                          title={t('common.edit')}
                          aria-label={`${t('common.edit')} ${item.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setToDelete(item)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                          title={t('common.delete')}
                          aria-label={`${t('common.delete')} ${item.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? t('contacts.add') : t('contacts.edit')}
        size="sm"
        onConfirm={save}
        confirmDisabled={!draft.name.trim()}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
            <Button variant="gold" onClick={save} disabled={!draft.name.trim()} loading={create.isPending || update.isPending}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label={t('events.contactName')}
            required
            autoFocus
            maxLength={120}
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            hint={duplicate ? t('contacts.duplicateHint') : undefined}
          />
          <Input
            label={t('contacts.role')}
            placeholder={t('contacts.rolePlaceholder')}
            maxLength={120}
            value={draft.role}
            onChange={(event) => setDraft({ ...draft, role: event.target.value })}
          />
          <Input
            label={t('events.contactPhone')}
            type="tel"
            inputMode="tel"
            maxLength={60}
            value={draft.phone}
            onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
          />
          <Input
            label={t('events.contactEmail')}
            type="email"
            maxLength={200}
            value={draft.email}
            onChange={(event) => setDraft({ ...draft, email: event.target.value })}
          />
          <p className="text-xs text-slate-400">{t('contacts.editHint')}</p>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await remove.mutateAsync(toDelete.id);
          } catch {
            toast(t('common.errorGeneric'), 'error');
          }
          setToDelete(null);
        }}
        title={t('contacts.deleteConfirm')}
        message={t('contacts.deleteHint')}
        confirmLabel={t('common.delete')}
        loading={remove.isPending}
      />
    </div>
  );
}
