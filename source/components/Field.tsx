import type {InputHTMLAttributes, SelectHTMLAttributes} from 'react';

const control =
  'skin-rounded-sm border border-line-strong bg-surface text-ink px-1.5 py-1 font-[inherit] text-[length:inherit] min-w-0';

export function TextInput({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return <input className={`${control} ${className}`} {...props} />;
}

export function Select({
  className = '',
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element {
  return <select className={`${control} ${className}`} {...props} />;
}

export function Checkbox({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {label?: string}): React.JSX.Element {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5">
      <input type="checkbox" className="accent-[var(--accent)]" {...props} />
      {label ? <span>{label}</span> : null}
    </label>
  );
}
