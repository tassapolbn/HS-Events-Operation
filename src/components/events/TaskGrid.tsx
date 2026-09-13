import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine, Check, ClipboardPaste, Columns3, Copy, CopyPlus, Keyboard, Maximize2, Plus, Trash2, Undo2
} from 'lucide-react';
import { en } from '../../i18n/en';
import { th } from '../../i18n/th';
import { useLanguage, type TKey } from '../../i18n';
import { useToast } from '../ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { useTaskMutations, type TaskInput, type TaskPatch } from '../../hooks/useTasks';
import { PRIORITIES, TASK_STATUSES, TASK_STATUS_DOTS } from '../../lib/constants';
import { cn, combineDateTime, extractTime, formatDate } from '../../lib/utils';
import { matchOption, normalizeTimeInput, parseClipboardTable, toClipboardTable } from '../../lib/grid';
import { copyTasks, getTaskClipboard, taskToClipboardItem, useTaskClipboard } from '../../lib/taskClipboard';
import type { Department, EventSession, EventTask, Priority, TaskStatus } from '../../types';

/** Every field the grid can edit in a cell. */
export type GridField =
  | 'department_id'
  | 'session_id'
  | 'title'
  | 'assigned_staff'
  | 'work_location'
  | 'setup_location'
  | 'start_time'
  | 'completion_time'
  | 'priority'
  | 'status'
  | 'notes';

type RowValues = Record<GridField, string>;

interface ColumnDef {
  field: GridField;
  labelKey: TKey;
  type: 'text' | 'time' | 'select';
  width: number;
  /** The task title always stays visible */
  fixed?: boolean;
}

const COLUMNS: ColumnDef[] = [
  { field: 'title', labelKey: 'tasks.taskTitle', type: 'text', width: 280, fixed: true },
  { field: 'department_id', labelKey: 'common.department', type: 'select', width: 150 },
  { field: 'session_id', labelKey: 'sessions.title', type: 'select', width: 160 },
  { field: 'assigned_staff', labelKey: 'tasks.assignedStaff', type: 'text', width: 140 },
  { field: 'work_location', labelKey: 'tasks.workLocation', type: 'text', width: 150 },
  { field: 'setup_location', labelKey: 'tasks.setupLocation', type: 'text', width: 150 },
  { field: 'start_time', labelKey: 'tasks.startTime', type: 'time', width: 92 },
  { field: 'completion_time', labelKey: 'tasks.completionTime', type: 'time', width: 92 },
  { field: 'priority', labelKey: 'common.priority', type: 'select', width: 118 },
  { field: 'status', labelKey: 'common.status', type: 'select', width: 132 },
  { field: 'notes', labelKey: 'tasks.departmentNotes', type: 'text', width: 200 }
];

const HIDDEN_COLUMNS_KEY = 'eventops.gridHiddenColumns';

function readHiddenColumns(): GridField[] {
  try {
    const raw = localStorage.getItem(HIDDEN_COLUMNS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const allowed = new Set(COLUMNS.filter((c) => !c.fixed).map((c) => c.field as string));
    return parsed.filter((value): value is GridField => typeof value === 'string' && allowed.has(value));
  } catch {
    return [];
  }
}

function emptyValues(): RowValues {
  return {
    department_id: '',
    session_id: '',
    title: '',
    assigned_staff: '',
    work_location: '',
    setup_location: '',
    start_time: '',
    completion_time: '',
    priority: 'medium',
    status: 'not_started',
    notes: ''
  };
}

function toRowValues(task: EventTask): RowValues {
  return {
    department_id: task.department_id,
    session_id: task.session_id ?? '',
    title: task.title,
    assigned_staff: task.assigned_staff,
    work_location: task.work_location,
    setup_location: task.setup_location,
    start_time: extractTime(task.start_time) ?? '',
    completion_time: extractTime(task.completion_time) ?? '',
    priority: task.priority,
    status: task.status,
    notes: task.notes
  };
}

interface GridRow {
  task: EventTask;
  values: RowValues;
  groupKey: string;
}

interface Selection {
  /** anchor: the active cell */
  r: number;
  c: number;
  /** focus: the far corner of the range */
  r2: number;
  c2: number;
}

type UndoEntry =
  | { kind: 'update'; patches: Array<{ id: string; values: Partial<RowValues> }> }
  | { kind: 'create'; ids: string[] }
  | { kind: 'delete'; ids: string[] };

interface TaskGridProps {
  eventId: string;
  eventDate: string;
  tasks: EventTask[];
  departments: Department[];
  sessions: EventSession[];
  canEdit: boolean;
  /** Opens the read only detail panel */
  onOpenTask: (task: EventTask) => void;
  /** Opens the full form, for description, instructions and attachments */
  onEditTask: (task: EventTask) => void;
}

export function TaskGrid({
  eventId, eventDate, tasks, departments, sessions, canEdit, onOpenTask, onEditTask
}: TaskGridProps) {
  const { t, deptName, lang } = useLanguage();
  const { toast } = useToast();
  const { profile } = useAuth();
  const { createTasks, updateTasks, deleteTasks, restoreTasks } = useTaskMutations(eventId);
  const clipboard = useTaskClipboard();

  const containerRef = useRef<HTMLDivElement>(null);
  const undoStack = useRef<UndoEntry[]>([]);
  const dragMode = useRef<'none' | 'select' | 'fill'>('none');
  const focusAfterCreate = useRef<{ id: string; field: GridField } | null>(null);

  const [hiddenColumns, setHiddenColumns] = useState<GridField[]>(readHiddenColumns);
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [sel, setSel] = useState<Selection | null>(null);
  const [editing, setEditing] = useState<{ r: number; c: number; initial: string | null } | null>(null);
  const [pending, setPending] = useState<Record<string, Partial<RowValues>>>({});
  const [fillTo, setFillTo] = useState<number | null>(null);
  const [undoDepth, setUndoDepth] = useState(0);

  const columns = useMemo(
    () => COLUMNS.filter((column) => column.fixed || !hiddenColumns.includes(column.field)),
    [hiddenColumns]
  );

  useEffect(() => {
    try {
      localStorage.setItem(HIDDEN_COLUMNS_KEY, JSON.stringify(hiddenColumns));
    } catch {
      // Storage can be blocked; the grid still works for this visit
    }
  }, [hiddenColumns]);

  // ---------- rows, ordered the way the board reads: session, department, then task order ----------

  const sessionLabel = useCallback(
    (session: EventSession) => {
      const date = formatDate(session.session_date, lang, 'd MMM');
      const parts = [session.title || date];
      if (session.title) parts.push(date);
      if (session.location) parts.push(session.location);
      return parts.join(' - ');
    },
    [lang]
  );

  const { rows, bands } = useMemo(() => {
    const deptOrder = new Map(departments.map((dept, index) => [dept.id, index]));
    const sessionOrder = new Map(sessions.map((session, index) => [session.id, index + 1]));
    const groupOf = (task: EventTask) =>
      task.session_id && sessionOrder.has(task.session_id) ? task.session_id : '';

    const ordered = [...tasks].sort((a, b) => {
      const ga = sessionOrder.get(groupOf(a)) ?? 0;
      const gb = sessionOrder.get(groupOf(b)) ?? 0;
      return (
        ga - gb ||
        (deptOrder.get(a.department_id) ?? 99) - (deptOrder.get(b.department_id) ?? 99) ||
        a.sort_order - b.sort_order ||
        a.created_at.localeCompare(b.created_at)
      );
    });

    const built: GridRow[] = ordered.map((task) => ({
      task,
      values: { ...toRowValues(task), ...(pending[task.id] ?? {}) },
      groupKey: groupOf(task)
    }));

    const labels = new Map<number, string>();
    let previous: string | null = null;
    built.forEach((row, index) => {
      if (row.groupKey === previous) return;
      previous = row.groupKey;
      if (!row.groupKey) {
        if (sessions.length > 0) labels.set(index, t('sessions.generalTasks'));
        return;
      }
      const session = sessions.find((item) => item.id === row.groupKey);
      if (session) labels.set(index, sessionLabel(session));
    });

    return { rows: built, bands: labels };
  }, [tasks, departments, sessions, pending, sessionLabel, t]);

  const rowById = useMemo(() => new Map(rows.map((row) => [row.task.id, row])), [rows]);

  // Drop optimistic values once the server confirms them
  useEffect(() => {
    setPending((prev) => {
      const ids = Object.keys(prev);
      if (ids.length === 0) return prev;
      const serverById = new Map(tasks.map((task) => [task.id, toRowValues(task)]));
      const next: Record<string, Partial<RowValues>> = {};
      let changed = false;
      for (const id of ids) {
        const server = serverById.get(id);
        if (!server) {
          changed = true;
          continue;
        }
        const remaining: Partial<RowValues> = {};
        let kept = 0;
        for (const [field, value] of Object.entries(prev[id]) as Array<[GridField, string]>) {
          if (server[field] === value) changed = true;
          else {
            remaining[field] = value;
            kept += 1;
          }
        }
        if (kept > 0) next[id] = remaining;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [tasks]);

  // Keep the selection inside the grid as rows come and go
  useEffect(() => {
    setSel((prev) => {
      if (!prev) return prev;
      if (rows.length === 0) return null;
      const maxRow = rows.length - 1;
      const maxCol = columns.length - 1;
      const clamped: Selection = {
        r: Math.min(prev.r, maxRow),
        c: Math.min(prev.c, maxCol),
        r2: Math.min(prev.r2, maxRow),
        c2: Math.min(prev.c2, maxCol)
      };
      const same =
        clamped.r === prev.r && clamped.c === prev.c && clamped.r2 === prev.r2 && clamped.c2 === prev.c2;
      return same ? prev : clamped;
    });
  }, [rows.length, columns.length]);

  // After a row is created, put the cursor in it so typing can continue
  useEffect(() => {
    const target = focusAfterCreate.current;
    if (!target) return;
    const rowIndex = rows.findIndex((row) => row.task.id === target.id);
    if (rowIndex === -1) return;
    const colIndex = columns.findIndex((column) => column.field === target.field);
    focusAfterCreate.current = null;
    setSel({ r: rowIndex, c: Math.max(colIndex, 0), r2: rowIndex, c2: Math.max(colIndex, 0) });
    containerRef.current?.focus();
  }, [rows, columns]);

  // End a drag even if the pointer leaves the table
  useEffect(() => {
    const stop = () => {
      if (dragMode.current === 'fill' && fillTo !== null) void applyFill(fillTo);
      dragMode.current = 'none';
      setFillTo(null);
    };
    document.addEventListener('mouseup', stop);
    return () => document.removeEventListener('mouseup', stop);
  });

  useEffect(() => {
    if (!sel) return;
    const cell = containerRef.current?.querySelector(`[data-cell="${sel.r}-${sel.c}"]`);
    (cell as HTMLElement | null)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [sel]);

  // Escape closes the toolbar menus
  useEffect(() => {
    if (!columnMenuOpen && !helpOpen) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setColumnMenuOpen(false);
      setHelpOpen(false);
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [columnMenuOpen, helpOpen]);

  // ---------- option lists, matched in both languages when pasting ----------

  const deptOptions = useMemo(
    () => departments.map((dept) => ({ value: dept.id, labels: [dept.code, dept.name_en, dept.name_th] })),
    [departments]
  );
  const sessionOptions = useMemo(
    () =>
      sessions.map((session) => ({
        value: session.id,
        labels: [session.title, session.session_date, sessionLabel(session)].filter(Boolean)
      })),
    [sessions, sessionLabel]
  );
  const priorityOptions = useMemo(
    () => PRIORITIES.map((value) => ({ value, labels: [en.priority[value], th.priority[value]] })),
    []
  );
  const statusOptions = useMemo(
    () => TASK_STATUSES.map((value) => ({ value, labels: [en.taskStatus[value], th.taskStatus[value]] })),
    []
  );

  const optionsFor = useCallback(
    (field: GridField) => {
      if (field === 'department_id') return deptOptions;
      if (field === 'session_id') return sessionOptions;
      if (field === 'priority') return priorityOptions;
      if (field === 'status') return statusOptions;
      return [];
    },
    [deptOptions, sessionOptions, priorityOptions, statusOptions]
  );

  const displayValue = useCallback(
    (row: GridRow, column: ColumnDef): string => {
      const value = row.values[column.field];
      if (column.field === 'department_id') return deptName(departments.find((dept) => dept.id === value));
      if (column.field === 'session_id') {
        const session = sessions.find((item) => item.id === value);
        return session ? sessionLabel(session) : t('sessions.whole');
      }
      if (column.field === 'priority') return t(`priority.${value as Priority}`);
      if (column.field === 'status') return t(`taskStatus.${value as TaskStatus}`);
      return value;
    },
    [departments, sessions, deptName, sessionLabel, t]
  );

  const parseCellInput = useCallback(
    (column: ColumnDef, raw: string): string | null => {
      if (column.type === 'text') return raw.replace(/\s+$/, '');
      if (column.type === 'time') {
        if (raw.trim() === '') return '';
        return normalizeTimeInput(raw) || null;
      }
      if (column.field === 'session_id' && raw.trim() === '') return '';
      return matchOption(raw, optionsFor(column.field));
    },
    [optionsFor]
  );

  // ---------- writing ----------

  const toDbPatch = useCallback(
    (values: Partial<RowValues>): TaskInput => {
      const patch: TaskInput = {};
      for (const [field, value] of Object.entries(values) as Array<[GridField, string]>) {
        switch (field) {
          case 'department_id':
            if (value) patch.department_id = value;
            break;
          case 'session_id':
            patch.session_id = value || null;
            break;
          case 'title':
            patch.title = value;
            break;
          case 'assigned_staff':
            patch.assigned_staff = value;
            break;
          case 'work_location':
            patch.work_location = value;
            break;
          case 'setup_location':
            patch.setup_location = value;
            break;
          case 'notes':
            patch.notes = value;
            break;
          case 'start_time':
            patch.start_time = combineDateTime(eventDate, value || null);
            break;
          case 'completion_time':
            patch.completion_time = combineDateTime(eventDate, value || null);
            break;
          case 'priority':
            if ((PRIORITIES as string[]).includes(value)) patch.priority = value as Priority;
            break;
          case 'status':
            if ((TASK_STATUSES as string[]).includes(value)) patch.status = value as TaskStatus;
            break;
        }
      }
      return patch;
    },
    [eventDate]
  );

  const pushUndo = useCallback((entry: UndoEntry) => {
    undoStack.current.push(entry);
    if (undoStack.current.length > 30) undoStack.current.shift();
    setUndoDepth(undoStack.current.length);
  }, []);

  const commitUpdates = useCallback(
    async (changes: Array<{ id: string; values: Partial<RowValues> }>, undoable = true) => {
      const real = changes.filter((change) => Object.keys(change.values).length > 0);
      if (!canEdit || real.length === 0) return;

      const before = real.map(({ id, values }) => {
        const row = rowById.get(id);
        const previous: Partial<RowValues> = {};
        if (row) for (const field of Object.keys(values) as GridField[]) previous[field] = row.values[field];
        return { id, values: previous };
      });

      setPending((prev) => {
        const next = { ...prev };
        for (const { id, values } of real) next[id] = { ...(next[id] ?? {}), ...values };
        return next;
      });
      if (undoable) pushUndo({ kind: 'update', patches: before });

      try {
        const patches: TaskPatch[] = real.map(({ id, values }) => ({ id, ...toDbPatch(values) }));
        await updateTasks.mutateAsync(patches);
      } catch {
        setPending((prev) => {
          const next = { ...prev };
          for (const { id, values } of real) {
            const entry = { ...(next[id] ?? {}) };
            for (const field of Object.keys(values) as GridField[]) delete entry[field];
            if (Object.keys(entry).length > 0) next[id] = entry;
            else delete next[id];
          }
          return next;
        });
        toast(t('common.errorGeneric'), 'error');
      }
    },
    [canEdit, rowById, pushUndo, toDbPatch, updateTasks, toast, t]
  );

  const nextSortOrder = useCallback(
    (sessionId: string, departmentId: string) => {
      const group = tasks.filter(
        (task) => (task.session_id ?? '') === sessionId && task.department_id === departmentId
      );
      return group.reduce((max, task) => Math.max(max, task.sort_order), -1) + 1;
    },
    [tasks]
  );

  const toInsert = useCallback(
    (values: RowValues, sortOrder: number, extra?: { description?: string; instructions?: string }): TaskInput => ({
      event_id: eventId,
      department_id: values.department_id || departments[0]?.id,
      session_id: values.session_id || null,
      title: values.title,
      description: extra?.description ?? '',
      instructions: extra?.instructions ?? '',
      work_location: values.work_location,
      setup_location: values.setup_location,
      assigned_staff: values.assigned_staff,
      start_time: combineDateTime(eventDate, values.start_time || null),
      completion_time: combineDateTime(eventDate, values.completion_time || null),
      priority: (PRIORITIES as string[]).includes(values.priority) ? (values.priority as Priority) : 'medium',
      status: (TASK_STATUSES as string[]).includes(values.status) ? (values.status as TaskStatus) : 'not_started',
      notes: values.notes,
      sort_order: sortOrder,
      created_by: profile?.id ?? null
    }),
    [eventId, eventDate, departments, profile?.id]
  );

  const bounds = useMemo(() => {
    if (!sel) return null;
    return {
      top: Math.min(sel.r, sel.r2),
      bottom: Math.max(sel.r, sel.r2),
      left: Math.min(sel.c, sel.c2),
      right: Math.max(sel.c, sel.c2)
    };
  }, [sel]);

  // ---------- selection ----------

  const selectCell = (r: number, c: number, extend = false) => {
    setSel((prev) =>
      extend && prev
        ? { ...prev, r2: Math.max(0, Math.min(r, rows.length - 1)), c2: Math.max(0, Math.min(c, columns.length - 1)) }
        : {
            r: Math.max(0, Math.min(r, rows.length - 1)),
            c: Math.max(0, Math.min(c, columns.length - 1)),
            r2: Math.max(0, Math.min(r, rows.length - 1)),
            c2: Math.max(0, Math.min(c, columns.length - 1))
          }
    );
  };

  const move = (dr: number, dc: number, extend: boolean) => {
    if (!sel) {
      selectCell(0, 0);
      return;
    }
    if (extend) selectCell(sel.r2 + dr, sel.c2 + dc, true);
    else selectCell(sel.r + dr, sel.c + dc);
  };

  const startEdit = (r: number, c: number, initial: string | null = null) => {
    if (!canEdit || !rows[r] || !columns[c]) return;
    setEditing({ r, c, initial });
  };

  // ---------- clipboard ----------

  const selectionAsTable = (): string[][] => {
    if (!bounds) return [];
    const table: string[][] = [];
    for (let r = bounds.top; r <= bounds.bottom; r += 1) {
      const row = rows[r];
      if (!row) continue;
      const cells: string[] = [];
      for (let c = bounds.left; c <= bounds.right; c += 1) cells.push(displayValue(row, columns[c]));
      table.push(cells);
    }
    return table;
  };

  const stashSelectedTasks = () => {
    if (!bounds) return 0;
    const selected = rows.slice(bounds.top, bounds.bottom + 1).map((row) => row.task);
    if (selected.length === 0) return 0;
    copyTasks(selected.map(taskToClipboardItem), `${selected.length} ${t('grid.tasksWord')}`);
    return selected.length;
  };

  const handleCopy = (event: React.ClipboardEvent) => {
    if (editing) return;
    const table = selectionAsTable();
    if (table.length === 0) return;
    event.preventDefault();
    event.clipboardData.setData('text/plain', toClipboardTable(table));
    stashSelectedTasks();
  };

  const applyTable = async (table: string[][]) => {
    if (!bounds || !canEdit || table.length === 0) return;

    // One copied cell fills the whole selection, exactly like a spreadsheet
    if (table.length === 1 && table[0].length === 1) {
      const raw = table[0][0];
      const changes: Array<{ id: string; values: Partial<RowValues> }> = [];
      for (let r = bounds.top; r <= bounds.bottom; r += 1) {
        const row = rows[r];
        if (!row) continue;
        const values: Partial<RowValues> = {};
        for (let c = bounds.left; c <= bounds.right; c += 1) {
          const parsed = parseCellInput(columns[c], raw);
          if (parsed !== null) values[columns[c].field] = parsed;
        }
        changes.push({ id: row.task.id, values });
      }
      await commitUpdates(changes);
      return;
    }

    const changes: Array<{ id: string; values: Partial<RowValues> }> = [];
    const inserts: TaskInput[] = [];
    const lastRow = rows[rows.length - 1];
    const base: RowValues = {
      ...emptyValues(),
      department_id: rows[bounds.top]?.values.department_id ?? lastRow?.values.department_id ?? departments[0]?.id ?? '',
      session_id: rows[bounds.top]?.values.session_id ?? lastRow?.values.session_id ?? ''
    };
    const sortCounters = new Map<string, number>();

    table.forEach((cells, offset) => {
      const r = bounds.top + offset;
      const values: Partial<RowValues> = {};
      cells.forEach((raw, index) => {
        const column = columns[bounds.left + index];
        if (!column) return;
        const parsed = parseCellInput(column, raw);
        if (parsed !== null) values[column.field] = parsed;
      });
      const row = rows[r];
      if (row) {
        changes.push({ id: row.task.id, values });
        return;
      }
      const merged: RowValues = { ...base, ...values };
      const key = `${merged.session_id}|${merged.department_id}`;
      const start = sortCounters.get(key) ?? nextSortOrder(merged.session_id, merged.department_id);
      sortCounters.set(key, start + 1);
      inserts.push(toInsert(merged, start));
    });

    await commitUpdates(changes);
    if (inserts.length > 0) {
      try {
        const created = await createTasks.mutateAsync(inserts);
        pushUndo({ kind: 'create', ids: created.map((task) => task.id) });
        toast(`${t('grid.rowsAdded')} ${created.length}`);
      } catch {
        toast(t('common.errorGeneric'), 'error');
      }
    }
  };

  const handlePaste = (event: React.ClipboardEvent) => {
    if (editing || !canEdit) return;
    const text = event.clipboardData.getData('text/plain');
    if (!text) return;
    event.preventDefault();
    void applyTable(parseClipboardTable(text));
  };

  const clearRange = async () => {
    if (!bounds || !canEdit) return;
    const changes: Array<{ id: string; values: Partial<RowValues> }> = [];
    for (let r = bounds.top; r <= bounds.bottom; r += 1) {
      const row = rows[r];
      if (!row) continue;
      const values: Partial<RowValues> = {};
      for (let c = bounds.left; c <= bounds.right; c += 1) {
        const column = columns[c];
        // Department, priority and status always hold a value, so they are left alone
        if (column.field === 'department_id' || column.field === 'priority' || column.field === 'status') continue;
        values[column.field] = '';
      }
      changes.push({ id: row.task.id, values });
    }
    await commitUpdates(changes);
  };

  const handleCut = (event: React.ClipboardEvent) => {
    if (editing) return;
    handleCopy(event);
    if (canEdit) void clearRange();
  };

  // ---------- fill ----------

  const fillDown = async () => {
    if (!bounds || !canEdit) return;
    let source = bounds.top;
    let firstTarget = bounds.top + 1;
    if (bounds.top === bounds.bottom) {
      if (bounds.top === 0) return;
      source = bounds.top - 1;
      firstTarget = bounds.top;
    }
    const from = rows[source];
    if (!from) return;
    const changes: Array<{ id: string; values: Partial<RowValues> }> = [];
    for (let r = firstTarget; r <= bounds.bottom; r += 1) {
      const row = rows[r];
      if (!row) continue;
      const values: Partial<RowValues> = {};
      for (let c = bounds.left; c <= bounds.right; c += 1) values[columns[c].field] = from.values[columns[c].field];
      changes.push({ id: row.task.id, values });
    }
    await commitUpdates(changes);
  };

  const applyFill = async (endRow: number) => {
    if (!bounds || !canEdit || endRow <= bounds.bottom) return;
    const height = bounds.bottom - bounds.top + 1;
    const changes: Array<{ id: string; values: Partial<RowValues> }> = [];
    for (let r = bounds.bottom + 1; r <= Math.min(endRow, rows.length - 1); r += 1) {
      const row = rows[r];
      const from = rows[bounds.top + ((r - bounds.top) % height)];
      if (!row || !from) continue;
      const values: Partial<RowValues> = {};
      for (let c = bounds.left; c <= bounds.right; c += 1) values[columns[c].field] = from.values[columns[c].field];
      changes.push({ id: row.task.id, values });
    }
    if (changes.length === 0) return;
    setSel({ r: bounds.top, c: bounds.left, r2: Math.min(endRow, rows.length - 1), c2: bounds.right });
    await commitUpdates(changes);
  };

  // ---------- rows ----------

  const addRows = async (count = 1, focusField: GridField = 'title', from?: RowValues) => {
    if (!canEdit) return;
    const reference = from ?? rows[bounds?.bottom ?? rows.length - 1]?.values;
    const seed: RowValues = {
      ...emptyValues(),
      department_id: reference?.department_id || departments[0]?.id || '',
      session_id: reference?.session_id ?? ''
    };
    if (!seed.department_id) {
      toast(t('validation.departmentRequired'), 'error');
      return;
    }
    const start = nextSortOrder(seed.session_id, seed.department_id);
    const inserts = Array.from({ length: count }, (_, index) => toInsert(seed, start + index));
    try {
      const created = await createTasks.mutateAsync(inserts);
      pushUndo({ kind: 'create', ids: created.map((task) => task.id) });
      if (created[0]) focusAfterCreate.current = { id: created[0].id, field: focusField };
    } catch {
      toast(t('common.errorGeneric'), 'error');
    }
  };

  const duplicateRows = async () => {
    if (!bounds || !canEdit) return;
    const sources = rows.slice(bounds.top, bounds.bottom + 1);
    if (sources.length === 0) return;
    const counters = new Map<string, number>();
    const inserts = sources.map((row) => {
      const key = `${row.values.session_id}|${row.values.department_id}`;
      const start = counters.get(key) ?? nextSortOrder(row.values.session_id, row.values.department_id);
      counters.set(key, start + 1);
      return toInsert(row.values, start, {
        description: row.task.description,
        instructions: row.task.instructions
      });
    });
    try {
      const created = await createTasks.mutateAsync(inserts);
      pushUndo({ kind: 'create', ids: created.map((task) => task.id) });
      if (created[0]) focusAfterCreate.current = { id: created[0].id, field: 'title' };
      toast(`${t('grid.duplicated')} ${created.length}`);
    } catch {
      toast(t('common.errorGeneric'), 'error');
    }
  };

  const removeRows = async () => {
    if (!bounds || !canEdit) return;
    const ids = rows.slice(bounds.top, bounds.bottom + 1).map((row) => row.task.id);
    if (ids.length === 0) return;
    try {
      await deleteTasks.mutateAsync(ids);
      pushUndo({ kind: 'delete', ids });
      toast(t('grid.deletedUndoHint'));
    } catch {
      toast(t('common.errorGeneric'), 'error');
    }
  };

  const pasteCopiedTasks = async () => {
    const clip = getTaskClipboard();
    if (!clip || !canEdit) return;
    const reference = rows[bounds?.top ?? rows.length - 1]?.values;
    const departmentId = reference?.department_id || departments[0]?.id;
    if (!departmentId) return;
    const sessionId = reference?.session_id ?? '';
    const start = nextSortOrder(sessionId, departmentId);
    const inserts: TaskInput[] = clip.items.map((item, index) => ({
      event_id: eventId,
      department_id: departmentId,
      session_id: sessionId || null,
      title: item.title,
      description: item.description,
      instructions: item.instructions,
      work_location: item.work_location,
      setup_location: item.setup_location,
      assigned_staff: item.assigned_staff,
      start_time: combineDateTime(eventDate, item.start_time),
      completion_time: combineDateTime(eventDate, item.completion_time),
      priority: item.priority,
      status: 'not_started',
      notes: item.notes,
      sort_order: start + index,
      created_by: profile?.id ?? null
    }));
    try {
      const created = await createTasks.mutateAsync(inserts);
      pushUndo({ kind: 'create', ids: created.map((task) => task.id) });
      if (created[0]) focusAfterCreate.current = { id: created[0].id, field: 'title' };
      toast(`${t('grid.pasted')} ${created.length}`);
    } catch {
      toast(t('common.errorGeneric'), 'error');
    }
  };

  const undo = async () => {
    const entry = undoStack.current.pop();
    setUndoDepth(undoStack.current.length);
    if (!entry) return;
    try {
      if (entry.kind === 'update') await commitUpdates(entry.patches, false);
      if (entry.kind === 'create') await deleteTasks.mutateAsync(entry.ids);
      if (entry.kind === 'delete') await restoreTasks.mutateAsync(entry.ids);
      toast(t('grid.undone'));
    } catch {
      toast(t('common.errorGeneric'), 'error');
    }
  };

  // ---------- keyboard ----------

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (editing) return;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key;

    if (mod && key.toLowerCase() === 'd') {
      event.preventDefault();
      void fillDown();
      return;
    }
    if (mod && key.toLowerCase() === 'z') {
      event.preventDefault();
      void undo();
      return;
    }
    if (mod && key.toLowerCase() === 'a') {
      event.preventDefault();
      if (rows.length > 0) setSel({ r: 0, c: 0, r2: rows.length - 1, c2: columns.length - 1 });
      return;
    }
    // Leave copy, cut and paste to the clipboard handlers
    if (mod) return;

    switch (key) {
      case 'ArrowDown':
        event.preventDefault();
        move(1, 0, event.shiftKey);
        return;
      case 'ArrowUp':
        event.preventDefault();
        move(-1, 0, event.shiftKey);
        return;
      case 'ArrowLeft':
        event.preventDefault();
        move(0, -1, event.shiftKey);
        return;
      case 'ArrowRight':
        event.preventDefault();
        move(0, 1, event.shiftKey);
        return;
      case 'Tab':
        event.preventDefault();
        move(0, event.shiftKey ? -1 : 1, false);
        return;
      case 'Home':
        event.preventDefault();
        if (sel) selectCell(sel.r, 0);
        return;
      case 'End':
        event.preventDefault();
        if (sel) selectCell(sel.r, columns.length - 1);
        return;
      case 'Enter':
      case 'F2':
        event.preventDefault();
        if (sel) startEdit(sel.r, sel.c);
        return;
      case 'Escape':
        event.preventDefault();
        setSel(null);
        return;
      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        void clearRange();
        return;
      default:
        if (canEdit && sel && key.length === 1 && !event.altKey) {
          event.preventDefault();
          startEdit(sel.r, sel.c, key);
        }
    }
  };

  const commitEdit = async (raw: string, direction: 'down' | 'up' | 'right' | 'left' | 'stay') => {
    const cell = editing;
    setEditing(null);
    containerRef.current?.focus();
    if (!cell) return;
    const column = columns[cell.c];
    const row = rows[cell.r];
    if (!column || !row) return;

    const parsed = column.type === 'time' ? normalizeTimeInput(raw) : raw;
    const changed = parsed !== row.values[column.field];
    if (changed) await commitUpdates([{ id: row.task.id, values: { [column.field]: parsed } }]);

    if (direction === 'down') {
      if (cell.r === rows.length - 1) {
        if (changed && parsed.trim() !== '') await addRows(1, column.field, row.values);
        return;
      }
      selectCell(cell.r + 1, cell.c);
      return;
    }
    if (direction === 'up') selectCell(cell.r - 1, cell.c);
    if (direction === 'right') selectCell(cell.r, cell.c + 1);
    if (direction === 'left') selectCell(cell.r, cell.c - 1);
  };

  const cancelEdit = () => {
    setEditing(null);
    containerRef.current?.focus();
  };

  // ---------- render ----------

  const inSelection = (r: number, c: number) =>
    !!bounds && r >= bounds.top && r <= bounds.bottom && c >= bounds.left && c <= bounds.right;
  const inFillPreview = (r: number) =>
    fillTo !== null && !!bounds && r > bounds.bottom && r <= fillTo;

  const selectedRowCount = bounds ? bounds.bottom - bounds.top + 1 : 0;

  const toolbarButton =
    'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-navy-700 disabled:opacity-40 disabled:hover:bg-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-gold-300';

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 p-2 dark:border-slate-800">
        {canEdit && (
          <>
            <button className={toolbarButton} onClick={() => void addRows(1)} disabled={createTasks.isPending}>
              <Plus className="h-3.5 w-3.5" /> {t('grid.addRow')}
            </button>
            <button className={toolbarButton} onClick={() => void duplicateRows()} disabled={!bounds}>
              <CopyPlus className="h-3.5 w-3.5" /> {t('grid.duplicateRow')}
              {selectedRowCount > 1 && <span className="text-slate-400">({selectedRowCount})</span>}
            </button>
            <button className={toolbarButton} onClick={() => void fillDown()} disabled={!bounds}>
              <ArrowDownToLine className="h-3.5 w-3.5" /> {t('grid.fillDown')}
            </button>
          </>
        )}
        <button
          className={toolbarButton}
          disabled={!bounds}
          onClick={async () => {
            const table = selectionAsTable();
            const count = stashSelectedTasks();
            if (table.length > 0) {
              try {
                await navigator.clipboard.writeText(toClipboardTable(table));
              } catch {
                // Clipboard permission can be denied; the in app copy still worked
              }
            }
            if (count > 0) toast(`${t('grid.copied')} ${count}`);
          }}
        >
          <Copy className="h-3.5 w-3.5" /> {t('grid.copy')}
        </button>
        {canEdit && clipboard && (
          <button className={toolbarButton} onClick={() => void pasteCopiedTasks()}>
            <ClipboardPaste className="h-3.5 w-3.5" /> {t('grid.pasteCopied')} ({clipboard.items.length})
          </button>
        )}
        {canEdit && (
          <button
            className={cn(toolbarButton, 'hover:!text-red-600')}
            onClick={() => void removeRows()}
            disabled={!bounds}
          >
            <Trash2 className="h-3.5 w-3.5" /> {t('common.delete')}
          </button>
        )}
        {canEdit && (
          <button className={toolbarButton} onClick={() => void undo()} disabled={undoDepth === 0}>
            <Undo2 className="h-3.5 w-3.5" /> {t('grid.undo')}
          </button>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <div className="relative">
            {columnMenuOpen && <div className="fixed inset-0 z-20" onClick={() => setColumnMenuOpen(false)} />}
            <button
              className={cn(toolbarButton, columnMenuOpen && 'relative z-30')}
              onClick={() => setColumnMenuOpen((open) => !open)}
            >
              <Columns3 className="h-3.5 w-3.5" /> {t('grid.columns')}
            </button>
            {columnMenuOpen && (
              <>
                <div className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                  {COLUMNS.map((column) => {
                    const visible = column.fixed || !hiddenColumns.includes(column.field);
                    return (
                      <button
                        key={column.field}
                        disabled={column.fixed}
                        onClick={() =>
                          setHiddenColumns((prev) =>
                            prev.includes(column.field)
                              ? prev.filter((field) => field !== column.field)
                              : [...prev, column.field]
                          )
                        }
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <span
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                            visible
                              ? 'border-navy-700 bg-navy-700 text-white dark:border-gold-400 dark:bg-gold-400 dark:text-navy-900'
                              : 'border-slate-300 dark:border-slate-600'
                          )}
                        >
                          {visible && <Check className="h-3 w-3" />}
                        </span>
                        {t(column.labelKey)}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          <div className="relative">
            {helpOpen && <div className="fixed inset-0 z-20" onClick={() => setHelpOpen(false)} />}
            <button
              className={cn(toolbarButton, helpOpen && 'relative z-30')}
              onClick={() => setHelpOpen((open) => !open)}
            >
              <Keyboard className="h-3.5 w-3.5" /> {t('grid.shortcuts')}
            </button>
            {helpOpen && (
              <>
                <div className="absolute right-0 z-30 mt-1 w-72 space-y-1 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  <p className="font-semibold text-slate-800 dark:text-slate-100">{t('grid.shortcuts')}</p>
                  <p>{t('grid.helpNavigate')}</p>
                  <p>{t('grid.helpEdit')}</p>
                  <p>{t('grid.helpCopy')}</p>
                  <p>{t('grid.helpFill')}</p>
                  <p>{t('grid.helpPasteRows')}</p>
                  <p>{t('grid.helpUndo')}</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Grid */}
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm italic text-slate-400">{t('tasks.noTasks')}</p>
      ) : (
        <div
          ref={containerRef}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onCopy={handleCopy}
          onCut={handleCut}
          onPaste={handlePaste}
          className="max-h-[72vh] overflow-auto outline-none"
        >
          <table className="w-max min-w-full select-none border-separate border-spacing-0 text-[13px]">
            <colgroup>
              <col style={{ width: 46 }} />
              {columns.map((column) => (
                <col key={column.field} style={{ width: column.width }} />
              ))}
              <col style={{ width: 44 }} />
            </colgroup>
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 border-b border-r border-slate-200 bg-slate-100 px-1 py-2 text-[11px] font-semibold text-slate-400 dark:border-slate-700 dark:bg-slate-800">
                  #
                </th>
                {columns.map((column, index) => (
                  <th
                    key={column.field}
                    className={cn(
                      'sticky top-0 border-b border-r border-slate-200 bg-slate-100 px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
                      index === 0 ? 'left-[46px] z-20' : 'z-10'
                    )}
                  >
                    {t(column.labelKey)}
                  </th>
                ))}
                <th className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <Fragment key={row.task.id}>
                  {bands.get(r) && (
                    <tr>
                      <td
                        colSpan={columns.length + 2}
                        className="border-b border-slate-200 bg-navy-50 p-0 text-[11px] font-extrabold uppercase tracking-wide text-navy-700 dark:border-slate-700 dark:bg-navy-900/60 dark:text-gold-300"
                      >
                        <div className="sticky left-0 w-max px-3 py-1.5">{bands.get(r)}</div>
                      </td>
                    </tr>
                  )}
                  <tr className="group">
                    <td
                      onClick={() => setSel({ r, c: 0, r2: r, c2: columns.length - 1 })}
                      className={cn(
                        'sticky left-0 z-[2] cursor-pointer border-b border-r border-slate-100 px-1 py-0 text-center text-[11px] font-bold dark:border-slate-800',
                        bounds && r >= bounds.top && r <= bounds.bottom
                          ? 'bg-navy-100 text-navy-700 dark:bg-navy-800 dark:text-gold-300'
                          : 'bg-slate-50 text-slate-400 dark:bg-slate-800'
                      )}
                    >
                      {r + 1}
                    </td>
                    {columns.map((column, c) => {
                      const selected = inSelection(r, c);
                      const active = !!sel && sel.r === r && sel.c === c;
                      const isEditing = !!editing && editing.r === r && editing.c === c;
                      const isFillCorner = !!bounds && r === bounds.bottom && c === bounds.right;
                      const frozen = c === 0;
                      return (
                        <td
                          key={column.field}
                          data-cell={`${r}-${c}`}
                          onMouseDown={(event) => {
                            if (event.button !== 0) return;
                            if (isEditing) return;
                            containerRef.current?.focus();
                            dragMode.current = 'select';
                            selectCell(r, c, event.shiftKey);
                          }}
                          onMouseEnter={() => {
                            if (dragMode.current === 'select') selectCell(r, c, true);
                            if (dragMode.current === 'fill') setFillTo(r);
                          }}
                          onDoubleClick={() => startEdit(r, c)}
                          className={cn(
                            'border-b border-r border-slate-100 p-0 align-middle dark:border-slate-800',
                            // The first column is frozen, so it needs a solid backdrop
                            frozen ? 'sticky left-[46px] bg-white dark:bg-slate-900' : 'relative',
                            active ? 'z-[3]' : frozen ? 'z-[2]' : '',
                            active && 'outline outline-2 -outline-offset-2 outline-navy-600 dark:outline-gold-400'
                          )}
                        >
                          {isEditing ? (
                            <CellEditor
                              column={column}
                              value={row.values[column.field]}
                              initial={editing?.initial ?? null}
                              departments={departments}
                              sessions={sessions}
                              sessionLabel={sessionLabel}
                              onCommit={commitEdit}
                              onCancel={cancelEdit}
                            />
                          ) : (
                            <div
                              className={cn(
                                'flex h-[34px] items-center gap-1.5 truncate px-2',
                                column.type === 'time' && 'tabular-nums',
                                (column.field === 'title' || column.field === 'assigned_staff') && 'font-medium',
                                selected && 'bg-navy-100/70 dark:bg-navy-800/50',
                                inFillPreview(r) && 'bg-gold-100/70 dark:bg-gold-900/30'
                              )}
                            >
                              {column.field === 'status' && (
                                <span
                                  className="h-2 w-2 shrink-0 rounded-full"
                                  style={{ backgroundColor: TASK_STATUS_DOTS[row.values.status as TaskStatus] }}
                                />
                              )}
                              <span
                                className={cn(
                                  'truncate',
                                  column.field === 'session_id' && !row.values.session_id && 'text-slate-400',
                                  !row.values[column.field] && column.type === 'text' && 'text-slate-300'
                                )}
                                title={displayValue(row, column) || undefined}
                              >
                                {displayValue(row, column)}
                              </span>
                            </div>
                          )}
                          {canEdit && isFillCorner && !isEditing && (
                            <span
                              data-fill-handle="true"
                              title={t('grid.fillHandle')}
                              onMouseDown={(event) => {
                                event.stopPropagation();
                                event.preventDefault();
                                dragMode.current = 'fill';
                                setFillTo(r);
                              }}
                              className="absolute -bottom-[3px] -right-[3px] z-[2] h-2.5 w-2.5 cursor-crosshair rounded-[2px] border border-white bg-navy-600 dark:border-slate-900 dark:bg-gold-400"
                            />
                          )}
                        </td>
                      );
                    })}
                    <td className="border-b border-slate-100 px-1 text-center dark:border-slate-800">
                      <button
                        onClick={() => (canEdit ? onEditTask(row.task) : onOpenTask(row.task))}
                        title={canEdit ? t('grid.openFullForm') : t('tasks.taskDetails')}
                        className="rounded-md p-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-navy-700 dark:hover:bg-slate-800 dark:hover:text-gold-300"
                      >
                        <Maximize2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-400 dark:border-slate-800">
        {t('grid.footerHint')}
      </p>
    </section>
  );
}

interface CellEditorProps {
  column: ColumnDef;
  value: string;
  initial: string | null;
  departments: Department[];
  sessions: EventSession[];
  sessionLabel: (session: EventSession) => string;
  onCommit: (raw: string, direction: 'down' | 'up' | 'right' | 'left' | 'stay') => void;
  onCancel: () => void;
}

function CellEditor({
  column, value, initial, departments, sessions, sessionLabel, onCommit, onCancel
}: CellEditorProps) {
  const { t, deptName } = useLanguage();
  const [draft, setDraft] = useState(initial ?? value);
  const committed = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Start with the caret at the end so the first typed character is kept
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const end = input.value.length;
    input.setSelectionRange(end, end);
  }, []);

  const finish = (raw: string, direction: 'down' | 'up' | 'right' | 'left' | 'stay') => {
    if (committed.current) return;
    committed.current = true;
    onCommit(raw, direction);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      finish(draft, event.shiftKey ? 'up' : 'down');
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      finish(draft, event.shiftKey ? 'left' : 'right');
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      committed.current = true;
      onCancel();
    }
  };

  if (column.type === 'select') {
    const options =
      column.field === 'department_id'
        ? departments.map((dept) => ({ value: dept.id, label: deptName(dept) }))
        : column.field === 'session_id'
          ? [
              { value: '', label: t('sessions.whole') },
              ...sessions.map((session) => ({ value: session.id, label: sessionLabel(session) }))
            ]
          : column.field === 'priority'
            ? PRIORITIES.map((priority) => ({ value: priority, label: t(`priority.${priority}`) }))
            : TASK_STATUSES.map((status) => ({ value: status, label: t(`taskStatus.${status}`) }));
    return (
      <select
        autoFocus
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          finish(event.target.value, 'stay');
        }}
        onKeyDown={onKeyDown}
        onBlur={() => finish(draft, 'stay')}
        className="h-[34px] w-full border-0 bg-white px-1.5 text-[13px] text-slate-800 outline-none ring-2 ring-inset ring-navy-600 dark:bg-slate-900 dark:text-slate-100 dark:ring-gold-400"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      ref={inputRef}
      autoFocus
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => finish(draft, 'stay')}
      placeholder={column.type === 'time' ? 'HH:mm' : undefined}
      className="h-[34px] w-full border-0 bg-white px-2 text-[13px] text-slate-800 outline-none ring-2 ring-inset ring-navy-600 dark:bg-slate-900 dark:text-slate-100 dark:ring-gold-400"
    />
  );
}
