import {describe, expect, it} from 'vitest';

import {badgeColour, badgeText} from '@/Background/badge';
import type {CapturedRequest, RequestHop} from '@/types';

function hop(statusCode?: number): RequestHop {
  return {url: 'https://x.com/', method: 'GET', requestHeaders: [], responseHeaders: [], statusCode};
}

function request(hops: RequestHop[]): CapturedRequest {
  return {
    id: '1',
    tabId: 1,
    url: 'https://x.com/',
    host: 'x.com',
    method: 'GET',
    type: 'main_frame',
    timeStamp: 0,
    hops,
    requestHeaders: [],
    responseHeaders: [],
    statusCode: hops[hops.length - 1]?.statusCode,
    completed: true,
  };
}

describe('badgeColour', () => {
  it('colours by status class', () => {
    expect(badgeColour(200)).toBe('#078f00');
    expect(badgeColour(301)).toBe('#0062a3');
    expect(badgeColour(404)).toBe('#de5500');
    expect(badgeColour(500)).toBe('#ba0000');
  });

  it('stays neutral without a status', () => {
    expect(badgeColour(undefined)).toBe('#3b3b3b');
    expect(badgeColour(100)).toBe('#3b3b3b');
  });
});

describe('badgeText', () => {
  it('shows the status code for a single round trip', () => {
    expect(badgeText(request([hop(200)]))).toBe('200');
    expect(badgeText(request([hop(404)]))).toBe('404');
  });

  it('counts the round trips once the request redirected', () => {
    expect(badgeText(request([hop(302), hop(200)]))).toBe('× 2');
    expect(badgeText(request([hop(301), hop(302), hop(200)]))).toBe('× 3');
  });

  it('shows nothing while the status is still unknown', () => {
    expect(badgeText(request([hop()]))).toBe('');
    expect(badgeText(undefined)).toBe('');
  });
});
