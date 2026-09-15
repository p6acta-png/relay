import { useId } from 'react';
import { cx } from '@/lib/cx';

/**
 * Accessible form fields: every input has a <label>, errors are linked with aria-describedby
 * and marked with aria-invalid, so screen readers announce what went wrong and where.
 */
export const controlClasses =
  'block w-full rounded-[var(--radius-md)] border border-rule-strong bg-white px-3 text-[0.9375rem] text-ink ' +
  'placeholder:text-ink-3/70 transition-colors hover:border-ink-3 ' +
  'focus:border-pine-600 focus:outline-none focus:ring-2 focus:ring-pine-600/25 ' +
  'aria-[invalid=true]:border-danger-600 disabled:bg-sunken disabled:text-ink-3';

interface FieldProps {
  label: string;
  name: string;
  error?: string;
  hint?: React.ReactNode;
  className?: string;
  optional?: boolean;
}

function FieldShell({
  id,
  label,
  error,
  hint,
  className,
  optional,
  children,
}: Omit<FieldProps, 'name'> & { id: string; children: React.ReactNode }) {
  return (
    <div className={cx('space-y-1.5', className)}>
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-sm font-medium text-ink">
        <span>{label}</span>
        {optional && <span className="text-xs font-normal text-ink-3">Optional</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-[0.8125rem] text-ink-3">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-[0.8125rem] font-medium text-danger-700">
          {error}
        </p>
      )}
    </div>
  );
}

function describedBy(id: string, error?: string, hint?: React.ReactNode) {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

export function TextField({
  label,
  name,
  error,
  hint,
  className,
  optional,
  ...input
}: FieldProps & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'name'>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} className={className} optional={optional}>
      <input
        id={id}
        name={name}
        className={cx(controlClasses, 'h-10')}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        required={!optional}
        {...input}
      />
    </FieldShell>
  );
}

export function TextArea({
  label,
  name,
  error,
  hint,
  className,
  optional,
  ...input
}: FieldProps & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'name'>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} className={className} optional={optional}>
      <textarea
        id={id}
        name={name}
        className={cx(controlClasses, 'min-h-24 py-2 leading-relaxed')}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        required={!optional}
        {...input}
      />
    </FieldShell>
  );
}

const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8' fill='none' stroke='%23666a61' stroke-width='1.5'%3E%3Cpath d='M1 1.5 6 6.5 11 1.5'/%3E%3C/svg%3E\")";

export function SelectField({
  label,
  name,
  error,
  hint,
  className,
  optional,
  children,
  ...input
}: FieldProps & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'name'>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} className={className} optional={optional}>
      <select
        id={id}
        name={name}
        className={cx(
          controlClasses,
          'h-10 appearance-none bg-[length:12px] bg-[right_12px_center] bg-no-repeat pr-8',
        )}
        style={{ backgroundImage: CHEVRON }}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        required={!optional}
        {...input}
      >
        {children}
      </select>
    </FieldShell>
  );
}

/** Invisible to people, tempting to bots. Filled in = rejected (see modules/protection/challenge.ts). */
export function Honeypot() {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label>
        Leave this field empty
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );
}
