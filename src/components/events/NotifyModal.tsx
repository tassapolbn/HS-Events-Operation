import { useState } from 'react';
import { Mail, Send } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useLanguage } from '../../i18n';
import { useToast } from '../ui/Toast';
import { useSendNotification } from '../../hooks/useNotifications';
import { departmentIcon } from '../../lib/constants';
import { cn } from '../../lib/utils';
import type { Department } from '../../types';

interface NotifyModalProps {
  open: boolean;
  onClose: () => void;
  type: 'event' | 'request';
  targetId: string;
  departments: Department[];
  /** Departments that actually have tasks (pre-checked) */
  suggestedIds?: string[];
}

export function NotifyModal({ open, onClose, type, targetId, departments, suggestedIds }: NotifyModalProps) {
  const { t, deptName } = useLanguage();
  const { toast } = useToast();
  const send = useSendNotification();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(suggestedIds ?? []));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = selected.size === departments.length;

  const submit = async () => {
    if (selected.size === 0) {
      toast(t('notify.noDepartments'), 'error');
      return;
    }
    try {
      const result = await send.mutateAsync({ type, id: targetId, departmentIds: Array.from(selected) });
      const failures = result.results.filter((r) => r.error);
      if (failures.length === 0) {
        toast(t('notify.successAll'));
      } else {
        toast(`${t('notify.successPartial')} ${failures.map((f) => f.department).join(', ')}`, 'info');
      }
      onClose();
    } catch {
      toast(t('common.errorGeneric'), 'error');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('notify.title')}
      subtitle={t('notify.subtitle')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="gold" onClick={submit} loading={send.isPending}>
            <Send className="h-4 w-4" /> {t('notify.sendButton')}
          </Button>
        </>
      }
    >
      <div className="space-y-2.5">
        <label className="flex cursor-pointer items-center gap-2 px-1 text-sm font-medium text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() =>
              setSelected(allSelected ? new Set() : new Set(departments.map((d) => d.id)))
            }
            className="h-4 w-4 rounded accent-navy-700 dark:accent-gold-400"
          />
          {t('notify.selectAll')}
        </label>

        {departments.map((dept) => {
          const Icon = departmentIcon(dept.icon);
          const checked = selected.has(dept.id);
          return (
            <label
              key={dept.id}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors',
                checked
                  ? 'border-navy-400 bg-navy-50/60 dark:border-gold-400 dark:bg-navy-900/40'
                  : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(dept.id)}
                className="mt-1 h-4 w-4 rounded accent-navy-700 dark:accent-gold-400"
              />
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
                style={{ backgroundColor: dept.color }}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{deptName(dept)}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {dept.emails.map((email) => (
                    <span key={email} className="inline-flex items-center gap-1 text-xs text-slate-400">
                      <Mail className="h-3 w-3" /> {email}
                    </span>
                  ))}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </Modal>
  );
}
