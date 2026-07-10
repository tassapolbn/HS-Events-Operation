import { useEffect, useState, type ReactNode } from 'react';
import { Globe, RefreshCw } from 'lucide-react';
import { useLanguage } from '../../i18n';
import { departmentIcon } from '../../lib/constants';
import { cn } from '../../lib/utils';
import type { DisplayDepartment } from '../../types';

interface DisplayShellProps {
  title: string;
  departments: DisplayDepartment[];
  selectedDepartmentId: string;
  onSelectDepartment: (id: string) => void;
  onRefresh: () => void;
  refreshing?: boolean;
  updatedAt?: Date | null;
  children: ReactNode;
}

/** Shared frame for the public display boards: large screens, tablets and TVs */
export function DisplayShell({
  title,
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

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      {/* Board header */}
      <header className="bg-navy-800 text-white dark:bg-navy-950">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4 lg:px-8">
          <img src="/logo-landscape-dark.png" alt="HeadStart International School" className="h-10 w-auto object-contain 2xl:h-14" />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-extrabold tracking-tight lg:text-xl 2xl:text-3xl">{title}</h1>
            <p className="text-xs text-white/60 2xl:text-sm">{t('display.liveBoard')}</p>
          </div>
          <div className="hidden text-right sm:block">
            <p className="text-xl font-bold tabular-nums text-gold-400 lg:text-2xl 2xl:text-4xl">{clock}</p>
            <p className="text-xs capitalize text-white/70 2xl:text-sm">{dateLine}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLang(lang === 'en' ? 'th' : 'en')}
              className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20"
            >
              <Globe className="h-4 w-4" /> {lang === 'en' ? 'ไทย' : 'EN'}
            </button>
            <button
              onClick={onRefresh}
              className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20"
              title={t('display.refresh')}
            >
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            </button>
          </div>
        </div>

        {/* Department filter chips */}
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-2 px-5 pb-4 lg:px-8">
          <button
            onClick={() => onSelectDepartment('')}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors lg:text-sm 2xl:px-4 2xl:py-2 2xl:text-base',
              selectedDepartmentId === ''
                ? 'bg-gold-400 text-navy-900'
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
                  'flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all lg:text-sm 2xl:px-4 2xl:py-2 2xl:text-base',
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
      </header>

      <main className="mx-auto max-w-[1800px] px-4 py-5 lg:px-6 2xl:px-8">{children}</main>
    </div>
  );
}
