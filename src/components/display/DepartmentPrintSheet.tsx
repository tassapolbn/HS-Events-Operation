import { useEffect, useState } from 'react';
import { useLanguage } from '../../i18n';
import { schoolToday } from '../../lib/archive';
import { sessionTimeline } from '../../lib/sessionTimeline';
import { sanitizeHtml, shiftDate } from '../../lib/utils';
import type { DisplayDepartment, DisplayEvent } from '../../types';

/** Preserve paragraph/list boundaries and decode entities without rendering rich text. */
function plainText(value: string): string {
  const document = new DOMParser().parseFromString(sanitizeHtml(value).replace(/<br\s*\/?\s*>|<\/(?:p|div|li|h[1-3])>/gi, '\n'), 'text/html');
  return (document.body.textContent ?? '').replace(/\u00a0/g, ' ').trim();
}

const time = (value: string | null | undefined) => value ? new Date(value).toLocaleTimeString('en-GB', {
  timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false
}) : '';

export function DepartmentPrintSheet({ events, department, campusName }: {
  events: DisplayEvent[];
  department: DisplayDepartment;
  campusName: string;
}) {
  const { lang, deptName } = useLanguage();
  const th = lang === 'th';
  const [printedAt, setPrintedAt] = useState(() => new Date());
  useEffect(() => {
    const update = () => setPrintedAt(new Date());
    window.addEventListener('beforeprint', update);
    return () => window.removeEventListener('beforeprint', update);
  }, []);
  const today = schoolToday(printedAt.getTime());
  const entries = sessionTimeline(events, department.id);
  const dateLabel = (day: string) => new Date(`${day}T12:00:00+07:00`).toLocaleDateString(th ? 'th-TH' : 'en-GB', {
    timeZone: 'Asia/Bangkok', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
  return <article className="hidden bg-white text-black print:block" style={{ fontSize: '11pt', lineHeight: 1.5 }}>
    <style>{'@media print { @page { size: A4 portrait; margin: 14mm; } }'}</style>
    <header style={{ borderBottom: '2px solid black', paddingBottom: '3mm', marginBottom: '5mm' }}>
      <h1 style={{ fontSize: '17pt', fontWeight: 800 }}>{campusName} · {deptName(department)} · {th ? 'ใบงาน' : 'Job sheet'}</h1>
      <p>{th ? 'พิมพ์เมื่อ' : 'Printed'} {dateLabel(today)} · {time(printedAt.toISOString())} ({th ? 'เวลาไทย' : 'Thailand time'})</p>
    </header>
    {[today, shiftDate(today, 1)].map((day, dayIndex) => {
      const dayEntries = entries.filter(entry => entry.date === day).sort((a, b) => {
        const start = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : Infinity;
        const aTime = start(a.block.session?.start_time);
        const bTime = start(b.block.session?.start_time);
        return aTime === bTime ? 0 : aTime < bTime ? -1 : 1;
      });
      return <section key={day} style={{ marginBottom: '6mm' }}>
        <h2 style={{ fontSize: '14pt', fontWeight: 800, borderBottom: '1px solid black', marginBottom: '3mm', breakAfter: 'avoid' }}>
          {dayIndex === 0 ? (th ? 'วันนี้' : 'Today') : (th ? 'พรุ่งนี้' : 'Tomorrow')} · {dateLabel(day)}
        </h2>
        {!dayEntries.length && <p>{th ? 'ไม่มีงาน' : 'No jobs'}</p>}
        {dayEntries.map(({ event, block }) => {
          const session = block.session;
          return <section key={`${event.id}:${block.key}`} className="break-inside-avoid" style={{ marginBottom: '5mm' }}>
            <h3 style={{ fontWeight: 800 }}>
              {time(session?.start_time) || session?.time_note || (th ? 'ไม่ระบุเวลา' : 'No time')}
              {session?.end_time ? ` – ${time(session.end_time)}` : ''}
              {' · '}{session?.location || event.location || (th ? 'ไม่ระบุสถานที่' : 'No location')}
              {' · '}{event.name}
            </h3>
            {session?.title && <p style={{ fontWeight: 600 }}>{session.title}</p>}
            {session?.start_time && session.time_note && <p>{session.time_note}</p>}
            {session?.note && <p className="whitespace-pre-wrap">{plainText(session.note)}</p>}
            <ol style={{ marginTop: '2mm' }}>
              {block.tasks.map((task, index) => <li key={task.id} style={{ display: 'flex', gap: '3mm', borderTop: '1px solid #aaa', padding: '2mm 0' }}>
                <span style={{ flexShrink: 0, minWidth: '5mm' }}>{task.status === 'completed' ? (th ? '✓ เสร็จแล้ว' : '✓ Done') : <span aria-label={th ? 'ยังไม่เสร็จ' : 'Not done'} style={{ display: 'inline-block', width: '4mm', height: '4mm', border: '1px solid black', verticalAlign: 'middle' }} />}</span>
                <div style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                  <p style={{ fontWeight: 600 }}>{index + 1}. {task.title}</p>
                  {task.notes && <p className="whitespace-pre-wrap">{plainText(task.notes)}</p>}
                  <p>{th ? 'ผู้ทำ' : 'Done by'} ____________________</p>
                </div>
              </li>)}
            </ol>
          </section>;
        })}
      </section>;
    })}
  </article>;
}
