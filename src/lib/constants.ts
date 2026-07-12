import {
  Wrench, Sparkles, Shield, ChefHat, Users,
  CalendarDays, GraduationCap, Trophy, Award, PartyPopper, Presentation, Music, Camera, Bus,
  type LucideIcon
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

/** Icon per event category, shown on the display board event header */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  general: CalendarDays,
  academic: GraduationCap,
  sports: Trophy,
  ceremony: Award,
  celebration: PartyPopper,
  meeting: Presentation,
  performance: Music,
  photoshoot: Camera,
  trip: Bus,
  other: Sparkles
};

export function categoryIcon(name: string): LucideIcon {
  return CATEGORY_ICONS[name] ?? CalendarDays;
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
  cancelled: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300',
  new: 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300',
  acknowledged: 'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300',
  needs_revision: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300'
};

/** Small colored dot per task status (for compact column view) */
export const TASK_STATUS_DOTS: Record<TaskStatus, string> = {
  not_started: '#94a3b8',
  in_progress: '#0ea5e9',
  waiting: '#f59e0b',
  completed: '#10b981',
  cancelled: '#ef4444',
  new: '#8b5cf6',
  acknowledged: '#14b8a6',
  needs_revision: '#f43f5e'
};

export const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent'];
export const EVENT_STATUSES: EventStatus[] = ['draft', 'scheduled', 'active', 'completed', 'archived'];
export const TASK_STATUSES: TaskStatus[] = ['not_started', 'in_progress', 'waiting', 'completed', 'cancelled'];
/** Statuses used by General Department Requests */
export const REQUEST_STATUSES: TaskStatus[] = ['new', 'acknowledged', 'needs_revision', 'in_progress', 'completed', 'cancelled'];
/** Statuses a department may set from the public display board */
export const PUBLIC_REQUEST_STATUSES: TaskStatus[] = ['acknowledged', 'needs_revision', 'in_progress', 'completed'];

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
