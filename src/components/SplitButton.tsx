import { useEffect, useRef, useState } from "react"
import { Button } from "./Button"

export type DataFormat = "json" | "csv" | "text" | "curl"

const LABELS: Record<DataFormat, string> = {
  json: "JSON",
  csv: "CSV",
  text: "Plain text",
  curl: "curl",
}

/**
 * Acts in the default format on click, with the alternatives behind the caret,
 * so the common case is one click rather than a menu.
 */
export function SplitButton({
  label,
  formats,
  onPick,
  defaultFormat,
}: {
  label: string
  formats: DataFormat[]
  onPick: (format: DataFormat) => void
  defaultFormat: DataFormat
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return undefined

    const onDocumentClick = (event: MouseEvent): void => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false)
    }

    document.addEventListener("click", onDocumentClick)
    document.addEventListener("keydown", onEscape)

    return () => {
      document.removeEventListener("click", onDocumentClick)
      document.removeEventListener("keydown", onEscape)
    }
  }, [open])

  return (
    <div ref={ref} className='relative flex shrink-0'>
      <Button
        onClick={() => onPick(defaultFormat)}
        className='rounded-r-none border-r-0'
        title={`${label} as ${LABELS[defaultFormat]}`}
      >
        {label}
      </Button>

      <Button
        aria-label={`Choose a ${label.toLowerCase()} format`}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((was) => !was)
        }}
        className='rounded-l-none px-1.5'
      >
        ▾
      </Button>

      {open ? (
        <div className='skin-rounded-sm absolute top-8 right-0 z-20 flex min-w-36 flex-col border border-line-strong bg-surface p-1 shadow-lg'>
          {formats.map((format) => (
            <button
              key={format}
              type='button'
              onClick={() => {
                setOpen(false)
                onPick(format)
              }}
              className='cursor-pointer rounded-xs px-2 py-1.5 text-left hover:bg-accent-soft hover:text-accent'
            >
              {label} as {LABELS[format]}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
