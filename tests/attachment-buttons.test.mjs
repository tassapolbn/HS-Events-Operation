import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const attachments = readFileSync(new URL('../src/components/attachments/AttachmentSection.tsx', import.meta.url), 'utf8');
const modal = readFileSync(new URL('../src/components/ui/Modal.tsx', import.meta.url), 'utf8');
const taskDetail = readFileSync(new URL('../src/components/events/TaskDetailModal.tsx', import.meta.url), 'utf8');
const mutations = readFileSync(new URL('../src/hooks/useAttachments.ts', import.meta.url), 'utf8');

test('attachment buttons cannot submit an enclosing form', () => {
  // Match through the closing tag: > also occurs in JSX arrow functions.
  const buttons = [...attachments.matchAll(/<button\b[\s\S]*?<\/button\s*>/g)];
  assert.ok(buttons.length > 0);
  assert.equal(buttons.length, (attachments.match(/<button\b/g) ?? []).length);
  for (const [button] of buttons) {
    assert.match(button, /\btype\s*=\s*["']button["']/);
  }
});

test('Enter only confirms the top dialog containing the event target', () => {
  const handler = modal.match(/onKeyDownCapture=\{e\s*=>\s*\{([\s\S]*?)\}\}/)?.[1];
  assert.ok(handler, 'Modal must retain its Enter capture handler');
  const guard = handler.slice(0, handler.indexOf('e.preventDefault()'));
  assert.match(guard, /document\.querySelectorAll\(['"]\[role=dialog\]['"]\)/);
  assert.match(guard, /if\s*\(dialogs\[dialogs\.length\s*-\s*1\]\s*!==\s*dialogRef\.current\s*\|\|\s*!dialogRef\.current\?\.contains\(e\.target as Node\)\)\s*return;/);
  assert.ok(handler.indexOf('e.stopPropagation()') > guard.length);
});

test('Enter leaves textarea and contenteditable targets to their own handlers', () => {
  const handler = modal.match(/onKeyDownCapture=\{e\s*=>\s*\{([\s\S]*?)\}\}/)?.[1];
  assert.ok(handler, 'Modal must retain its Enter capture handler');
  const preventDefault = handler.indexOf('e.preventDefault()');
  assert.ok(preventDefault >= 0);
  const guard = handler.slice(0, preventDefault);
  assert.match(guard, /if\s*\(e\.target instanceof HTMLElement && \(e\.target\.isContentEditable \|\| e\.target\.closest\('textarea,\[contenteditable\]:not\(\[contenteditable="false"\]\)'\)\)\)\s*return;/);
  assert.ok(handler.indexOf('e.stopPropagation()') > preventDefault);
  assert.ok(handler.indexOf('.then(onConfirm)') > preventDefault);
});

test('Enter leaves native controls including the colour picker alone', () => {
  const handler = modal.match(/onKeyDownCapture=\{e\s*=>\s*\{([\s\S]*?)\}\}/)?.[1];
  assert.ok(handler);
  const preventDefault = handler.indexOf('e.preventDefault()');
  assert.ok(preventDefault >= 0);
  assert.match(handler.slice(0, preventDefault), /if \(e\.target instanceof HTMLElement && e\.target\.closest\('button,select,\[role=combobox\],input\[type=color\]'\)\) return;/);
});

test('Department notes leave list Enter to the editor and retain Enter to save', () => {
  const handler = taskDetail.split('{/* Department notes */}')[1]?.match(/onKeyDownCapture=\{e\s*=>\s*\{([\s\S]*?)\}\}/)?.[1];
  assert.ok(handler);
  const preventDefault = handler.indexOf('e.preventDefault()');
  assert.ok(preventDefault >= 0);
  assert.match(handler.slice(0, preventDefault), /if \(e\.target instanceof HTMLElement && e\.target\.isContentEditable\) \{\s*\/\/[^\n]*\n\s*const node = window\.getSelection\(\)\?\.anchorNode;\s*const el = node instanceof Element \? node : node\?\.parentElement;\s*if \(el\?\.closest\('li'\)\) return;\s*\}/);
  assert.ok(handler.includes("if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229 && !e.repeat && !(e.target instanceof HTMLElement && e.target.closest('button,input[type=color]'))) { e.preventDefault(); void saveNotes(); }"));
});

test('attachment deletion removes the row before the storage object', () => {
  const remove = mutations.match(/const remove = useMutation\(\{([\s\S]*?)onSuccess: invalidate/)?.[1];
  assert.ok(remove);
  const rowDelete = remove.indexOf("supabase.from('attachments').delete().eq('id', attachment.id)");
  const storageRemove = remove.indexOf("supabase.storage.from('attachments').remove(");
  assert.ok(rowDelete >= 0 && storageRemove > rowDelete);
  assert.match(remove.slice(rowDelete, storageRemove), /if \(error\) throw error;/);
});

test('attachment mutations invalidate photo counts', () => {
  const invalidate = mutations.match(/const invalidate = \(\) => \{([\s\S]*?)\};/)?.[1];
  assert.ok(invalidate);
  assert.match(invalidate, /return queryClient\.invalidateQueries\(\{ queryKey: \['attachments', entityType, entityId\] \}\)/);
  assert.match(invalidate, /queryClient\.invalidateQueries\(\{ queryKey: \['attachment-photo-counts'\] \}\)/);
});

test('failed attachment deletion shows an error and keeps confirmation open', () => {
  const onConfirm = attachments.match(/onConfirm=\{async \(\) => \{([\s\S]*?)\}\}/)?.[1];
  assert.ok(onConfirm);
  assert.match(onConfirm, /try \{\s*await remove\.mutateAsync\(toDelete\);\s*setToDelete\(null\);[\s\S]*?\} catch \{\s*toast\(t\('common\.errorGeneric'\), 'error'\);\s*\}/);
  assert.match(attachments, /const rootRef = useRef<HTMLDivElement>\(null\);[\s\S]*?<div ref=\{rootRef\} tabIndex=\{-1\} className="space-y-3 focus:outline-none">[\s\S]*?setToDelete\(null\);\s*\/\/[^\n]*\n\s*requestAnimationFrame\(\(\) => \{\s*const active = document\.activeElement;\s*if \(!active \|\| active === document\.body\) rootRef\.current\?\.focus\(\);\s*\}\);/);
});

test('modal cleanup only unlocks scrolling when no dialog remains', () => {
  const cleanup = modal.match(/return \(\) => \{([\s\S]*?)\};/)?.[1];
  assert.ok(cleanup);
  assert.match(cleanup, /const dialogs = document\.querySelectorAll<HTMLElement>\('\[role=dialog\]'\);/);
  assert.match(cleanup, /if \(dialogs\.length === 0\) document\.body\.style\.overflow = '';/);
  assert.match(cleanup, /else dialogs\[dialogs\.length - 1\]\?\.focus\(\);/);
});
