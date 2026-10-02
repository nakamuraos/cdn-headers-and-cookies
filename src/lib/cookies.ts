import browser from "webextension-polyfill"
import type { CookiePartitionKey, CookieRecord } from "@/types"

function toRecord(cookie: browser.Cookies.Cookie): CookieRecord {
  return {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite as CookieRecord["sameSite"],
    session: cookie.session,
    expirationDate: cookie.expirationDate,
    storeId: cookie.storeId,
    ...(cookie.partitionKey ? { partitionKey: cookie.partitionKey as CookiePartitionKey } : {}),
  }
}

/**
 * The URL a cookie must be written back to. A leading dot on the domain marks
 * a wildcard cookie and is not part of a valid URL.
 */
function cookieUrl(cookie: CookieRecord): string {
  const scheme = cookie.secure ? "https" : "http"
  const domain = cookie.domain.replace(/^\./, "")

  return `${scheme}://${domain}${cookie.path}`
}

/**
 * The cookie store the tab reads from. Without it the API falls back to the
 * store of the extension page, which is the regular one even for a private
 * window or a Firefox container tab.
 */
export async function cookieStoreFor(tabId: number): Promise<string | undefined> {
  const stores = await browser.cookies.getAllCookieStores()

  return stores.find((store) => store.tabIds.includes(tabId))?.id
}

/**
 * Whether the page would be sent a cookie from this partition. A partitioned
 * cookie belongs to the jar of a top-level site, which is a registrable
 * domain, so the page is in it when its host is that site or a subdomain of it.
 * Cookies set inside a cross-site frame chain never reach the top frame.
 */
function inPagePartition(cookie: CookieRecord, url: URL): boolean {
  const key = cookie.partitionKey
  if (!key) return true
  if (key.hasCrossSiteAncestor) return false
  if (!key.topLevelSite) return true

  try {
    const site = new URL(key.topLevelSite)

    return (
      site.protocol === url.protocol &&
      (url.hostname === site.hostname || url.hostname.endsWith(`.${site.hostname}`))
    )
  } catch {
    return false
  }
}

async function getAllCookies(
  url: string,
  storeId: string | undefined,
): Promise<browser.Cookies.Cookie[]> {
  const store = storeId ? { storeId } : {}

  try {
    // Without a partition key only unpartitioned cookies come back; an empty
    // key returns every partition.
    return await browser.cookies.getAll({ url, partitionKey: {}, ...store })
  } catch {
    // Chrome before 119 rejects the partitionKey field.
    return await browser.cookies.getAll({ url, ...store })
  }
}

export async function listCookies(url: string, tabId?: number): Promise<CookieRecord[]> {
  const storeId = tabId === undefined ? undefined : await cookieStoreFor(tabId)
  // A domain filter only matches cookies scoped to that exact host or its
  // subdomains, so it hides the parent-domain cookies that apply to the page.
  // Matching by URL returns every cookie the address would be sent, HttpOnly
  // included.
  const cookies = await getAllCookies(url, storeId)
  const page = new URL(url)

  return cookies
    .map(toRecord)
    .filter((cookie) => inPagePartition(cookie, page))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function saveCookie(cookie: CookieRecord, tabId?: number): Promise<void> {
  // A cookie added in the popup has no store yet; it belongs to the tab's.
  const storeId = cookie.storeId ?? (tabId === undefined ? undefined : await cookieStoreFor(tabId))

  await browser.cookies.set({
    url: cookieUrl(cookie),
    name: cookie.name,
    value: cookie.value,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    // Host-only cookies must not carry a domain, or the browser widens their scope.
    ...(cookie.domain.startsWith(".") ? { domain: cookie.domain } : {}),
    ...(cookie.session ? {} : { expirationDate: cookie.expirationDate }),
    ...(storeId ? { storeId } : {}),
    ...(cookie.partitionKey ? { partitionKey: cookie.partitionKey } : {}),
  })
}

export async function removeCookie(cookie: CookieRecord): Promise<void> {
  await browser.cookies.remove({
    url: cookieUrl(cookie),
    name: cookie.name,
    ...(cookie.storeId ? { storeId: cookie.storeId } : {}),
    ...(cookie.partitionKey ? { partitionKey: cookie.partitionKey } : {}),
  })
}

export function describeFlags(cookie: CookieRecord): string[] {
  const flags: string[] = []

  if (cookie.secure) flags.push("Secure")
  if (cookie.httpOnly) flags.push("HttpOnly")
  if (cookie.partitionKey) flags.push("Partitioned")
  if (cookie.sameSite && cookie.sameSite !== "unspecified") {
    flags.push(`SameSite=${cookie.sameSite}`)
  }
  flags.push(
    cookie.session || !cookie.expirationDate
      ? "Session"
      : `Expires ${new Date(cookie.expirationDate * 1000).toISOString().slice(0, 10)}`,
  )

  return flags
}
