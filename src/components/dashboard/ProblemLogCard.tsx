import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, X } from 'lucide-react';
import { useClearProblems, useProblemLog, type ClientProblem } from '../../hooks/useProblemLog';
import { useLanguage, type TKey } from '../../i18n';
import { Card, CardBody, CardHeader, CardTitle } from '../ui/Card';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { cn, fillTemplate, formatDateTime } from '../../lib/utils';

const KIND_STYLE: Record<string, string> = {
  upload: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  save: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200',
  load: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  crash: 'bg-rose-200 text-rose-900 dark:bg-rose-900/60 dark:text-rose-100',
  script: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
};

/** The detail JSON as "type: image/webp · status: 400" */
function readableDetail(detail: string): string {
  if (!detail) return '';
  try {
    const parsed = JSON.parse(detail) as Record<string, unknown>;
    return Object.entries(parsed)
      .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
      .join(' · ');
  } catch {
    return detail;
  }
}

function ProblemRow({ problem, onClear }: { problem: ClientProblem; onClear: () => void }) {
  const { t, lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const kindKey = `problems.kind_${problem.kind}` as TKey;
  const kindLabel = t(kindKey) === kindKey ? problem.kind : t(kindKey);
  const who = problem.profile?.full_name || (problem.user_id ? t('problems.someone') : t('problems.signedOut'));

  return (
    <li className="py-2.5" data-problem={problem.id}>
      <div className="flex items-start gap-2">
        <span className={cn('mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide', KIND_STYLE[problem.kind] ?? KIND_STYLE.script)}>
          {kindLabel}
        </span>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="min-w-0 flex-1 text-left"
          aria-expanded={open}
        >
          <p className={cn('text-xs font-medium text-slate-700 dark:text-slate-200', !open && 'line-clamp-2')}>{problem.message}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-400">
            <span>{who}</span>
            <span>{formatDateTime(problem.last_seen, lang)}</span>
            {problem.times > 1 && (
              <span className="font-semibold text-slate-500 dark:text-slate-300">
                {fillTemplate(t('problems.times'), { n: problem.times })}
              </span>
            )}
            <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
          </p>
        </button>
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 rounded-lg p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          title={t('problems.clearOne')}
          aria-label={t('problems.clearOne')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {open && (
        <dl className="ml-1 mt-2 space-y-1 rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          {problem.page && (
            <div className="flex gap-2"><dt className="w-16 shrink-0 font-semibold">{t('problems.page')}</dt><dd className="min-w-0 break-all">{problem.page}</dd></div>
          )}
          {problem.detail && (
            <div className="flex gap-2"><dt className="w-16 shrink-0 font-semibold">{t('problems.detail')}</dt><dd className="min-w-0 break-all">{readableDetail(problem.detail)}</dd></div>
          )}
          {problem.browser && (
            <div className="flex gap-2"><dt className="w-16 shrink-0 font-semibold">{t('problems.browser')}</dt><dd className="min-w-0">{problem.browser}</dd></div>
          )}
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 font-semibold">{t('problems.firstSeen')}</dt>
            <dd className="min-w-0">{formatDateTime(problem.first_seen, lang)}{problem.build ? ` · ${problem.build.slice(0, 7)}` : ''}</dd>
          </div>
        </dl>
      )}
    </li>
  );
}

/**
 * Problems people met in the app during the last week: refused uploads,
 * saves that failed, crashes. Admins only.
 */
export function ProblemLogCard() {
  const { t } = useLanguage();
  const { data: problems, isError } = useProblemLog(true);
  const clear = useClearProblems();
  const [confirmAll, setConfirmAll] = useState(false);

  // Hidden until the database has the log (and for anyone who cannot read it)
  if (isError || !problems) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {problems.length > 0 ? (
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          )}
          {t('problems.title')}
        </CardTitle>
        {problems.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirmAll(true)}
            className="shrink-0 whitespace-nowrap text-xs font-medium text-navy-600 hover:underline dark:text-gold-400"
          >
            {t('problems.clearAll')}
          </button>
        )}
      </CardHeader>
      <CardBody className="px-4 py-1">
        {problems.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">{t('problems.none')}</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800" aria-label={t('problems.title')}>
            {problems.map((problem) => (
              <ProblemRow key={problem.id} problem={problem} onClear={() => clear.mutate(problem.id)} />
            ))}
          </ul>
        )}
      </CardBody>
      <ConfirmDialog
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        onConfirm={async () => {
          await clear.mutateAsync(undefined);
          setConfirmAll(false);
        }}
        title={t('problems.clearAllConfirm')}
        message={t('problems.clearAllHint')}
        confirmLabel={t('problems.clearAll')}
        loading={clear.isPending}
      />
    </Card>
  );
}
