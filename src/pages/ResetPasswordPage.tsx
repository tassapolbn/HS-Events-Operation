import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../i18n';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';

/**
 * Where a reset link lands. Supabase puts a one-off recovery session in the URL
 * and the client picks it up, so the only thing left to do here is choose the
 * new password. The link is spent once this succeeds.
 */
export function ResetPasswordPage() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [ready, setReady] = useState<'checking' | 'ok' | 'expired'>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // The client needs a moment to read the recovery token out of the URL
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setReady(data.session ? 'ok' : 'expired');
    };
    const timer = window.setTimeout(check, 400);
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled && session) setReady('ok');
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      listener.subscription.unsubscribe();
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (password.length < 8) {
      setError(t('auth.passwordTooShort'));
      return;
    }
    if (password !== confirm) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    setSaving(true);
    const { error: saveError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (saveError) {
      setError(t('auth.resetFailed'));
      return;
    }
    setDone(true);
    window.setTimeout(() => navigate('/', { replace: true }), 1600);
  };

  if (ready === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy-900">
        <Spinner />
      </div>
    );
  }
  if (ready === 'expired') return <Navigate to="/login" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-900 px-4 py-10">
      <main className="w-full max-w-md rounded-3xl border border-white/20 bg-white/95 p-7 shadow-[0_30px_70px_-25px_rgba(0,0,0,0.7)] sm:p-8 dark:border-white/10 dark:bg-slate-900/90">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gold-400 text-navy-900">
          <KeyRound className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-xl font-extrabold tracking-tight text-navy-900 dark:text-white">
          {t('auth.resetTitle')}
        </h1>

        {done ? (
          <p
            role="status"
            className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-sm leading-relaxed text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
          >
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> {t('auth.resetDone')}
          </p>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <Input
              label={t('auth.newPassword')}
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              hint={t('auth.passwordRule')}
            />
            <Input
              label={t('auth.confirmPassword')}
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {error && (
              <p
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-600 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400"
              >
                {error}
              </p>
            )}
            <Button type="submit" variant="gold" size="lg" className="w-full" loading={saving}>
              {t('auth.resetSave')}
            </Button>
          </form>
        )}
      </main>
    </div>
  );
}
