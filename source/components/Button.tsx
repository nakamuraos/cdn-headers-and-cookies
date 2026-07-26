import type {ButtonHTMLAttributes} from 'react';

type Variant = 'default' | 'primary' | 'danger' | 'icon';

const base =
  'skin-rounded-sm cursor-pointer border font-[inherit] text-[length:inherit] disabled:cursor-not-allowed disabled:opacity-50';

const variants: Record<Variant, string> = {
  default:
    'border-line-strong bg-surface text-ink px-2.5 py-1 hover:bg-surface-3',
  primary:
    'border-accent bg-accent text-accent-ink px-2.5 py-1 hover:brightness-110',
  danger: 'border-crit bg-surface text-crit px-2.5 py-1 hover:bg-crit-soft',
  icon: 'border-transparent bg-transparent text-ink-dim grid size-7 place-items-center hover:bg-surface-3 hover:text-ink aria-expanded:border-accent aria-expanded:bg-accent-soft aria-expanded:text-accent',
};

export function Button({
  variant = 'default',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {variant?: Variant}): React.JSX.Element {
  return (
    <button type="button" className={`${base} ${variants[variant]} ${className}`} {...props} />
  );
}
