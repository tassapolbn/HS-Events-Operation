import { useLanguage } from '../../i18n';
import { readableTextColor } from '../../lib/utils';
import type { NowAndNext, TodaySession } from '../../lib/boardToday';
import type { DisplayDepartment } from '../../types';

const time = (value: string) => new Date(value).toLocaleTimeString('en-GB', {
  timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false
});

export function NowNextStrip({ schedule, departments }: { schedule: NowAndNext; departments: DisplayDepartment[] }) {
  const { lang, deptName } = useLanguage();
  const th = lang === 'th';
  if (!schedule.now.length && !schedule.next) return null;
  /** "in 40 min", or "in 7 h 28 min" once the wait is an hour or more */
  const wait = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours === 0) return th ? `อีก ${minutes} นาที` : `in ${minutes} min`;
    if (rest === 0) return th ? `อีก ${hours} ชม.` : `in ${hours} h`;
    return th ? `อีก ${hours} ชม. ${rest} นาที` : `in ${hours} h ${rest} min`;
  };
  const sessionSummary = (entry: TodaySession) => (
    <div key={entry.key} className="space-y-2">
      <p className="text-xl font-bold leading-snug sm:text-2xl">
        <span className="tabular-nums">{time(entry.startTime)}</span>
        {' · '}{entry.sessionTitle || entry.location || (th ? 'ไม่ระบุสถานที่' : 'No location')}
        {entry.location && entry.location !== entry.sessionTitle ? ` · ${entry.location}` : ''}
        {' · '}{entry.eventName}
      </p>
      <div className="flex flex-wrap gap-2">
        {departments.filter(dept => entry.openCounts[dept.id] > 0).map(dept => (
          <span key={dept.id} className="rounded-lg px-3 py-1 text-base font-bold" style={{ backgroundColor: dept.color, color: readableTextColor(dept.color) }}>
            {deptName(dept)} <span className="ml-1 tabular-nums">{entry.openCounts[dept.id]}</span>
          </span>
        ))}
      </div>
    </div>
  );
  return <aside aria-label={th ? 'ตอนนี้และถัดไป' : 'Now and next'} className="mb-5 grid gap-4 rounded-2xl border border-gold-300 bg-white p-5 text-navy-900 lg:grid-cols-2">
    {schedule.now.length > 0 && <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-extrabold"><span aria-hidden className="h-3 w-3 rounded-full bg-gold-400" />{th ? 'ตอนนี้' : 'Now'}</h2>
      {schedule.now.map(sessionSummary)}
    </section>}
    {schedule.next && <section className="space-y-3">
      <h2 className="text-lg font-extrabold">{th ? 'ถัดไป' : 'Next'} <span className="ml-2 rounded-lg bg-gold-100 px-2 py-1 text-gold-800">{wait(schedule.next.minutes)}</span></h2>
      {sessionSummary(schedule.next)}
    </section>}
  </aside>;
}
