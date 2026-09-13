import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../i18n';
import { useSendNotification } from '../../hooks/useNotifications';
import { Button } from '../ui/Button';

/** Sending is an explicit action, independent of saving the task. */
export function TaskNotifyPanel({ taskId, title, department, disabled = false }: { taskId: string; title: string; department: string; disabled?: boolean }) {
  const { isEventsTeam } = useAuth();
  const { lang } = useLanguage();
  const send = useSendNotification();
  const busy = useRef(false);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'updated' | 'added'>('updated');
  const [result, setResult] = useState('');
  useEffect(() => { setOpen(false); setResult(''); setKind('updated'); }, [taskId]);
  if (!isEventsTeam) return null;
  const th = lang === 'th';
  const notify = async () => {
    if (busy.current || disabled) return;
    busy.current = true; setResult('');
    try {
      const data = await send.mutateAsync({ type: 'task', id: taskId, changeKind: kind });
      const failure = data.results.find(item => item.error);
      if (!data.ok || !data.results.length) throw new Error('No recipients');
      setResult(failure ? `${th ? 'แจ้งเตือนไม่ครบถ้วน' : 'Notification partially delivered'}: ${failure.error}` : (th ? 'ส่งการแจ้งเตือนงานนี้แล้ว' : 'Notification sent for this task.'));
      setOpen(false);
    } catch { setResult(th ? 'ส่งไม่สำเร็จ กรุณาลองอีกครั้ง' : 'Could not send. Please try again.'); }
    finally { busy.current = false; }
  };
  return <section className="rounded-xl border border-teal-200 bg-teal-50/60 p-3 dark:border-teal-900 dark:bg-teal-950/30" onKeyDown={e => e.stopPropagation()}>
    <Button type="button" variant="outline" disabled={disabled || send.isPending} onClick={() => { setOpen(!open); setResult(''); }}>
      <Bell className="h-4 w-4" /> {th ? 'แจ้งเตือน (แก้ไข/เพิ่มงาน)' : 'Notify (updated / added task)'}
    </Button>
    <p className="mt-2 text-xs text-slate-500">{disabled ? (th ? 'บันทึกการแก้ไขก่อนส่งแจ้งเตือน' : 'Save your changes before notifying.') : (th ? `ส่งเฉพาะงานนี้ไปยัง ${department}` : `Send only this task to ${department}.`)}</p>
    {open && <div className="mt-3 space-y-3">
      <p className="break-words text-sm font-semibold">{title}</p>
      <label className="block text-sm">{th ? 'ประเภทการแจ้งเตือน' : 'Notification type'}
        <select value={kind} disabled={send.isPending} onChange={e => setKind(e.target.value as 'updated' | 'added')} className="ml-2 rounded-lg border border-slate-300 bg-white p-2 text-slate-800">
          <option value="updated">{th ? 'แก้ไขงาน' : 'Task updated'}</option>
          <option value="added">{th ? 'เพิ่มงาน' : 'Task added'}</option>
        </select>
      </label>
      <Button type="button" loading={send.isPending} disabled={disabled} onClick={() => void notify()}>{th ? 'ส่งแจ้งเตือนงานนี้' : 'Send task notification'}</Button>
    </div>}
    {result && <p role="status" className="mt-2 text-sm">{result}</p>}
  </section>;
}
