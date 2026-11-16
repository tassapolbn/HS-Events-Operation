export const BOARD_NAME_KEY = 'eventops.display.myName';

export function readBoardName(): string {
  try { return (localStorage.getItem(BOARD_NAME_KEY) ?? '').trim().slice(0, 60); } catch { return ''; }
}
