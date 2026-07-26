/**
 * Hosts are the key under which per-site settings and DNR rules are stored.
 * A leading "www." is dropped so that settings made on one form of a site
 * apply to the other.
 */
export function hostFromUrl(url: string): string {
  try {
    const {hostname} = new URL(url);
    return hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function isCapturableUrl(url: string | undefined): boolean {
  if (!url) return false;
  return /^https?:\/\//i.test(url);
}
