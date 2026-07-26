import {useMemo, useState} from 'react';

import {Button} from '@/components/Button';
import {TextInput} from '@/components/Field';
import {HeaderTable} from '@/components/HeaderTable';
import {RedirectChain} from '@/components/RedirectChain';
import {filterHeaders, groupResponseHeaders} from '@/lib/headers';
import {detectPreset, type CdnPreset} from '@/lib/presets';
import type {CapturedRequest, CdnPresetId, Skin} from '@/types';

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

/**
 * Says which CDN answered when that can be told from the response, and offers
 * to adopt it when it is not the preset in use.
 */
function DetectedBanner({
  detected,
  selected,
  onUsePreset,
}: {
  detected: CdnPreset;
  selected: CdnPreset;
  onUsePreset?: (id: CdnPresetId) => void;
}): React.JSX.Element {
  const agrees = detected.id === selected.id;

  return (
    <div
      className={`flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 ${
        agrees ? 'text-ink-dim' : 'bg-warn-soft text-warn'
      }`}
    >
      <span>
        Served by <strong>{detected.label}</strong>
        {agrees ? null : `, but the preset is set to ${selected.label}`}
      </span>

      {agrees || !onUsePreset ? null : (
        <Button onClick={() => onUsePreset(detected.id)}>Use {detected.label}</Button>
      )}
    </div>
  );
}

export function ResponsePanel({
  request,
  preset,
  skin,
  onExport,
  onUsePreset,
}: {
  request: CapturedRequest;
  preset: CdnPreset;
  skin: Skin;
  onExport: () => void;
  onUsePreset?: (id: CdnPresetId) => void;
}): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [hop, setHop] = useState<number | null>(null);

  // The last hop is what the page ended up with, so it is the default view.
  const hops = request.hops;
  const selected = hop === null ? Math.max(hops.length - 1, 0) : hop;
  const headers = hops[selected]?.responseHeaders ?? request.responseHeaders;

  // Grouping follows whichever CDN actually answered, so the headers worth
  // reading stay at the top even when the preset says otherwise.
  const detected = useMemo(
    () => detectPreset(headers.map((h) => h.name)),
    [headers]
  );
  const grouping = detected ?? preset;

  const {cdn, other} = useMemo(
    () => groupResponseHeaders(filterHeaders(headers, query), grouping),
    [headers, query, grouping]
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

      {hops.length > 1 ? (
        <RedirectChain hops={hops} selected={selected} onSelect={setHop} />
      ) : null}

      {detected ? (
        <DetectedBanner detected={detected} selected={preset} onUsePreset={onUsePreset} />
      ) : null}

      <GroupHeading title={`${grouping.label} Response Headers`} count={cdn.length} />

      {skin === 'classic' ? (
        <p className="skin-sm border-b border-line bg-warn-soft px-3 py-1.5 text-ink-dim">
          The first 5 header values are taken from the X-Cache, X-Cache-Key and
          X-Check-Cacheable values. (display purpose only)
        </p>
      ) : null}

      <HeaderTable
        headers={cdn}
        preset={grouping}
        showHead={false}
        emptyLabel={`No ${grouping.label} headers on this response.`}
      />

      <GroupHeading title="Default Response Headers" count={other.length} />

      <HeaderTable headers={other} preset={grouping} showHead={false} />
    </div>
  );
}
