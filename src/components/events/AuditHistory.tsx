import { useState } from 'react';
import { ChevronDown, History } from 'lucide-react';
import { useAuditForRecord, diffAuditEntry } from '../../hooks/useAudit';
import { useLanguage } from '../../i18n';
import { cn, formatDateTime } from '../../lib/utils';
import { Card, CardBody, CardHeader, CardTitle } from '../ui/Card';
import { Badge } from '../ui/Badge';

const ACTION_STYLES: Record<string, string> = {
  INSERT: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
  UPDATE: 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
};

export function AuditHistory({ recordId }: { recordId: string }) {
  const { t, lang } = useLanguage();
  const { data: entries } = useAuditForRecord(recordId);
  const [collapsed, setCollapsed] = useState(true);

  return (
    <Card>
      <CardHeader className="cursor-pointer select-none" onClick={() => setCollapsed((v) => !v)}>
        <CardTitle className="flex items-center gap-2">
          <History className="h-4 w-4 text-slate-400" /> {t('audit.title')}
        </CardTitle>
        <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', collapsed && '-rotate-90')} />
      </CardHeader>
      {!collapsed && (
        <CardBody>
          {!entries || entries.length === 0 ? (
            <p className="text-sm italic text-slate-400">{t('audit.noHistory')}</p>
          ) : (
            <ul className="space-y-4">
              {entries.map((entry) => {
                const changes = diffAuditEntry(entry);
                return (
                  <li key={entry.id} className="border-l-2 border-slate-200 pl-4 dark:border-slate-700">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <Badge className={ACTION_STYLES[entry.action]}>{t(`audit.${entry.action}`)}</Badge>
                      <span>
                        {formatDateTime(entry.created_at, lang)} {t('audit.by')}{' '}
                        <span className="font-medium text-slate-700 dark:text-slate-200">
                          {entry.changed_by_profile?.full_name ?? '-'}
                        </span>
                      </span>
                    </div>
                    {changes.length > 0 && (
                      <table className="mt-2 w-full text-xs">
                        <thead>
                          <tr className="text-left text-slate-400">
                            <th className="py-1 pr-3 font-medium">{t('audit.field')}</th>
                            <th className="py-1 pr-3 font-medium">{t('audit.oldValue')}</th>
                            <th className="py-1 font-medium">{t('audit.newValue')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {changes.map((change) => (
                            <tr key={change.field}>
                              <td className="py-1.5 pr-3 font-mono text-[11px] text-slate-500">{change.field}</td>
                              <td className="py-1.5 pr-3 text-red-500/80 line-through">
                                {change.oldValue === 'null' || change.oldValue === '' ? t('audit.empty') : change.oldValue}
                              </td>
                              <td className="py-1.5 text-emerald-600 dark:text-emerald-400">
                                {change.newValue === 'null' || change.newValue === '' ? t('audit.empty') : change.newValue}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      )}
    </Card>
  );
}
