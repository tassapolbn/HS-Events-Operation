import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { useLanguage } from '../i18n';
import { Button } from '../components/ui/Button';

export function NotFoundPage() {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="rounded-full bg-slate-100 p-4 dark:bg-slate-800">
        <Compass className="h-8 w-8 text-slate-400" />
      </div>
      <h1 className="mt-4 text-2xl font-bold text-navy-800 dark:text-white">{t('errors.notFound')}</h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500 dark:text-slate-400">{t('errors.notFoundText')}</p>
      <Link to="/" className="mt-6">
        <Button variant="gold">{t('errors.goHome')}</Button>
      </Link>
    </div>
  );
}
