import {useCallback, useEffect, useState} from 'react';
import browser from 'webextension-polyfill';

import {requestSnapshot} from '@/Background/messaging';
import {listCookies} from '@/lib/cookies';
import type {CapturedRequest, CookieRecord} from '@/types';
import type {CaptureStatus} from '@/types/messages';

export interface ActiveTab {
  tabId: number | null;
  tabUrl: string;
  status: CaptureStatus;
  requests: CapturedRequest[];
  cookies: CookieRecord[];
  refreshCookies: () => Promise<void>;
}

/**
 * Resolves the active tab and its captured requests, and stays subscribed so
 * the view follows the window. A popup is torn down before the subscriptions
 * can fire, so it reads once; a side panel outlives the tab it was opened over
 * and re-reads on every switch and navigation.
 */
export function useActiveTab(): ActiveTab {
  const [tabId, setTabId] = useState<number | null>(null);
  const [tabUrl, setTabUrl] = useState('');
  const [status, setStatus] = useState<CaptureStatus>('empty');
  const [requests, setRequests] = useState<CapturedRequest[]>([]);
  const [cookies, setCookies] = useState<CookieRecord[]>([]);

  useEffect(() => {
    let active = true;

    const read = async (): Promise<void> => {
      const [tab] = await browser.tabs.query({active: true, currentWindow: true});
      if (!active) return;

      if (!tab?.id) {
        setStatus('restricted');
        return;
      }

      setTabId(tab.id);
      setTabUrl(tab.url ?? '');

      const snapshot = await requestSnapshot(tab.id);
      if (!active) return;

      setStatus(snapshot.status);
      setRequests(snapshot.requests);

      const cookieList = tab.url?.startsWith('http')
        ? await listCookies(tab.url).catch(() => [])
        : [];
      if (!active) return;

      setCookies(cookieList);
    };

    void read();

    const onActivated = (): void => void read();
    // Only the settled address is worth re-reading for; the intermediate
    // updates of a single navigation would each queue a snapshot request.
    const onUpdated = (_id: number, change: {status?: string}): void => {
      if (change.status === 'complete') void read();
    };

    browser.tabs.onActivated.addListener(onActivated);
    browser.tabs.onUpdated.addListener(onUpdated);

    return () => {
      active = false;
      browser.tabs.onActivated.removeListener(onActivated);
      browser.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);

  const refreshCookies = useCallback(async () => {
    if (!tabUrl.startsWith('http')) return;
    setCookies(await listCookies(tabUrl).catch(() => []));
  }, [tabUrl]);

  return {tabId, tabUrl, status, requests, cookies, refreshCookies};
}
