import { useSavedContacts } from '../../hooks/useSavedContacts';

/** The id an input's list attribute names to suggest saved contacts while typing */
export const SAVED_CONTACT_NAMES = 'saved-contact-names';

/**
 * Suggestions from the saved contacts for a "who does it" field, so a name
 * that is already saved is picked rather than typed again.
 */
export function SavedContactNames() {
  const { data } = useSavedContacts();
  if (!data || data.length === 0) return null;
  return (
    <datalist id={SAVED_CONTACT_NAMES}>
      {data.map((item) => (
        <option key={item.id} value={item.name}>
          {[item.role, item.phone].filter(Boolean).join(' · ')}
        </option>
      ))}
    </datalist>
  );
}
