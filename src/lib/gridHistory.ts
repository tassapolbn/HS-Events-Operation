/** Reversible entries retain the exact cells changed; filters never redefine them. */
export type GridHistoryEntry<F extends string> =
  | { kind: 'update'; patches: Array<{ id: string; values: Partial<Record<F, string>> }> }
  | { kind: 'create'; ids: string[] }
  | { kind: 'delete'; ids: string[] };

export function inverseGridEntry<F extends string>(entry: GridHistoryEntry<F>, values: Map<string, Record<F, string>>): GridHistoryEntry<F> {
  if (entry.kind === 'create') return {kind: 'delete', ids: entry.ids};
  if (entry.kind === 'delete') return {kind: 'create', ids: entry.ids};
  return {kind: 'update', patches: entry.patches.map(patch => {
    const current = values.get(patch.id);
    if (!current) throw new Error('Task is no longer available');
    return {id: patch.id, values: Object.fromEntries(Object.keys(patch.values).map(field => [field, current[field as F]])) as Partial<Record<F, string>>};
  })};
}
