import {
  Wrench, Sparkles, Shield, ChefHat, Users, type LucideIcon
} from 'lucide-react';
import type { EventStatus, Priority, TaskStatus } from '../types';

/** Icon registry for departments (icon name stored in the database) */
export const DEPARTMENT_ICONS: Record<string, LucideIcon> = {
  wrench: Wrench,
  sparkles: Sparkles,
  shield: Shield,
  'chef-hat': ChefHat,
  users: Users
};

export function departmentIcon(name: string): LucideIcon {
  return DEPARTMENT_ICONS[name] ?? Users;
}

/** Tailwind-safe classes per priority */
export const PRIORITY_STYLES: Record<Priority, string> = {
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  medium: 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300',
  urgent: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
};

export const EVENT_STATUS_STYLES: Record<EventStatus, string> = {
  draft: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  scheduled: 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300',
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
  completed: 'bg-navy-100 text-navy-800 dark:bg-navy-900 dark:text-navy-200',
  archived: 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
};

export const TASK_STATUS_STYLES: Record<TaskStatus, string> = {
  not_started: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  in_progress: 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300',
  waiting: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
  cancelled: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300'
};

export const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent'];
export const EVENT_STATUSES: EventStatus[] = ['draft', 'scheduled', 'active', 'completed', 'archived'];
export const TASK_STATUSES: TaskStatus[] = ['not_started', 'in_progress', 'waiting', 'completed', 'cancelled'];

export const EVENT_CATEGORIES = [
  'general',
  'academic',
  'sports',
  'ceremony',
  'celebration',
  'meeting',
  'performance',
  'photoshoot',
  'trip',
  'other'
] as const;

/** Timeline milestone fields in display order */
export const TIMELINE_FIELDS = [
  'setup_start',
  'venue_ready',
  'event_start',
  'event_finish',
  'breakdown_start',
  'breakdown_deadline'
] as const;

export type TimelineField = (typeof TIMELINE_FIELDS)[number];
