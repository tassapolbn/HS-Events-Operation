import { useEffect, useState } from 'react';
import { CheckCircle2, MessageCircleQuestion } from 'lucide-react';
import { useAskDisplayQuestion } from '../../hooks/usePublicDisplay';
import { useLanguage } from '../../i18n';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Select, Textarea } from '../ui/Input';
import type { DisplayDepartment } from '../../types';

interface AskQuestionModalProps {
  open: boolean;
  onClose: () => void;
  eventId: string;
  eventName: string;
  departments: DisplayDepartment[];
}

/**
 * Lets department staff ask the events team about an event without an
 * account. Kept deliberately short: who is asking, and what they need.
 */
export function AskQuestionModal({ open, onClose, eventId, eventName, departments }: AskQuestionModalProps) {
  const { t, deptName } = useLanguage();
  const askQuestion = useAskDisplayQuestion();
  const [departmentId, setDepartmentId] = useState('');
  const [question, setQuestion] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  // Start clean every time the dialog opens
  useEffect(() => {
    if (open) {
      setDepartmentId('');
      setQuestion('');
      setError('');
      setSent(false);
    }
  }, [open]);

  const submit = async () => {
    if (!departmentId) {
      setError(t('validation.departmentRequired'));
      return;
    }
    if (!question.trim()) {
      setError(t('validation.required'));
      return;
    }
    setError('');
    try {
      await askQuestion.mutateAsync({ eventId, departmentId, question: question.trim() });
      setSent(true);
    } catch {
      setError(t('common.errorGeneric'));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('display.askQuestion')}
      subtitle={sent ? undefined : eventName}
      size="md"
      footer={
        sent ? (
          <Button onClick={onClose}>{t('common.close')}</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submit} loading={askQuestion.isPending}>
              {t('common.send')}
            </Button>
          </>
        )
      }
    >
      {sent ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400">
            <CheckCircle2 className="h-7 w-7" />
          </span>
          <p className="text-base font-bold text-slate-800 dark:text-slate-100">{t('display.questionSent')}</p>
          <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">{t('display.questionSentHint')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="flex items-start gap-2.5 rounded-xl bg-slate-50 px-3.5 py-3 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
            <MessageCircleQuestion className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            {t('display.askQuestionHint')}
          </p>

          <Select
            label={t('common.department')}
            required
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
          >
            <option value="">{t('requests.selectDepartment')}</option>
            {departments.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {deptName(dept)}
              </option>
            ))}
          </Select>

          <Textarea
            label={t('display.yourQuestion')}
            required
            rows={4}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t('display.questionPlaceholder')}
            maxLength={1000}
          />

          {error && (
            <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-600 dark:bg-red-950/50 dark:text-red-400">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
