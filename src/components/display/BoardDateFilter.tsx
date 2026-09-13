import { CalendarDays } from 'lucide-react';
import { useLanguage } from '../../i18n';
import { cn, formatDate } from '../../lib/utils';
import { matchesDateScope, type DateScope } from '../../lib/boardDates';

export function BoardDateFilter({ dates, today, scope, selectedDate, onChange }: {
  dates: string[]; today: string; scope: DateScope; selectedDate: string;
  onChange: (scope: DateScope, date?: string) => void;
}) {
  const { lang } = useLanguage();
  const th = lang === 'th';
  const options: [DateScope, string][] = [
    ['all', th ? 'ทุกวัน' : 'All dates'], ['today', th ? 'วันนี้' : 'Today'],
    ['tomorrow', th ? 'พรุ่งนี้' : 'Tomorrow'], ['week', th ? '7 วันข้างหน้า' : 'Next 7 days'],
    ['later', th ? 'หลังจากนี้' : 'Later'], ['past', th ? 'วันที่ผ่านมา' : 'Past days']
  ];
  const months = [...new Set(dates.map(date => date.slice(0, 7)))];
  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex items-center gap-2 text-sm font-bold"><CalendarDays className="h-4 w-4 text-teal-600" />{th ? 'ช่วงวันที่' : 'Date range'}</p>
        <div className="flex flex-1 flex-wrap gap-1.5" aria-label={th ? 'กรองช่วงวันที่' : 'Filter date range'}>
          {options.map(([value, label]) => <button key={value} onClick={() => onChange(value)} aria-pressed={scope === value} className={cn('rounded-xl px-3 py-2 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-teal-500', scope === value ? 'bg-teal-700 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300')}>
            {label}<span className={cn('ml-2 text-xs', scope === value ? 'text-teal-100' : 'text-slate-400')}>{dates.filter(date => matchesDateScope(date, today, value)).length}</span>
          </button>)}
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          {th ? 'เลือกวันที่' : 'Choose date'}
          <input type="date" value={scope === 'custom' ? selectedDate : ''} onChange={event => onChange(event.target.value ? 'custom' : 'all', event.target.value)} className="rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200" />
        </label>
      </div>
      <div className="flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <label htmlFor="board-jump-date" className="text-xs font-semibold text-slate-500">{th ? 'ข้ามไปวันที่' : 'Jump to date'}</label>
        <select id="board-jump-date" value="" className="min-w-0 flex-1 rounded-lg bg-slate-50 p-2 text-sm dark:bg-slate-800" onChange={event => {
          const date = event.target.value;
          onChange('custom', date);
        }}>
          <option value="">{th ? 'เลือกจากวันที่มีงาน แบ่งตามเดือน' : 'Scheduled dates, grouped by month'}</option>
          {months.map(month => <optgroup key={month} label={formatDate(`${month}-01`, lang, 'MMMM yyyy')}>
            {dates.filter(date => date.startsWith(month)).map(date => <option key={date} value={date}>{formatDate(date, lang, 'EEEE d MMMM')}</option>)}
          </optgroup>)}
        </select>
      </div>
    </div>
  );
}
