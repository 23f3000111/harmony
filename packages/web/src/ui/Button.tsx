import clsx from 'clsx';
import { LoaderCircle, type LucideIcon } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';

export type ButtonVariant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger' | 'white' | 'glass';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-[transform,background-color,box-shadow,color,border-color] duration-200 ease-out active:scale-[.97] disabled:pointer-events-none disabled:opacity-55';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white shadow-glow hover:-translate-y-0.5 hover:bg-brand-700',
  secondary: 'border border-line bg-white text-ink hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-soft',
  soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
  ghost: 'text-ink-muted hover:bg-brand-50 hover:text-brand-700',
  danger: 'bg-coral-50 text-coral-700 hover:bg-coral-100',
  white: 'bg-white text-brand-800 shadow-soft hover:-translate-y-0.5 hover:shadow-card',
  glass: 'border border-white/40 text-white hover:-translate-y-0.5 hover:bg-white/15',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-4 text-[13px]',
  md: 'h-11 px-5 text-[14px]',
  lg: 'h-12 px-7 text-[15px]',
};

const iconSize: Record<ButtonSize, string> = { sm: 'size-3.5', md: 'size-4', lg: 'size-[18px]' };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'primary', size = 'md', icon: Icon, loading, className, children, type = 'button', ...props }, ref) {
  return (
    <button ref={ref} type={type} className={clsx(base, variants[variant], sizes[size], className)} {...props} disabled={props.disabled || loading} aria-busy={loading || undefined}>
      {loading ? <LoaderCircle aria-hidden className={clsx(iconSize[size], 'animate-spin')} /> : Icon ? <Icon aria-hidden className={iconSize[size]} /> : null}
      {children}
    </button>
  );
});

export function LinkButton({ variant = 'primary', size = 'md', icon: Icon, className, children, ...props }: LinkProps & { variant?: ButtonVariant; size?: ButtonSize; icon?: LucideIcon; children?: ReactNode }) {
  return (
    <Link className={clsx(base, variants[variant], sizes[size], className)} {...props}>
      {Icon ? <Icon aria-hidden className={iconSize[size]} /> : null}
      {children}
    </Link>
  );
}

export function IconButton({ icon: Icon, label, className, size = 'md', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(
        'grid shrink-0 place-items-center rounded-full text-ink-muted transition-[transform,background-color,color] duration-150 hover:bg-brand-50 hover:text-brand-700 active:scale-90 disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' ? 'size-8' : 'size-10',
        className,
      )}
      {...props}
    >
      <Icon aria-hidden className={size === 'sm' ? 'size-4' : 'size-[18px]'} />
    </button>
  );
}
