import browser from "webextension-polyfill"
import type { CookieRecord } from "@/types"

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

export async function listCookies(url: string): Promise<CookieRecord[]> {
  // A domain filter only matches cookies scoped to that exact host or its
  // subdomains, so it hides the parent-domain cookies that apply to the page.
  // Matching by URL returns every cookie the address would be sent, HttpOnly
  // included.
  const cookies = await browser.cookies.getAll({ url })

  return cookies.map(toRecord).sort((a, b) => a.name.localeCompare(b.name))
}

export async function saveCookie(cookie: CookieRecord): Promise<void> {
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
    ...(cookie.storeId ? { storeId: cookie.storeId } : {}),
  })
}

export async function removeCookie(cookie: CookieRecord): Promise<void> {
  await browser.cookies.remove({
    url: cookieUrl(cookie),
    name: cookie.name,
    ...(cookie.storeId ? { storeId: cookie.storeId } : {}),
  })
}

export function describeFlags(cookie: CookieRecord): string[] {
  const flags: string[] = []

  if (cookie.secure) flags.push("Secure")
  if (cookie.httpOnly) flags.push("HttpOnly")
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
