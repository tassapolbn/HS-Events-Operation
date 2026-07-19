import { useState, type CSSProperties, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, Monitor } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

/**
 * Physics-led entrance: elements settle in sequence so the eye is guided
 * from brand, to the task at hand, to the alternative route.
 * Automatically neutralised by the prefers-reduced-motion rule in index.css.
 */
const rise = (delay: number): CSSProperties => ({
  animationDelay: `${delay}ms`,
  animationDuration: '560ms',
  animationTimingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  animationFillMode: 'backwards'
});

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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-navy-950 px-4 py-10">
      {/* Ambient warmth: layered depth that frames the card without competing with it */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800" />
        <div className="orb-drift absolute -left-28 -top-28 h-[26rem] w-[26rem] rounded-full bg-gold-400/20 blur-3xl" />
        <div
          className="orb-drift absolute -bottom-32 -right-20 h-[30rem] w-[30rem] rounded-full bg-navy-400/25 blur-3xl"
          style={{ animationDelay: '4s' }}
        />
        <div className="absolute left-1/2 top-1/4 h-72 w-72 -translate-x-1/2 rounded-full bg-gold-300/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <header className="animate-slide-up text-center" style={rise(0)}>
          <img
            src="/logo-landscape-dark.png"
            alt="HeadStart International School"
            className="mx-auto h-16 w-auto object-contain sm:h-20"
          />
          <p className="mt-3 text-[0.7rem] font-bold uppercase tracking-[0.3em] text-gold-400">{t('app.name')}</p>
        </header>

        {/* Responsible glassmorphism: one clear surface for the one task on this screen */}
        <main
          className="animate-slide-up mt-6 rounded-3xl border border-white/20 bg-white/95 p-7 shadow-[0_30px_70px_-25px_rgba(0,0,0,0.7)] backdrop-blur-xl sm:p-8 dark:border-white/10 dark:bg-slate-900/90"
          style={rise(90)}
        >
          <h1
            className="font-extrabold tracking-tight text-navy-900 dark:text-white"
            style={{ fontSize: 'clamp(1.35rem, 1.05rem + 1.1vw, 1.8rem)' }}
          >
            {t('auth.signInTitle')}
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{t('auth.signInSubtitle')}</p>

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
              <p
                role="alert"
                className="animate-slide-up rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-600 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400"
              >
                {error}
              </p>
            )}
            <Button type="submit" variant="gold" size="lg" className="w-full" loading={submitting}>
              {submitting ? t('auth.signingIn') : t('auth.signIn')}
            </Button>
          </form>

          <p className="mt-4 text-center text-xs leading-relaxed text-slate-400 dark:text-slate-500">
            {t('auth.noAccount')}
          </p>
        </main>

        {/* Anticipatory: most department staff never need an account, only the board */}
        <Link
          to="/display"
          className="animate-slide-up group mt-4 flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3.5 backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.16] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950"
          style={rise(180)}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold-400/20 text-gold-300">
            <Monitor className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-white">{t('auth.openBoard')}</span>
            <span className="mt-0.5 block text-xs leading-snug text-white/60">{t('auth.openBoardHint')}</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-white/50 transition-transform duration-200 group-hover:translate-x-1" />
        </Link>

        <div className="animate-slide-up mt-5 text-center" style={rise(250)}>
          <button
            onClick={() => setLang(lang === 'en' ? 'th' : 'en')}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-white/70 transition-colors hover:text-gold-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
          >
            {lang === 'en' ? 'ภาษาไทย' : 'English'}
          </button>
        </div>
      </div>
    </div>
  );
}
