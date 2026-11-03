/**
 * Suggestions from each department's past jobs, for the worksheet. Jobs repeat
 * from event to event ("ยกเก้าอี้ 120 ตัว", "คลุมผ้าโต๊ะ 3 ผืน"), so the next
 * one is usually a job typed before.
 */

export interface JobHistoryRow {
  title: string;
  department_id: string;
  created_at: string;
}

export interface JobSuggestion {
  title: string;
  /** How many times the job was given */
  count: number;
  /** When it was last given, ISO */
  last: string;
}

export type JobIndex = Map<string, JobSuggestion[]>;

/** Trim and collapse inner whitespace, so "ยก  เก้าอี้ " and "ยก เก้าอี้" are one job */
export function normalizeJobTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim();
}

/** One entry per department and job, keeping the most recent spelling */
export function buildJobIndex(rows: JobHistoryRow[]): JobIndex {
  const byDept = new Map<string, Map<string, JobSuggestion>>();
  for (const row of rows) {
    const title = normalizeJobTitle(row.title ?? '');
    if (!title || !row.department_id) continue;
    const key = title.toLocaleLowerCase();
    let jobs = byDept.get(row.department_id);
    if (!jobs) {
      jobs = new Map();
      byDept.set(row.department_id, jobs);
    }
    const seen = jobs.get(key);
    if (!seen) {
      jobs.set(key, { title, count: 1, last: row.created_at });
    } else {
      seen.count += 1;
      if (row.created_at > seen.last) {
        seen.last = row.created_at;
        seen.title = title;
      }
    }
  }
  const index: JobIndex = new Map();
  for (const [dept, jobs] of byDept) index.set(dept, [...jobs.values()]);
  return index;
}

/**
 * Past jobs of one department that contain the typed text. Jobs that start with
 * it come first, then the most often given, then the most recent. Nothing is
 * suggested for fewer than two characters, or for the text exactly.
 */
export function suggestJobs(index: JobIndex, departmentId: string, text: string, limit = 6): string[] {
  const needle = normalizeJobTitle(text).toLocaleLowerCase();
  if (needle.length < 2) return [];
  const jobs = index.get(departmentId) ?? [];
  return jobs
    .map((job) => ({ job, lower: job.title.toLocaleLowerCase() }))
    .filter(({ lower }) => lower !== needle && lower.includes(needle))
    .sort((a, b) => {
      const aStarts = a.lower.startsWith(needle) ? 0 : 1;
      const bStarts = b.lower.startsWith(needle) ? 0 : 1;
      return aStarts - bStarts || b.job.count - a.job.count || b.job.last.localeCompare(a.job.last);
    })
    .slice(0, limit)
    .map(({ job }) => job.title);
}
