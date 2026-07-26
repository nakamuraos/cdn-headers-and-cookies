import {useMemo, useState} from 'react';

import {Button} from '@/components/Button';
import {TextInput} from '@/components/Field';
import {Switch} from '@/components/Switch';
import {SplitButton, type DataFormat} from '@/components/SplitButton';
import {HeaderTable, type SortKey, type SortState} from '@/components/HeaderTable';
import {validateHeader} from '@/Background/rules';
import {filterHeaders, sortHeaders} from '@/lib/headers';
import type {CdnPreset} from '@/lib/presets';
import type {CapturedRequest, CustomHeader} from '@/types';

function CustomHeaderRow({
  header,
  onChange,
  onDelete,
}: {
  header: CustomHeader;
  onChange: (next: CustomHeader) => void;
  onDelete: () => void;
}): React.JSX.Element {
  const error = validateHeader(header);

  return (
    <div className="border-b border-line px-3 py-1.5">
      <div className="flex items-center gap-1.5">
        <Switch
          size="sm"
          checked={header.enabled}
          onChange={(enabled) => onChange({...header, enabled})}
          label={`Enable ${header.name || 'header'}`}
        />
        <TextInput
          value={header.name}
          onChange={(e) => onChange({...header, name: e.target.value})}
          aria-label="Header name"
          className="skin-mono flex-1"
        />
        <TextInput
          value={header.value}
          onChange={(e) => onChange({...header, value: e.target.value})}
          aria-label="Header value"
          className="skin-mono flex-1"
        />
        <Button variant="icon" onClick={onDelete} title="Delete header" className="size-6">
          ✕
        </Button>
      </div>

      {error ? <p className="skin-sm mt-1 text-crit">{error}</p> : null}
    </div>
  );
}

export function RequestPanel({
  request,
  preset,
  host,
  customHeaders,
  onCustomHeadersChange,
  onExport,
  onCopy,
}: {
  request: CapturedRequest;
  preset: CdnPreset;
  host: string;
  customHeaders: CustomHeader[];
  onCustomHeadersChange: (next: CustomHeader[]) => void;
  onExport: (format: DataFormat) => void;
  onCopy: (format: DataFormat) => void;
}): React.JSX.Element {
  const [query, setQuery] = useState('');
  // Unsorted by default: the order headers were sent in is itself information.
  const [sort, setSort] = useState<SortState | null>(null);

  const rows = useMemo(() => {
    const filtered = filterHeaders(request.requestHeaders, query);
    return sort ? sortHeaders(filtered, sort.key, sort.dir) : filtered;
  }, [request.requestHeaders, query, sort]);

  // Cycles ascending, descending, then back to the order they arrived in.
  const toggleSort = (key: SortKey): void => {
    setSort((prev) => {
      if (prev?.key !== key) return {key, dir: 'asc'};
      return prev.dir === 'asc' ? {key, dir: 'desc'} : null;
    });
  };

  const replaceAt = (index: number, next: CustomHeader): void => {
    onCustomHeadersChange(customHeaders.map((h, i) => (i === index ? next : h)));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="sticky top-0 z-2 flex items-center gap-2 border-b border-line bg-surface px-3 py-2">
        <TextInput
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter headers"
          aria-label="Filter request headers"
          className="flex-1"
        />
        <SplitButton
          label="Copy"
          formats={['json', 'csv', 'text', 'curl']}
          defaultFormat="json"
          onPick={onCopy}
        />
        <SplitButton
          label="Export"
          formats={['csv', 'json', 'text']}
          defaultFormat="csv"
          onPick={onExport}
        />
      </div>

      <HeaderTable
        headers={rows}
        preset={preset}
        sort={sort}
        onSort={toggleSort}
      />

      <div className="mt-auto shrink-0 border-t border-line bg-surface-2">
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
          <span className="font-semibold">Custom headers for {host}</span>
          <Button
            variant="primary"
            onClick={() =>
              onCustomHeadersChange([
                ...customHeaders,
                {name: '', value: '', enabled: true},
              ])
            }
          >
            Add header
          </Button>
        </div>

        {customHeaders.length === 0 ? (
          <p className="skin-sm px-3 py-2.5 text-ink-dim">
            No custom headers for this host yet.
          </p>
        ) : (
          customHeaders.map((header, index) => (
            <CustomHeaderRow
              // Rows are positional; a name-based key would remount mid-edit.
              key={index}
              header={header}
              onChange={(next) => replaceAt(index, next)}
              onDelete={() =>
                onCustomHeadersChange(customHeaders.filter((_, i) => i !== index))
              }
            />
          ))
        )}
      </div>
    </div>
  );
}
