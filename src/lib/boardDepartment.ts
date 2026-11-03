export function boardDepartmentKey(campus?: string): string {
  return `eventops.display.dept.${campus ?? 'all'}`;
}

export function resolveBoardDepartment(
  param: string | null | undefined,
  departments: Array<{ id: string; code: string; name_en: string; name_th: string }>
): string | null {
  if (param == null) return null;
  if (param === '' || param === 'all') return '';
  const exact = departments.find((dept) => dept.id === param);
  if (exact) return exact.id;
  const code = departments.find((dept) => dept.code.toLowerCase() === param.toLowerCase());
  if (code) return code.id;
  const name = param.trim().toLowerCase();
  return departments.find((dept) =>
    dept.name_en.trim().toLowerCase() === name || dept.name_th.trim().toLowerCase() === name
  )?.id ?? null;
}
