import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, Clock, EyeOff, GripVertical, Layers, Loader2, MapPin, Maximize2, Plus, Redo2, Undo2, User } from 'lucide-react';
import { ContextMenu, type ContextAction } from '../ui/ContextMenu';
import { inverseGridEntry, type GridHistoryEntry } from '../../lib/gridHistory';
import { useLanguage } from '../../i18n';
import { useToast } from '../ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { useTaskMutations, type TaskInput } from '../../hooks/useTasks';
import { departmentIcon, TASK_STATUS_DOTS } from '../../lib/constants';
import { sessionColor } from '../../lib/sessionColors';
import { cn, combineDateTime, darkenColor, extractTime, formatDate, formatTime, lightenColor, readableTextColor } from '../../lib/utils';
import { parseClipboardTable, toClipboardTable } from '../../lib/grid';
import type { Department, EventSession, EventTask, TaskStatus } from '../../types';

/** One group of work: a session, or the work that belongs to the whole event. */
interface BoardGroup {
  key: string;
  session: EventSession | null;
  /** Tasks per department, in the order they are worked */
  columns: Map<string, EventTask[]>;
  /** How many task rows this group needs, before the empty row for typing */
  rows: number;
}

/** Where a job sits: which department column, which session, and how far down. */
type Placement = { id: string; session_id: string | null; department_id: string; sort_order: number };

/**
 * A move changes none of the text, so the title based history cannot describe
 * it. Placement is kept as its own kind of entry rather than left out, because
 * a job dropped on the wrong department is exactly the mistake worth undoing.
 */
type BoardHistoryEntry = GridHistoryEntry<'title'> | { kind: 'placement'; patches: Placement[] };

type Cell = { group: string; dept: string; row: number };

interface TaskBoardGridProps {
  eventId: string;
  eventDate: string;
  tasks: EventTask[];
  departments: Department[];
  sessions: EventSession[];
  canEdit: boolean;
  /** Filters shared with the list layout, so switching keeps what is on screen */
  search: string;
  departmentFilter: string;
  sessionFilter: string;
  onOpenTask: (task: EventTask) => void;
  onEditTask: (task: EventTask) => void;
  onAddSession?: () => void;
}

/**
 * The worksheet laid out the way the Events team has always written it on paper:
 * one column per department across the top, a band for the session underneath,
 * and every department's jobs for that session listed down its own column.
 *
 * A cell is a task, not a field. Typing in the empty cell at the foot of a column
 * creates the task; pasting a block of lines creates one task per line, which is
 * how a whole session gets moved across from a spreadsheet in one go.
 */
export function TaskBoardGrid({
  eventId, eventDate, tasks, departments, sessions, canEdit, search, departmentFilter, sessionFilter,
  onOpenTask, onEditTask, onAddSession
}: TaskBoardGridProps) {
  const { t, deptName, lang } = useLanguage();
  const { toast } = useToast();
  const { profile } = useAuth();
  const { createTasks, updateTasks, deleteTasks, restoreTasks } = useTaskMutations(eventId);

  const containerRef = useRef<HTMLDivElement>(null);
  const undoStack = useRef<BoardHistoryEntry[]>([]);
  const redoStack = useRef<BoardHistoryEntry[]>([]);
  const busyRef = useRef(false);
  const focusAfterCreate = useRef<string | null>(null);
  const [depth, setDepth] = useState({ undo: 0, redo: 0 });
  /** column key + group key + row, the cell the cursor is on */
  const [cursor, setCursor] = useState<{ group: string; dept: string; row: number } | null>(null);
  const [editing, setEditing] = useState<{ group: string; dept: string; row: number; initial: string | null } | null>(null);
  const [context, setContext] = useState<{ x: number; y: number } | null>(null);
  /** The far corner of a dragged out selection, always inside the cursor's band */
  const [focus, setFocus] = useState<Cell | null>(null);
  const dragMode = useRef<'none' | 'select' | 'fill'>('none');
  const [fillTo, setFillTo] = useState<Cell | null>(null);
  /** The job being carried to another column, and the cell under the pointer */
  const carrying = useRef<EventTask | null>(null);
  const [dropAt, setDropAt] = useState<Cell | null>(null);

  const busy = createTasks.isPending || updateTasks.isPending || deleteTasks.isPending || restoreTasks.isPending;

  const columns = useMemo(
    () => departments.filter((dept) => !departmentFilter || dept.id === departmentFilter),
    [departments, departmentFilter]
  );

  const groups = useMemo<BoardGroup[]>(() => {
    const needle = search.trim().toLocaleLowerCase();
    const matches = (task: EventTask) =>
      !needle ||
      [task.title, task.assigned_staff, task.work_location, task.setup_location]
        .join(' ')
        .toLocaleLowerCase()
        .includes(needle);
    const ids = new Set(sessions.map((session) => session.id));
    const order = (a: EventTask, b: EventTask) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at);

    const build = (key: string, session: EventSession | null): BoardGroup => {
      const mine = tasks.filter((task) =>
        (session ? task.session_id === session.id : !task.session_id || !ids.has(task.session_id)) && matches(task)
      );
      const perColumn = new Map<string, EventTask[]>();
      let rows = 0;
      for (const dept of columns) {
        const list = mine.filter((task) => task.department_id === dept.id).sort(order);
        perColumn.set(dept.id, list);
        rows = Math.max(rows, list.length);
      }
      return { key, session, columns: perColumn, rows };
    };

    const all: BoardGroup[] = [];
    if (sessionFilter === 'all' || sessionFilter === '') all.push(build('', null));
    for (const session of sessions) {
      if (sessionFilter !== 'all' && sessionFilter !== session.id) continue;
      all.push(build(session.id, session));
    }
    // The whole event group only earns a band once it has work, or when it is the only one
    return all.filter((group) => group.session || group.rows > 0 || all.length === 1);
  }, [tasks, sessions, columns, search, sessionFilter]);

  const groupByKey = useMemo(() => new Map(groups.map((group) => [group.key, group])), [groups]);

  const taskAt = useCallback(
    (groupKey: string, deptId: string, row: number): EventTask | null =>
      groupByKey.get(groupKey)?.columns.get(deptId)?.[row] ?? null,
    [groupByKey]
  );

  // After a task is created, put the cursor on it so typing can carry on
  useEffect(() => {
    const id = focusAfterCreate.current;
    if (!id) return;
    for (const group of groups) {
      for (const dept of columns) {
        const row = (group.columns.get(dept.id) ?? []).findIndex((task) => task.id === id);
        if (row !== -1) {
          focusAfterCreate.current = null;
          setCursor({ group: group.key, dept: dept.id, row });
          containerRef.current?.focus();
          return;
        }
      }
    }
  }, [groups, columns]);

  useEffect(() => { setCursor(null); setFocus(null); setEditing(null); setContext(null); }, [search, departmentFilter, sessionFilter]);

  // ---------- writing ----------

  const pushUndo = (entry: BoardHistoryEntry) => {
    redoStack.current = [];
    undoStack.current.push(entry);
    if (undoStack.current.length > 30) undoStack.current.shift();
    setDepth({ undo: undoStack.current.length, redo: 0 });
  };

  const nextSortOrder = (sessionId: string, departmentId: string) =>
    tasks
      .filter((task) => (task.session_id ?? '') === sessionId && task.department_id === departmentId)
      .reduce((max, task) => Math.max(max, task.sort_order), -1) + 1;

  const newTask = (groupKey: string, departmentId: string, title: string, sortOrder: number): TaskInput => {
    const date = sessions.find((session) => session.id === groupKey)?.session_date ?? eventDate;
    return {
      event_id: eventId,
      department_id: departmentId,
      session_id: groupKey || null,
      title,
      description: '',
      instructions: '',
      work_location: '',
      setup_location: '',
      assigned_staff: '',
      start_time: combineDateTime(date, null),
      completion_time: combineDateTime(date, null),
      priority: 'medium',
      status: 'not_started',
      notes: '',
      sort_order: sortOrder,
      created_by: profile?.id ?? null
    };
  };

  /** Write one or more titles down a column, creating rows as they run out. */
  const writeColumn = async (groupKey: string, deptId: string, startRow: number, titles: string[]) => {
    if (!canEdit || busyRef.current) return;
    const existing = groupByKey.get(groupKey)?.columns.get(deptId) ?? [];
    const updates: Array<{ id: string; values: { title: string } }> = [];
    const inserts: TaskInput[] = [];
    let order = nextSortOrder(groupKey, deptId);
    titles.forEach((title, offset) => {
      const task = existing[startRow + offset];
      if (task) {
        if (task.title !== title) updates.push({ id: task.id, values: { title } });
      } else {
        inserts.push(newTask(groupKey, deptId, title, order));
        order += 1;
      }
    });
    if (updates.length === 0 && inserts.length === 0) return;
    busyRef.current = true;
    try {
      if (updates.length > 0) {
        const before = updates.map(({ id }) => ({
          id,
          values: { title: tasks.find((task) => task.id === id)?.title ?? '' }
        }));
        await updateTasks.mutateAsync(updates.map(({ id, values }) => ({ id, title: values.title })));
        pushUndo({ kind: 'update', patches: before });
      }
      if (inserts.length > 0) {
        const created = await createTasks.mutateAsync(inserts);
        pushUndo({ kind: 'create', ids: created.map((task) => task.id) });
        if (created[0]) focusAfterCreate.current = created[created.length - 1].id;
      }
    } catch {
      toast(t('common.errorGeneric'), 'error');
    } finally {
      busyRef.current = false;
    }
  };

  const removeTask = async (task: EventTask) => {
    if (!canEdit || busyRef.current) return;
    busyRef.current = true;
    try {
      await deleteTasks.mutateAsync([task.id]);
      pushUndo({ kind: 'delete', ids: [task.id] });
      toast(t('grid.deletedUndoHint'));
    } catch {
      toast(t('common.errorGeneric'), 'error');
    } finally {
      busyRef.current = false;
    }
  };

  const duplicateTask = async (task: EventTask) => {
    if (!canEdit || busyRef.current) return;
    busyRef.current = true;
    try {
      const created = await createTasks.mutateAsync([
        {
          ...newTask(task.session_id ?? '', task.department_id, task.title, nextSortOrder(task.session_id ?? '', task.department_id)),
          description: task.description,
          instructions: task.instructions,
          work_location: task.work_location,
          setup_location: task.setup_location,
          assigned_staff: task.assigned_staff,
          start_time: task.start_time,
          completion_time: task.completion_time,
          priority: task.priority
        }
      ]);
      pushUndo({ kind: 'create', ids: created.map((item) => item.id) });
      if (created[0]) focusAfterCreate.current = created[0].id;
      toast(`${t('grid.duplicated')} 1`);
    } catch {
      toast(t('common.errorGeneric'), 'error');
    } finally {
      busyRef.current = false;
    }
  };

  const toggleDone = async (task: EventTask) => {
    if (!canEdit || busyRef.current) return;
    busyRef.current = true;
    try {
      await updateTasks.mutateAsync([
        { id: task.id, status: task.status === 'completed' ? 'not_started' : 'completed' }
      ]);
    } catch {
      toast(t('common.errorGeneric'), 'error');
    } finally {
      busyRef.current = false;
    }
  };

  const travel = async (redo = false) => {
    if (!canEdit || busyRef.current) return;
    const from = redo ? redoStack : undoStack;
    const to = redo ? undoStack : redoStack;
    const entry = from.current[from.current.length - 1];
    if (!entry) return;
    busyRef.current = true;
    try {
      // Putting a job back where it was is its own kind of step
      if (entry.kind === 'placement') {
        const byId = new Map(tasks.map((task) => [task.id, task]));
        const back: Placement[] = entry.patches.map((patch) => {
          const task = byId.get(patch.id);
          if (!task) throw new Error('Task is no longer available');
          return {
            id: task.id,
            session_id: task.session_id ?? null,
            department_id: task.department_id,
            sort_order: task.sort_order
          };
        });
        await updateTasks.mutateAsync(entry.patches);
        from.current.pop();
        to.current.push({ kind: 'placement', patches: back });
        setDepth({ undo: undoStack.current.length, redo: redoStack.current.length });
        toast(redo ? (lang === 'th' ? 'ทำซ้ำแล้ว' : 'Redone') : t('grid.undone'));
        return;
      }
      const values = new Map(tasks.map((task) => [task.id, { title: task.title }]));
      const inverse = inverseGridEntry(entry, values);
      if (entry.kind === 'update') {
        await updateTasks.mutateAsync(entry.patches.map((patch) => ({ id: patch.id, title: patch.values.title ?? '' })));
      }
      if (entry.kind === 'create') await deleteTasks.mutateAsync(entry.ids);
      if (entry.kind === 'delete') await restoreTasks.mutateAsync(entry.ids);
      from.current.pop();
      to.current.push(inverse);
      setDepth({ undo: undoStack.current.length, redo: redoStack.current.length });
      toast(redo ? (lang === 'th' ? 'ทำซ้ำแล้ว' : 'Redone') : t('grid.undone'));
    } catch {
      toast(t('common.errorGeneric'), 'error');
    } finally {
      busyRef.current = false;
    }
  };

  // ---------- moving around ----------

  const flatColumns = columns.map((dept) => dept.id);

  const move = (dRow: number, dCol: number) => {
    if (!cursor) {
      const first = groups[0];
      if (first && flatColumns[0]) setCursor({ group: first.key, dept: flatColumns[0], row: 0 });
      return;
    }
    const groupIndex = groups.findIndex((group) => group.key === cursor.group);
    const colIndex = flatColumns.indexOf(cursor.dept);
    if (groupIndex === -1 || colIndex === -1) return;
    if (dCol !== 0) {
      const next = Math.min(Math.max(colIndex + dCol, 0), flatColumns.length - 1);
      setCursor({ ...cursor, dept: flatColumns[next] });
      return;
    }
    const row = cursor.row + dRow;
    const limit = groups[groupIndex].rows; // the empty slot sits at index rows
    if (row >= 0 && row <= limit) {
      setCursor({ ...cursor, row });
      return;
    }
    // Step into the group above or below, landing on its nearest edge
    const nextGroup = groups[groupIndex + (dRow > 0 ? 1 : -1)];
    if (!nextGroup) return;
    setCursor({ group: nextGroup.key, dept: cursor.dept, row: dRow > 0 ? 0 : nextGroup.rows });
  };

  // ---------- selecting a block, filling it, carrying a job elsewhere ----------

  /**
   * The block the pointer has swept out. A selection never leaves its band:
   * the bands hold different sessions and different numbers of rows, so a
   * rectangle across two of them would mean nothing to read and nothing to fill.
   */
  const area = (() => {
    if (!cursor) return null;
    const far = focus && focus.group === cursor.group ? focus : cursor;
    const a = flatColumns.indexOf(cursor.dept);
    const b = flatColumns.indexOf(far.dept);
    if (a === -1 || b === -1) return null;
    return {
      group: cursor.group,
      top: Math.min(cursor.row, far.row),
      bottom: Math.max(cursor.row, far.row),
      left: Math.min(a, b),
      right: Math.max(a, b)
    };
  })();

  const inArea = (groupKey: string, deptId: string, row: number) => {
    if (!area || area.group !== groupKey) return false;
    const column = flatColumns.indexOf(deptId);
    return row >= area.top && row <= area.bottom && column >= area.left && column <= area.right;
  };

  /** The way a fill is heading: whichever axis the pointer has travelled furthest. */
  const fillRect = (() => {
    if (!fillTo || !area || fillTo.group !== area.group) return null;
    const row = fillTo.row;
    const column = flatColumns.indexOf(fillTo.dept);
    if (column === -1) return null;
    const down = row - area.bottom;
    const right = column - area.right;
    if (down <= 0 && right <= 0) return null;
    if (right > down) return { top: area.top, bottom: area.bottom, left: area.right + 1, right: column };
    return { top: area.bottom + 1, bottom: row, left: area.left, right: area.right };
  })();

  const inFillPreview = (groupKey: string, deptId: string, row: number) => {
    if (!fillRect || !area || area.group !== groupKey) return false;
    const column = flatColumns.indexOf(deptId);
    return row >= fillRect.top && row <= fillRect.bottom && column >= fillRect.left && column <= fillRect.right;
  };

  /**
   * Write a title into each named cell, creating the job where the slot is
   * still empty. Everything goes in one round trip so a filled block either
   * lands or does not, rather than half landing.
   */
  const writeCells = async (entries: Array<{ dept: string; row: number; title: string }>, groupKey: string) => {
    if (!canEdit || busyRef.current || entries.length === 0) return;
    const updates: Array<{ id: string; title: string }> = [];
    const before: Array<{ id: string; values: { title: string } }> = [];
    const inserts: TaskInput[] = [];
    const orders = new Map<string, number>();
    for (const entry of entries) {
      const existing = groupByKey.get(groupKey)?.columns.get(entry.dept) ?? [];
      const task = existing[entry.row];
      if (task) {
        if (task.title === entry.title) continue;
        updates.push({ id: task.id, title: entry.title });
        before.push({ id: task.id, values: { title: task.title } });
      } else {
        const order = orders.get(entry.dept) ?? nextSortOrder(groupKey, entry.dept);
        inserts.push(newTask(groupKey, entry.dept, entry.title, order));
        orders.set(entry.dept, order + 1);
      }
    }
    if (updates.length === 0 && inserts.length === 0) return;
    busyRef.current = true;
    try {
      if (updates.length > 0) {
        await updateTasks.mutateAsync(updates);
        pushUndo({ kind: 'update', patches: before });
      }
      if (inserts.length > 0) {
        const created = await createTasks.mutateAsync(inserts);
        pushUndo({ kind: 'create', ids: created.map((task) => task.id) });
      }
    } catch {
      toast(t('common.errorGeneric'), 'error');
    } finally {
      busyRef.current = false;
    }
  };

  /** Every job inside the selected block, read left to right then down. */
  const areaTasks = (): EventTask[] => {
    if (!area) return [];
    const found: EventTask[] = [];
    for (let row = area.top; row <= area.bottom; row += 1) {
      for (let column = area.left; column <= area.right; column += 1) {
        const task = taskAt(area.group, flatColumns[column] ?? '', row);
        if (task) found.push(task);
      }
    }
    return found;
  };

  const removeTasks = async (list: EventTask[]) => {
    if (!canEdit || busyRef.current || list.length === 0) return;
    busyRef.current = true;
    try {
      const ids = list.map((task) => task.id);
      await deleteTasks.mutateAsync(ids);
      pushUndo({ kind: 'delete', ids });
      toast(t('grid.deletedUndoHint'));
    } catch {
      toast(t('common.errorGeneric'), 'error');
    } finally {
      busyRef.current = false;
    }
  };

  const applyFill = async (to: Cell) => {
    if (!area || !fillRect || to.group !== area.group) return;
    const height = area.bottom - area.top + 1;
    const width = area.right - area.left + 1;
    const entries: Array<{ dept: string; row: number; title: string }> = [];
    for (let row = fillRect.top; row <= fillRect.bottom; row += 1) {
      for (let column = fillRect.left; column <= fillRect.right; column += 1) {
        const dept = flatColumns[column];
        if (!dept) continue;
        // The block repeats, so a pair of jobs fills as a pair over and over
        const fromRow = area.top + (((row - area.top) % height) + height) % height;
        const fromColumn = area.left + (((column - area.left) % width) + width) % width;
        const source = taskAt(area.group, flatColumns[fromColumn] ?? '', fromRow);
        if (!source || !source.title.trim()) continue;
        entries.push({ dept, row, title: source.title });
      }
    }
    if (entries.length === 0) return;
    await writeCells(entries, area.group);
  };

  /**
   * Carry a job to another department column or another session. The column it
   * lands in is renumbered so it sits exactly where it was dropped, and the
   * placement it came from is kept so the drop can be undone.
   */
  const carryTo = async (task: EventTask, target: Cell) => {
    if (!canEdit || busyRef.current) return;
    const column = groupByKey.get(target.group)?.columns.get(target.dept) ?? [];
    const without = column.filter((item) => item.id !== task.id);
    const at = Math.min(Math.max(target.row, 0), without.length);
    const ordered = [...without.slice(0, at), task, ...without.slice(at)];
    const patches: Array<{ id: string; sort_order: number; session_id?: string | null; department_id?: string }> = [];
    const undo: Placement[] = [];
    ordered.forEach((item, order) => {
      const moved = item.id === task.id;
      const placed = moved && (
        (task.session_id ?? '') !== target.group || task.department_id !== target.dept
      );
      if (item.sort_order === order && !placed) return;
      undo.push({
        id: item.id,
        session_id: item.session_id ?? null,
        department_id: item.department_id,
        sort_order: item.sort_order
      });
      patches.push({
        id: item.id,
        sort_order: order,
        ...(placed ? { session_id: target.group || null, department_id: target.dept } : {})
      });
    });
    if (patches.length === 0) return;
    busyRef.current = true;
    try {
      await updateTasks.mutateAsync(patches);
      pushUndo({ kind: 'placement', patches: undo });
      setCursor({ group: target.group, dept: target.dept, row: at });
      setFocus(null);
      toast(t('grid.taskMoved'));
    } catch {
      toast(t('common.errorGeneric'), 'error');
    } finally {
      busyRef.current = false;
    }
  };

  // A drag that ends anywhere, including outside the table, still settles
  useEffect(() => {
    const stop = () => {
      if (dragMode.current === 'fill' && fillTo) void applyFill(fillTo);
      dragMode.current = 'none';
      setFillTo(null);
    };
    document.addEventListener('mouseup', stop);
    return () => document.removeEventListener('mouseup', stop);
  });

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (editing || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || context) return;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key;
    if (mod && key.toLowerCase() === 'z') { event.preventDefault(); void travel(event.shiftKey); return; }
    if (mod && key.toLowerCase() === 'y') { event.preventDefault(); void travel(true); return; }
    if (mod) return;
    if (event.shiftKey && cursor && (key === 'ArrowDown' || key === 'ArrowUp' || key === 'ArrowLeft' || key === 'ArrowRight')) {
      event.preventDefault();
      const from = focus && focus.group === cursor.group ? focus : cursor;
      const column = flatColumns.indexOf(from.dept);
      const limit = groups.find((group) => group.key === cursor.group)?.rows ?? 0;
      if (key === 'ArrowDown' || key === 'ArrowUp') {
        const row = Math.min(Math.max(from.row + (key === 'ArrowDown' ? 1 : -1), 0), limit);
        setFocus({ group: cursor.group, dept: from.dept, row });
      } else {
        const next = Math.min(Math.max(column + (key === 'ArrowRight' ? 1 : -1), 0), flatColumns.length - 1);
        setFocus({ group: cursor.group, dept: flatColumns[next], row: from.row });
      }
      return;
    }
    if (key === 'ArrowDown') { event.preventDefault(); setFocus(null); move(1, 0); return; }
    if (key === 'ArrowUp') { event.preventDefault(); setFocus(null); move(-1, 0); return; }
    if (key === 'ArrowLeft') { event.preventDefault(); setFocus(null); move(0, -1); return; }
    if (key === 'ArrowRight' || key === 'Tab') { event.preventDefault(); setFocus(null); move(0, event.shiftKey && key === 'Tab' ? -1 : 1); return; }
    if (key === 'Escape') { event.preventDefault(); setCursor(null); setFocus(null); return; }
    if ((key === 'Enter' || key === 'F2') && cursor && canEdit) {
      event.preventDefault();
      setEditing({ ...cursor, initial: null });
      return;
    }
    if ((key === 'Delete' || key === 'Backspace') && cursor && canEdit) {
      event.preventDefault();
      const picked = areaTasks();
      if (picked.length > 1) void removeTasks(picked);
      else if (picked.length === 1) void removeTask(picked[0]);
      return;
    }
    if (canEdit && cursor && key.length === 1 && !event.altKey) {
      event.preventDefault();
      setEditing({ ...cursor, initial: key });
    }
  };

  const onPaste = (event: React.ClipboardEvent) => {
    if (editing || !canEdit || !cursor) return;
    const text = event.clipboardData.getData('text/plain');
    if (!text) return;
    event.preventDefault();
    const table = parseClipboardTable(text);
    const colIndex = flatColumns.indexOf(cursor.dept);
    // A block of columns lands across the departments to the right, one column each
    if (table.some((row) => row.length > 1)) {
      const width = Math.max(...table.map((row) => row.length));
      for (let c = 0; c < width; c += 1) {
        const dept = flatColumns[colIndex + c];
        if (!dept) break;
        const titles = table.map((row) => (row[c] ?? '').trim()).filter(Boolean);
        if (titles.length > 0) void writeColumn(cursor.group, dept, cursor.row, titles);
      }
      return;
    }
    const titles = table.map((row) => (row[0] ?? '').trim()).filter(Boolean);
    if (titles.length > 0) void writeColumn(cursor.group, cursor.dept, cursor.row, titles);
  };

  const onCopy = (event: React.ClipboardEvent) => {
    if (editing || !area) return;
    // A block copies as a block, so it can go straight into a spreadsheet
    const table: string[][] = [];
    for (let row = area.top; row <= area.bottom; row += 1) {
      const line: string[] = [];
      for (let column = area.left; column <= area.right; column += 1) {
        line.push(taskAt(area.group, flatColumns[column] ?? '', row)?.title ?? '');
      }
      table.push(line);
    }
    if (table.every((line) => line.every((value) => !value))) return;
    event.preventDefault();
    event.clipboardData.setData('text/plain', toClipboardTable(table));
  };

  const commitEdit = async (raw: string, cell: { group: string; dept: string; row: number }, after: 'down' | 'stay') => {
    setEditing(null);
    containerRef.current?.focus();
    const title = raw.trim();
    const task = taskAt(cell.group, cell.dept, cell.row);
    if (!title) {
      // Emptying a cell takes the job off the sheet, the way a spreadsheet would
      if (task) await removeTask(task);
      return;
    }
    if (task?.title === title) {
      if (after === 'down') move(1, 0);
      return;
    }
    await writeColumn(cell.group, cell.dept, cell.row, [title]);
    if (after === 'down' && task) move(1, 0);
  };

  const cursorTask = cursor ? taskAt(cursor.group, cursor.dept, cursor.row) : null;
  const text = (th: string, en: string) => (lang === 'th' ? th : en);
  const contextActions: ContextAction[] = [
    { label: text('รายละเอียดงาน', 'Task details'), disabled: !cursorTask, onSelect: () => cursorTask && onOpenTask(cursorTask) },
    { label: t('grid.openFullForm'), disabled: !cursorTask || !canEdit, onSelect: () => cursorTask && onEditTask(cursorTask) },
    { label: text('แก้ไขข้อความ', 'Edit text'), shortcut: 'F2', divider: true, disabled: !cursor || !canEdit, onSelect: () => cursor && setEditing({ ...cursor, initial: null }) },
    { label: text('ทำสำเนา', 'Duplicate'), disabled: !cursorTask || !canEdit, onSelect: () => cursorTask && void duplicateTask(cursorTask) },
    { label: cursorTask?.status === 'completed' ? text('ยกเลิกเสร็จแล้ว', 'Mark not started') : text('ทำเครื่องหมายว่าเสร็จ', 'Mark completed'), disabled: !cursorTask || !canEdit, onSelect: () => cursorTask && void toggleDone(cursorTask) },
    { label: text('ลบงานนี้', 'Delete task'), shortcut: 'Delete', danger: true, disabled: !cursorTask || !canEdit, onSelect: () => cursorTask && void removeTask(cursorTask) },
    { label: t('grid.undo'), shortcut: 'Ctrl+Z', divider: true, disabled: !depth.undo || !canEdit, onSelect: () => void travel() },
    { label: text('ทำซ้ำอีกครั้ง', 'Redo'), shortcut: 'Ctrl+Y', disabled: !depth.redo || !canEdit, onSelect: () => void travel(true) }
  ];

  const toolbarButton =
    'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-navy-700 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800';

  if (columns.length === 0) {
    return <p className="px-4 py-8 text-center text-sm italic text-slate-400">{t('tasks.noTasks')}</p>;
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 p-2 dark:border-slate-800">
        {canEdit && onAddSession && (
          <button type="button" className={toolbarButton} onClick={onAddSession} disabled={busy}>
            <Layers className="h-3.5 w-3.5" /> {t('grid.addSession')}
          </button>
        )}
        {canEdit && (
          <>
            <button type="button" className={toolbarButton} disabled={!depth.undo || busy} onClick={() => void travel()}>
              <Undo2 className="h-3.5 w-3.5" /> {t('grid.undo')}
            </button>
            <button type="button" className={toolbarButton} disabled={!depth.redo || busy} onClick={() => void travel(true)}>
              <Redo2 className="h-3.5 w-3.5" /> {text('ทำซ้ำอีกครั้ง', 'Redo')}
            </button>
          </>
        )}
        <span className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-slate-400">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {t('grid.boardHint')}
        </span>
      </div>

      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onCopy={onCopy}
        aria-label={t('grid.boardLayout')}
        className="max-h-[72vh] overflow-auto outline-none"
      >
        <table className="w-full min-w-[720px] select-none border-separate border-spacing-0 text-[13px]">
          <colgroup>
            {columns.map((dept) => (
              <col key={dept.id} style={{ width: `${100 / columns.length}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columns.map((dept) => {
                const Icon = departmentIcon(dept.icon);
                return (
                  <th
                    key={dept.id}
                    scope="col"
                    className="sticky top-0 z-10 border-b-2 border-r border-white/20 px-3 py-2.5 text-center text-sm font-extrabold"
                    style={{ backgroundColor: dept.color, color: readableTextColor(dept.color) }}
                  >
                    <span className="inline-flex items-center justify-center gap-2">
                      <Icon className="h-4 w-4 shrink-0" /> {deptName(dept)}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const color = group.session ? sessionColor(sessions, group.session.id) : '#64748b';
              const session = group.session;
              const done = [...group.columns.values()].flat().filter((task) => task.status === 'completed').length;
              const total = [...group.columns.values()].flat().length;
              return (
                <Fragment key={group.key || 'general'}>
                  <tr>
                    <td
                      colSpan={columns.length}
                      data-board-band={group.key || 'general'}
                      className="border-b border-t border-slate-200 px-3 py-2 dark:border-slate-700"
                      style={{
                        backgroundColor: lightenColor(color, 0.86),
                        color: darkenColor(color, 0.7),
                        borderLeft: `5px solid ${color}`
                      }}
                    >
                      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center">
                        <span className="text-sm font-extrabold">
                          {session ? session.title || formatDate(session.session_date, lang, 'EEEE d MMMM') : t('sessions.generalTasks')}
                        </span>
                        {session && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold opacity-80">
                            <CalendarDays className="h-3.5 w-3.5" /> {formatDate(session.session_date, lang)}
                          </span>
                        )}
                        {session?.location && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold opacity-80">
                            <MapPin className="h-3.5 w-3.5" /> {session.location}
                          </span>
                        )}
                        {session?.start_time && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold tabular-nums opacity-80">
                            <Clock className="h-3.5 w-3.5" /> {formatTime(session.start_time, lang)}
                            {session.end_time && <> - {formatTime(session.end_time, lang)}</>}
                          </span>
                        )}
                        {session?.time_note && <span className="text-xs font-semibold opacity-80">{session.time_note}</span>}
                        {session?.is_hidden && (
                          <span
                            title={t('sessions.hiddenHint')}
                            className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[0.65rem] font-extrabold text-amber-800"
                          >
                            <EyeOff className="h-3 w-3" /> {t('sessions.hiddenOnBoard')}
                          </span>
                        )}
                        {total > 0 && (
                          <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-extrabold tabular-nums">
                            {done}/{total}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>

                  {Array.from({ length: group.rows + (canEdit ? 1 : 0) }, (_, row) => (
                    <tr key={`${group.key}-${row}`}>
                      {columns.map((dept) => {
                        const task = group.columns.get(dept.id)?.[row] ?? null;
                        const here =
                          cursor?.group === group.key && cursor.dept === dept.id && cursor.row === row;
                        const isEditing =
                          editing?.group === group.key && editing.dept === dept.id && editing.row === row;
                        const completed = task?.status === 'completed';
                        const picked = inArea(group.key, dept.id, row);
                        const filling = inFillPreview(group.key, dept.id, row);
                        const isDropTarget =
                          !!dropAt && dropAt.group === group.key && dropAt.dept === dept.id && dropAt.row === row;
                        const isFillCorner =
                          !!area && area.group === group.key && row === area.bottom
                          && flatColumns.indexOf(dept.id) === area.right;
                        return (
                          <td
                            key={dept.id}
                            data-board-cell={`${group.key || 'general'}|${dept.id}|${row}`}
                            onMouseDown={(event) => {
                              if (isEditing || event.button !== 0) return;
                              containerRef.current?.focus();
                              dragMode.current = 'select';
                              if (event.shiftKey && cursor?.group === group.key) {
                                setFocus({ group: group.key, dept: dept.id, row });
                              } else {
                                setCursor({ group: group.key, dept: dept.id, row });
                                setFocus(null);
                              }
                            }}
                            onMouseEnter={() => {
                              if (dragMode.current === 'select' && cursor?.group === group.key) {
                                setFocus({ group: group.key, dept: dept.id, row });
                              }
                              if (dragMode.current === 'fill') setFillTo({ group: group.key, dept: dept.id, row });
                            }}
                            onDragOver={(event) => {
                              if (!canEdit || !carrying.current) return;
                              event.preventDefault();
                              event.dataTransfer.dropEffect = 'move';
                              if (!isDropTarget) setDropAt({ group: group.key, dept: dept.id, row });
                            }}
                            onDragLeave={() => { if (isDropTarget) setDropAt(null); }}
                            onDrop={(event) => {
                              if (!canEdit) return;
                              event.preventDefault();
                              const moved = carrying.current;
                              carrying.current = null;
                              setDropAt(null);
                              if (moved) void carryTo(moved, { group: group.key, dept: dept.id, row });
                            }}
                            onDoubleClick={() => canEdit && setEditing({ group: group.key, dept: dept.id, row, initial: null })}
                            onContextMenu={(event) => {
                              if (isEditing) return;
                              event.preventDefault();
                              setCursor({ group: group.key, dept: dept.id, row });
                              setContext({ x: event.clientX, y: event.clientY });
                            }}
                            className={cn(
                              'group/cell relative border-b border-r border-slate-100 p-0 align-top dark:border-slate-800',
                              here && 'outline outline-2 -outline-offset-2 outline-navy-600 dark:outline-gold-400',
                              completed && 'bg-emerald-50/60 dark:bg-emerald-950/20',
                              picked && !here && 'bg-navy-100/70 dark:bg-navy-800/50',
                              filling && 'bg-gold-100/70 dark:bg-gold-900/30',
                              isDropTarget && 'outline-dashed outline-2 -outline-offset-2 outline-navy-500 dark:outline-gold-300'
                            )}
                          >
                            {isEditing ? (
                              <BoardCellEditor
                                value={task?.title ?? ''}
                                initial={editing?.initial ?? null}
                                onCommit={(raw, after) => void commitEdit(raw, { group: group.key, dept: dept.id, row }, after)}
                                onCancel={() => { setEditing(null); containerRef.current?.focus(); }}
                              />
                            ) : task ? (
                              <div className="flex min-h-[38px] gap-1.5 px-2 py-1.5">
                                {canEdit && (
                                  <span
                                    data-board-grip="true"
                                    title={t('grid.dragToMove')}
                                    draggable={!busy}
                                    onDragStart={(event) => {
                                      // A carry is not a sweep, so the selection stops following the pointer
                                      dragMode.current = 'none';
                                      carrying.current = task;
                                      event.dataTransfer.effectAllowed = 'move';
                                      event.dataTransfer.setData('text/plain', task.title);
                                    }}
                                    onDragEnd={() => { carrying.current = null; setDropAt(null); }}
                                    className="mt-0.5 flex h-4 w-3 shrink-0 cursor-grab items-center justify-center text-slate-300 opacity-0 transition-opacity active:cursor-grabbing group-hover/cell:opacity-100 dark:text-slate-600"
                                  >
                                    <GripVertical className="h-3.5 w-3.5" />
                                  </span>
                                )}
                                <button
                                  type="button"
                                  disabled={!canEdit}
                                  onClick={(event) => { event.stopPropagation(); void toggleDone(task); }}
                                  title={t('display.tapToComplete')}
                                  aria-label={t('display.tapToComplete')}
                                  aria-pressed={completed}
                                  className={cn(
                                    'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors',
                                    completed
                                      ? 'border-emerald-500 bg-emerald-500 text-white'
                                      : 'border-slate-300 hover:border-emerald-400 dark:border-slate-600'
                                  )}
                                  style={!completed ? { borderColor: TASK_STATUS_DOTS[task.status as TaskStatus] } : undefined}
                                >
                                  {completed && <Check className="h-3 w-3 animate-tick-pop" strokeWidth={3} />}
                                </button>
                                <span className="min-w-0 flex-1">
                                  <span
                                    className={cn(
                                      'block whitespace-pre-wrap break-words leading-snug',
                                      completed && 'text-slate-400 line-through'
                                    )}
                                  >
                                    {task.title || <span className="italic text-slate-300">{t('tasks.taskTitle')}</span>}
                                  </span>
                                  {(task.assigned_staff || task.start_time) && (
                                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-slate-400">
                                      {task.assigned_staff && (
                                        <span className="inline-flex items-center gap-1">
                                          <User className="h-3 w-3" /> {task.assigned_staff}
                                        </span>
                                      )}
                                      {task.start_time && (
                                        <span className="inline-flex items-center gap-1 tabular-nums">
                                          <Clock className="h-3 w-3" /> {extractTime(task.start_time)}
                                          {task.completion_time && <> - {extractTime(task.completion_time)}</>}
                                        </span>
                                      )}
                                    </span>
                                  )}
                                </span>
                                <button
                                  type="button"
                                  onClick={(event) => { event.stopPropagation(); canEdit ? onEditTask(task) : onOpenTask(task); }}
                                  title={canEdit ? t('grid.openFullForm') : t('tasks.taskDetails')}
                                  className="mt-0.5 h-5 shrink-0 rounded text-slate-300 opacity-0 transition-opacity hover:text-navy-700 focus:opacity-100 group-hover/cell:opacity-100 dark:hover:text-gold-300"
                                >
                                  <Maximize2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div
                                className={cn(
                                  'flex min-h-[38px] items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-slate-300 transition-opacity',
                                  here ? 'opacity-100' : 'opacity-0 group-hover/cell:opacity-100'
                                )}
                              >
                                {canEdit && <><Plus className="h-3 w-3" /> {t('grid.typeToAdd')}</>}
                              </div>
                            )}
                            {canEdit && isFillCorner && !isEditing && (
                              <span
                                data-board-fill="true"
                                title={t('grid.fillHandle')}
                                onMouseDown={(event) => {
                                  event.stopPropagation();
                                  event.preventDefault();
                                  dragMode.current = 'fill';
                                  setFillTo({ group: group.key, dept: dept.id, row });
                                }}
                                className="absolute -bottom-[3px] -right-[3px] z-[2] h-2.5 w-2.5 cursor-crosshair rounded-[2px] border border-white bg-navy-600 dark:border-slate-900 dark:bg-gold-400"
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {context && (
        <ContextMenu
          x={context.x}
          y={context.y}
          title={cursorTask?.title || t('grid.boardLayout')}
          actions={contextActions}
          onClose={() => { setContext(null); containerRef.current?.focus(); }}
        />
      )}
    </>
  );
}

/** A cell editor that grows with the text, because these jobs are written as sentences. */
function BoardCellEditor({
  value, initial, onCommit, onCancel
}: {
  value: string;
  initial: string | null;
  onCommit: (raw: string, after: 'down' | 'stay') => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState(initial ?? value);
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);

  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    const end = input.value.length;
    input.setSelectionRange(end, end);
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  }, []);

  const finish = (after: 'down' | 'stay') => {
    if (done.current) return;
    done.current = true;
    onCommit(draft, after);
  };

  return (
    <textarea
      ref={ref}
      autoFocus
      rows={1}
      aria-label={t('tasks.taskTitle')}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        event.target.style.height = 'auto';
        event.target.style.height = `${event.target.scrollHeight}px`;
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); finish('down'); return; }
        if (event.key === 'Tab') { event.preventDefault(); finish('stay'); return; }
        if (event.key === 'Escape') { event.preventDefault(); done.current = true; onCancel(); }
      }}
      onBlur={() => finish('stay')}
      className="block w-full select-text resize-none border-0 bg-white px-2.5 py-1.5 text-[13px] leading-snug text-slate-800 outline-none ring-2 ring-inset ring-navy-600 dark:bg-slate-900 dark:text-slate-100 dark:ring-gold-400"
    />
  );
}
