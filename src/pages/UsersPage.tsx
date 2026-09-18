import { useMemo, useState } from 'react';
import {
  KeyRound, Mail, ShieldCheck, Trash2, UserPlus, UserRoundCheck, UserRoundX
} from 'lucide-react';
import { useUserMutations, useUsers, type ManagedUser } from '../hooks/useUsers';
import { useDepartments } from '../hooks/useDepartments';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../i18n';
import { useToast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { Input, Select } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { cn, formatDate } from '../lib/utils';
import type { UserRole } from '../types';

const ROLES: UserRole[] = ['admin', 'events_team', 'department_manager', 'department_staff'];

const emptyDraft = () => ({
  full_name: '',
  username: '',
  email: '',
  password: '',
  role: 'department_staff' as UserRole,
  department_id: '',
  recovery_email: ''
});

/**
 * Accounts, for an admin.
 *
 * Someone joins, someone leaves, someone forgets a password: all three used to
 * mean opening the Supabase dashboard. Leaving is the one that matters most,
 * because an account nobody closes is an account that still works.
 */
export function UsersPage() {
  const { t, deptName, lang } = useLanguage();
  const { toast } = useToast();
  const { profile } = useAuth();
  const th = lang === 'th';
  const { data: users, isLoading, error } = useUsers();
  const { data: departments } = useDepartments();
  const { createUser, updateProfile, setPassword, setActive, deleteUser, sendResetLink } = useUserMutations();

  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [passwordFor, setPasswordFor] = useState<ManagedUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [deleting, setDeleting] = useState<ManagedUser | null>(null);
  const [search, setSearch] = useState('');

  const departmentList = departments ?? [];
  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return (users ?? []).filter(
      (item) =>
        !needle ||
        [item.full_name, item.username, item.email].join(' ').toLocaleLowerCase().includes(needle)
    );
  }, [users, search]);

  const roleLabel = (role: UserRole) => t(`roles.${role}`);

  const submitNew = async () => {
    if (!draft.full_name.trim()) {
      toast(t('users.nameRequired'), 'error');
      return;
    }
    if (!draft.username.trim() && !draft.email.trim()) {
      toast(t('users.idRequired'), 'error');
      return;
    }
    if (draft.password.length < 8) {
      toast(t('auth.passwordTooShort'), 'error');
      return;
    }
    try {
      await createUser.mutateAsync({
        full_name: draft.full_name.trim(),
        username: draft.username.trim(),
        email: draft.email.trim(),
        password: draft.password,
        role: draft.role,
        department_id: draft.department_id || null,
        recovery_email: draft.recovery_email.trim()
      });
      toast(t('users.created'));
      setAddOpen(false);
      setDraft(emptyDraft());
    } catch (creationError) {
      toast((creationError as Error).message || t('common.errorGeneric'), 'error');
    }
  };

  const savePassword = async () => {
    if (!passwordFor) return;
    if (newPassword.length < 8) {
      toast(t('auth.passwordTooShort'), 'error');
      return;
    }
    try {
      await setPassword.mutateAsync({ id: passwordFor.id, password: newPassword });
      toast(t('users.passwordSet'));
      setPasswordFor(null);
      setNewPassword('');
    } catch (passwordError) {
      toast((passwordError as Error).message || t('common.errorGeneric'), 'error');
    }
  };

  const toggleActive = async (item: ManagedUser) => {
    try {
      await setActive.mutateAsync({ id: item.id, is_active: !item.is_active });
      toast(item.is_active ? t('users.nowClosed') : t('users.nowOpen'));
    } catch (activeError) {
      toast((activeError as Error).message || t('common.errorGeneric'), 'error');
    }
  };

  if (isLoading) return <Spinner className="py-16" />;
  if (error) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-red-600">{(error as Error).message}</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-bold text-navy-800 dark:text-white">{t('users.title')}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('users.subtitle')}</p>
        </div>
        <Button onClick={() => { setDraft(emptyDraft()); setAddOpen(true); }}>
          <UserPlus className="h-4 w-4" /> {t('users.add')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{visible.length} {t('users.accounts')}</CardTitle>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('users.search')}
            aria-label={t('users.search')}
            className="w-56 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
        </CardHeader>
        <CardBody className="p-0">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {visible.map((item) => {
              const isMe = item.id === profile?.id;
              return (
                <li
                  key={item.id}
                  className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5', !item.is_active && 'opacity-60')}
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                      {item.full_name || item.username || item.email}
                      {isMe && <Badge className="bg-navy-100 text-navy-700">{t('users.you')}</Badge>}
                      {!item.is_active && <Badge className="bg-red-100 text-red-700">{t('users.closed')}</Badge>}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {item.username && <span className="font-mono font-semibold">{item.username}</span>}
                      <span>{item.email}</span>
                      <span>
                        {item.last_sign_in_at
                          ? `${t('users.lastSignIn')} ${formatDate(item.last_sign_in_at, lang, 'd MMM yyyy')}`
                          : t('users.neverSignedIn')}
                      </span>
                    </p>
                  </div>

                  <Select
                    aria-label={t('users.role')}
                    value={item.role}
                    disabled={isMe}
                    onChange={(event) => void updateProfile.mutateAsync({ id: item.id, role: event.target.value as UserRole })}
                    className="w-44"
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>{roleLabel(role)}</option>
                    ))}
                  </Select>

                  <Select
                    aria-label={t('common.department')}
                    value={item.department_id ?? ''}
                    onChange={(event) => void updateProfile.mutateAsync({ id: item.id, department_id: event.target.value || null })}
                    className="w-44"
                  >
                    <option value="">{t('users.noDepartment')}</option>
                    {departmentList.map((dept) => (
                      <option key={dept.id} value={dept.id}>{deptName(dept)}</option>
                    ))}
                  </Select>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => { setPasswordFor(item); setNewPassword(''); }}
                      title={t('users.setPassword')}
                      aria-label={t('users.setPassword')}
                      className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-navy-700 dark:hover:bg-slate-800 dark:hover:text-gold-300"
                    >
                      <KeyRound className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await sendResetLink.mutateAsync(item.username || item.email);
                        toast(t('users.resetSent'));
                      }}
                      title={t('users.sendReset')}
                      aria-label={t('users.sendReset')}
                      className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-navy-700 dark:hover:bg-slate-800 dark:hover:text-gold-300"
                    >
                      <Mail className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={isMe}
                      onClick={() => void toggleActive(item)}
                      title={item.is_active ? t('users.close') : t('users.reopen')}
                      aria-label={item.is_active ? t('users.close') : t('users.reopen')}
                      className={cn(
                        'rounded-lg p-2 disabled:cursor-not-allowed disabled:opacity-30',
                        item.is_active
                          ? 'text-slate-400 hover:bg-amber-100 hover:text-amber-700'
                          : 'text-emerald-600 hover:bg-emerald-100'
                      )}
                    >
                      {item.is_active ? <UserRoundX className="h-4 w-4" /> : <UserRoundCheck className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      disabled={isMe}
                      onClick={() => setDeleting(item)}
                      title={t('users.delete')}
                      aria-label={t('users.delete')}
                      className="rounded-lg p-2 text-slate-400 hover:bg-red-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-red-950/50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {visible.length === 0 && (
            <p className="px-4 py-10 text-center text-sm italic text-slate-400">{t('users.none')}</p>
          )}
        </CardBody>
      </Card>

      <p className="flex items-start gap-2 rounded-xl bg-slate-100 px-3.5 py-3 text-xs leading-relaxed text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> {t('users.closeVsDelete')}
      </p>

      {/* A new account */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={t('users.add')}
        subtitle={t('users.addHint')}
        footer={
          <>
            <Button variant="outline" onClick={() => setAddOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="gold" loading={createUser.isPending} onClick={() => void submitNew()}>
              {t('users.create')}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t('users.fullName')}
            required
            className="sm:col-span-2"
            value={draft.full_name}
            onChange={(event) => setDraft({ ...draft, full_name: event.target.value })}
          />
          <Input
            label={t('users.username')}
            hint={t('users.usernameHint')}
            autoCapitalize="none"
            spellCheck={false}
            value={draft.username}
            onChange={(event) => setDraft({ ...draft, username: event.target.value })}
          />
          <Input
            label={t('users.emailOptional')}
            type="email"
            hint={t('users.emailHint')}
            value={draft.email}
            onChange={(event) => setDraft({ ...draft, email: event.target.value })}
          />
          <Select
            label={t('users.role')}
            value={draft.role}
            onChange={(event) => setDraft({ ...draft, role: event.target.value as UserRole })}
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>{roleLabel(role)}</option>
            ))}
          </Select>
          <Select
            label={t('common.department')}
            value={draft.department_id}
            onChange={(event) => setDraft({ ...draft, department_id: event.target.value })}
          >
            <option value="">{t('users.noDepartment')}</option>
            {departmentList.map((dept) => (
              <option key={dept.id} value={dept.id}>{deptName(dept)}</option>
            ))}
          </Select>
          <Input
            label={t('auth.newPassword')}
            type="text"
            required
            hint={t('users.passwordHint')}
            className="sm:col-span-2"
            value={draft.password}
            onChange={(event) => setDraft({ ...draft, password: event.target.value })}
          />
          <Input
            label={t('users.recoveryEmail')}
            type="email"
            hint={t('users.recoveryHint')}
            className="sm:col-span-2"
            value={draft.recovery_email}
            onChange={(event) => setDraft({ ...draft, recovery_email: event.target.value })}
          />
        </div>
      </Modal>

      {/* Handing somebody a password face to face */}
      <Modal
        open={!!passwordFor}
        onClose={() => setPasswordFor(null)}
        title={t('users.setPassword')}
        subtitle={passwordFor?.full_name || passwordFor?.username || ''}
        footer={
          <>
            <Button variant="outline" onClick={() => setPasswordFor(null)}>{t('common.cancel')}</Button>
            <Button variant="gold" loading={setPassword.isPending} onClick={() => void savePassword()}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <Input
          label={t('auth.newPassword')}
          type="text"
          hint={th ? 'พิมพ์ให้เห็นได้ เพื่อบอกเจ้าตัวได้ถูกต้อง' : 'Shown as you type, so you can read it out correctly'}
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await deleteUser.mutateAsync(deleting.id);
            toast(t('users.deleted'));
          } catch (removeError) {
            toast((removeError as Error).message || t('common.errorGeneric'), 'error');
          }
          setDeleting(null);
        }}
        title={t('users.deleteConfirm')}
        message={t('users.deleteConfirmText')}
        loading={deleteUser.isPending}
      />
    </div>
  );
}
