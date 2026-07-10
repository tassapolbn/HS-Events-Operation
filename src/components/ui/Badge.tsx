import { cn } from '../../lib/utils';
import { EVENT_STATUS_STYLES, PRIORITY_STYLES, TASK_STATUS_STYLES } from '../../lib/constants';
import { useLanguage } from '../../i18n';
import type { EventStatus, Priority, TaskStatus } from '../../types';

export function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
        className
      )}
    >
      {children}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const { t } = useLanguage();
  return <Badge className={PRIORITY_STYLES[priority]}>{t(`priority.${priority}`)}</Badge>;
}

export function EventStatusBadge({ status }: { status: EventStatus }) {
  const { t } = useLanguage();
  return <Badge className={EVENT_STATUS_STYLES[status]}>{t(`eventStatus.${status}`)}</Badge>;
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const { t } = useLanguage();
  return <Badge className={TASK_STATUS_STYLES[status]}>{t(`taskStatus.${status}`)}</Badge>;
}
