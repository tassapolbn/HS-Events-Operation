/**
 * Saved contacts and the contacts of one event.
 *
 * A contact is kept once (saved_contacts) and ticked into any event, which
 * keeps its own copy with the saved contact's id. The copy means a past event
 * still shows who was asked at the time; the id is how a tick box knows the
 * person is already on the event. Events from before saved contacts have no
 * ids, so a matching name and phone counts too. No React or Supabase here.
 */

import type { EventContact } from '../types';

export interface SavedContact {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

/** The most contacts one event holds (the database allows no more) */
export const MAX_EVENT_CONTACTS = 8;

const plain = (value: string | undefined | null) => (value ?? '').trim().toLocaleLowerCase();
const digits = (value: string | undefined | null) => (value ?? '').replace(/\D/g, '');

/** Whether an event's contact is this saved contact */
export function isSameContact(contact: EventContact, saved: SavedContact): boolean {
  if (contact.contact_id) return contact.contact_id === saved.id;
  if (plain(contact.name) !== plain(saved.name)) return false;
  // Same name: the same person unless both have phone numbers that differ
  const a = digits(contact.phone);
  const b = digits(saved.phone);
  return !a || !b || a === b;
}

export function isPicked(contacts: EventContact[], saved: SavedContact): boolean {
  return contacts.some((contact) => isSameContact(contact, saved));
}

/** The event's copy of a saved contact */
export function toEventContact(saved: SavedContact): EventContact {
  return { name: saved.name, role: saved.role, phone: saved.phone, email: saved.email, contact_id: saved.id };
}

/**
 * Ticks or unticks a saved contact on an event. A tick when the event is full
 * changes nothing; the caller says why.
 */
export function togglePicked(contacts: EventContact[], saved: SavedContact, max = MAX_EVENT_CONTACTS): EventContact[] {
  if (isPicked(contacts, saved)) return contacts.filter((contact) => !isSameContact(contact, saved));
  if (contacts.length >= max) return contacts;
  return [...contacts, toEventContact(saved)];
}

/** Whether a saved contact matches what was typed in the search box: name, role, email or phone */
export function matchesContact(saved: SavedContact, query: string): boolean {
  const needle = plain(query);
  if (!needle) return true;
  if ([saved.name, saved.role, saved.email].some((field) => plain(field).includes(needle))) return true;
  const typedDigits = digits(query);
  return typedDigits.length >= 3 && digits(saved.phone).includes(typedDigits);
}

/** A saved contact that is very likely the same person: same name, and no phone that says otherwise */
export function findDuplicate(list: SavedContact[], candidate: Pick<SavedContact, 'name' | 'phone'>, exceptId?: string): SavedContact | undefined {
  return list.find(
    (saved) =>
      saved.id !== exceptId &&
      plain(saved.name) === plain(candidate.name) &&
      (!digits(saved.phone) || !digits(candidate.phone) || digits(saved.phone) === digits(candidate.phone))
  );
}

/** Sorted by name, in the order a person would look for it */
export function sortContacts<T extends Pick<SavedContact, 'name'>>(list: T[]): T[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, ['th', 'en'], { sensitivity: 'base' }));
}
