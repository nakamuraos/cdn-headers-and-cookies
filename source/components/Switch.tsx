type Size = 'md' | 'sm';

const track: Record<Size, string> = {
  md: 'h-[26px] w-[44px]',
  sm: 'h-[20px] w-[34px]',
};

const knob: Record<Size, string> = {
  md: 'size-[22px] peer-checked:translate-x-[18px]',
  sm: 'size-[16px] peer-checked:translate-x-[14px]',
};

/**
 * A sliding toggle in the iOS idiom. The native checkbox stays in the tree and
 * carries the semantics and keyboard behaviour; the visible track and knob are
 * driven from its checked state.
 */
export function Switch({
  checked,
  onChange,
  label,
  size = 'md',
  id,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  size?: Size;
  id?: string;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <label
      className={`inline-flex items-center gap-2 ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      }`}
    >
      <span className="relative inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={label}
          className="peer absolute inset-0 z-1 m-0 cursor-[inherit] opacity-0"
        />
        <span
          className={`${track[size]} rounded-full bg-switch-off transition-colors duration-200 peer-checked:bg-accent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent`}
        />
        <span
          className={`${knob[size]} pointer-events-none absolute top-1/2 left-[2px] -translate-y-1/2 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.3)] transition-transform duration-200`}
        />
      </span>

      {label ? <span>{label}</span> : null}
    </label>
  );
}
