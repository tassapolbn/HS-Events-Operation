import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: ReactNode;
  footer?: ReactNode;
  onConfirm?: () => void | Promise<void>;
  confirmDisabled?: boolean;
}

const sizes = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl'
};

export function Modal({ open, onClose, title, subtitle, size = 'md', children, footer, onConfirm, confirmDisabled }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirming = useRef(false);
  // The latest onClose, read when Escape is pressed. Most callers pass a new
  // function on every render; when that restarted the effect below, the focus
  // was pulled out of the field being typed in after every single letter.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  // Where the focus was before the dialog opened, read before a field inside
  // it takes the focus with autoFocus, so closing can put it back
  const openerRef = useRef<HTMLElement | null>(null);
  if (open && openerRef.current === null && typeof document !== 'undefined') {
    openerRef.current = document.activeElement as HTMLElement | null;
  }
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    // A field that took the focus on opening keeps it; otherwise the dialog takes it
    if (dialog && !dialog.contains(document.activeElement)) dialog.focus();
    const onKey = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role=dialog]');
      if (e.key === 'Escape' && dialogs[dialogs.length - 1] === dialogRef.current) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      const opener = openerRef.current;
      openerRef.current = null;
      if (opener && opener !== document.body && opener.isConnected) opener.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 animate-fade-in bg-navy-950/60 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={dialogRef}
        tabIndex={-1}
        onKeyDownCapture={e => {
          if (!onConfirm || e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
          // Keep native button activation and selecting an option intact.
          if (e.target instanceof HTMLElement && e.target.closest('button,select,[role=combobox]')) return;
          e.preventDefault();
          e.stopPropagation();
          if (confirmDisabled || confirming.current || e.repeat) return;
          confirming.current = true;
          Promise.resolve().then(onConfirm).finally(() => { confirming.current = false; });
        }}
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative z-10 flex max-h-[92vh] w-full flex-col animate-scale-in rounded-t-2xl bg-white shadow-2xl sm:m-4 sm:rounded-2xl dark:bg-slate-900',
          sizes[size]
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4 dark:border-slate-800">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
