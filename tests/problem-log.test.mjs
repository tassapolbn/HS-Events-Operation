import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProblemReporter, describeProblem, fileFacts, firstLines, isNoise, summarizeBrowser } from '../src/lib/problemLog.ts';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function reporter(overrides = {}) {
  const sent = [];
  const report = createProblemReporter({
    send: async (payload) => { sent.push(payload); },
    context: () => ({ page: '/events/1', build: 'abc123', browser: 'Chrome 140 · Windows' }),
    ...overrides
  });
  return { report, sent };
}

test('Supabase, Storage and ordinary errors become a message and short details', () => {
  assert.deepEqual(describeProblem({ message: 'new row violates row-level security policy', code: '42501', details: null, hint: null }),
    { message: 'new row violates row-level security policy', detail: { code: '42501' } });
  assert.deepEqual(describeProblem({ message: 'mime type image/webp is not supported', statusCode: '400', error: 'Bad Request' }).detail, { statusCode: '400' });
  assert.equal(describeProblem(new Error('boom')).message, 'boom');
  assert.deepEqual(describeProblem(new TypeError('x is undefined')).detail, { name: 'TypeError' });
  assert.equal(describeProblem('plain text').message, 'plain text');
  assert.equal(describeProblem(undefined).message, 'Unknown problem');
});

test('lost connections, cancelled requests and browser add-ons are not reported', () => {
  for (const message of ['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed', 'AbortError: The user aborted a request.', 'ResizeObserver loop limit exceeded', 'Script error.', 'JWT expired', '  ']) {
    assert.equal(isNoise(message), true, message);
  }
  assert.equal(isNoise('Cannot read properties of undefined', 'at chrome-extension://abc/inject.js:1:1'), true);
  assert.equal(isNoise('Upload failed: mime type image/webp is not supported'), false);
  assert.equal(isNoise('current transaction is aborted, commands ignored'), false, 'a database message is kept');
});

test('a problem is sent once per visit, with page, release and browser', async () => {
  const { report, sent } = reporter();
  assert.equal(report('upload', { message: 'mime type not supported', statusCode: '400' }, { type: 'image/webp' }), true);
  assert.equal(report('upload', { message: 'mime type not supported', statusCode: '400' }), false, 'the same problem again');
  assert.equal(report('save', { message: 'mime type not supported' }), true, 'a different kind is a different problem');
  await flush();
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0], {
    kind: 'upload', message: 'mime type not supported', detail: '{"statusCode":"400","type":"image/webp"}',
    page: '/events/1', build: 'abc123', browser: 'Chrome 140 · Windows'
  });
});

test('nothing is sent offline, past the limit, or when sending itself fails', async () => {
  const offline = reporter({ isOnline: () => false });
  assert.equal(offline.report('save', 'Server said no'), false);

  const limited = reporter({ maxReports: 2 });
  limited.report('save', 'one'); limited.report('save', 'two');
  assert.equal(limited.report('save', 'three'), false);

  const failing = createProblemReporter({ send: async () => { throw new Error('network down'); }, context: () => ({ page: '', build: '', browser: '' }) });
  assert.equal(failing('crash', new Error('render failed')), true, 'reporting never throws');
  await flush();
});

test('crashes carry the top of the stack; long messages are cut', async () => {
  const { report, sent } = reporter();
  const error = new Error('x'.repeat(800));
  error.stack = 'Error: x\n    at Board (index.js:1:2)\n    at render (index.js:3:4)\n    at a\n    at b';
  report('crash', error);
  await flush();
  assert.equal(sent[0].message.length, 500);
  assert.match(sent[0].detail, /"where":"Error: x \| at Board \(index.js:1:2\) \| at render \(index.js:3:4\)"/);
});

test('helpers: stack lines, browser names, file facts', () => {
  assert.equal(firstLines('a\n\n  b  \nc\nd', 3), 'a | b | c');
  assert.equal(firstLines(undefined, 2), '');
  assert.equal(summarizeBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'), 'Chrome 140 · Windows');
  assert.equal(summarizeBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0'), 'Edge 140 · Windows');
  assert.equal(summarizeBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'), 'Safari 18 · iPhone');
  assert.equal(summarizeBrowser('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0 Mobile Safari/537.36 Line/14.10.0'), 'LINE 14 · Android');
  assert.deepEqual(fileFacts({ name: 'IMG_1.HEIC', type: '', size: 2048 }), { file: 'IMG_1.HEIC', type: 'unknown', size: '2 KB' });
  assert.deepEqual(fileFacts(undefined), {});
});
