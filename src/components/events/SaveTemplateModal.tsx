import { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';
import { useLanguage } from '../../i18n';
import { useToast } from '../ui/Toast';
import { useTemplateMutations } from '../../hooks/useTemplates';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import type { Attachment, Department, EventWithTasks } from '../../types';

interface SaveTemplateModalProps {
  open: boolean;
  onClose: () => void;
  event: EventWithTasks;
  departments: Department[];
  attachments: Attachment[];
}

export function SaveTemplateModal({ open, onClose, event, departments, attachments }: SaveTemplateModalProps) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { profile } = useAuth();
  const { saveTemplate } = useTemplateMutations();
  const [name, setName] = useState(event.name);
  const [description, setDescription] = useState('');
  const [includeAttachments, setIncludeAttachments] = useState(true);

  const submit = async () => {
    if (!name.trim() || !profile) return;
    try {
      // Collect checklist labels for every task in this event
      const taskIds = event.event_tasks.map((task) => task.id);
      const checklistsByTask: Record<string, string[]> = {};
      if (taskIds.length > 0) {
        const { data } = await supabase
          .from('task_checklist_items')
          .select('task_id, label, sort_order')
          .in('task_id', taskIds)
          .order('sort_order');
        for (const row of data ?? []) {
          const key = row.task_id as string;
          if (!checklistsByTask[key]) checklistsByTask[key] = [];
          checklistsByTask[key].push(row.label as string);
        }
      }
      await saveTemplate.mutateAsync({
        name: name.trim(),
        description: description.trim(),
        event,
        departments,
        attachments,
        includeAttachments,
        checklistsByTask,
        userId: profile.id
      });
      toast(t('templates.savedSuccess'));
      onClose();
    } catch {
      toast(t('common.errorGeneric'), 'error');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('templates.saveTemplate')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={submit} loading={saveTemplate.isPending} disabled={!name.trim()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label={t('templates.templateName')} required value={name} onChange={(e) => setName(e.target.value)} />
        <Textarea
          label={t('templates.templateDescription')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={includeAttachments}
            onChange={(e) => setIncludeAttachments(e.target.checked)}
            className="h-4 w-4 rounded accent-navy-700 dark:accent-gold-400"
          />
          {t('templates.includeAttachments')} ({attachments.length})
        </label>
        <p className="text-xs text-slate-400">
          {event.event_tasks.length} {t('templates.tasksIncluded')}
          {event.event_sessions.length > 0 &&
            ` - ${event.event_sessions.length} ${t('templates.sessionsIncluded')}`}
        </p>
      </div>
    </Modal>
  );
}
