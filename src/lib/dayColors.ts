/**
 * Thai day colours. Everyone at school knows them (Monday is yellow, Friday is
 * light blue), so the board gives each day of the week its colour and two days
 * side by side never look alike.
 *
 * The date tiles are a deep shade of the day's colour with white text, which
 * passes the WCAG AA contrast ratio of 4.5:1 on every one of them.
 */
export interface DayColor {
  /** The date tile: a deep shade of the day's colour */
  solid: string;
  /** A deeper shade, where the tile's gradient ends */
  deep: string;
  /** The deepest shade, where a session bar's gradient starts */
  darkest: string;
  /** Text on the tile: always white */
  onSolid: string;
  /** The weekday written on the light background */
  ink: string;
  /** The day banner's light background */
  tint: string;
  /** The banner's border */
  border: string;
  /** The line down the side of the day's work */
  rail: string;
}

const DAY_COLORS: DayColor[] = [
  // Sunday: red
  { solid: '#b91c1c', deep: '#991b1b', darkest: '#7f1d1d', onSolid: '#ffffff', ink: '#b91c1c', tint: '#fef2f2', border: '#fecaca', rail: '#fca5a5' },
  // Monday: yellow
  { solid: '#a16207', deep: '#854d0e', darkest: '#713f12', onSolid: '#ffffff', ink: '#a16207', tint: '#fefce8', border: '#fde68a', rail: '#fde047' },
  // Tuesday: pink
  { solid: '#be185d', deep: '#9d174d', darkest: '#831843', onSolid: '#ffffff', ink: '#be185d', tint: '#fdf2f8', border: '#fbcfe8', rail: '#f9a8d4' },
  // Wednesday: green
  { solid: '#15803d', deep: '#166534', darkest: '#14532d', onSolid: '#ffffff', ink: '#15803d', tint: '#f0fdf4', border: '#bbf7d0', rail: '#86efac' },
  // Thursday: orange
  { solid: '#c2410c', deep: '#9a3412', darkest: '#7c2d12', onSolid: '#ffffff', ink: '#c2410c', tint: '#fff7ed', border: '#fed7aa', rail: '#fdba74' },
  // Friday: light blue
  { solid: '#0369a1', deep: '#075985', darkest: '#0c4a6e', onSolid: '#ffffff', ink: '#0369a1', tint: '#f0f9ff', border: '#bae6fd', rail: '#7dd3fc' },
  // Saturday: purple
  { solid: '#6d28d9', deep: '#5b21b6', darkest: '#4c1d95', onSolid: '#ffffff', ink: '#6d28d9', tint: '#f5f3ff', border: '#ddd6fe', rail: '#c4b5fd' }
];

/** 0 for Sunday to 6 for Saturday, for a yyyy-MM-dd day, whatever time zone the device is in */
export function weekdayOf(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/** The colours of a yyyy-MM-dd day */
export function dayColor(day: string): DayColor {
  return DAY_COLORS[weekdayOf(day)] ?? DAY_COLORS[0];
}

/**
 * The bar across the top of a session, in its weekday's colour: deepest on
 * the left, the tile's shade on the right. White text reads on all of it.
 */
export function sessionBarGradient(day: string): string {
  const color = dayColor(day);
  return `linear-gradient(135deg, ${color.darkest} 0%, ${color.deep} 55%, ${color.solid} 100%)`;
}
