import { useId, useState } from 'react';
import { AlertTriangle, ChevronDown, Clock, EyeOff, ListTodo, MapPin, Monitor } from 'lucide-react';
import { useLanguage } from '../../i18n';
import { eventCheck, type EventCheckWarning } from '../../lib/eventCheck';
import { formatDate, formatTime } from '../../lib/utils';
import type { Department, EventWithTasks } from '../../types';

export function EventCheckStrip({ event, departments }: { event: EventWithTasks; departments: Department[] }) {
  const { lang, deptName } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const tableId = useId();
  const text = (th: string, en: string) => lang === 'th' ? th : en;
  const { blocks, totals } = eventCheck({
    event_date: event.event_date, sessions: event.event_sessions, tasks: event.event_tasks
  }, departments.map((department) => department.id));
  const warningCount = blocks.reduce((sum, block) => sum + block.warnings.length, 0);
  const sessions = new Map(event.event_sessions.map((session) => [session.id, session]));
  const warningLabels: Record<EventCheckWarning, string> = {
    'no-jobs': text('ยังไม่มีงาน', 'No jobs'),
    'no-time': text('ยังไม่ระบุเวลา', 'No time'),
    'no-place': text('ยังไม่ระบุสถานที่', 'No place'),
    hidden: text('ซ่อนจากบอร์ด', 'Hidden from the board')
  };
  const warningIcons = { 'no-jobs': ListTodo, 'no-time': Clock, 'no-place': MapPin, hidden: EyeOff };

  return (
    <section aria-label={text('ตรวจงานก่อนวันงาน', 'Check before the day')} className="min-w-0 max-w-full rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <h3 className="w-full text-sm font-bold text-navy-800 dark:text-white sm:w-auto">{text('ตรวจงานก่อนวันงาน', 'Check before the day')}</h3>
        <div className="flex w-full min-w-0 flex-wrap gap-1.5 sm:w-auto sm:flex-1">
          {departments.map((department) => (
            <span key={department.id} className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700 [overflow-wrap:anywhere] dark:bg-slate-800 dark:text-slate-200">
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: department.color }} />
              {deptName(department)} <strong className="tabular-nums">{totals[department.id].total}</strong>
            </span>
          ))}
        </div>
        {warningCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />
            {text(`ควรตรวจสอบ ${warningCount} รายการ`, `${warningCount} warnings`)}
          </span>
        )}
        <div className="flex w-full min-w-0 items-center justify-between gap-2 sm:w-auto">
          <a href={`/display/${event.campus.toLowerCase()}?event=${event.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-navy-800 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 dark:text-slate-200 dark:hover:bg-slate-800">
            <Monitor aria-hidden="true" className="h-4 w-4" /> {text('ดูบนบอร์ด', 'Open on board')}
          </a>
          <button type="button" aria-expanded={expanded} aria-controls={tableId} aria-label={text('แสดงหรือซ่อนรายละเอียดการตรวจงาน', 'Show or hide check details')} onClick={() => setExpanded(!expanded)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 dark:text-slate-300 dark:hover:bg-slate-800">
            <ChevronDown aria-hidden="true" className={`h-4 w-4 ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>
      <div id={tableId} hidden={!expanded} className="overflow-x-auto border-t border-slate-200 dark:border-slate-700">
        <table className="w-full text-left text-xs text-slate-700 dark:text-slate-200">
          <caption className="sr-only">{text('จำนวนงาน งานเสร็จ และงานที่รับทราบ แยกตามช่วงและแผนก', 'Total, completed and acknowledged jobs by session and department')}</caption>
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th scope="col" className="px-3 py-2">{text('ช่วงกิจกรรม', 'Session')}</th>
              {departments.map((department) => <th scope="col" key={department.id} className="whitespace-nowrap px-3 py-2">{deptName(department)}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {blocks.map((block) => {
              const session = block.sessionId ? sessions.get(block.sessionId) : undefined;
              const time = session && (session.start_time || session.end_time)
                ? [session.start_time && formatTime(session.start_time, lang), session.end_time && formatTime(session.end_time, lang)].filter(Boolean).join(' – ')
                : session?.time_note;
              return (
                <tr key={block.key}>
                  <th scope="row" className="min-w-[15rem] px-3 py-2 font-medium">
                    <div>{formatDate(block.date, lang)} · {session ? session.title || session.location || text('ช่วงกิจกรรม', 'Session') : text('ทั้งกิจกรรม', 'Whole event')}{time ? ` · ${time}` : ''}</div>
                    {block.warnings.length > 0 && <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-amber-700 dark:text-amber-300">
                      {block.warnings.map((warning) => {
                        const Icon = warningIcons[warning];
                        return <span key={warning} className="inline-flex items-center gap-1"><Icon aria-hidden="true" className="h-3 w-3" />{warningLabels[warning]}</span>;
                      })}
                    </div>}
                  </th>
                  {departments.map((department) => {
                    const { total, done, acknowledged } = block.counts[department.id];
                    return <td key={department.id} className="whitespace-nowrap px-3 py-2 tabular-nums">
                      {total} · <span className="text-emerald-700 dark:text-emerald-400">✓{done}</span> · {text('รับทราบ', 'ack')} {acknowledged}/{total - done}
                    </td>;
                  })}
                </tr>
              );
            })}
            {blocks.length === 0 && <tr><td colSpan={departments.length + 1} className="px-3 py-3 text-slate-500">{text('ยังไม่มีช่วงกิจกรรมหรืองาน', 'No sessions or jobs yet')}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
