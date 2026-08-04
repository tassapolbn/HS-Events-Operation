import { Link } from 'react-router-dom';
import { ArrowRight, MonitorPlay } from 'lucide-react';
import { useLanguage } from '../i18n';
import { CAMPUSES, CAMPUS_NAMES } from '../lib/constants';

/** Public landing that lets a viewer pick which campus board to open. */
export function DisplayPickerPage() {
  const { t } = useLanguage();
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-navy-950 px-4 py-10">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800" />
        <div className="orb-drift absolute -left-28 -top-28 h-[26rem] w-[26rem] rounded-full bg-gold-400/20 blur-3xl" />
        <div
          className="orb-drift absolute -bottom-32 -right-20 h-[30rem] w-[30rem] rounded-full bg-navy-400/25 blur-3xl"
          style={{ animationDelay: '4s' }}
        />
      </div>

      <div className="relative w-full max-w-2xl">
        <header className="animate-slide-up text-center">
          <img
            src="/logo-landscape-dark.png"
            alt="HeadStart International School"
            className="mx-auto h-16 w-auto object-contain sm:h-20"
          />
          <p className="mt-3 text-[0.7rem] font-bold uppercase tracking-[0.3em] text-gold-400">
            {t('display.boardTitle')}
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-white">{t('display.pickCampus')}</h1>
        </header>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {CAMPUSES.map((code, i) => (
            <Link
              key={code}
              to={`/display/${code.toLowerCase()}`}
              className="animate-slide-up group flex flex-col gap-4 rounded-3xl border border-white/15 bg-white/[0.07] p-6 backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-gold-400/60 hover:bg-white/[0.12] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-400/20 text-gold-300">
                <MonitorPlay className="h-6 w-6" />
              </span>
              <span>
                <span className="block text-[0.7rem] font-bold uppercase tracking-[0.2em] text-gold-400">{code}</span>
                <span className="mt-1 block text-xl font-extrabold text-white">{CAMPUS_NAMES[code]}</span>
              </span>
              <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-bold text-white/70 transition-colors group-hover:text-gold-300">
                {t('display.openBoard')} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
