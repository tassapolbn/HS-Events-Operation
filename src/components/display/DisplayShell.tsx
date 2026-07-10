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
      <header className="bg-gradient-to-r from-navy-950 via-navy-800 to-navy-600 shadow-md">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-5 gap-y-3 px-5 py-3.5 lg:px-8">
          <img src="/logo-landscape-dark.png" alt="HeadStart International School" className="h-10 w-auto object-contain" />
          <div className="min-w-0">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-gold-400">{t('app.school')}</p>
            <h1 className="text-lg font-extrabold tracking-tight text-white">{t('display.boardTitle')}</h1>
          </div>

          {/* Tabs */}
          <div className="flex rounded-2xl bg-white/10 p-1 backdrop-blur">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => onTabChange(key)}
                className={cn(
                  'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all duration-200',
                  tab === key
                    ? 'bg-gradient-to-r from-gold-400 to-gold-300 text-navy-900 shadow-md'
                    : 'text-white/75 hover:bg-white/10 hover:text-white'
                )}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>

          <div className="ml-auto hidden text-right sm:block">
            <p className="text-2xl font-extrabold tabular-nums tracking-tight text-gold-400">{clock}</p>
            <p className="text-xs capitalize text-white/70">{dateLine}</p>
          </div>

          {/* Display size */}
          <div className="flex items-center gap-1 rounded-2xl bg-white/10 p-1 backdrop-blur" title={t('displaySize.label')}>
            <Type className="ml-1.5 h-4 w-4 text-white/60" />
            {SCALES.map((s) => (
              <button
                key={s}
                onClick={() => onScaleChange(s)}
                className={cn(
                  'rounded-xl px-2.5 py-1.5 text-xs font-bold transition-all',
                  scale === s
                    ? 'bg-gold-400 text-navy-900 shadow-sm'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                )}
              >
                {t(`displaySize.${s}`)}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setLang(lang === 'en' ? 'th' : 'en')}
              className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white transition-all hover:scale-105 hover:bg-white/20"
            >
              <Globe className="h-4 w-4" /> {lang === 'en' ? 'ไทย' : 'EN'}
            </button>
            <button
              onClick={onRefresh}
              className="rounded-xl bg-white/10 px-3 py-2 text-white transition-all hover:scale-105 hover:bg-white/20"
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
              'rounded-full px-4 py-1.5 text-sm font-bold transition-all duration-200 hover:-translate-y-0.5',
              selectedDepartmentId === ''
                ? 'bg-gradient-to-r from-gold-400 to-gold-300 text-navy-900 shadow-md'
                : 'bg-white/10 text-white/85 hover:bg-white/20'
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
                  'flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold transition-all duration-200 hover:-translate-y-0.5',
                  active ? 'text-white shadow-md' : 'bg-white/10 text-white/85 hover:bg-white/20'
                )}
                style={active ? { backgroundColor: dept.color } : undefined}
              >
                <Icon className="h-4 w-4" /> {deptName(dept)}
              </button>
            );
          })}
          <span className="ml-auto hidden text-xs text-white/50 md:block">
            {updatedAt && `${t('display.updated')} ${updatedAt.toLocaleTimeString(lang === 'th' ? 'th-TH' : 'en-GB')}`}
          </span>
        </div>
        <div className="h-1 bg-gradient-to-r from-gold-400 via-gold-300/70 to-transparent" />
      </header>

      <main className="mx-auto max-w-[1800px] px-5 py-6 lg:px-8">{children}</main>
    </div>
  );
}
