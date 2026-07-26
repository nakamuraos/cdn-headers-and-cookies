import {Chip, InjectedTag} from './Chip';
import {cacheState} from '@/lib/headers';
import type {CdnPreset} from '@/lib/presets';
import type {HeaderEntry} from '@/types';

export type SortKey = 'name' | 'value';
export type SortDir = 'asc' | 'desc';

export interface SortState {
  key: SortKey;
  dir: SortDir;
}

function SortableHeading({
  label,
  sortKey,
  sort,
  onSort,
  width,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState | null | undefined;
  onSort: (key: SortKey) => void;
  width?: string;
}): React.JSX.Element {
  const active = sort?.key === sortKey;

  return (
    <th
      scope="col"
      style={width ? {width} : undefined}
      aria-sort={active ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className="skin-cell skin-sm skin-cell-rule sticky top-0 z-1 cursor-pointer border-b border-line bg-surface-2 text-left font-semibold tracking-wider text-ink uppercase select-none classic:skin-display classic:bg-[#f5f5f5] classic:text-[12px] classic:font-semibold classic:tracking-normal classic:normal-case"
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="cursor-pointer font-[inherit] text-[length:inherit] tracking-[inherit] uppercase classic:normal-case"
      >
        {label}
        <span className={`ml-1 text-[9px] ${active ? 'text-accent' : 'text-line-strong'}`}>
          {active && sort?.dir === 'desc' ? '▼' : '▲'}
        </span>
      </button>
    </th>
  );
}

export function HeaderTable({
  headers,
  preset,
  sort,
  onSort,
  emptyLabel = 'No headers match that filter.',
  showHead = true,
}: {
  headers: HeaderEntry[];
  preset: CdnPreset;
  sort?: SortState | null;
  onSort?: (key: SortKey) => void;
  emptyLabel?: string;
  showHead?: boolean;
}): React.JSX.Element {
  return (
    <table className="w-full table-fixed border-collapse">
      {showHead && onSort ? (
        <thead>
          <tr>
            <SortableHeading
              label="Name"
              sortKey="name"
              sort={sort}
              onSort={onSort}
              width="25%"
            />
            <SortableHeading label="Value" sortKey="value" sort={sort} onSort={onSort} />
          </tr>
        </thead>
      ) : null}

      <tbody>
        {headers.length === 0 ? (
          <tr>
            <td colSpan={2} className="skin-cell text-ink-dim">
              {emptyLabel}
            </td>
          </tr>
        ) : (
          headers.map((header, index) => {
            const tone = cacheState(header.name, header.value, preset);

            return (
              <tr
                key={`${header.name}-${index}`}
                className="classic:odd:bg-surface-2"
              >
                <td className="skin-cell skin-mono skin-cell-rule w-[25%] border-b border-line bg-surface-2 align-top break-words classic:break-all">
                  {header.name}
                  {header.injected ? <InjectedTag /> : null}
                </td>
                <td className="skin-cell skin-mono skin-cell-rule border-b border-line align-top break-words classic:break-all">
                  {tone === 'none' ? header.value : <Chip tone={tone}>{header.value}</Chip>}
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
