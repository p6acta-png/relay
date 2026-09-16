import Link from 'next/link';
import { cx } from '@/lib/cx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'signal';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors select-none ' +
  'disabled:pointer-events-none disabled:opacity-55 rounded-[var(--radius-md)]';

const variants: Record<Variant, string> = {
  primary: 'bg-pine-700 text-white hover:bg-pine-800 active:bg-pine-800',
  secondary: 'bg-surface text-ink border border-rule-strong hover:border-ink-3 hover:bg-white',
  ghost: 'text-ink-2 hover:text-ink hover:bg-sunken',
  danger: 'bg-surface text-danger-700 border border-danger-600/40 hover:bg-danger-50',
  signal: 'bg-signal-700 text-white hover:bg-signal-700/90',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[0.8125rem]',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-[0.9375rem]',
};

export function buttonClasses(variant: Variant = 'primary', size: Size = 'md', className?: string) {
  return cx(base, variants[variant], sizes[size], className);
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: React.ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />;
}
