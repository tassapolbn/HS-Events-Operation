import { useEffect, useState, type ReactNode } from 'react';
import { CalendarDays, Globe, Inbox, RefreshCw, Search, Settings2, X } from 'lucide-react';
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
  canEdit?: boolean;
  campusName?: string;
  search: string;
  onSearch: (value: string) => void;
  children: ReactNode;
}

export function DisplayShell({ tab, onTabChange, scale, onScaleChange, departments, selectedDepartmentId, onSelectDepartment, onRefresh, refreshing, updatedAt, campusName, search, onSearch, children }: DisplayShellProps) {
  const { t, lang, setLang, deptName } = useLanguage();
  const [now, setNow] = useState(new Date());
  const [settings, setSettings] = useState(false);
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(timer); }, []);
  const th = lang === 'th';
  return <div className="support-board min-h-screen bg-[#f3f6fa] text-slate-800">
    <header className="border-b-4 border-gold-400 bg-[#003057] text-white">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-5">
          <img src="/logo-square-dark.png" alt="HeadStart" className="h-12 w-12 shrink-0 object-contain" />
          <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-widest text-gold-400">{th ? 'บอร์ดปฏิบัติงาน' : 'Operations board'}</p><h1 className="text-lg font-bold leading-snug sm:text-2xl">{campusName || t('display.boardTitle')}</h1></div>
        </div>
        <div className="flex items-center gap-2">
          <p className="mr-3 hidden text-right text-sm text-white/80 lg:block">{now.toLocaleDateString(th ? 'th-TH' : 'en-GB', {timeZone:'Asia/Bangkok',day:'numeric',month:'long',year:'numeric'})}<span className="mt-1 block text-xs">{th ? 'เวลาไทย' : 'Thailand time'}</span></p>
          <button onClick={() => setLang(th ? 'en' : 'th')} className="flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-3 font-semibold hover:bg-white/20"><Globe className="h-4 w-4" />{th ? 'EN' : 'ไทย'}</button>
          <button onClick={() => setSettings(!settings)} aria-expanded={settings} aria-label={th ? 'ขนาดตัวอักษร' : 'Text size'} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20"><Settings2 className="h-5 w-5" /></button>
          <button onClick={onRefresh} disabled={refreshing} aria-label={t('display.refresh')} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-60"><RefreshCw className={cn('h-5 w-5', refreshing && 'animate-spin')} /></button>
        </div>
        {settings && <div className="flex w-full flex-wrap items-center gap-2 border-t border-white/15 pt-3"><span className="mr-2 text-sm">{th ? 'ขนาดตัวอักษร' : 'Text size'}</span>{SCALES.map(size => <button key={size} aria-pressed={scale === size} onClick={() => onScaleChange(size)} className={cn('min-h-11 rounded-lg px-4 text-sm font-bold',scale === size ? 'bg-gold-400 text-navy-900' : 'bg-white/10')}>{t(`displaySize.${size}`)}</button>)}</div>}
      </div>
    </header>
    <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto max-w-[1600px] space-y-3 px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-3 md:flex-row">
          <div className="flex shrink-0 gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label={t('display.chooseView')}>
            {([{key:'events',icon:CalendarDays,label:t('nav.events')},{key:'requests',icon:Inbox,label:t('nav.requests')}] as const).map(({key,icon:Icon,label}) => <button key={key} aria-pressed={tab===key} onClick={() => onTabChange(key)} className={cn('flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold md:flex-none',tab===key ? 'bg-[#003057] text-white shadow-sm' : 'text-slate-600 hover:bg-white')}><Icon className="h-4 w-4" />{label}</button>)}
          </div>
          <div className="relative flex-1">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
            <input type="search" value={search} onChange={e => onSearch(e.target.value)} aria-label={th ? 'ค้นหางาน' : 'Search work'} placeholder={th ? 'ค้นหาชื่องาน สถานที่ ผู้รับผิดชอบ หรือแผนก' : 'Search jobs, locations, staff or departments'} className="min-h-12 w-full rounded-xl border border-slate-300 bg-slate-50 pl-10 pr-12 text-base outline-none focus:border-navy-600 focus:bg-white focus:ring-2 focus:ring-navy-100" />
            {search && <button onClick={() => onSearch('')} aria-label={th ? 'ล้างคำค้น' : 'Clear search'} className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>}
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label={t('common.department')}>
          <button aria-pressed={!selectedDepartmentId} onClick={() => onSelectDepartment('')} className={cn('min-h-11 shrink-0 rounded-xl border px-4 text-sm font-bold',!selectedDepartmentId ? 'border-gold-400 bg-gold-50 text-navy-900' : 'border-slate-200 bg-white text-slate-600')}>{t('display.allDepartments')}</button>
          {departments.map(dept => {const Icon=departmentIcon(dept.icon);const active=selectedDepartmentId===dept.id;return <button key={dept.id} aria-pressed={active} onClick={() => onSelectDepartment(active ? '' : dept.id)} className={cn('flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-semibold',active ? 'border-navy-700 bg-navy-50 text-navy-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}><Icon className="h-4 w-4" style={{color:dept.color}} />{deptName(dept)}</button>;})}
        </div>
      </div>
    </div>
    <main className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 sm:py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><p>{th ? 'เลือกแผนกเพื่อดูงานของทีม · แตะงานเพื่อดูรายละเอียด' : 'Choose your department · Open a job for details'}</p><span>{updatedAt ? `${t('display.updated')} ${updatedAt.toLocaleTimeString(th ? 'th-TH' : 'en-GB',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit'})}` : ''}</span></div>
      {children}
    </main>
  </div>;
}
