import { useEffect, useRef } from 'react';
import { useLanguage } from '../../i18n';
import { cn } from '../../lib/utils';

/**
 * Past jobs of the same department, under a worksheet cell being typed in.
 * Nothing is chosen until the arrow keys pick one, so Enter and Tab keep their
 * usual meaning for people who ignore the list.
 */
export function JobSuggestionList({
  id,
  suggestions,
  highlight,
  onPick
}: {
  id: string;
  suggestions: string[];
  highlight: number;
  onPick: (title: string) => void;
}) {
  const { lang } = useLanguage();
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (highlight >= 0) listRef.current?.children[highlight]?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);
  if (suggestions.length === 0) return null;
  return (
    <ul
      ref={listRef}
      id={id}
      role="listbox"
      aria-label={lang === 'th' ? 'งานที่แผนกนี้เคยได้รับ' : "This department's past jobs"}
      className="absolute left-0 top-full z-40 mt-0.5 max-h-60 min-w-full max-w-[28rem] overflow-auto rounded-b-lg border border-slate-200 bg-white py-1 text-left shadow-xl dark:border-slate-700 dark:bg-slate-900"
    >
      <li role="presentation" className="px-3 pb-1 pt-0.5 text-[11px] font-semibold text-slate-400">
        {lang === 'th' ? '↓ เลือกงานที่เคยลง · Enter ใช้' : '↓ pick a past job · Enter to use'}
      </li>
      {suggestions.map((title, index) => (
        <li
          key={title}
          id={`${id}-${index}`}
          role="option"
          aria-selected={highlight === index}
          // Keep focus in the editor, so the pick saves like a typed value
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            onPick(title);
          }}
          className={cn(
            'cursor-pointer whitespace-normal break-words px-3 py-1.5 text-[13px] leading-snug',
            highlight === index
              ? 'bg-navy-100 text-navy-800 dark:bg-navy-800 dark:text-gold-300'
              : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800'
          )}
        >
          {title}
        </li>
      ))}
    </ul>
  );
}
