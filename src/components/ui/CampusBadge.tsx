import { cn } from '../../lib/utils';
import type { Campus } from '../../types';

/**
 * Campus tag with a shape difference, not only colour, so HSC and HSN are
 * distinguishable at a glance and for colour-blind readers:
 * HSC is a solid navy chip with a filled dot, HSN a gold-outlined chip with a ring.
 */
export function CampusBadge({ campus, className }: { campus: Campus; className?: string }) {
  const hsn = campus === 'HSN';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.65rem] font-extrabold uppercase tracking-wide',
        hsn
          ? 'border border-gold-500 text-gold-700 dark:border-gold-500 dark:text-gold-300'
          : 'bg-navy-700 text-white dark:bg-navy-600',
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', hsn ? 'border border-current' : 'bg-current')} />
      {campus}
    </span>
  );
}
