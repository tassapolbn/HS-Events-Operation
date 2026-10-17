/**
 * Thai day colours. Everyone at school knows them (Monday is yellow, Friday is
 * light blue), so the board gives each day of the week its colour and two days
 * side by side never look alike.
 *
 * Text on every solid colour passes the WCAG AA contrast ratio of 4.5:1. The
 * light colours (yellow, orange, light blue) take dark text, the others white.
 */
export interface DayColor {
  /** The date tile */
  solid: string;
  /** Text on the solid colour */
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
  { solid: '#dc2626', onSolid: '#ffffff', ink: '#b91c1c', tint: '#fef2f2', border: '#fecaca', rail: '#fca5a5' },
  // Monday: yellow
  { solid: '#facc15', onSolid: '#422006', ink: '#a16207', tint: '#fefce8', border: '#fde68a', rail: '#fde047' },
  // Tuesday: pink
  { solid: '#db2777', onSolid: '#ffffff', ink: '#be185d', tint: '#fdf2f8', border: '#fbcfe8', rail: '#f9a8d4' },
  // Wednesday: green
  { solid: '#15803d', onSolid: '#ffffff', ink: '#15803d', tint: '#f0fdf4', border: '#bbf7d0', rail: '#86efac' },
  // Thursday: orange
  { solid: '#f97316', onSolid: '#431407', ink: '#c2410c', tint: '#fff7ed', border: '#fed7aa', rail: '#fdba74' },
  // Friday: light blue
  { solid: '#38bdf8', onSolid: '#082f49', ink: '#0369a1', tint: '#f0f9ff', border: '#bae6fd', rail: '#7dd3fc' },
  // Saturday: purple
  { solid: '#7c3aed', onSolid: '#ffffff', ink: '#6d28d9', tint: '#f5f3ff', border: '#ddd6fe', rail: '#c4b5fd' }
];

/** 0 for Sunday to 6 for Saturday, for a yyyy-MM-dd day, whatever time zone the device is in */
export function weekdayOf(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/** The colours of a yyyy-MM-dd day */
export function dayColor(day: string): DayColor {
  return DAY_COLORS[weekdayOf(day)] ?? DAY_COLORS[0];
}
