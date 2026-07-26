import {useMemo, useState} from 'react';

import {Button} from '@/components/Button';
import {TextInput} from '@/components/Field';
import {HeaderTable} from '@/components/HeaderTable';
import {filterHeaders, groupResponseHeaders} from '@/lib/headers';
import type {CdnPreset} from '@/lib/presets';
import type {CapturedRequest, Skin} from '@/types';

function GroupHeading({
  title,
  count,
}: {
  title: string;
  count: number;
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-line bg-surface-2 px-3 py-2 font-semibold classic:skin-cell-rule classic:h-[45px] classic:bg-[#efefef] classic:p-[7px] classic:text-[11px] classic:font-bold">
      <span>{title}</span>
      <span className="skin-mono skin-sm font-normal text-ink-dim">{count} headers</span>
    </div>
  );
}

export function ResponsePanel({
  request,
  preset,
  skin,
  onExport,
}: {
  request: CapturedRequest;
  preset: CdnPreset;
  skin: Skin;
  onExport: () => void;
}): React.JSX.Element {
  const [query, setQuery] = useState('');

  const {cdn, other} = useMemo(
    () => groupResponseHeaders(filterHeaders(request.responseHeaders, query), preset),
    [request.responseHeaders, query, preset]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="sticky top-0 z-2 flex items-center gap-2 border-b border-line bg-surface px-3 py-2">
        <TextInput
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter headers"
          aria-label="Filter response headers"
          className="flex-1"
        />
        <Button onClick={onExport}>Export</Button>
      </div>

      <GroupHeading title={`${preset.label} Response Headers`} count={cdn.length} />

      {skin === 'classic' ? (
        <p className="skin-sm border-b border-line bg-warn-soft px-3 py-1.5 text-ink-dim">
          The first 5 header values are taken from the X-Cache, X-Cache-Key and
          X-Check-Cacheable values. (display purpose only)
        </p>
      ) : null}

      <HeaderTable
        headers={cdn}
        preset={preset}
        showHead={false}
        emptyLabel={`No ${preset.label} headers on this response.`}
      />

      <GroupHeading title="Default Response Headers" count={other.length} />

      <HeaderTable headers={other} preset={preset} showHead={false} />
    </div>
  );
}
