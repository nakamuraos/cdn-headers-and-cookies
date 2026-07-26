import type {CapturedRequest, HeaderEntry} from '@/types';

/** A single header value long enough to threaten the session storage quota. */
export const MAX_HEADER_VALUE = 8 * 1024;

export function truncateValue(value: string): string {
  if (value.length <= MAX_HEADER_VALUE) return value;
  return `${value.slice(0, MAX_HEADER_VALUE)}… (truncated)`;
}

export function truncateHeaders(headers: HeaderEntry[]): HeaderEntry[] {
  return headers.map((h) => ({...h, value: truncateValue(h.value)}));
}

/**
 * Appends a request to a tab's log, replacing any existing entry with the same
 * id, and evicting the oldest entries once the limit is reached.
 */
export function pushRequest(
  log: CapturedRequest[],
  request: CapturedRequest,
  limit: number
): CapturedRequest[] {
  const existing = log.findIndex((r) => r.id === request.id);

  const next = existing === -1 ? [...log, request] : log.slice();
  if (existing !== -1) next[existing] = request;

  if (limit <= 0) return [];
  return next.length > limit ? next.slice(next.length - limit) : next;
}
