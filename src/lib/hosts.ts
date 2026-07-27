/**
 * Hosts are the key under which per-site settings and DNR rules are stored.
 * A leading "www." is dropped so that settings made on one form of a site
 * apply to the other.
 */
export function hostFromUrl(url: string): string {
  try {
    const { hostname } = new URL(url)
    return hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

export function isCapturableUrl(url: string | undefined): boolean {
  if (!url) return false
  return /^https?:\/\//i.test(url)
}

/** Whether two URLs address the same origin. */
export function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin
  } catch {
    return false
  }
}

export type CaptureRelevance = "current" | "same-document" | "foreign"

/**
 * How far the captured document has drifted from the page on screen.
 *
 * A page can change its address without issuing a request the extension can
 * see, either through the history API or by activating a page the browser
 * prerendered. Same-origin, the captured headers still describe the document
 * being viewed and are worth showing with a caveat. Cross-origin, they belong
 * to a site that has been left and describe nothing on screen.
 */
export function captureRelevance(
  tabUrl: string,
  documentUrl: string | undefined,
): CaptureRelevance {
  if (!tabUrl || !documentUrl || documentUrl === tabUrl) return "current"

  return sameOrigin(tabUrl, documentUrl) ? "same-document" : "foreign"
}
