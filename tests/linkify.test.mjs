import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findLinks, linkifyHtml, linkifyText } from '../src/lib/linkify.ts';

const hrefs = (text, html) => findLinks(text, html).map((link) => link.href);

test('finds http(s) and www addresses in plain text', () => {
  assert.deepEqual(hrefs('Plan: https://drive.google.com/file/d/abc/view?usp=sharing'), ['https://drive.google.com/file/d/abc/view?usp=sharing']);
  assert.deepEqual(hrefs('see www.canva.com/design/xyz and http://example.com'), ['https://www.canva.com/design/xyz', 'http://example.com']);
  assert.deepEqual(hrefs('no links here, only words.'), []);
  assert.deepEqual(hrefs('javascript:alert(1) mailto:a@b.com'), [], 'only web addresses become links');
  assert.deepEqual(hrefs('just https:// or www.'), []);
});

test('sentence punctuation and Thai text after an address are left out', () => {
  assert.deepEqual(hrefs('Open https://example.com/a.'), ['https://example.com/a']);
  assert.deepEqual(hrefs('Is it https://example.com/?q=1, or not?'), ['https://example.com/?q=1']);
  assert.deepEqual(hrefs('(map: https://maps.app.goo.gl/AbC1)'), ['https://maps.app.goo.gl/AbC1']);
  assert.deepEqual(hrefs('https://en.wikipedia.org/wiki/Phuket_(city)'), ['https://en.wikipedia.org/wiki/Phuket_(city)'], 'balanced brackets stay');
  assert.deepEqual(hrefs('ดูแผนผังที่ https://drive.google.com/abcดูให้ด้วยนะ'), ['https://drive.google.com/abc']);
});

test('plain text is split into text and links', () => {
  assert.deepEqual(linkifyText('Gate B https://maps.app.goo.gl/x1 now'), [
    { text: 'Gate B ' },
    { text: 'https://maps.app.goo.gl/x1', href: 'https://maps.app.goo.gl/x1' },
    { text: ' now' }
  ]);
  assert.deepEqual(linkifyText('Main hall'), [{ text: 'Main hall' }]);
  assert.deepEqual(linkifyText(''), [{ text: '' }]);
});

test('bare addresses in rich text become links that open in a new tab', () => {
  assert.equal(
    linkifyHtml('<p>Floor plan https://drive.google.com/file/d/abc/view?a=1&amp;b=2&nbsp;ดูไฟล์</p>'),
    '<p>Floor plan <a href="https://drive.google.com/file/d/abc/view?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">https://drive.google.com/file/d/abc/view?a=1&amp;b=2</a>&nbsp;ดูไฟล์</p>'
  );
});

test('existing links, attributes and other markup are left alone', () => {
  const linked = '<p><a href="https://x.com" target="_blank" rel="noopener">https://x.com</a> and https://y.com</p>';
  assert.equal(
    linkifyHtml(linked),
    '<p><a href="https://x.com" target="_blank" rel="noopener">https://x.com</a> and <a href="https://y.com" target="_blank" rel="noopener noreferrer">https://y.com</a></p>'
  );
  const styled = '<span style="background: url(https://evil.example/x.png)">text</span>';
  assert.equal(linkifyHtml(styled), styled, 'addresses inside tag attributes are not touched');
  assert.equal(linkifyHtml('<p><strong>Bring</strong> 20 chairs</p>'), '<p><strong>Bring</strong> 20 chairs</p>');
  assert.equal(linkifyHtml(''), '');
});
