import type { HeaderEntry } from "@/types"
import type { CdnPreset } from "./presets"

export type CacheState = "ok" | "warn" | "crit" | "none"

export interface HeaderGroups {
  cdn: HeaderEntry[]
  other: HeaderEntry[]
}

/**
 * Splits response headers into the preset's CDN headers and everything else,
 * preserving the order in which the preset lists them so the most useful
 * values stay at the top.
 */
export function groupResponseHeaders(headers: HeaderEntry[], preset: CdnPreset): HeaderGroups {
  const known = new Set(preset.responseHeaders)
  const rank = new Map(preset.responseHeaders.map((name, i) => [name, i]))

  const cdn: HeaderEntry[] = []
  const other: HeaderEntry[] = []

  for (const header of headers) {
    if (known.has(header.name.toLowerCase())) {
      cdn.push(header)
    } else {
      other.push(header)
    }
  }

  cdn.sort((a, b) => (rank.get(a.name.toLowerCase()) ?? 0) - (rank.get(b.name.toLowerCase()) ?? 0))

  return { cdn, other }
}

/**
 * Maps a CDN cache header value onto a severity so hits, revalidations and
 * misses are distinguishable without reading the string.
 */
export function cacheState(name: string, value: string, preset: CdnPreset): CacheState {
  if (!preset.cacheStateHeaders.includes(name.toLowerCase())) return "none"

  const v = value.toLowerCase()

  if (
    v.includes("refresh") ||
    v.includes("revalidated") ||
    v.includes("stale") ||
    v.includes("expired") ||
    v.includes("updating")
  ) {
    return "warn"
  }
  if (
    v.includes("miss") ||
    v === "no" ||
    v.includes("bypass") ||
    v.includes("dynamic") ||
    v.includes("error") ||
    v.includes("uncacheable")
  ) {
    return "crit"
  }
  if (v.includes("hit") || v === "yes") return "ok"

  return "none"
}

export function statusSeverity(status: number | undefined): CacheState {
  if (status === undefined) return "none"
  if (status >= 400) return "crit"
  if (status >= 300) return "warn"
  return "ok"
}

export function sortHeaders(
  headers: HeaderEntry[],
  key: "name" | "value",
  dir: "asc" | "desc",
): HeaderEntry[] {
  const factor = dir === "asc" ? 1 : -1
  return [...headers].sort((a, b) => a[key].localeCompare(b[key]) * factor)
}

export function filterHeaders(headers: HeaderEntry[], query: string): HeaderEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return headers
  return headers.filter(
    (h) => h.name.toLowerCase().includes(q) || h.value.toLowerCase().includes(q),
  )
}

/** The pseudo-header the capture prepends to every response. */
export const STATUS_HEADER = "status"

/**
 * Splits a status line such as "HTTP/1.1 404 Not Found" into its code and
 * reason phrase, so the row can be toned the way the toolbar icon is and the
 * phrase can be surfaced on its own.
 */
export function statusFromLine(value: string): number | undefined {
  const match = /\b([1-5]\d{2})\b/.exec(value)

  return match ? Number(match[1]) : undefined
}

/**
 * HTTP/2 dropped the reason phrase, so a status line often carries only a code.
 * These are the standard phrases, used when the line does not supply one.
 */
const REASONS: Record<number, string> = {
  200: "OK",
  201: "Created",
  202: "Accepted",
  204: "No Content",
  206: "Partial Content",
  301: "Moved Permanently",
  302: "Found",
  303: "See Other",
  304: "Not Modified",
  307: "Temporary Redirect",
  308: "Permanent Redirect",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  406: "Not Acceptable",
  408: "Request Timeout",
  409: "Conflict",
  410: "Gone",
  412: "Precondition Failed",
  413: "Payload Too Large",
  415: "Unsupported Media Type",
  418: "I'm a Teapot",
  421: "Misdirected Request",
  422: "Unprocessable Content",
  425: "Too Early",
  429: "Too Many Requests",
  451: "Unavailable For Legal Reasons",
  500: "Internal Server Error",
  501: "Not Implemented",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
  505: "HTTP Version Not Supported",
  511: "Network Authentication Required",
}

export function reasonFromLine(value: string): string {
  const match = /\b[1-5]\d{2}\b\s+(.+)$/.exec(value.trim())
  if (match?.[1]) return match[1].trim()

  const status = statusFromLine(value)

  return status === undefined ? "" : (REASONS[status] ?? "")
}
