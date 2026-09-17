import { useEffect, useMemo, useState } from 'react';
import { Bell, ImageIcon, Send, Sparkles } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useLanguage } from '../../i18n';
import { useToast } from '../ui/Toast';
import { useSendNotification } from '../../hooks/useNotifications';
import { useAttachmentPhotoCounts } from '../../hooks/useAttachments';
import { departmentIcon } from '../../lib/constants';
import { cn, formatDate, formatTime } from '../../lib/utils';
import type { Department, EventSession, EventTask } from '../../types';

/** Work nobody has been emailed about yet. */
export function unsentTasks(tasks: EventTask[], sessionId: string): EventTask[] {
  return tasks.filter((task) => task.session_id === sessionId && !task.notified_at);
}

interface SessionNotifyModalProps {
  open: boolean;
  onClose: () => void;
  session: EventSession;
  eventName: string;
  tasks: EventTask[];
  departments: Department[];
}

/**
 * A session gets added to over days, and the departments only hear about it when
 * somebody remembers to tell them. This picks up where that leaves off: it shows
 * what has been added since the last email, the events team ticks what to send
 * and to whom, and each department receives one email holding only its own jobs.
 */
export function SessionNotifyModal({
  open, onClose, session, eventName, tasks, departments
}: SessionNotifyModalProps) {
  const { t, deptName, lang } = useLanguage();
  const { toast } = useToast();
  const send = useSendNotification();
  const th = lang === 'th';

  const sessionTasks = useMemo(
    () => tasks.filter((task) => task.session_id === session.id),
    [tasks, session.id]
  );
  const photoCounts = useAttachmentPhotoCounts('event_task', open ? sessionTasks.map((task) => task.id) : []);

  // Departments that actually have work in this session, in their usual order
  const groups = useMemo(
    () =>
      departments
        .map((dept) => ({ dept, items: sessionTasks.filter((task) => task.department_id === dept.id) }))
        .filter((group) => group.items.length > 0),
    [departments, sessionTasks]
  );

  const [chosen, setChosen] = useState<Set<string>>(new Set());

  // Opening the dialog offers exactly the work that has never been sent
  useEffect(() => {
    if (!open) return;
    setChosen(new Set(sessionTasks.filter((task) => !task.notified_at).map((task) => task.id)));
  }, [open, sessionTasks]);

  const toggle = (id: string) =>
    setChosen((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleGroup = (ids: string[], on: boolean) =>
    setChosen((previous) => {
      const next = new Set(previous);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const chosenTasks = sessionTasks.filter((task) => chosen.has(task.id));
  const departmentIds = Array.from(new Set(chosenTasks.map((task) => task.department_id)));
  const newCount = sessionTasks.filter((task) => !task.notified_at).length;

  const submit = async () => {
    if (chosenTasks.length === 0) {
      toast(t('notify.noTasks'), 'error');
      return;
    }
    try {
      const result = await send.mutateAsync({
        type: 'session_tasks',
        id: session.id,
        taskIds: chosenTasks.map((task) => task.id),
        departmentIds
      });
      const failures = result.results.filter((item) => item.error);
      if (failures.length === 0) toast(`${t('notify.successAll')} · ${chosenTasks.length} ${t('grid.tasksWord')}`);
      else toast(`${t('notify.successPartial')} ${failures.map((item) => item.department).join(', ')}`, 'info');
      onClose();
    } catch {
      toast(t('common.errorGeneric'), 'error');
    }
  };

  const when = [
    formatDate(session.session_date, lang),
    session.start_time ? formatTime(session.start_time, lang) : '',
    session.location
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('notify.sessionTitle')}
      subtitle={`${eventName} · ${session.title || formatDate(session.session_date, lang, 'EEEE d MMMM')}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="gold" onClick={() => void submit()} loading={send.isPending} disabled={chosenTasks.length === 0}>
            <Send className="h-4 w-4" />
            {t('notify.sendButton')} ({chosenTasks.length})
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
          <Bell className="h-4 w-4 shrink-0 text-gold-500" />
          {when}
        </p>

        <p className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {newCount > 0
            ? `${th ? 'ติ๊กไว้ให้แล้ว' : 'Already ticked'}: ${newCount} ${t('notify.newSinceLast')}`
            : t('notify.nothingNew')}
        </p>

        {groups.length === 0 && (
          <p className="py-6 text-center text-sm italic text-slate-400">{t('tasks.noTasks')}</p>
        )}

        {groups.map(({ dept, items }) => {
          const ids = items.map((task) => task.id);
          const picked = ids.filter((id) => chosen.has(id)).length;
          const Icon = departmentIcon(dept.icon);
          return (
            <section
              key={dept.id}
              className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700"
              style={{ borderLeft: `5px solid ${dept.color}` }}
            >
              <label
                className="flex cursor-pointer items-center gap-2.5 border-b border-slate-100 px-3.5 py-2.5 dark:border-slate-800"
                style={{ backgroundColor: `${dept.color}14` }}
              >
                <input
                  type="checkbox"
                  checked={picked === ids.length}
                  ref={(element) => { if (element) element.indeterminate = picked > 0 && picked < ids.length; }}
                  onChange={(event) => toggleGroup(ids, event.target.checked)}
                  className="h-4 w-4 rounded accent-navy-700 dark:accent-gold-400"
                />
                <Icon className="h-4 w-4 shrink-0" style={{ color: dept.color }} />
                <span className="flex-1 text-sm font-extrabold text-slate-700 dark:text-slate-100">{deptName(dept)}</span>
                <span className="text-xs font-bold tabular-nums text-slate-500">{picked}/{ids.length}</span>
              </label>

              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {items.map((task) => {
                  const isNew = !task.notified_at;
                  const photos = photoCounts[task.id] ?? 0;
                  return (
                    <li key={task.id}>
                      <label className="flex cursor-pointer items-start gap-2.5 px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <input
                          type="checkbox"
                          checked={chosen.has(task.id)}
                          onChange={() => toggle(task.id)}
                          className="mt-0.5 h-4 w-4 rounded accent-navy-700 dark:accent-gold-400"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-sm font-semibold text-slate-700 dark:text-slate-200">
                            {task.title || <em className="text-slate-400">{t('tasks.taskTitle')}</em>}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                            {isNew ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-gold-100 px-2 py-0.5 font-extrabold text-gold-800 dark:bg-gold-900/60 dark:text-gold-200">
                                <Sparkles className="h-3 w-3" /> {t('notify.neverSent')}
                              </span>
                            ) : (
                              <span className="text-slate-400">
                                {t('notify.lastSent')} {formatDate(task.notified_at as string, lang, 'd MMM HH:mm')}
                              </span>
                            )}
                            {photos > 0 && (
                              <span className="inline-flex items-center gap-1 text-slate-400">
                                <ImageIcon className="h-3 w-3" /> {photos}
                              </span>
                            )}
                            {task.assigned_staff && <span className="text-slate-400">{task.assigned_staff}</span>}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        <p className={cn('text-xs text-slate-500 dark:text-slate-400', chosenTasks.length === 0 && 'text-amber-600')}>
          {chosenTasks.length === 0
            ? t('notify.noTasks')
            : `${t('notify.willSend')} ${departmentIds.length} ${th ? 'แผนก' : 'department(s)'}`}
        </p>
      </div>
    </Modal>
  );
}
