import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attachmentAccept, canAttach, canAttachToRequestPhotos, fileType, isAppleMobile, isHeic, needsConversion,
  pictureAccept, PDF, PPT, PPTX, STORED_TYPES
} from '../src/lib/fileTypes.ts';

test('a blank or generic type is read from the extension', () => {
  assert.equal(fileType({ name: 'IMG_0042.HEIC', type: '' }), 'image/heic');
  assert.equal(fileType({ name: 'Run sheet.pptx', type: 'application/octet-stream' }), PPTX);
  assert.equal(fileType({ name: 'old deck.ppt', type: '' }), PPT);
  assert.equal(fileType({ name: 'photo.jpg', type: 'image/jpg' }), 'image/jpeg', 'image/jpg is JPEG');
  assert.equal(fileType({ name: 'plan.png', type: 'image/png' }), 'image/png');
  assert.equal(fileType({ name: 'notes', type: '' }), '');
});

test('PowerPoint is stored as it is; HEIC, WebP, AVIF, GIF and BMP are converted first', () => {
  for (const type of [PDF, 'image/png', 'image/jpeg', PPTX, PPT]) {
    assert.equal(STORED_TYPES.has(type), true, type);
    assert.equal(needsConversion(type), false, type);
    assert.equal(canAttach(type), true, type);
  }
  for (const type of ['image/heic', 'image/heif', 'image/webp', 'image/avif', 'image/gif', 'image/bmp']) {
    assert.equal(needsConversion(type), true, type);
    assert.equal(canAttach(type), true, type);
  }
  for (const type of ['video/mp4', 'application/zip', 'text/plain', 'image/svg+xml', '']) {
    assert.equal(canAttach(type), false, type || 'blank');
  }
  assert.equal(isHeic('image/heif-sequence'), true);
  assert.equal(isHeic('image/webp'), false);
});

test('request photos take pictures and PDFs, not documents', () => {
  assert.equal(canAttachToRequestPhotos(PDF), true);
  assert.equal(canAttachToRequestPhotos('image/heic'), true);
  assert.equal(canAttachToRequestPhotos('image/jpeg'), true);
  assert.equal(canAttachToRequestPhotos(PPTX), false);
});

test('iPhones are not offered HEIC, so they convert photos to JPEG themselves', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
  const ipadDesktopMode = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.5 Safari/605.1.15';
  assert.equal(isAppleMobile(iphone), true);
  assert.equal(isAppleMobile(ipadDesktopMode, 5), true, 'an iPad asking for the desktop site');
  assert.equal(isAppleMobile(ipadDesktopMode, 0), false, 'a real Mac');
  assert.equal(attachmentAccept(true).includes('heic'), false);
  assert.equal(attachmentAccept(false).includes('.heic'), true);
  assert.match(attachmentAccept(false), /\.pptx/);
  assert.match(pictureAccept(false, true), /application\/pdf/);
  assert.doesNotMatch(pictureAccept(false, false), /pdf/);
});
