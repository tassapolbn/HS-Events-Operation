import { useEffect, useState } from 'react';
import { extractTime } from './utils';
import type { EventTask, Priority, TaskStatus } from '../types';

/**
 * A task copied from anywhere in the app. Times are kept as plain HH:mm so a
 * copy can be pasted into an event or a session that runs on a different day.
 */
export interface ClipboardTask {
  title: string;
  description: string;
  instructions: string;
  work_location: string;
  setup_location: string;
  assigned_staff: string;
  start_time: string | null;
  completion_time: string | null;
  priority: Priority;
  status: TaskStatus;
  notes: string;
}

export interface TaskClipboard {
  items: ClipboardTask[];
  /** Where the tasks came from, shown on the paste button */
  label: string;
  copiedAt: number;
}

const STORAGE_KEY = 'eventops.taskClipboard';

function read(): TaskClipboard | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TaskClipboard;
    return Array.isArray(parsed.items) && parsed.items.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

let current: TaskClipboard | null = read();
const listeners = new Set<(value: TaskClipboard | null) => void>();

function publish() {
  for (const listener of listeners) listener(current);
}

/** Put one or more tasks on the app clipboard so they can be pasted elsewhere. */
export function copyTasks(items: ClipboardTask[], label: string) {
  if (items.length === 0) return;
  current = { items, label, copiedAt: Date.now() };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Private windows and blocked storage are fine: the clipboard still works in memory
  }
  publish();
}

export function clearTaskClipboard() {
  current = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  publish();
}

export function getTaskClipboard(): TaskClipboard | null {
  return current;
}

/** Subscribe a component to the app clipboard. */
export function useTaskClipboard(): TaskClipboard | null {
  const [value, setValue] = useState<TaskClipboard | null>(current);
  useEffect(() => {
    listeners.add(setValue);
    setValue(current);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}

/** Strip a saved task down to the fields worth copying. */
export function taskToClipboardItem(task: EventTask): ClipboardTask {
  return {
    title: task.title,
    description: task.description,
    instructions: task.instructions,
    work_location: task.work_location,
    setup_location: task.setup_location,
    assigned_staff: task.assigned_staff,
    start_time: extractTime(task.start_time),
    completion_time: extractTime(task.completion_time),
    priority: task.priority,
    status: task.status,
    notes: task.notes
  };
}
