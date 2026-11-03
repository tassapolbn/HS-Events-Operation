import { useState } from 'react';
import { useLanguage } from '../../i18n';
import { Modal } from '../ui/Modal';

export function BoardNameDialog({ onSave, onSkip, onClose }: {
  onSave: (name: string) => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const { lang } = useLanguage();
  const [name, setName] = useState('');
  const title = lang === 'th' ? 'ชื่อของคุณ' : 'Your name';
  const save = () => { if (name.trim()) onSave(name.trim().slice(0, 60)); };
  return (
    <Modal open onClose={onClose} title={title} size="sm" onConfirm={save} confirmDisabled={!name.trim()}
      subtitle={lang === 'th' ? 'จะแสดงว่าใครทำหรือรับทราบงาน บันทึกไว้ในเครื่องนี้' : 'Shown with the jobs you tick or acknowledge. Saved on this device.'}
      footer={<>
        <button type="button" onClick={onSkip} className="rounded-lg px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300">{lang === 'th' ? 'ข้าม' : 'Skip'}</button>
        <button type="button" onClick={save} disabled={!name.trim()} className="rounded-lg bg-navy-800 px-4 py-2 font-bold text-white disabled:opacity-50">{lang === 'th' ? 'บันทึก' : 'Save'}</button>
      </>}
    >
      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
        {title}
        <input autoFocus maxLength={60} value={name} onChange={event => setName(event.target.value)} autoComplete="name"
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
      </label>
    </Modal>
  );
}
