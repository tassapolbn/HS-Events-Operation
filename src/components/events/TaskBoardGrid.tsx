import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, Clock, EyeOff, Layers, Loader2, MapPin, Maximize2, Plus, Redo2, Undo2, User } from 'lucide-react';
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

type BoardHistoryEntry = GridHistoryEntry<'title'>;

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

  useEffect(() => { setCursor(null); setEditing(null); setContext(null); }, [search, departmentFilter, sessionFilter]);

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

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (editing || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || context) return;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key;
    if (mod && key.toLowerCase() === 'z') { event.preventDefault(); void travel(event.shiftKey); return; }
    if (mod && key.toLowerCase() === 'y') { event.preventDefault(); void travel(true); return; }
    if (mod) return;
    if (key === 'ArrowDown') { event.preventDefault(); move(1, 0); return; }
    if (key === 'ArrowUp') { event.preventDefault(); move(-1, 0); return; }
    if (key === 'ArrowLeft') { event.preventDefault(); move(0, -1); return; }
    if (key === 'ArrowRight' || key === 'Tab') { event.preventDefault(); move(0, event.shiftKey && key === 'Tab' ? -1 : 1); return; }
    if (key === 'Escape') { event.preventDefault(); setCursor(null); return; }
    if ((key === 'Enter' || key === 'F2') && cursor && canEdit) {
      event.preventDefault();
      setEditing({ ...cursor, initial: null });
      return;
    }
    if ((key === 'Delete' || key === 'Backspace') && cursor && canEdit) {
      event.preventDefault();
      const task = taskAt(cursor.group, cursor.dept, cursor.row);
      if (task) void removeTask(task);
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
    if (editing || !cursor) return;
    const task = taskAt(cursor.group, cursor.dept, cursor.row);
    if (!task) return;
    event.preventDefault();
    event.clipboardData.setData('text/plain', toClipboardTable([[task.title]]));
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
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-[13px]">
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
                        return (
                          <td
                            key={dept.id}
                            data-board-cell={`${group.key || 'general'}|${dept.id}|${row}`}
                            onMouseDown={() => {
                              if (isEditing) return;
                              containerRef.current?.focus();
                              setCursor({ group: group.key, dept: dept.id, row });
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
                              completed && 'bg-emerald-50/60 dark:bg-emerald-950/20'
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
                              <div className="flex min-h-[38px] gap-2 px-2.5 py-1.5">
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
      className="block w-full resize-none border-0 bg-white px-2.5 py-1.5 text-[13px] leading-snug text-slate-800 outline-none ring-2 ring-inset ring-navy-600 dark:bg-slate-900 dark:text-slate-100 dark:ring-gold-400"
    />
  );
}
