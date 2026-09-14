import { CircleCheckBig, ListTodo } from 'lucide-react';
import { useLanguage } from '../../i18n';
import { cn } from '../../lib/utils';
import type { BoardScope } from '../../lib/boardScope';

/**
 * Active / Done. One switch for the whole board, so finished work and days that
 * have gone by are one tap away instead of sitting in front of today's work.
 */
export function BoardScopeToggle({
  scope,
  onChange,
  activeCount,
  doneCount
}: {
  scope: BoardScope;
  onChange: (scope: BoardScope) => void;
  activeCount: number;
  doneCount: number;
}) {
  const { t } = useLanguage();
  const options: Array<[BoardScope, typeof ListTodo, string, number]> = [
    ['active', ListTodo, t('display.scopeActive'), activeCount],
    ['done', CircleCheckBig, t('display.scopeDone'), doneCount]
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div
        role="group"
        aria-label={t('display.scopeActive')}
        className="flex shrink-0 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900"
      >
        {options.map(([value, Icon, label, count]) => (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            aria-pressed={scope === value}
            className={cn(
              'flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-500',
              scope === value
                ? value === 'done'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-navy-800 text-white dark:bg-gold-400 dark:text-navy-900'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
            )}
          >
            <Icon className="h-4 w-4" /> {label}
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-xs font-extrabold tabular-nums',
                scope === value ? 'bg-black/20' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
              )}
            >
              {count}
            </span>
          </button>
        ))}
      </div>
      <p className="w-full text-sm leading-relaxed text-slate-500 sm:min-w-48 sm:flex-1 dark:text-slate-400">
        {t('display.scopeHint')}
      </p>
    </div>
  );
}
