export function nextAutoScroll(scrollY: number, viewport: number, total: number): { top: number; wrap: boolean } {
  const step = Math.round(viewport * 0.8);
  if (scrollY + viewport >= total - 4) return { top: 0, wrap: true };
  return { top: Math.min(scrollY + step, total - viewport), wrap: false };
}
