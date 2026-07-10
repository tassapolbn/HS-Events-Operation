import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export function LoginPage() {
  const { session, signIn, loading } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && session) return <Navigate to="/" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const { error: signInError } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (signInError) setError(t('auth.invalidCredentials'));
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-navy-950 via-navy-800 to-navy-700 p-4">
      <div className="w-full max-w-md animate-slide-up">
        <div className="mb-6 text-center">
          <img src="/logo-landscape-dark.png" alt="HeadStart International School" className="mx-auto h-20 w-auto object-contain" />
          <p className="mt-3 text-xs font-semibold uppercase tracking-[0.25em] text-gold-400">{t('app.name')}</p>
        </div>
        <div className="rounded-3xl bg-white p-8 shadow-2xl dark:bg-slate-900">
          <h1 className="text-xl font-bold text-navy-800 dark:text-white">{t('auth.signInTitle')}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('auth.signInSubtitle')}</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <Input
              label={t('auth.email')}
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@headstartphuket.com"
            />
            <Input
              label={t('auth.password')}
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && (
              <p className="rounded-xl bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600 dark:bg-red-950/50 dark:text-red-400">
                {error}
              </p>
            )}
            <Button type="submit" variant="gold" size="lg" className="w-full" loading={submitting}>
              {submitting ? t('auth.signingIn') : t('auth.signIn')}
            </Button>
          </form>

          <p className="mt-4 text-center text-xs text-slate-400">{t('auth.noAccount')}</p>
        </div>
        <div className="mt-4 text-center">
          <button
            onClick={() => setLang(lang === 'en' ? 'th' : 'en')}
            className="text-sm font-medium text-white/70 transition-colors hover:text-gold-300"
          >
            {lang === 'en' ? 'ภาษาไทย' : 'English'}
          </button>
        </div>
      </div>
    </div>
  );
}
