/**
 * Spreadsheet helpers for the task grid: clipboard parsing and loose time input,
 * kept out of the component so the behaviour is easy to reason about.
 */

/**
 * Parse clipboard text as a tab separated table. Handles the quoted cells that
 * Google Sheets and Excel produce when a cell contains a tab or a line break.
 */
export function parseClipboardTable(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let cellStarted = false;

  const endCell = () => {
    row.push(cell);
    cell = '';
    cellStarted = false;
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"' && !cellStarted) {
      quoted = true;
      cellStarted = true;
      continue;
    }
    if (char === '\t') {
      endCell();
      continue;
    }
    if (char === '\r') continue;
    if (char === '\n') {
      endRow();
      continue;
    }
    cell += char;
    cellStarted = true;
  }
  if (cell.length > 0 || row.length > 0) endRow();

  // A trailing newline leaves one empty row behind
  while (rows.length > 0) {
    const last = rows[rows.length - 1];
    if (last.length === 1 && last[0] === '') rows.pop();
    else break;
  }
  return rows;
}

/** Turn a block of cells into text a spreadsheet can paste. */
export function toClipboardTable(rows: string[][]): string {
  return rows
    .map((cells) =>
      cells
        .map((value) => {
          const text = value ?? '';
          return /[\t\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join('\t')
    )
    .join('\n');
}

/**
 * Accept the ways people actually type a time and return HH:mm.
 * "9" "900" "0900" "9:00" "9.00" "9 am" "2pm" all work. Anything else returns ''.
 */
export function normalizeTimeInput(value: string): string {
  const raw = value.trim().toLowerCase();
  if (!raw) return '';

  let meridiem: 'am' | 'pm' | null = null;
  let body = raw;
  if (body.endsWith('am') || body.endsWith('a.m.')) {
    meridiem = 'am';
    body = body.replace(/a\.?m\.?$/, '').trim();
  } else if (body.endsWith('pm') || body.endsWith('p.m.')) {
    meridiem = 'pm';
    body = body.replace(/p\.?m\.?$/, '').trim();
  }
  body = body.replace(/[.\s]/g, ':').replace(/:+/g, ':').replace(/:$/, '');

  let hours: number;
  let minutes = 0;
  if (/^\d{1,2}:\d{1,2}$/.test(body)) {
    const [h, m] = body.split(':');
    hours = Number(h);
    minutes = Number(m);
  } else if (/^\d{3,4}$/.test(body)) {
    hours = Number(body.slice(0, body.length - 2));
    minutes = Number(body.slice(-2));
  } else if (/^\d{1,2}$/.test(body)) {
    hours = Number(body);
  } else {
    return '';
  }

  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return '';
  if (hours > 23 || minutes > 59) return '';
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Match a pasted label against a list of accepted spellings. */
export function matchOption(
  raw: string,
  options: Array<{ value: string; labels: string[] }>
): string | null {
  const needle = raw.trim().toLowerCase();
  if (!needle) return null;
  for (const option of options) {
    if (option.value.toLowerCase() === needle) return option.value;
    if (option.labels.some((label) => label.trim().toLowerCase() === needle)) return option.value;
  }
  return null;
}
