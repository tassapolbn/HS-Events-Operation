export const BOARD_NAME_KEY = 'eventops.display.myName';
const SKIPPED_KEY = 'eventops.display.nameSkipped';

export function readBoardName(): string {
  try { return (localStorage.getItem(BOARD_NAME_KEY) ?? '').trim().slice(0, 60); } catch { return ''; }
}

export function saveBoardName(name: string) {
  try { localStorage.setItem(BOARD_NAME_KEY, name.trim().slice(0, 60)); } catch { /* Storage may be blocked. */ }
}

export function nameSkipped(): boolean {
  try { return sessionStorage.getItem(SKIPPED_KEY) === '1'; } catch { return false; }
}

export function markNameSkipped() {
  try { sessionStorage.setItem(SKIPPED_KEY, '1'); } catch { /* Storage may be blocked. */ }
}
