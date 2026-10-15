import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { sortContacts, type SavedContact } from '../lib/savedContacts';

export type SavedContactInput = Pick<SavedContact, 'name' | 'role' | 'phone' | 'email'>;

const trimmed = (input: SavedContactInput): SavedContactInput => ({
  name: input.name.trim(),
  role: (input.role ?? '').trim(),
  phone: (input.phone ?? '').trim(),
  email: (input.email ?? '').trim()
});

/** Every saved contact, by name. A short list, read once and kept for a while. */
export function useSavedContacts() {
  return useQuery({
    queryKey: ['saved-contacts'],
    staleTime: 10 * 60_000,
    // Before the database has the list, the field works as it always did
    retry: false,
    queryFn: async (): Promise<SavedContact[]> => {
      const { data, error } = await supabase.from('saved_contacts').select('*').order('name');
      if (error) throw error;
      return sortContacts((data ?? []) as SavedContact[]);
    }
  });
}

export function useSavedContactMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['saved-contacts'] });

  const create = useMutation({
    mutationFn: async ({ input, userId }: { input: SavedContactInput; userId: string }): Promise<SavedContact> => {
      const { data, error } = await supabase
        .from('saved_contacts')
        .insert({ ...trimmed(input), created_by: userId })
        .select()
        .single();
      if (error) throw error;
      return data as SavedContact;
    },
    onSuccess: invalidate
  });

  const update = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: SavedContactInput }) => {
      const { error } = await supabase.from('saved_contacts').update(trimmed(input)).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('saved_contacts').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate
  });

  return { create, update, remove };
}
