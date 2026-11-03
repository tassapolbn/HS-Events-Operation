export type BoardPlacement = {
  id: string;
  session_id: string | null;
  department_id: string;
  sort_order: number;
};

type MoveGroup = {
  key: string;
  columns: ReadonlyMap<string, readonly BoardPlacement[]>;
};

/** Lists are in worksheet order. The drop row is where the block's top row goes,
 * indexing the list after removal, matching single-job dragging. Colliding
 * columns merge in row-major order. Only jobs whose place changes are returned. */
export function planBlockMove({ columns, groups, carried, target }: {
  columns: readonly string[];
  groups: readonly MoveGroup[];
  carried: {
    ids: readonly string[];
    /** Column index that lands in the drop column (the grabbed job's); the rest keep their offset from it */
    anchor: number;
    /**
     * Each carried job's row as the worksheet shows it, when a search hides
     * some jobs. It sets the order columns merge in at an edge. Defaults to
     * the rows in the full columns.
     */
    rows?: ReadonlyMap<string, number>;
  };
  target: {
    group: string; dept: string; row: number;
    /** Search-filtered worksheets resolve the visible row separately per column. */
    rows?: ReadonlyMap<string, number>;
  };
}): { patches: BoardPlacement[]; undo: BoardPlacement[] } {
  const empty = { patches: [], undo: [] };
  const destination = groups.find((group) => group.key === target.group);
  const dropColumn = columns.indexOf(target.dept);
  if (!destination || dropColumn < 0 || carried.ids.length === 0) return empty;

  const ids = new Set(carried.ids);
  const picked: Array<{ task: BoardPlacement; group: MoveGroup; column: number; row: number }> = [];
  for (const group of groups) {
    columns.forEach((dept, column) => {
      group.columns.get(dept)?.forEach((task, row) => {
        if (ids.has(task.id)) picked.push({ task, group, column, row });
      });
    });
  }
  // A stale or cross-band selection must not silently move only part of a block.
  if (picked.length !== ids.size || new Set(picked.map(({ group }) => group.key)).size !== 1) return empty;
  // Reading order, row by row as the worksheet shows them, then left to right
  const shownRow = (entry: (typeof picked)[number]) => carried.rows?.get(entry.task.id) ?? entry.row;
  picked.sort((a, b) => shownRow(a) - shownRow(b) || a.column - b.column);

  const touched = new Map<MoveGroup, Map<string, BoardPlacement[]>>();
  const touch = (group: MoveGroup, dept: string) => {
    let perColumn = touched.get(group);
    if (!perColumn) { perColumn = new Map(); touched.set(group, perColumn); }
    let list = perColumn.get(dept);
    if (!list) {
      list = (group.columns.get(dept) ?? []).filter((task) => !ids.has(task.id));
      perColumn.set(dept, list);
    }
    return list;
  };
  const arrivals = new Map<string, BoardPlacement[]>();
  for (const { task, group, column } of picked) {
    touch(group, columns[column]);
    const dept = columns[Math.max(0, Math.min(columns.length - 1, dropColumn + column - carried.anchor))];
    const list = arrivals.get(dept) ?? [];
    list.push(task);
    arrivals.set(dept, list);
  }
  for (const [dept, incoming] of arrivals) {
    const list = touch(destination, dept);
    list.splice(Math.max(0, Math.min(target.rows?.get(dept) ?? target.row, list.length)), 0, ...incoming);
  }

  // Returning to the same positions is a no-op even if old sort orders have gaps.
  const changed = [...touched].some(([group, perColumn]) =>
    [...perColumn].some(([dept, list]) => {
      const before = group.columns.get(dept) ?? [];
      return before.length !== list.length || list.some((task, row) => task.id !== before[row]?.id);
    })
  );
  if (!changed) return empty;

  // Jobs already in their place are left out, as single-job dragging does: fewer
  // writes, and a job someone else just removed elsewhere in the column cannot
  // fail the whole move.
  const patches: BoardPlacement[] = [];
  const undo: BoardPlacement[] = [];
  for (const [group, perColumn] of touched) {
    for (const [dept, list] of perColumn) {
      list.forEach((task, sort_order) => {
        const session_id = ids.has(task.id) ? group.key || null : task.session_id;
        if ((session_id ?? null) === (task.session_id ?? null) && dept === task.department_id && sort_order === task.sort_order) return;
        undo.push({ id: task.id, session_id: task.session_id, department_id: task.department_id, sort_order: task.sort_order });
        patches.push({ id: task.id, session_id, department_id: dept, sort_order });
      });
    }
  }
  return { patches, undo };
}

/**
 * Where a block's top row goes in each full column of the drop session. The
 * visible drop row is read with the carried jobs lifted out, as the planner
 * inserts them, and then found again among all the jobs, hidden ones
 * included. Without a search both lists are the same and this is the row.
 */
export function fullDropRows({ full, visible, carried, row }: {
  full: ReadonlyMap<string, readonly { id: string }[]>;
  visible: ReadonlyMap<string, readonly { id: string }[]>;
  carried: readonly string[];
  row: number;
}): Map<string, number> {
  const lifted = new Set(carried);
  const rows = new Map<string, number>();
  for (const [dept, list] of full) {
    const rest = list.filter((task) => !lifted.has(task.id));
    const anchor = (visible.get(dept) ?? []).filter((task) => !lifted.has(task.id))[row];
    const at = anchor ? rest.findIndex((task) => task.id === anchor.id) : -1;
    rows.set(dept, at >= 0 ? at : rest.length);
  }
  return rows;
}
