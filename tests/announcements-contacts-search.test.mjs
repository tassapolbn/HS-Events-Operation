import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDaysIso, announcementState, bangkokToday, dashboardAnnouncements, dismissKey, sortAnnouncements } from '../src/lib/announcements.ts';
import { findDuplicate, isPicked, matchesContact, sortContacts, toEventContact, togglePicked } from '../src/lib/savedContacts.ts';
import { flattenSearch, moveSelection, searchable } from '../src/lib/searchResults.ts';

const notice = (over) => ({
  id: over.id ?? 'a', message: over.message ?? 'x', tone: over.tone ?? 'info', starts_on: over.starts_on ?? '2026-10-15',
  ends_on: over.ends_on === undefined ? '2026-10-20' : over.ends_on, show_on_board: false, campus: over.campus ?? null,
  created_by: null, created_at: over.created_at ?? '2026-10-15T01:00:00Z', updated_at: over.updated_at ?? '2026-10-15T01:00:00Z'
});

test('Bangkok days: today, and moving a date', () => {
  assert.equal(bangkokToday(new Date('2026-10-15T17:30:00Z')), '2026-10-16', 'after 17:00 UTC it is tomorrow in Bangkok');
  assert.equal(bangkokToday(new Date('2026-10-15T16:59:00Z')), '2026-10-15');
  assert.equal(addDaysIso('2026-10-28', 7), '2026-11-04');
  assert.equal(addDaysIso('2026-03-01', -1), '2026-02-28');
});

test('an announcement shows from its first day to its last, then disappears', () => {
  const item = notice({ starts_on: '2026-10-15', ends_on: '2026-10-20' });
  assert.equal(announcementState(item, '2026-10-14'), 'upcoming');
  assert.equal(announcementState(item, '2026-10-15'), 'active');
  assert.equal(announcementState(item, '2026-10-20'), 'active', 'still shows on its last day');
  assert.equal(announcementState(item, '2026-10-21'), 'ended');
  assert.equal(announcementState(notice({ ends_on: null }), '2030-01-01'), 'active', 'no end date');
});

test('the Dashboard shows today\'s notices for the chosen campus, most urgent first', () => {
  const items = [
    notice({ id: 'info-both', tone: 'info' }),
    notice({ id: 'urgent-hsn', tone: 'urgent', campus: 'HSN' }),
    notice({ id: 'warn-hsc', tone: 'warning', campus: 'HSC' }),
    notice({ id: 'later', starts_on: '2026-10-18' }),
    notice({ id: 'over', starts_on: '2026-10-01', ends_on: '2026-10-10' })
  ];
  assert.deepEqual(dashboardAnnouncements(items, '2026-10-15').map((item) => item.id), ['urgent-hsn', 'warn-hsc', 'info-both']);
  assert.deepEqual(dashboardAnnouncements(items, '2026-10-15', 'HSC').map((item) => item.id), ['warn-hsc', 'info-both']);
  assert.deepEqual(sortAnnouncements([notice({ id: 'old', created_at: '2026-10-01' }), notice({ id: 'new', created_at: '2026-10-14' })]).map((item) => item.id), ['new', 'old']);
  assert.notEqual(dismissKey(notice({ updated_at: '1' })), dismissKey(notice({ updated_at: '2' })), 'an edited notice shows again');
});

const somsak = { id: 's1', name: 'Khun Somsak', role: 'Sound supplier', phone: '081-234-5678', email: 'somsak@sound.test' };
const malee = { id: 'm1', name: 'Khun Malee', role: 'Owner', phone: '', email: '' };

test('ticking a saved contact adds a copy to the event; unticking removes it', () => {
  let contacts = togglePicked([], somsak);
  assert.deepEqual(contacts, [toEventContact(somsak)]);
  assert.equal(contacts[0].contact_id, 's1');
  assert.equal(isPicked(contacts, somsak), true);
  contacts = togglePicked(contacts, somsak);
  assert.deepEqual(contacts, []);
  const full = Array.from({ length: 8 }, (_, index) => ({ name: `Person ${index}` }));
  assert.equal(togglePicked(full, malee).length, 8, 'a full event takes nobody else');
});

test('an older event contact without an id still counts as ticked when name and phone match', () => {
  assert.equal(isPicked([{ name: ' khun somsak ', phone: '0812345678' }], somsak), true);
  assert.equal(isPicked([{ name: 'Khun Somsak', phone: '099-999-9999' }], somsak), false, 'same name, another phone');
  assert.equal(isPicked([{ name: 'Khun Somsak', contact_id: 'other' }], somsak), false, 'linked to someone else');
  assert.equal(togglePicked([{ name: 'Khun Somsak', phone: '' }], somsak).length, 0, 'unticking removes the old copy too');
});

test('contacts are found by name, role, email or phone digits; duplicates are spotted', () => {
  assert.equal(matchesContact(somsak, 'sound'), true);
  assert.equal(matchesContact(somsak, '0812345678'), true);
  assert.equal(matchesContact(somsak, '234 5678'), true);
  assert.equal(matchesContact(somsak, '12'), false, 'two digits are too few to match a phone');
  assert.equal(matchesContact(malee, ''), true);
  assert.equal(findDuplicate([somsak, malee], { name: 'KHUN SOMSAK', phone: '' })?.id, 's1');
  assert.equal(findDuplicate([somsak], { name: 'Khun Somsak', phone: '02-000-0000' }), undefined);
  assert.equal(findDuplicate([somsak], { name: 'Khun Somsak', phone: '' }, 's1'), undefined, 'not a duplicate of itself');
  assert.deepEqual(sortContacts([somsak, malee]).map((item) => item.id), ['m1', 's1']);
});

const response = {
  events: [{ id: 'e1', name: 'Sports Day', event_date: '2026-10-18', campus: 'HSC', location: 'Field', status: 'scheduled', archived: false }],
  tasks: [{ id: 't1', title: 'Set chairs', event_id: 'e1', event_name: 'Sports Day', event_date: '2026-10-18', campus: 'HSC', department_id: 'd1', status: 'not_started', assigned_staff: 'Somchai', archived: false }],
  requests: [{ id: 'r1', title: 'Fix light', reference: 'R-12', request_date: '2026-10-01', due_date: null, campus: 'HSN', department_id: 'd2', status: 'new', location: '', archived: true }],
  contacts: [{ id: 'c1', name: 'Khun Somsak', role: 'Sound', phone: '081', email: '' }],
  people: [{ id: 'p1', full_name: 'Somchai H', email: 'hk@test', role: 'department_staff', department_id: 'd1' }]
};

test('search results become one list, each line knowing where it leads', () => {
  const hits = flattenSearch(response, { isAdmin: false });
  assert.deepEqual(hits.map((hit) => hit.group), ['events', 'tasks', 'requests', 'contacts', 'people']);
  assert.equal(hits[1].href, '/events/e1?task=t1', 'a job opens on its event');
  assert.equal(hits[2].archived, true);
  assert.equal(hits[2].date, '2026-10-01', 'a request without a due date shows its request date');
  assert.equal(hits[3].href, '/contacts?q=Khun%20Somsak');
  assert.equal(hits[4].href, null, 'people are information only, except for admins');
  assert.equal(flattenSearch(response, { isAdmin: true })[4].href, '/users?q=Somchai%20H');
  assert.deepEqual(flattenSearch(null, { isAdmin: true }), []);
  assert.equal(searchable(' a '), false);
  assert.equal(searchable('ab'), true);
});

test('arrow keys walk the lines that lead somewhere and wrap around', () => {
  const hits = flattenSearch(response, { isAdmin: false });
  assert.equal(moveSelection(hits, -1, 1), 0, 'down from nothing is the first line');
  assert.equal(moveSelection(hits, -1, -1), 3, 'up from nothing is the last line that leads somewhere');
  assert.equal(moveSelection(hits, 3, 1), 0, 'past the end wraps to the top, skipping people');
  assert.equal(moveSelection([], -1, 1), -1);
});
