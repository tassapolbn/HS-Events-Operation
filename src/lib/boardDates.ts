export type DateScope = 'all' | 'today' | 'tomorrow' | 'week' | 'later' | 'past' | 'custom';

export function matchesDateScope(date: string, today: string, scope: DateScope, selectedDate = ''): boolean {
  const distance = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  if (scope === 'custom') return !selectedDate || date === selectedDate;
  if (scope === 'today') return distance === 0;
  if (scope === 'tomorrow') return distance === 1;
  if (scope === 'week') return distance >= 0 && distance < 7;
  if (scope === 'later') return distance >= 7;
  if (scope === 'past') return distance < 0;
  return true;
}
