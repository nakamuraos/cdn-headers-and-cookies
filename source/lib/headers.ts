import type {CdnPreset} from './presets';
import type {HeaderEntry} from '@/types';

export type CacheState = 'ok' | 'warn' | 'crit' | 'none';

export interface HeaderGroups {
  cdn: HeaderEntry[];
  other: HeaderEntry[];
}

/**
 * Splits response headers into the preset's CDN headers and everything else,
 * preserving the order in which the preset lists them so the most useful
 * values stay at the top.
 */
export function groupResponseHeaders(
  headers: HeaderEntry[],
  preset: CdnPreset
): HeaderGroups {
  const known = new Set(preset.responseHeaders);
  const rank = new Map(preset.responseHeaders.map((name, i) => [name, i]));

  const cdn: HeaderEntry[] = [];
  const other: HeaderEntry[] = [];

  for (const header of headers) {
    if (known.has(header.name.toLowerCase())) {
      cdn.push(header);
    } else {
      other.push(header);
    }
  }

  cdn.sort(
    (a, b) =>
      (rank.get(a.name.toLowerCase()) ?? 0) - (rank.get(b.name.toLowerCase()) ?? 0)
  );

  return {cdn, other};
}

/**
 * Maps a CDN cache header value onto a severity so hits, revalidations and
 * misses are distinguishable without reading the string.
 */
export function cacheState(name: string, value: string, preset: CdnPreset): CacheState {
  if (!preset.cacheStateHeaders.includes(name.toLowerCase())) return 'none';

  const v = value.toLowerCase();

  if (
    v.includes('refresh') ||
    v.includes('revalidated') ||
    v.includes('stale') ||
    v.includes('expired') ||
    v.includes('updating')
  ) {
    return 'warn';
  }
  if (
    v.includes('miss') ||
    v === 'no' ||
    v.includes('bypass') ||
    v.includes('dynamic') ||
    v.includes('error') ||
    v.includes('uncacheable')
  ) {
    return 'crit';
  }
  if (v.includes('hit') || v === 'yes') return 'ok';

  return 'none';
}

export function statusSeverity(status: number | undefined): CacheState {
  if (status === undefined) return 'none';
  if (status >= 400) return 'crit';
  if (status >= 300) return 'warn';
  return 'ok';
}

export function sortHeaders(
  headers: HeaderEntry[],
  key: 'name' | 'value',
  dir: 'asc' | 'desc'
): HeaderEntry[] {
  const factor = dir === 'asc' ? 1 : -1;
  return [...headers].sort((a, b) => a[key].localeCompare(b[key]) * factor);
}

export function filterHeaders(headers: HeaderEntry[], query: string): HeaderEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return headers;
  return headers.filter(
    (h) => h.name.toLowerCase().includes(q) || h.value.toLowerCase().includes(q)
  );
}
