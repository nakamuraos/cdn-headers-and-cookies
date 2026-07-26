import browser from 'webextension-polyfill';

import {isCapturableUrl} from '@/lib/hosts';
import {forget, snapshot} from './capture';
import {clearCapture} from './store';
import type {CaptureSnapshot, ExtensionMessage} from '@/types/messages';

async function buildSnapshot(tabId: number): Promise<CaptureSnapshot> {
  const tab = await browser.tabs.get(tabId).catch(() => undefined);

  if (!isCapturableUrl(tab?.url)) {
    return {status: 'restricted', requests: []};
  }

  const requests = await snapshot(tabId);

  return {
    status: requests.length > 0 ? 'ok' : 'empty',
    requests,
  };
}

export function registerMessaging(): void {
  browser.runtime.onMessage.addListener((message: unknown) => {
    const msg = message as ExtensionMessage;

    if (msg?.type === 'GET_SNAPSHOT') {
      return buildSnapshot(msg.tabId);
    }

    if (msg?.type === 'CLEAR_TAB') {
      forget(msg.tabId);
      return clearCapture(msg.tabId).then(() => ({ok: true as const}));
    }

    return undefined;
  });
}

/** Popup and options page call this from their own context, not the worker. */
export async function requestSnapshot(tabId: number): Promise<CaptureSnapshot> {
  const response = await browser.runtime.sendMessage({type: 'GET_SNAPSHOT', tabId});

  return (response as CaptureSnapshot | undefined) ?? {status: 'empty', requests: []};
}

export async function clearTab(tabId: number): Promise<void> {
  await browser.runtime.sendMessage({type: 'CLEAR_TAB', tabId});
}
