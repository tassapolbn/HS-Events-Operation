/** Request scheduling always uses the school's timezone, including input fields. */
export const SCHOOL_TIMEZONE = 'Asia/Bangkok';

export function bangkokInput(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: SCHOOL_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function fromBangkokInput(value: string): string | null {
  return value ? new Date(`${value}:00+07:00`).toISOString() : null;
}

export function scheduleLabel(value: string | null | undefined, lang: string, withTime = true): string {
  if (!value) return lang === 'th' ? 'ยังไม่ระบุ' : 'Not scheduled';
  const date = new Date(value.length === 10 ? `${value}T00:00:00+07:00` : value);
  return date.toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB', {
    timeZone: SCHOOL_TIMEZONE, day: 'numeric', month: 'short', year: 'numeric',
    ...(withTime && value.length > 10 ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const } : {})
  });
}

export function requestDeadline(request: { due_at?: string | null; due_date: string | null }): number {
  const value = request.due_at || (request.due_date ? `${request.due_date}T23:59:59.999+07:00` : '');
  return value ? new Date(value).getTime() : Infinity;
}

export function deadlineBeforeWork(start: string, dueDate: string, dueTime: string): boolean {
  if (!start || !dueDate) return false;
  const deadline = requestDeadline({ due_date: dueDate, due_at: dueTime ? fromBangkokInput(`${dueDate}T${dueTime}`) : null });
  return deadline < new Date(fromBangkokInput(start)!).getTime();
}
