import {useEffect, useRef, useState} from 'react';

import {Button} from '@/components/Button';

export type ExportFormat = 'csv' | 'json' | 'curl' | 'copy-json';

const GearIcon = (): React.JSX.Element => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4" aria-hidden="true">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-2.9-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.3 14H4a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.1-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 11 4.3V4a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 2.9 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.1 2.9H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.4 1z" />
  </svg>
);

const ReloadIcon = (): React.JSX.Element => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4" aria-hidden="true">
    <path d="M21 12a9 9 0 1 1-2.6-6.4" />
    <path d="M21 3v6h-6" />
  </svg>
);

const ExportIcon = (): React.JSX.Element => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5" />
    <path d="M12 15V3" />
  </svg>
);

export function Toolbar({
  url,
  settingsOpen,
  onToggleSettings,
  onReload,
  onExport,
}: {
  url: string;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  onReload: () => void;
  onExport: (format: ExportFormat) => void;
}): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const onDocumentClick = (event: MouseEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    document.addEventListener('click', onDocumentClick);
    document.addEventListener('keydown', onEscape);

    return () => {
      document.removeEventListener('click', onDocumentClick);
      document.removeEventListener('keydown', onEscape);
    };
  }, [menuOpen]);

  const pick = (format: ExportFormat): void => {
    setMenuOpen(false);
    onExport(format);
  };

  return (
    <div className="flex shrink-0 items-center gap-2.5 border-b border-line bg-surface-2 px-3 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="skin-sm font-semibold tracking-wider text-ink-dim uppercase classic:font-bold classic:tracking-normal classic:normal-case">
          Requested URL
        </span>
        <span className="skin-mono truncate" title={url}>
          {url}
        </span>
      </div>

      <div ref={menuRef} className="relative flex shrink-0 gap-1">
        <Button
          variant="icon"
          onClick={onToggleSettings}
          aria-expanded={settingsOpen}
          title="Settings"
        >
          <GearIcon />
        </Button>

        <Button variant="icon" onClick={onReload} title="Reload page">
          <ReloadIcon />
        </Button>

        <Button
          variant="icon"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((open) => !open);
          }}
          aria-expanded={menuOpen}
          title="Export everything"
        >
          <ExportIcon />
        </Button>

        {menuOpen ? (
          <div className="skin-rounded-sm absolute top-8 right-0 z-20 flex min-w-48 flex-col border border-line-strong bg-surface p-1 shadow-lg">
            <p className="skin-sm m-0 px-2 pt-1 pb-0.5 font-semibold tracking-wider text-ink-dim uppercase">
              Download
            </p>
            <button
              type="button"
              onClick={() => pick('csv')}
              className="cursor-pointer rounded-xs px-2 py-1.5 text-left hover:bg-accent-soft hover:text-accent"
            >
              Everything as CSV
            </button>
            <button
              type="button"
              onClick={() => pick('json')}
              className="cursor-pointer rounded-xs px-2 py-1.5 text-left hover:bg-accent-soft hover:text-accent"
            >
              Everything as JSON
            </button>

            <hr className="my-1 border-line" />

            <p className="skin-sm m-0 px-2 pt-1 pb-0.5 font-semibold tracking-wider text-ink-dim uppercase">
              Copy
            </p>
            <button
              type="button"
              onClick={() => pick('copy-json')}
              className="cursor-pointer rounded-xs px-2 py-1.5 text-left hover:bg-accent-soft hover:text-accent"
            >
              Copy as JSON
            </button>
            <button
              type="button"
              onClick={() => pick('curl')}
              className="cursor-pointer rounded-xs px-2 py-1.5 text-left hover:bg-accent-soft hover:text-accent"
            >
              Copy as curl
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
