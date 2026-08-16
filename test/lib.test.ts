import { beforeEach, describe, expect, it, vi } from "vitest"
import browser from "webextension-polyfill"
import { withInjected } from "@/Background/capture"
import { listCookies } from "@/lib/cookies"
import {
  cookiesToJson,
  cookiesToText,
  headersToCsv,
  headersToJson,
  headersToText,
  requestToCurl,
  toCsv,
} from "@/lib/format"
import {
  cacheState,
  groupResponseHeaders,
  reasonFromLine,
  sortHeaders,
  statusFromLine,
  statusSeverity,
} from "@/lib/headers"
import { captureRelevance, hostFromUrl, isCapturableUrl, sameOrigin } from "@/lib/hosts"
import { detectPreset, getPreset, presetList, presets } from "@/lib/presets"
import { MAX_HEADER_VALUE, pushRequest, truncateValue } from "@/lib/ringBuffer"
import type { CapturedRequest } from "@/types"

function request(id: string, overrides: Partial<CapturedRequest> = {}): CapturedRequest {
  return {
    id,
    tabId: 1,
    url: "https://example.com/",
    host: "example.com",
    method: "GET",
    type: "main_frame",
    timeStamp: 0,
    hops: [],
    requestHeaders: [],
    responseHeaders: [],
    completed: false,
    ...overrides,
  }
}

describe("hostFromUrl", () => {
  it("drops a leading www so settings apply to both forms", () => {
    expect(hostFromUrl("https://www.example.com/a")).toBe("example.com")
    expect(hostFromUrl("https://example.com/a")).toBe("example.com")
  })

  it("keeps other subdomains", () => {
    expect(hostFromUrl("https://api.example.com/")).toBe("api.example.com")
  })

  it("returns an empty string for an unparseable url", () => {
    expect(hostFromUrl("not a url")).toBe("")
  })
})

describe("isCapturableUrl", () => {
  it("accepts http and https only", () => {
    expect(isCapturableUrl("https://example.com")).toBe(true)
    expect(isCapturableUrl("http://example.com")).toBe(true)
    expect(isCapturableUrl("chrome://extensions")).toBe(false)
    expect(isCapturableUrl("about:blank")).toBe(false)
    expect(isCapturableUrl(undefined)).toBe(false)
  })
})

describe("groupResponseHeaders", () => {
  const headers = [
    { name: "content-type", value: "text/html" },
    { name: "X-Check-Cacheable", value: "YES" },
    { name: "x-cache", value: "TCP_MEM_HIT from edge" },
    { name: "date", value: "today" },
  ]

  it("splits CDN headers from the rest", () => {
    const { cdn, other } = groupResponseHeaders(headers, presets.akamai)

    expect(cdn.map((h) => h.name)).toEqual(["x-cache", "X-Check-Cacheable"])
    expect(other.map((h) => h.name)).toEqual(["content-type", "date"])
  })

  it("orders CDN headers by the preset, not by arrival", () => {
    const { cdn } = groupResponseHeaders(headers, presets.akamai)

    expect(cdn[0]?.name).toBe("x-cache")
  })

  it("matches header names case insensitively", () => {
    const { cdn } = groupResponseHeaders(
      [{ name: "CF-Cache-Status", value: "HIT" }],
      presets.cloudflare,
    )

    expect(cdn).toHaveLength(1)
  })

  it("groups any known CDN header under Auto", () => {
    const { cdn, other } = groupResponseHeaders(headers, presets.auto)

    expect(cdn.map((h) => h.name)).toEqual(["x-cache", "X-Check-Cacheable"])
    expect(other.map((h) => h.name)).toEqual(["content-type", "date"])
  })
})

describe("cacheState", () => {
  it("reads hits, revalidations and misses off Akamai values", () => {
    expect(cacheState("x-cache", "TCP_MEM_HIT from edge", presets.akamai)).toBe("ok")
    expect(cacheState("x-cache", "TCP_REFRESH_HIT from edge", presets.akamai)).toBe("warn")
    expect(cacheState("x-cache", "TCP_MISS from edge", presets.akamai)).toBe("crit")
  })

  it("reads the cacheable flag", () => {
    expect(cacheState("x-check-cacheable", "YES", presets.akamai)).toBe("ok")
    expect(cacheState("x-check-cacheable", "NO", presets.akamai)).toBe("crit")
  })

  it("ignores headers the preset does not treat as cache state", () => {
    expect(cacheState("content-type", "text/html", presets.akamai)).toBe("none")
  })

  it("reads Cloudflare cache status", () => {
    expect(cacheState("cf-cache-status", "HIT", presets.cloudflare)).toBe("ok")
    expect(cacheState("cf-cache-status", "DYNAMIC", presets.cloudflare)).toBe("crit")
  })
})

describe("statusSeverity", () => {
  it("maps status classes onto severities", () => {
    expect(statusSeverity(200)).toBe("ok")
    expect(statusSeverity(304)).toBe("warn")
    expect(statusSeverity(404)).toBe("crit")
    expect(statusSeverity(undefined)).toBe("none")
  })
})

describe("sortHeaders", () => {
  const headers = [
    { name: "b", value: "2" },
    { name: "a", value: "3" },
    { name: "c", value: "1" },
  ]

  it("sorts by name in both directions", () => {
    expect(sortHeaders(headers, "name", "asc").map((h) => h.name)).toEqual(["a", "b", "c"])
    expect(sortHeaders(headers, "name", "desc").map((h) => h.name)).toEqual(["c", "b", "a"])
  })

  it("does not mutate its input", () => {
    sortHeaders(headers, "name", "asc")
    expect(headers[0]?.name).toBe("b")
  })
})

describe("ring buffer", () => {
  it("appends new requests", () => {
    const log = pushRequest([], request("1"), 10)
    expect(log.map((r) => r.id)).toEqual(["1"])
  })

  it("replaces an existing request in place", () => {
    const log = pushRequest([request("1"), request("2")], request("1", { statusCode: 200 }), 10)

    expect(log).toHaveLength(2)
    expect(log[0]?.statusCode).toBe(200)
  })

  it("evicts oldest first once the limit is reached", () => {
    let log = [request("1"), request("2"), request("3")]
    log = pushRequest(log, request("4"), 3)

    expect(log.map((r) => r.id)).toEqual(["2", "3", "4"])
  })

  it("keeps nothing when the limit is zero", () => {
    expect(pushRequest([request("1")], request("2"), 0)).toEqual([])
  })

  it("truncates oversized header values", () => {
    const long = "x".repeat(MAX_HEADER_VALUE + 100)

    expect(truncateValue(long).length).toBeLessThan(long.length)
    expect(truncateValue(long)).toMatch(/truncated/)
    expect(truncateValue("short")).toBe("short")
  })
})

describe("csv", () => {
  it("quotes cells containing commas, quotes or newlines", () => {
    expect(toCsv([["a,b", 'c"d', "e\nf"]])).toBe('"a,b","c""d","e\nf"')
  })

  it("leaves plain cells alone", () => {
    expect(toCsv([["a", "b"]])).toBe("a,b")
  })

  it("writes a header row for header exports", () => {
    expect(headersToCsv([{ name: "x-a", value: "1" }])).toBe("Name,Value\r\nx-a,1")
  })
})

describe("requestToCurl", () => {
  it("includes headers and quotes the url", () => {
    const curl = requestToCurl(
      request("1", { requestHeaders: [{ name: "Accept", value: "text/html" }] }),
    )

    expect(curl).toContain("curl 'https://example.com/'")
    expect(curl).toContain("-H 'Accept: text/html'")
  })

  it("adds the method only when it is not GET", () => {
    expect(requestToCurl(request("1"))).not.toContain("-X")
    expect(requestToCurl(request("1", { method: "POST" }))).toContain("-X POST")
  })

  it("skips HTTP/2 pseudo-headers", () => {
    const curl = requestToCurl(
      request("1", { requestHeaders: [{ name: ":authority", value: "example.com" }] }),
    )

    expect(curl).not.toContain(":authority")
  })

  it("escapes single quotes in values", () => {
    const curl = requestToCurl(request("1", { requestHeaders: [{ name: "X-A", value: "it's" }] }))

    expect(curl).toContain("'X-A: it'\\''s'")
  })
})

describe("withInjected", () => {
  it("appends injected headers and marks them", () => {
    const merged = withInjected(
      [{ name: "accept", value: "text/html" }],
      [{ name: "Pragma", value: "akamai-x-cache-on" }],
    )

    expect(merged).toHaveLength(2)
    expect(merged[1]).toEqual({
      name: "Pragma",
      value: "akamai-x-cache-on",
      injected: true,
    })
  })

  it("replaces an observed header of the same name, case insensitively", () => {
    const merged = withInjected(
      [{ name: "pragma", value: "no-cache" }],
      [{ name: "Pragma", value: "akamai-x-cache-on" }],
    )

    expect(merged).toHaveLength(1)
    expect(merged[0]?.value).toBe("akamai-x-cache-on")
    expect(merged[0]?.injected).toBe(true)
  })

  it("leaves observed headers alone when nothing is injected", () => {
    const observed = [{ name: "accept", value: "text/html" }]

    expect(withInjected(observed, [])).toEqual(observed)
  })
})

describe("cdn presets", () => {
  it("gives every preset a distinct id and a label", () => {
    const ids = presetList.map((p) => p.id)

    expect(new Set(ids).size).toBe(ids.length)
    expect(presetList.every((p) => p.label.length > 0)).toBe(true)
  })

  it("lists its cache-state headers among its response headers", () => {
    for (const preset of presetList) {
      for (const name of preset.cacheStateHeaders) {
        expect(preset.responseHeaders).toContain(name)
      }
    }
  })

  it("keeps every header name lower-cased so matching is case insensitive", () => {
    for (const preset of presetList) {
      for (const name of [...preset.responseHeaders, ...preset.fingerprint]) {
        expect(name).toBe(name.toLowerCase())
      }
    }
  })

  it("falls back to Auto for an unknown or retired id", () => {
    expect(getPreset("nope" as never).id).toBe("auto")
    expect(getPreset("none" as never).id).toBe("auto")
  })

  it("builds Auto from every named preset without injecting anything itself", () => {
    expect(presets.auto.inject).toEqual([])
    expect(presets.auto.responseHeaders).toContain("cf-cache-status")
    expect(presets.auto.responseHeaders).toContain("x-nf-request-id")
    expect(presets.auto.cacheStateHeaders).toContain("cdn-cache")
  })

  it("identifies Netlify by its request id", () => {
    expect(detectPreset(["X-NF-Request-Id"])?.id).toBe("netlify")
  })

  it("reads a Netlify RFC 9211 cache status", () => {
    expect(cacheState("cache-status", '"Netlify Edge"; hit', presets.netlify)).toBe("ok")
    expect(cacheState("cache-status", '"Netlify Edge"; fwd=miss', presets.netlify)).toBe("crit")
  })
})

describe("detectPreset", () => {
  it("names the CDN from its identifying headers", () => {
    expect(detectPreset(["X-Amz-Cf-Id", "via"])?.id).toBe("cloudfront")
    expect(detectPreset(["CF-Ray"])?.id).toBe("cloudflare")
    expect(detectPreset(["x-varnish", "age"])?.id).toBe("varnish")
    expect(detectPreset(["akamai-grn"])?.id).toBe("akamai")
  })

  it("returns nothing when no CDN is identifiable", () => {
    expect(detectPreset(["content-type", "date"])).toBeNull()
  })
})

describe("cache state across presets", () => {
  it("reads each preset own vocabulary", () => {
    expect(cacheState("cf-cache-status", "EXPIRED", presets.cloudflare)).toBe("warn")
    expect(cacheState("x-cache", "Hit from cloudfront", presets.cloudfront)).toBe("ok")
    expect(cacheState("x-cache", "Miss from cloudfront", presets.cloudfront)).toBe("crit")
    expect(cacheState("x-cache", "RefreshHit from cloudfront", presets.cloudfront)).toBe("warn")
    expect(cacheState("cdn-cache", "BYPASS", presets.bunny)).toBe("crit")
    expect(cacheState("x-goog-cache-status", "hit", presets.google)).toBe("ok")
  })
})

describe("listCookies", () => {
  const getAll = vi.mocked(browser.cookies.getAll)

  beforeEach(() => {
    getAll.mockReset()
  })

  it("queries the cookies that the address would be sent, not by domain", async () => {
    getAll.mockResolvedValue([])

    await listCookies("https://www.example.com/path")

    expect(getAll).toHaveBeenCalledWith({ url: "https://www.example.com/path" })
    expect(getAll).not.toHaveBeenCalledWith({ domain: "www.example.com" })
  })

  it("keeps HttpOnly cookies in the list", async () => {
    getAll.mockResolvedValue([
      {
        name: "session",
        value: "abc",
        domain: ".example.com",
        hostOnly: false,
        path: "/",
        secure: true,
        httpOnly: true,
        sameSite: "lax",
        session: true,
        storeId: "0",
        firstPartyDomain: "",
      },
    ])

    const cookies = await listCookies("https://www.example.com/")

    expect(cookies).toEqual([expect.objectContaining({ name: "session", httpOnly: true })])
  })
})

describe("sameOrigin", () => {
  it("accepts a different path on the same origin", () => {
    expect(sameOrigin("https://x.com/a?q=1", "https://x.com/b")).toBe(true)
  })

  it("rejects a different host, scheme or port", () => {
    expect(sameOrigin("https://x.com/", "https://y.com/")).toBe(false)
    expect(sameOrigin("https://x.com/", "http://x.com/")).toBe(false)
    expect(sameOrigin("https://x.com/", "https://x.com:8443/")).toBe(false)
  })

  it("rejects anything unparseable rather than guessing", () => {
    expect(sameOrigin("not a url", "https://x.com/")).toBe(false)
  })
})

describe("captureRelevance", () => {
  it("is current when the captured document is the page on screen", () => {
    expect(captureRelevance("https://x.com/a", "https://x.com/a")).toBe("current")
  })

  it("treats a history-API navigation as the same document", () => {
    expect(captureRelevance("https://x.com/search?q=1", "https://x.com/")).toBe("same-document")
  })

  it("treats a capture from another site as foreign", () => {
    // What an activated prerender leaves behind: the tab moved to a new site
    // without the extension seeing a request for it.
    expect(captureRelevance("https://www.google.com/search?q=ahihi", "https://ahihi.vn/")).toBe(
      "foreign",
    )
  })

  it("is current when there is nothing to compare", () => {
    expect(captureRelevance("https://x.com/", undefined)).toBe("current")
    expect(captureRelevance("", "https://x.com/")).toBe("current")
  })
})

describe("statusFromLine", () => {
  it("reads the code out of a status line", () => {
    expect(statusFromLine("HTTP/1.1 200 OK")).toBe(200)
    expect(statusFromLine("HTTP/2 404 Not Found")).toBe(404)
    expect(statusFromLine("HTTP/1.1 301 Moved Permanently")).toBe(301)
    expect(statusFromLine("HTTP/1.1 503 Service Unavailable")).toBe(503)
  })

  it("ignores a line carrying no status", () => {
    expect(statusFromLine("HTTP/1.1")).toBeUndefined()
    expect(statusFromLine("")).toBeUndefined()
  })

  it("does not mistake the protocol version for a code", () => {
    // "HTTP/2" must not read as 2, nor "1.1" as part of a code.
    expect(statusFromLine("HTTP/2 204 No Content")).toBe(204)
  })
})

describe("reasonFromLine", () => {
  it("returns the reason phrase alone", () => {
    expect(reasonFromLine("HTTP/1.1 404 Not Found")).toBe("Not Found")
    expect(reasonFromLine("HTTP/1.1 200 OK")).toBe("OK")
    expect(reasonFromLine("HTTP/1.1 301 Moved Permanently")).toBe("Moved Permanently")
  })

  it("supplies the standard phrase when the line omits it", () => {
    // HTTP/2 carries no reason phrase, so the code has to speak for itself.
    expect(reasonFromLine("HTTP/1.1 200")).toBe("OK")
    expect(reasonFromLine("HTTP/2 404")).toBe("Not Found")
    expect(reasonFromLine("HTTP/2 304")).toBe("Not Modified")
    expect(reasonFromLine("HTTP/2 503")).toBe("Service Unavailable")
  })

  it("prefers the phrase the server sent over the standard one", () => {
    expect(reasonFromLine("HTTP/1.1 404 Nope")).toBe("Nope")
  })

  it("returns nothing when there is no status at all", () => {
    expect(reasonFromLine("HTTP/1.1")).toBe("")
    expect(reasonFromLine("")).toBe("")
  })
})

describe("copy and export serialisers", () => {
  const headers = [
    { name: "x-a", value: "1" },
    { name: "x-b", value: "two, three" },
  ]

  it("writes headers as a JSON object", () => {
    expect(JSON.parse(headersToJson(headers))).toEqual({ "x-a": "1", "x-b": "two, three" })
  })

  it("writes headers as they appear on the wire", () => {
    expect(headersToText(headers)).toBe("x-a: 1\nx-b: two, three")
  })

  it("writes cookies as JSON and as name=value pairs", () => {
    const cookies = [
      {
        name: "a",
        value: "1",
        domain: "x.com",
        path: "/",
        secure: true,
        httpOnly: false,
        sameSite: "lax" as const,
        session: true,
      },
    ]

    expect(JSON.parse(cookiesToJson(cookies))[0].name).toBe("a")
    expect(cookiesToText(cookies)).toBe("a=1")
  })
})
