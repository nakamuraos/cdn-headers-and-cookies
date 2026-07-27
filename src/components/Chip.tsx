import type { CacheState } from "@/lib/headers"

const tones: Record<CacheState, string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  crit: "bg-crit-soft text-crit",
  none: "bg-surface-3 text-ink-dim",
}

export function Chip({
  tone = "none",
  children,
}: {
  tone?: CacheState
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <span
      className={`skin-mono skin-sm inline-block rounded-full px-1.5 py-px classic:rounded-xs ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

/** Marks request headers this extension added, so they read apart from the browser's. */
export function InjectedTag(): React.JSX.Element {
  return (
    <span className='ml-1.5 inline-block rounded-xs bg-accent-soft px-1.5 text-[9.5px] font-medium tracking-wider text-accent uppercase align-[1px]'>
      injected
    </span>
  )
}
