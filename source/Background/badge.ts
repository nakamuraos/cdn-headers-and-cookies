import browser from 'webextension-polyfill';

import type {CapturedRequest} from '@/types';

/** Status classes, coloured the way HTTP tooling conventionally does. */
const COLOURS: {min: number; colour: string}[] = [
  {min: 500, colour: '#ba0000'},
  {min: 400, colour: '#de5500'},
  {min: 300, colour: '#0062a3'},
  {min: 200, colour: '#078f00'},
];

const NEUTRAL = '#3b3b3b';

export function badgeColour(status: number | undefined): string {
  if (status === undefined) return NEUTRAL;

  return COLOURS.find(({min}) => status >= min)?.colour ?? NEUTRAL;
}

/**
 * The badge reports the outcome of the page's own request: its status code,
 * or how many round trips it took when the chain redirected, since the number
 * of hops is the more interesting fact once there is more than one.
 */
export function badgeText(request: CapturedRequest | undefined): string {
  if (!request) return '';
  if (request.hops.length > 1) return `× ${request.hops.length}`;

  return request.statusCode ? String(request.statusCode) : '';
}

export async function updateBadge(
  tabId: number,
  request: CapturedRequest | undefined
): Promise<void> {
  try {
    await browser.action.setBadgeText({tabId, text: badgeText(request)});
    await browser.action.setBadgeBackgroundColor({
      tabId,
      color: badgeColour(request?.statusCode),
    });
  } catch {
    // The tab can close between the response arriving and the badge landing.
  }
}
