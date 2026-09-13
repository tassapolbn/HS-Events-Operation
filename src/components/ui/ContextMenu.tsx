import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';

export interface ContextAction {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
  onSelect: () => void;
}

export function ContextMenu({ x, y, title, actions, onClose }: { x: number; y: number; title: string; actions: ContextAction[]; onClose: () => void }) {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({left: x, top: y});
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    const element = menu.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setPosition({ left: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)) });
    element.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const outside = (event: Event) => { if (!element.contains(event.target as Node)) closeRef.current(); };
    const close = () => closeRef.current();
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('scroll', outside, true);
    window.addEventListener('resize', close);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('scroll', outside, true); window.removeEventListener('resize', close); };
  }, [x, y]);
  return createPortal(<div ref={menu} role="menu" aria-label={title} style={position}
    className="fixed z-[100] max-h-[calc(100vh-16px)] w-72 max-w-[calc(100vw-16px)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 text-sm text-slate-700 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
    onContextMenu={event => event.preventDefault()} onClick={event => event.stopPropagation()}
    onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); onClose(); return; }
      const buttons = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    }}>
    <div className="truncate px-2.5 py-2 text-xs font-bold text-slate-400">{title}</div>
    {actions.map(action => <div key={action.label} className={action.divider ? 'mt-1 border-t border-slate-100 pt-1 dark:border-slate-800' : ''}>
      <button role="menuitem" type="button" disabled={action.disabled} onClick={() => { onClose(); action.onSelect(); }}
        className={cn('flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left outline-none hover:bg-teal-50 focus:bg-teal-50 disabled:opacity-35 dark:hover:bg-slate-800 dark:focus:bg-slate-800', action.danger && 'text-red-600 dark:text-red-400')}>
        <span>{action.label}</span>{action.shortcut && <kbd className="shrink-0 text-[10px] text-slate-400">{action.shortcut}</kbd>}
      </button>
    </div>)}
  </div>, document.body);
}
