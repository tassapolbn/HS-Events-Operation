import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Globe, LogOut, Menu, Moon, Sun, Mail } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useCampus, type CampusFilter } from '../../contexts/CampusContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useLanguage } from '../../i18n';
import { useNotificationsFeed, useMarkNotificationsRead } from '../../hooks/useNotifications';
import { cn, formatDateTime } from '../../lib/utils';

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { campus, setCampus } = useCampus();
  const { lang, setLang, t } = useLanguage();
  const campusOptions: CampusFilter[] = ['ALL', 'HSC', 'HSN'];
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const { data: notifications } = useNotificationsFeed(profile?.id);
  const markRead = useMarkNotificationsRead(profile?.id);
  const unreadCount = (notifications ?? []).filter((n) => !n.read).length;

  const openNotifications = () => {
    setNotifOpen((v) => !v);
    setMenuOpen(false);
  };

  const handleNotificationClick = (eventId: string | null, requestId: string | null, id: string) => {
    markRead.mutate([id]);
    setNotifOpen(false);
    if (eventId) navigate(`/events/${eventId}`);
    else if (requestId) navigate(`/requests/${requestId}`);
  };

  const initials = (profile?.full_name ?? '?')
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/85 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85 lg:px-6">
      <button onClick={onMenuClick} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden" aria-label="Menu">
        <Menu className="h-5 w-5" />
      </button>
      <div className="flex-1" />

      {/* Campus switcher: filters every admin list. All manages both campuses. */}
      <div
        className="flex items-center rounded-xl bg-slate-100 p-0.5 dark:bg-slate-800"
        role="group"
        aria-label={t('campus.label')}
      >
        {campusOptions.map((c) => (
          <button
            key={c}
            onClick={() => setCampus(c)}
            aria-pressed={campus === c}
            className={cn(
              'rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-500',
              campus === c
                ? 'bg-white text-navy-800 shadow-sm dark:bg-slate-900 dark:text-white'
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            )}
          >
            {c === 'ALL' ? t('campus.all') : c}
          </button>
        ))}
      </div>

      {/* Language toggle */}
      <button
        onClick={() => setLang(lang === 'en' ? 'th' : 'en')}
        className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        title={t('common.language')}
      >
        <Globe className="h-4 w-4" />
        {lang === 'en' ? 'EN' : 'ไทย'}
      </button>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        title={theme === 'dark' ? t('common.lightMode') : t('common.darkMode')}
      >
        {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>

      {/* Notifications */}
      <div className="relative">
        <button
          onClick={openNotifications}
          className="relative rounded-xl p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          title={t('notifications.title')}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
        {notifOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setNotifOpen(false)} />
            <div className="absolute right-0 z-40 mt-2 w-80 animate-scale-in overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:w-96">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                <p className="text-sm font-semibold">{t('notifications.title')}</p>
                {unreadCount > 0 && (
                  <button
                    onClick={() => markRead.mutate((notifications ?? []).filter((n) => !n.read).map((n) => n.id))}
                    className="text-xs font-medium text-navy-600 hover:underline dark:text-gold-400"
                  >
                    {t('common.markAllRead')}
                  </button>
                )}
              </div>
              <div className="max-h-96 overflow-y-auto">
                {(notifications ?? []).length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-slate-400">{t('notifications.empty')}</p>
                ) : (
                  (notifications ?? []).map((n) => (
                    <button
                      key={n.id}
                      onClick={() => handleNotificationClick(n.event_id, n.request_id, n.id)}
                      className={cn(
                        'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800',
                        !n.read && 'bg-navy-50/70 dark:bg-navy-900/30'
                      )}
                    >
                      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-slate-300 dark:bg-slate-600' : 'bg-gold-400')} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">{n.title}</span>
                        <span className="block text-xs text-slate-500 dark:text-slate-400">{n.body}</span>
                        <span className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                          {formatDateTime(n.created_at, lang)}
                          {n.email_sent && (
                            <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                              <Mail className="h-3 w-3" /> {t('notifications.emailSent')}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* User menu */}
      <div className="relative">
        <button
          onClick={() => { setMenuOpen((v) => !v); setNotifOpen(false); }}
          className="flex items-center gap-2 rounded-xl p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-800 text-xs font-bold text-gold-400 dark:bg-gold-400 dark:text-navy-900">
            {initials}
          </span>
          <span className="hidden text-sm font-medium text-slate-700 dark:text-slate-200 md:block">
            {profile?.full_name}
          </span>
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 z-40 mt-2 w-56 animate-scale-in overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{profile?.full_name}</p>
                <p className="truncate text-xs text-slate-400">{profile?.email}</p>
              </div>
              <button
                onClick={() => signOut()}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
              >
                <LogOut className="h-4 w-4" /> {t('common.signOut')}
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
