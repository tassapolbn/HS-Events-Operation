import { useEffect, useState, type ReactNode } from 'react';
import { CalendarDays, Globe, Inbox, RefreshCw } from 'lucide-react';
import { useLanguage } from '../../i18n';
import { departmentIcon } from '../../lib/constants';
import { cn } from '../../lib/utils';
import type { DisplayDepartment } from '../../types';

export type DisplayTab = 'events' | 'requests';

interface DisplayShellProps {
  tab: DisplayTab;
  onTabChange: (tab: DisplayTab) => void;
  departments: DisplayDepartment[];
  selectedDepartmentId: string;
  onSelectDepartment: (id: string) => void;
  onRefresh: () => void;
  refreshing?: boolean;
  updatedAt?: Date | null;
  children: ReactNode;
}

/** Shared frame for the public display board: TVs, computers and tablets */
export function DisplayShell({
  tab,
  onTabChange,
  departments,
  selectedDepartmentId,
  onSelectDepartment,
  onRefresh,
  refreshing,
  updatedAt,
  children
}: DisplayShellProps) {
  const { t, lang, setLang, deptName } = useLanguage();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const clock = now.toLocaleTimeString(lang === 'th' ? 'th-TH' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const dateLine = now.toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const tabs: { key: DisplayTab; label: string; icon: typeof CalendarDays }[] = [
    { key: 'events', label: t('nav.events'), icon: CalendarDays },
    { key: 'requests', label: t('nav.requests'), icon: Inbox }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-navy-100/50 dark:from-slate-950 dark:via-navy-950 dark:to-slate-900">
      {/* Board header */}
      <header className="relative bg-gradient-to-r from-navy-950 via-navy-800 to-navy-600 text-white shadow-lg">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3.5 lg:px-6 2xl:px-8 2xl:py-4">
          <img src="/logo-landscape-dark.png" alt="HeadStart International School" className="h-10 w-auto object-contain 2xl:h-14" />
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold tracking-tight lg:text-xl 2xl:text-3xl">{t('display.boardTitle')}</h1>
            <p className="text-xs text-white/60 2xl:text-sm">{t('display.liveBoard')}</p>
          </div>

          {/* Tabs: Events / Department Requests */}
          <div className="flex rounded-2xl bg-white/10 p-1 backdrop-blur">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => onTabChange(key)}
                className={cn(
                  'flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold transition-all duration-200 lg:px-4 2xl:text-base',
                  tab === key
                    ? 'bg-gradient-to-r from-gold-400 to-gold-300 text-navy-900 shadow-md'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                )}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>

          <div className="ml-auto hidden text-right sm:block">
            <p className="text-xl font-bold tabular-nums text-gold-400 lg:text-2xl 2xl:text-4xl">{clock}</p>
            <p className="text-xs capitalize text-white/70 2xl:text-sm">{dateLine}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLang(lang === 'en' ? 'th' : 'en')}
              className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold transition-all hover:scale-105 hover:bg-white/20"
            >
              <Globe className="h-4 w-4" /> {lang === 'en' ? 'ไทย' : 'EN'}
            </button>
            <button
              onClick={onRefresh}
              className="rounded-xl bg-white/10 px-3 py-2 transition-all hover:scale-105 hover:bg-white/20"
              title={t('display.refresh')}
            >
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            </button>
          </div>
        </div>

        {/* Department filter chips */}
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-2 px-4 pb-3.5 lg:px-6 2xl:px-8">
          <button
            onClick={() => onSelectDepartment('')}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-xs font-bold transition-all duration-200 hover:-translate-y-0.5 lg:text-sm 2xl:px-4 2xl:py-2 2xl:text-base',
              selectedDepartmentId === ''
                ? 'bg-gradient-to-r from-gold-400 to-gold-300 text-navy-900 shadow-md'
                : 'bg-white/10 text-white/80 hover:bg-white/20'
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
                  'flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all duration-200 hover:-translate-y-0.5 lg:text-sm 2xl:px-4 2xl:py-2 2xl:text-base',
                  active ? 'text-white shadow-lg' : 'bg-white/10 text-white/80 hover:bg-white/20'
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

      <main className="mx-auto max-w-[1800px] px-4 py-5 lg:px-6 2xl:px-8">{children}</main>
    </div>
  );
}
