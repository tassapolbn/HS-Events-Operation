/**
 * A colour per session, so the worksheet, the session chips and the session
 * pickers all point at the same session with the same colour. With four
 * departments logging work into one long sheet, the colour is what tells the
 * eye which day a row belongs to without reading the session column.
 *
 * The colour follows the session's position in the event, so it stays in step
 * with the order the sessions are read in. All eight are dark enough to carry
 * white text and light enough to tint a row background.
 */
const SESSION_COLORS = [
  '#0f766e', // teal
  '#7e3f9d', // plum
  '#b45309', // amber
  '#15803d', // forest
  '#b3341f', // brick
  '#4f46e5', // indigo
  '#0369a1', // sky
  '#be185d'  // rose
];

/** Work that belongs to the whole event rather than one session */
export const WHOLE_EVENT_COLOR = '#64748b';

export function sessionColorAt(index: number): string {
  if (index < 0) return WHOLE_EVENT_COLOR;
  return SESSION_COLORS[index % SESSION_COLORS.length];
}

export function sessionColor(sessions: Array<{ id: string }>, sessionId: string | null | undefined): string {
  if (!sessionId) return WHOLE_EVENT_COLOR;
  return sessionColorAt(sessions.findIndex((session) => session.id === sessionId));
}
