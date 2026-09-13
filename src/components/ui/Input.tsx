import { forwardRef, useId, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

const baseField =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 ' +
  'focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-500/20 ' +
  'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 ' +
  'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 ' +
  'dark:focus:border-gold-400 dark:focus:ring-gold-400/20 dark:disabled:bg-slate-800';

interface FieldWrapperProps {
  htmlFor?: string;
  label?: string;
  error?: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export function FieldWrapper({ label, error, required, hint, children, className, htmlFor }: FieldWrapperProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
      {error && <p className="text-xs font-medium text-red-500">{error}</p>}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, required, className, ...props },
  ref
) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  return (
    <FieldWrapper htmlFor={id} label={label} error={error} required={required} hint={hint} className={className}>
      <input ref={ref} id={id} aria-invalid={!!error} required={required} className={cn(baseField, error && 'border-red-400')} {...props} />
    </FieldWrapper>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, required, className, ...props },
  ref
) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  return (
    <FieldWrapper htmlFor={id} label={label} error={error} required={required} hint={hint} className={className}>
      <textarea ref={ref} id={id} aria-invalid={!!error} required={required} className={cn(baseField, 'min-h-[90px]', error && 'border-red-400')} {...props} />
    </FieldWrapper>
  );
});

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, required, className, children, ...props },
  ref
) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  return (
    <FieldWrapper htmlFor={id} label={label} error={error} required={required} hint={hint} className={className}>
      <select ref={ref} id={id} aria-invalid={!!error} required={required} className={cn(baseField, 'appearance-none pr-8', error && 'border-red-400')} {...props}>
        {children}
      </select>
    </FieldWrapper>
  );
});
