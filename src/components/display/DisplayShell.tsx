import { useEffect, useState, type ReactNode } from 'react';
import { CalendarDays, Globe, Inbox, RefreshCw, Type } from 'lucide-react';
import { useLanguage } from '../../i18n';
import { departmentIcon } from '../../lib/constants';
import { cn } from '../../lib/utils';
import type { DisplayDepartment } from '../../types';

export type DisplayTab = 'events' | 'requests';
export type DisplayScale = 'small' | 'medium' | 'large' | 'xlarge';

const SCALES: DisplayScale[] = ['small', 'medium', 'large', 'xlarge'];

interface DisplayShellProps {
  tab: DisplayTab;
  onTabChange: (tab: DisplayTab) => void;
  scale: DisplayScale;
  onScaleChange: (scale: DisplayScale) => void;
  departments: DisplayDepartment[];
  selectedDepartmentId: string;
  onSelectDepartment: (id: string) => void;
  onRefresh: () => void;
  refreshing?: boolean;
  updatedAt?: Date | null;
  children: ReactNode;
}

/** Light, modern frame for the public display board: TVs, monitors and tablets */
export function DisplayShell({
  tab, onTabChange, scale, onScaleChange, departments, selectedDepartmentId,
  onSelectDepartment, onRefresh, refreshing, updatedAt, children
}: DisplayShellProps) {
  const { t, lang, setLang, deptName } = useLanguage();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const clock = now.toLocaleTimeString(lang === 'th' ? 'th-TH' : 'en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const dateLine = now.toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  const tabs: { key: DisplayTab; label: string; icon: typeof CalendarDays }[] = [
    { key: 'events', label: t('nav.events'), icon: CalendarDays },
    { key: 'requests', label: t('nav.requests'), icon: Inbox }
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-5 gap-y-3 px-5 py-3.5 lg:px-8">
          <img src="/logo-landscape-light.png" alt="HeadStart International School" className="h-10 w-auto object-contain dark:hidden" />
          <img src="/logo-landscape-dark.png" alt="HeadStart International School" className="hidden h-10 w-auto object-contain dark:block" />
          <div className="min-w-0">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-gold-500">{t('app.school')}</p>
            <h1 className="text-lg font-extrabold tracking-tight text-navy-800 dark:text-white">{t('display.boardTitle')}</h1>
          </div>

          {/* Tabs */}
          <div className="flex rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => onTabChange(key)}
                className={cn(
                  'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all duration-200',
                  tab === key
                    ? 'bg-white text-navy-800 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
                )}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>

          <div className="ml-auto hidden text-right sm:block">
            <p className="text-2xl font-extrabold tabular-nums tracking-tight text-navy-800 dark:text-gold-400">{clock}</p>
            <p className="text-xs capitalize text-slate-400">{dateLine}</p>
          </div>

          {/* Display size */}
          <div className="flex items-center gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800" title={t('displaySize.label')}>
            <Type className="ml-1.5 h-4 w-4 text-slate-400" />
            {SCALES.map((s) => (
              <button
                key={s}
                onClick={() => onScaleChange(s)}
                className={cn(
                  'rounded-xl px-2.5 py-1.5 text-xs font-bold transition-all',
                  scale === s
                    ? 'bg-navy-800 text-white shadow-sm dark:bg-gold-400 dark:text-navy-900'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
                )}
              >
                {t(`displaySize.${s}`)}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setLang(lang === 'en' ? 'th' : 'en')}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition-all hover:border-slate-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Globe className="h-4 w-4" /> {lang === 'en' ? 'ไทย' : 'EN'}
            </button>
            <button
              onClick={onRefresh}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-600 transition-all hover:border-slate-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              title={t('display.refresh')}
            >
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            </button>
          </div>
        </div>

        {/* Department filter chips */}
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-2 px-5 pb-3.5 lg:px-8">
          <button
            onClick={() => onSelectDepartment('')}
            className={cn(
              'rounded-full border px-4 py-1.5 text-sm font-bold transition-all duration-200 hover:-translate-y-0.5',
              selectedDepartmentId === ''
                ? 'border-navy-800 bg-navy-800 text-white shadow-md dark:border-gold-400 dark:bg-gold-400 dark:text-navy-900'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
            )}
          >
            {t('display.allDepartments')}
          </button>
          {departments.map((dept) => {
            const Icon = departmentIcon(dept.icon);
            const active = selectedDepartmentId === dept.id;
            return (
              <button
                key={dept.id}
                onClick={() => onSelectDepartment(active ? '' : dept.id)}
                className={cn(
                  'flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-bold transition-all duration-200 hover:-translate-y-0.5',
                  active
                    ? 'text-white shadow-md'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                )}
                style={active ? { backgroundColor: dept.color, borderColor: dept.color } : undefined}
              >
                <Icon className="h-4 w-4" style={active ? undefined : { color: dept.color }} /> {deptName(dept)}
              </button>
            );
          })}
          <span className="ml-auto hidden text-xs text-slate-400 md:block">
            {updatedAt && `${t('display.updated')} ${updatedAt.toLocaleTimeString(lang === 'th' ? 'th-TH' : 'en-GB')}`}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-[1800px] px-5 py-6 lg:px-8">{children}</main>
    </div>
  );
}
