import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, CalendarDays, ClipboardList, Inbox, LayoutTemplate, Building2, X, MonitorPlay, ExternalLink
} from 'lucide-react';
import { useLanguage } from '../../i18n';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { t } = useLanguage();
  const { isEventsTeam, profile } = useAuth();

  const items = [
    { to: '/', icon: LayoutDashboard, label: t('nav.dashboard'), show: true },
    { to: '/events', icon: ClipboardList, label: t('nav.events'), show: true },
    { to: '/requests', icon: Inbox, label: t('nav.requests'), show: true },
    { to: '/calendar', icon: CalendarDays, label: t('nav.calendar'), show: true },
    { to: '/templates', icon: LayoutTemplate, label: t('nav.templates'), show: isEventsTeam },
    { to: '/my-department', icon: Building2, label: t('nav.myDepartment'), show: !!profile?.department_id }
  ];

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-navy-950/50 lg:hidden" onClick={onClose} />}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-navy-800 text-white transition-transform duration-200 dark:bg-navy-950',
          'lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <img src="/logo-landscape-dark.png" alt="HeadStart International School" className="h-11 w-auto object-contain" />
          <button onClick={onClose} className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 lg:hidden" aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold-400">{t('app.name')}</p>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-6">
          {items
            .filter((item) => item.show)
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={onClose}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-gold-400 text-navy-900 shadow-sm'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                  )
                }
              >
                <item.icon className="h-[18px] w-[18px]" />
                {item.label}
              </NavLink>
            ))}
          <div className="mt-5 border-t border-white/10 pt-4">
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
              {t('display.liveBoard')}
            </p>
            <a
              href="/display"
              target="_blank"
              rel="noopener"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <MonitorPlay className="h-[18px] w-[18px]" />
              <span className="flex-1">{t('display.boardTitle')}</span>
              <ExternalLink className="h-3.5 w-3.5 opacity-50" />
            </a>
          </div>
        </nav>
        <div className="border-t border-white/10 px-5 py-4">
          <p className="text-xs text-white/50">{t('app.school')}</p>
        </div>
      </aside>
    </>
  );
}
