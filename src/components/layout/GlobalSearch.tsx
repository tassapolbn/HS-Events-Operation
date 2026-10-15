import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  BookUser, CalendarDays, ClipboardList, CornerDownLeft, FolderArchive, Inbox, Loader2, Mail, Phone, Search, UserRound, X
} from 'lucide-react';
import { useGlobalSearch } from '../../hooks/useGlobalSearch';
import { useDepartments } from '../../hooks/useDepartments';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../i18n';
import { flattenSearch, moveSelection, searchable, SEARCH_GROUPS, type SearchGroup, type SearchHit } from '../../lib/searchResults';
import { cn, formatDate } from '../../lib/utils';

const GROUP_ICON: Record<SearchGroup, typeof Search> = {
  events: CalendarDays,
  tasks: ClipboardList,
  requests: Inbox,
  contacts: BookUser,
  people: UserRound
};

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Other parts of the page (the phone menu) open the search with this event */
export const OPEN_SEARCH_EVENT = 'eventops:open-search';

export function openGlobalSearch(): void {
  window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
}

/**
 * One search for the whole app: a button in the top bar, or Ctrl+K (Cmd+K on
 * a Mac) from anywhere. Finds events, jobs, requests (archived ones too),
 * saved contacts and people.
 */
export function GlobalSearch() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    const onOpen = () => setOpen(true);
    document.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-w-0 items-center gap-2 rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 md:w-full md:max-w-sm md:border md:border-slate-200 md:bg-slate-50 md:px-3 md:py-1.5 md:dark:border-slate-700 md:dark:bg-slate-900"
        title={`${t('search.button')} (${isMac ? '⌘' : 'Ctrl'}+K)`}
        aria-label={t('search.button')}
        aria-keyshortcuts="Control+K Meta+K"
        data-global-search-button
      >
        <Search className="h-5 w-5 shrink-0 md:h-4 md:w-4" />
        <span className="hidden flex-1 truncate text-left text-sm md:block">{t('search.button')}</span>
        <kbd className="hidden rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-sans text-[10px] font-semibold text-slate-400 dark:border-slate-700 dark:bg-slate-800 lg:block">
          {isMac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </button>
      {open && <SearchDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function SearchDialog({ onClose }: { onClose: () => void }) {
  const { t, lang, deptName } = useLanguage();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const { data: departments } = useDepartments();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const search = useGlobalSearch(query);

  const ready = searchable(search.settled);
  const hits = useMemo(() => (ready ? flattenSearch(search.data, { isAdmin }) : []), [ready, search.data, isAdmin]);

  // A fresh search starts at the first line that leads somewhere
  useEffect(() => {
    setSelected(moveSelection(hits, -1, 1));
  }, [hits]);

  useEffect(() => {
    inputRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const go = (hit: SearchHit | undefined) => {
    if (!hit?.href) return;
    onClose();
    navigate(hit.href);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected((current) => moveSelection(hits, current, event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      go(hits[selected]);
    }
  };

  const departmentName = (id?: string | null) => {
    const department = (departments ?? []).find((item) => item.id === id);
    return department ? deptName(department) : '';
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center p-2 pt-[8vh] sm:p-4 sm:pt-[12vh]" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 animate-fade-in bg-navy-950/60 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('search.button')}
        className="relative z-10 flex max-h-[80vh] w-full max-w-2xl animate-scale-in flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900"
      >
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          {search.isFetching || search.waiting ? (
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-slate-400" />
          ) : (
            <Search className="h-5 w-5 shrink-0 text-slate-400" />
          )}
          <input
            ref={inputRef}
            type="text"
            enterKeyHint="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('search.placeholder')}
            aria-label={t('search.placeholder')}
            aria-controls="global-search-results"
            aria-activedescendant={selected >= 0 && hits[selected] ? `search-hit-${selected}` : undefined}
            className="min-w-0 flex-1 bg-transparent text-base text-slate-800 placeholder:text-slate-400 focus:outline-none dark:text-slate-100"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            aria-label={t('common.close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div ref={listRef} id="global-search-results" role="listbox" className="flex-1 overflow-y-auto px-2 py-2">
          {!ready ? (
            <p className="px-3 py-8 text-center text-sm text-slate-400">{t('search.hint')}</p>
          ) : search.isError ? (
            <p className="px-3 py-8 text-center text-sm text-slate-400">{t('search.notReady')}</p>
          ) : hits.length === 0 && !search.isFetching && !search.waiting ? (
            <p className="px-3 py-8 text-center text-sm text-slate-400">{t('search.none')}</p>
          ) : (
            SEARCH_GROUPS.map((group) => {
              const groupHits = hits.filter((hit) => hit.group === group);
              if (groupHits.length === 0) return null;
              const Icon = GROUP_ICON[group];
              return (
                <section key={group} className="mb-2" data-search-group={group}>
                  <h3 className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <Icon className="h-3.5 w-3.5" /> {t(`search.group_${group}`)}
                  </h3>
                  <ul>
                    {groupHits.map((hit) => {
                      const index = hits.indexOf(hit);
                      const isSelected = index === selected;
                      const facts = [
                        hit.date ? formatDate(hit.date, lang, 'd MMM yyyy') : '',
                        hit.context ?? '',
                        departmentName(hit.departmentId),
                        hit.campus ?? ''
                      ].filter(Boolean);
                      return (
                        <li
                          key={hit.key}
                          id={`search-hit-${index}`}
                          role="option"
                          aria-selected={isSelected}
                          data-selected={isSelected}
                          onMouseMove={() => hit.href && setSelected(index)}
                          onClick={() => go(hit)}
                          className={cn(
                            'flex items-start gap-3 rounded-xl px-3 py-2',
                            hit.href ? 'cursor-pointer' : 'cursor-default',
                            isSelected ? 'bg-navy-50 dark:bg-navy-900/50' : hit.href && 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-2 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                              <span className="truncate">{hit.title}</span>
                              {hit.archived && (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                                  <FolderArchive className="h-3 w-3" /> {t('search.archived')}
                                </span>
                              )}
                            </p>
                            {facts.length > 0 && <p className="truncate text-xs text-slate-500 dark:text-slate-400">{facts.join(' · ')}</p>}
                            {(hit.phone || hit.email) && (
                              <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
                                {hit.phone && (
                                  <a
                                    href={`tel:${hit.phone.replace(/\s+/g, '')}`}
                                    onClick={(event) => event.stopPropagation()}
                                    className="inline-flex items-center gap-1 text-navy-700 hover:underline dark:text-gold-300"
                                  >
                                    <Phone className="h-3 w-3" /> {hit.phone}
                                  </a>
                                )}
                                {hit.email && (
                                  <a
                                    href={`mailto:${hit.email}`}
                                    onClick={(event) => event.stopPropagation()}
                                    className="inline-flex items-center gap-1 break-all text-navy-700 hover:underline dark:text-gold-300"
                                  >
                                    <Mail className="h-3 w-3" /> {hit.email}
                                  </a>
                                )}
                              </p>
                            )}
                          </div>
                          {isSelected && hit.href && <CornerDownLeft className="mt-1 h-4 w-4 shrink-0 text-slate-400" />}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })
          )}
        </div>

        <p className="hidden border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400 dark:border-slate-800 sm:block">{t('search.keys')}</p>
      </div>
    </div>,
    document.body
  );
}
