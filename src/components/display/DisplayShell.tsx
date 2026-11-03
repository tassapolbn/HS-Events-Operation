import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CalendarDays, Globe, Inbox, MonitorPlay, RefreshCw, Search, Settings2, X } from 'lucide-react';
import { useLanguage } from '../../i18n';
import { departmentIcon } from '../../lib/constants';
import { cn, readableTextColor } from '../../lib/utils';
import type { DisplayDepartment } from '../../types';
import type { LiveStatus } from '../../lib/displayLive';
import type { AutoScrollCycle } from '../../hooks/useAutoScroll';

export type DisplayTab = 'events' | 'requests';
export type DisplayScale = 'small' | 'medium' | 'large' | 'xlarge';
const SCALES: DisplayScale[] = ['small', 'medium', 'large', 'xlarge'];
const BOARD_NAME_KEY = 'eventops.display.myName';

function readName(): string {
  try { return localStorage.getItem(BOARD_NAME_KEY) ?? ''; } catch { return ''; }
}

/** The parent keys each new wait; pausing freezes the actual in-flight width. */
function CountdownFill({ intervalMs, paused }: AutoScrollCycle) {
  const fillRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fill = fillRef.current;
    if (!fill) return;
    if (paused) {
      const width = fill.getBoundingClientRect().width;
      fill.style.transition = 'none';
      fill.style.width = `${width}px`;
      return;
    }
    fill.style.transition = 'none';
    fill.style.width = '0%';
    void fill.offsetWidth;
    const frame = window.requestAnimationFrame(() => {
      fill.style.transition = `width ${intervalMs}ms linear`;
      fill.style.width = '100%';
    });
    return () => window.cancelAnimationFrame(frame);
  }, [intervalMs, paused]);
  return <div aria-hidden className="fixed inset-x-0 top-0 z-50 h-[3px] bg-slate-200 motion-reduce:hidden"><div ref={fillRef} className={cn('h-full', paused ? 'bg-slate-400' : 'bg-gold-400')} style={{ width: 0 }} /></div>;
}

function PresentationCountdown({ cycle }: { cycle: AutoScrollCycle }) {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return reduced ? null : <CountdownFill key={cycle.cycleStart} {...cycle} />;
}

interface DisplayShellProps {
  tab: DisplayTab;
  onTabChange: (tab: DisplayTab) => void;
  scale: DisplayScale;
  onScaleChange: (scale: DisplayScale) => void;
  departments: DisplayDepartment[];
  openCounts?: Record<string, number>;
  selectedDepartmentId: string;
  onSelectDepartment: (id: string) => void;
  onRefresh: () => void;
  refreshing?: boolean;
  updatedAt?: Date | null;
  /** Whether the board is receiving changes as they happen */
  live?: LiveStatus;
  canEdit?: boolean;
  presenting?: boolean;
  autoScroll?: AutoScrollCycle;
  className?: string;
  onTogglePresentation?: () => void;
  campusName?: string;
  search: string;
  onSearch: (value: string) => void;
  children: ReactNode;
}

export function DisplayShell({ tab, onTabChange, scale, onScaleChange, departments, openCounts = {}, selectedDepartmentId, onSelectDepartment, onRefresh, refreshing, updatedAt, live, campusName, search, onSearch, presenting = false, autoScroll, className, onTogglePresentation, children }: DisplayShellProps) {
  const { t, lang, setLang, deptName } = useLanguage();
  const [now, setNow] = useState(new Date());
  const [settings, setSettings] = useState(false);
  const [myName, setMyName] = useState(readName);
  // Refresh when opening settings because the tick/acknowledge dialog can save a name too.
  useEffect(() => { if (settings) setMyName(readName()); }, [settings]);
  const saveName = () => {
    const name = myName.trim().slice(0, 60);
    setMyName(name);
    try { localStorage.setItem(BOARD_NAME_KEY, name); } catch { /* Shared displays may block storage. */ }
  };
  useEffect(() => { setNow(new Date()); const timer = setInterval(() => setNow(new Date()), presenting ? 30_000 : 60_000); return () => clearInterval(timer); }, [presenting]);
  // How tall the pinned search bar is, so the board's day headers can pin just below it
  const stickyRef = useRef<HTMLDivElement>(null);
  const [stickyHeight, setStickyHeight] = useState(0);
  useEffect(() => {
    if (presenting) { setStickyHeight(0); return; }
    const node = stickyRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setStickyHeight(Math.round(node.getBoundingClientRect().height)));
    setStickyHeight(Math.round(node.getBoundingClientRect().height));
    observer.observe(node);
    return () => observer.disconnect();
  }, [presenting, selectedDepartmentId]);
  const th = lang === 'th';
  const totalOpen = Object.values(openCounts).reduce((sum, count) => sum + count, 0);
  const countLabel = (name: string, count: number) => `${name}, ${count} ${th ? 'งานวันนี้' : 'jobs today'}`;
  const countBadge = (count: number, active = false) => count > 0 && <span aria-hidden className={cn('ml-1 rounded-full px-1.5 text-xs font-extrabold tabular-nums', active ? 'bg-white/25' : 'bg-slate-100 text-slate-700')}>{count}</span>;
  const selectedDepartment = departments.find((dept) => dept.id === selectedDepartmentId);
  const liveIndicator = live && <span title={th ? 'บอร์ดจะอัปเดตเองทันทีเมื่อทีม Events แก้ไขงาน' : 'The board updates by itself as soon as the Events team makes a change'} className={cn('inline-flex items-center gap-1.5 font-semibold', presenting ? 'text-white/90' : live === 'live' ? 'text-emerald-700' : live === 'offline' ? 'text-amber-800' : 'text-slate-500')}><span aria-hidden className={cn('h-2 w-2 rounded-full', live === 'live' ? (presenting ? 'bg-emerald-400' : 'bg-emerald-500') : live === 'offline' ? (presenting ? 'bg-amber-400' : 'bg-amber-500') : 'bg-slate-400')} />{live === 'live' ? (th ? 'อัปเดตสด' : 'Live') : live === 'offline' ? (th ? 'กำลังเชื่อมต่อใหม่…' : 'Reconnecting…') : (th ? 'กำลังเชื่อมต่อ…' : 'Connecting…')}</span>;
  return <div className={cn('support-board min-h-screen bg-[#f3f6fa] text-slate-800', className)} style={{ '--board-sticky-top': `${stickyHeight}px` } as CSSProperties}>
    {presenting && autoScroll && <PresentationCountdown cycle={autoScroll} />}
    <header className="border-b-4 border-gold-400 bg-[#003057] text-white">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-5">
          <img src="/logo-square-dark.png" alt="HeadStart" className="h-12 w-12 shrink-0 object-contain" />
          <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-widest text-gold-400">{th ? 'บอร์ดปฏิบัติงาน' : 'Operations board'}</p><h1 className="text-lg font-bold leading-snug sm:text-2xl">{campusName || t('display.boardTitle')}</h1></div>
        </div>
        <div className="flex items-center gap-2">
          <p className={cn('mr-3 text-right text-sm text-white/80', !presenting && 'hidden lg:block')}>{now.toLocaleDateString(th ? 'th-TH' : 'en-GB', {timeZone:'Asia/Bangkok',day:'numeric',month:'long',year:'numeric'})}{presenting && <span className="ml-2 font-bold tabular-nums">{now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false })}</span>}<span className="mt-1 block text-xs">{th ? 'เวลาไทย' : 'Thailand time'}</span></p>
          {presenting && liveIndicator}
          <button type="button" onClick={onTogglePresentation} aria-pressed={presenting} aria-label={presenting ? (th ? 'ออก' : 'Exit') : (th ? 'นำเสนอ' : 'Present')} className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl bg-white/10 px-3 font-semibold hover:bg-white/20">{presenting ? <X className="h-5 w-5" /> : <MonitorPlay className="h-5 w-5" />}<span className="hidden sm:inline">{presenting ? (th ? 'ออก' : 'Exit') : (th ? 'นำเสนอ' : 'Present')}</span></button>
          <button onClick={() => setLang(th ? 'en' : 'th')} className="flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-3 font-semibold hover:bg-white/20"><Globe className="h-4 w-4" />{th ? 'EN' : 'ไทย'}</button>
          <button onClick={() => setSettings(!settings)} aria-expanded={settings} aria-label={th ? 'ตั้งค่าบอร์ด' : 'Board settings'} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20"><Settings2 className="h-5 w-5" /></button>
          <button onClick={onRefresh} disabled={refreshing} aria-label={t('display.refresh')} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-60"><RefreshCw className={cn('h-5 w-5', refreshing && 'animate-spin')} /></button>
        </div>
        {settings && <div className="flex w-full flex-wrap items-center gap-2 border-t border-white/15 pt-3"><span className="mr-2 text-sm">{th ? 'ขนาดตัวอักษร' : 'Text size'}</span>{SCALES.map(size => <button key={size} aria-pressed={scale === size} onClick={() => onScaleChange(size)} className={cn('min-h-11 rounded-lg px-4 text-sm font-bold',scale === size ? 'bg-gold-400 text-navy-900' : 'bg-white/10')}>{t(`displaySize.${size}`)}</button>)}
          <label className="mt-2 flex w-full flex-col gap-2 text-sm font-semibold sm:max-w-sm">
            {th ? 'ชื่อของฉันในเครื่องนี้' : 'My name on this device'}
            <input type="text" value={myName} maxLength={60} onChange={event => setMyName(event.target.value)} onBlur={saveName} onKeyDown={event => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); saveName(); }
            }} className="min-h-11 rounded-lg border border-white/30 bg-white px-3 text-base text-navy-900 outline-none focus:ring-2 focus:ring-gold-400" />
          </label>
        </div>}
      </div>
    </header>
    {!presenting && <div ref={stickyRef} data-board-sticky className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur" style={selectedDepartment ? { borderBottomWidth: 4, borderBottomColor: selectedDepartment.color } : undefined}>
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
          <button aria-pressed={!selectedDepartmentId} aria-label={countLabel(t('display.allDepartments'), totalOpen)} onClick={() => onSelectDepartment('')} className={cn('min-h-11 shrink-0 rounded-xl border px-4 text-sm font-bold',!selectedDepartmentId ? 'border-gold-400 bg-gold-50 text-navy-900' : 'border-slate-200 bg-white text-slate-600')}>{t('display.allDepartments')}{countBadge(totalOpen)}</button>
          {departments.map(dept => {const Icon=departmentIcon(dept.icon);const active=selectedDepartmentId===dept.id;return <button key={dept.id} aria-pressed={active} aria-label={countLabel(deptName(dept), openCounts[dept.id] ?? 0)} onClick={() => onSelectDepartment(active ? '' : dept.id)} className={cn('flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-semibold',!active && 'border-slate-200 text-slate-600 hover:bg-slate-50')} style={active ? { backgroundColor: dept.color, color: readableTextColor(dept.color), borderColor: dept.color } : undefined}><Icon className="h-4 w-4" style={{color:active ? 'currentColor' : dept.color}} />{deptName(dept)}{countBadge(openCounts[dept.id] ?? 0, active)}</button>;})}
        </div>
      </div>
    </div>}
    <main data-board-main className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 sm:py-6">
      {!presenting && <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><p>{th ? 'เลือกแผนกเพื่อดูงานของทีม · แตะงานเพื่อดูรายละเอียด' : 'Choose your department · Open a job for details'}</p><span className="flex items-center gap-3">{liveIndicator}<span>{updatedAt ? `${t('display.updated')} ${updatedAt.toLocaleTimeString(th ? 'th-TH' : 'en-GB',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit'})}` : ''}</span></span></div>}
      {children}
    </main>
  </div>;
}
