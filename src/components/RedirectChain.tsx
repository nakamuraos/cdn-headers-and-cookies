import {statusSeverity} from '@/lib/headers';
import {Chip} from './Chip';
import type {RequestHop} from '@/types';

/**
 * The route a request actually took. Each hop is selectable, since the headers
 * that caused a redirect are usually the ones worth reading.
 */
export function RedirectChain({
  hops,
  selected,
  onSelect,
}: {
  hops: RequestHop[];
  selected: number;
  onSelect: (index: number) => void;
}): React.JSX.Element {
  return (
    <div className="flex shrink-0 flex-col border-b border-line">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-surface-2 px-3 py-2 font-semibold classic:h-[45px] classic:bg-[#efefef] classic:p-[7px] classic:text-[11px] classic:font-bold">
        <span>Redirect Path</span>
        <span className="skin-mono skin-sm font-normal text-ink-dim">
          {hops.length} requests
        </span>
      </div>

      <ol className="m-0 flex list-none flex-col p-0">
        {hops.map((hop, index) => (
          <li key={`${hop.url}-${index}`} className="flex">
            <button
              type="button"
              aria-current={index === selected}
              onClick={() => onSelect(index)}
              className={`flex w-full cursor-pointer items-start gap-2 border-b border-line px-3 py-1.5 text-left ${
                index === selected ? 'bg-accent-soft' : 'hover:bg-surface-2'
              }`}
            >
              <span className="skin-mono skin-sm w-4 shrink-0 text-ink-dim tabular-nums">
                {index + 1}
              </span>

              <span className="shrink-0">
                <Chip tone={statusSeverity(hop.statusCode)}>
                  {hop.statusCode ?? '···'}
                </Chip>
              </span>

              <span className="skin-mono min-w-0 flex-1 break-all">{hop.url}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
