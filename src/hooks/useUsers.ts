import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { UserRole } from '../types';

/** One account as the admin screen shows it. */
export interface ManagedUser {
  id: string;
  email: string;
  username: string | null;
  full_name: string;
  role: UserRole;
  department_id: string | null;
  is_active: boolean;
  recovery_email: string | null;
  created_at: string;
  /** Null means this person has never signed in */
  last_sign_in_at: string | null;
}

export interface NewUserInput {
  full_name: string;
  username: string;
  email: string;
  password: string;
  role: UserRole;
  department_id: string | null;
  recovery_email: string;
}

async function callManageUsers<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('manage-users', { body });
  if (error) {
    // The function puts the reason in the body, which the client hides behind a
    // generic message, so read it back out to say something useful.
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error((detail as { error?: string } | null)?.error || error.message);
  }
  const failed = (data as { error?: string } | null)?.error;
  if (failed) throw new Error(failed);
  return data as T;
}

export function useUsers(enabled = true) {
  return useQuery({
    queryKey: ['users'],
    enabled,
    queryFn: async (): Promise<ManagedUser[]> => {
      const data = await callManageUsers<{ users: ManagedUser[] }>({ action: 'list' });
      return data.users ?? [];
    }
  });
}

export function useUserMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['users'] });

  const createUser = useMutation({
    mutationFn: (input: NewUserInput) =>
      callManageUsers<{ ok: boolean }>({
        action: 'create',
        full_name: input.full_name,
        username: input.username,
        email: input.email,
        password: input.password,
        role: input.role,
        department_id: input.department_id,
        recovery_email: input.recovery_email
      }),
    onSuccess: invalidate
  });

  /** Role, department, username and where a reset goes are ordinary row edits. */
  const updateProfile = useMutation({
    mutationFn: async (input: {
      id: string;
      full_name?: string;
      username?: string | null;
      role?: UserRole;
      department_id?: string | null;
      recovery_email?: string | null;
    }) => {
      const { id, ...fields } = input;
      const { error } = await supabase.from('profiles').update(fields).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate
  });

  const setPassword = useMutation({
    mutationFn: (input: { id: string; password: string }) =>
      callManageUsers<{ ok: boolean }>({ action: 'set_password', id: input.id, password: input.password }),
    onSuccess: invalidate
  });

  const setActive = useMutation({
    mutationFn: (input: { id: string; is_active: boolean }) =>
      callManageUsers<{ ok: boolean }>({ action: 'set_active', id: input.id, is_active: input.is_active }),
    onSuccess: invalidate
  });

  const deleteUser = useMutation({
    mutationFn: (id: string) => callManageUsers<{ ok: boolean }>({ action: 'delete', id }),
    onSuccess: invalidate
  });

  /** Reuses the same link the sign in page sends, so there is one reset path. */
  const sendResetLink = useMutation({
    mutationFn: async (login: string) => {
      await supabase.functions.invoke('request-password-reset', { body: { login } });
    }
  });

  return { createUser, updateProfile, setPassword, setActive, deleteUser, sendResetLink };
}
