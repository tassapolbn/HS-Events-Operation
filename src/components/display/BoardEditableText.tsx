import { useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../i18n';
import { useTaskMutations } from '../../hooks/useTasks';
import { useSessionMutations } from '../../hooks/useSessions';
import { useEventMutations } from '../../hooks/useEvents';
import { useToast } from '../ui/Toast';
import { RichTextEditor } from '../editor/RichTextEditor';
import { RichTextViewer } from '../editor/RichTextViewer';

type Target = { entity: 'task'; field: 'title' | 'description' | 'notes' | 'assigned_staff' | 'instructions' | 'work_location' | 'setup_location' }
  | { entity: 'session'; field: 'title' | 'location' | 'time_note' | 'note' }
  | { entity: 'event'; field: 'name' | 'description' | 'additional_notes' | 'location' | 'setup_location' | 'setup_start_note' | 'venue_ready_note' | 'event_start_note' | 'event_finish_note' | 'breakdown_start_note' | 'breakdown_deadline_note' };

export function BoardEditableText({ entity, field, id, eventId, value, label, rich = false, placeholder, className = '' }: Target & {
  id: string; eventId: string; value: string | null; label: string; rich?: boolean; placeholder?: string; className?: string;
}) {
  const { isEventsTeam } = useAuth();
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const { updateTask } = useTaskMutations(eventId);
  const { updateSession } = useSessionMutations(eventId);
  const { updateEvent } = useEventMutations();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState<{ source: string | null; value: string } | null>(null);
  const busy = useRef(false);
  const pending = updateTask.isPending || updateSession.isPending || updateEvent.isPending;
  const displayed = saved?.source === value ? saved.value : value ?? '';
  const save = async () => {
    if (busy.current) return;
    if (((entity === 'task' && field === 'title') || field === 'name') && !draft.trim()) { toast(t('validation.required'), 'error'); return; }
    if (draft === displayed) { setEditing(false); return; }
    busy.current = true;
    try {
      const patch = { id, [field]: rich ? draft : draft.trim() };
      if (entity === 'task') await updateTask.mutateAsync(patch);
      else if (entity === 'session') await updateSession.mutateAsync(patch);
      else await updateEvent.mutateAsync(patch);
      setSaved({ source: value, value: rich ? draft : draft.trim() });
      setEditing(false);
      toast(t('common.savedSuccess'));
    } catch { toast(t('common.errorGeneric'), 'error'); }
    finally { busy.current = false; }
  };
  if (!editing || !isEventsTeam) return <span className={className}>
    <span role={isEventsTeam ? 'button' : undefined} tabIndex={isEventsTeam ? 0 : undefined}
      aria-label={isEventsTeam ? `${t('common.edit')}: ${label}` : undefined}
      title={isEventsTeam ? (lang === 'th' ? 'คลิกเพื่อแก้ไข · Enter บันทึก' : 'Click to edit · Enter to save') : undefined}
      className={isEventsTeam ? 'cursor-text rounded outline-none hover:ring-1 hover:ring-current focus-visible:ring-2' : ''}
      onClick={isEventsTeam ? e => { e.stopPropagation(); setDraft(displayed); setEditing(true); } : undefined}
      onKeyDown={isEventsTeam ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setDraft(displayed); setEditing(true); } } : undefined}>
      {rich ? <RichTextViewer html={displayed} /> : displayed || placeholder || (isEventsTeam ? '—' : '')}
    </span>
  </span>;
  return <span className={`inline-block max-w-full rounded-xl bg-white p-2 text-sm font-normal text-slate-800 shadow-lg ring-2 ring-teal-500 ${className}`}
    onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} onKeyDownCapture={e => {
      if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!busy.current) setEditing(false); }
      if (e.key === 'Enter' && !e.shiftKey && !e.repeat && !(e.target instanceof HTMLElement && e.target.closest('button,select'))) { e.preventDefault(); e.stopPropagation(); void save(); }
    }}>
    {rich ? <RichTextEditor autoFocus value={draft} onChange={setDraft} placeholder={label} /> :
      <textarea autoFocus aria-label={label} value={draft} disabled={pending} rows={Math.min(5, Math.max(1, draft.split('\n').length))}
        onChange={e => setDraft(e.target.value)} className="block min-w-32 max-w-full resize-y rounded border border-slate-300 px-2 py-1 text-slate-900" />}
    <span className="mt-1 flex items-center gap-2 text-xs">
      <span className="text-slate-500">Enter ↵ · Shift+Enter {lang === 'th' ? 'ขึ้นบรรทัดใหม่' : 'new line'}</span>
      <button type="button" aria-label={t('common.save')} disabled={pending} onClick={() => void save()} className="ml-auto rounded bg-teal-700 p-1.5 text-white disabled:opacity-50"><Check className="h-4 w-4" /></button>
      <button type="button" aria-label={t('common.cancel')} disabled={pending} onClick={() => setEditing(false)} className="rounded p-1.5 text-slate-600"><X className="h-4 w-4" /></button>
    </span>
  </span>;
}
