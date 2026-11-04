import clsx from 'clsx';
import { CircleAlert } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

function Wrap({ label, hint, error, id, children, className, optional }: { label: string; hint?: ReactNode; error?: string; id: string; children: ReactNode; className?: string; optional?: boolean }) {
  return (
    <div className={clsx('min-w-0', className)}>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px] font-semibold text-ink-muted">
        {label}
        {optional && <span className="text-[12px] font-normal text-ink-soft">Optional</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 flex items-center gap-1 text-[12.5px] font-medium text-coral-600">
          <CircleAlert aria-hidden className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p className="hint mt-1.5">{hint}</p>
      ) : null}
    </div>
  );
}

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  wrapClassName?: string;
  optional?: boolean;
}

export const TextField = forwardRef<HTMLInputElement, FieldProps & InputHTMLAttributes<HTMLInputElement>>(function TextField({ label, hint, error, wrapClassName, optional, className, ...props }, ref) {
  const id = useId();
  return (
    <Wrap label={label} hint={hint} error={error} id={id} className={wrapClassName} optional={optional}>
      <input ref={ref} id={id} className={clsx('field', className)} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} {...props} />
    </Wrap>
  );
});

export function TextArea({ label, hint, error, wrapClassName, optional, className, ...props }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <Wrap label={label} hint={hint} error={error} id={id} className={wrapClassName} optional={optional}>
      <textarea id={id} className={clsx('field', className)} aria-invalid={error ? true : undefined} {...props} />
    </Wrap>
  );
}

export function SelectField({ label, hint, error, wrapClassName, optional, className, children, ...props }: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <Wrap label={label} hint={hint} error={error} id={id} className={wrapClassName} optional={optional}>
      <select id={id} className={clsx('field', className)} aria-invalid={error ? true : undefined} {...props}>
        {children}
      </select>
    </Wrap>
  );
}

export function MoneyField({ label, hint, error, wrapClassName, optional, currency = 'MYR', ...props }: FieldProps & InputHTMLAttributes<HTMLInputElement> & { currency?: string }) {
  const id = useId();
  return (
    <Wrap label={label} hint={hint} error={error} id={id} className={wrapClassName} optional={optional}>
      <div className="relative">
        <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-ink-soft">
          {currency === 'MYR' ? 'RM' : currency}
        </span>
        <input id={id} inputMode="decimal" type="number" min="0" step="0.01" className="field pl-12" aria-invalid={error ? true : undefined} {...props} />
      </div>
    </Wrap>
  );
}

export function FormError({ message }: { message?: string }) {
  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.div role="alert" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
          <p className="mb-3 flex items-start gap-2 rounded-2xl bg-coral-50 px-4 py-3 text-[14px] font-medium text-coral-700">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {message}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function usePasswordToggle() {
  const [visible, setVisible] = useState(false);
  return { type: visible ? 'text' : 'password', visible, toggle: () => setVisible((value) => !value) };
}
