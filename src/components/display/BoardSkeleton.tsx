import { useLanguage } from '../../i18n';

/**
 * Content shaped loading state for the display board. The page appears to
 * assemble instead of blank waiting on a spinner, which reads far better on
 * a TV several metres away. animate-pulse is disabled automatically for
 * users who prefer reduced motion.
 */
export function BoardSkeleton({ cards = 3 }: { cards?: number }) {
  const { t } = useLanguage();
  return (
    <div role="status" className="space-y-6">
      <span className="sr-only">{t('common.loading')}</span>
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="animate-pulse overflow-hidden rounded-3xl border-2 border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="h-2 bg-slate-200 dark:bg-slate-700" />
          <div className="flex items-center gap-4 px-6 py-4">
            <div className="h-12 w-12 shrink-0 rounded-2xl bg-slate-200 dark:bg-slate-700" />
            <div className="min-w-0 space-y-2">
              <div className="h-5 w-52 max-w-full rounded-lg bg-slate-200 dark:bg-slate-700" />
              <div className="h-4 w-36 max-w-full rounded-lg bg-slate-100 dark:bg-slate-800" />
            </div>
          </div>
          <div className="grid gap-4 px-6 pb-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: cards }).map((_, j) => (
              <div key={j} className="h-36 rounded-2xl bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
