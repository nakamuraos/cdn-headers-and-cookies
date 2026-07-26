import browser from 'webextension-polyfill';

import {hostFromUrl, isCapturableUrl} from '@/lib/hosts';
import {pushRequest, truncateHeaders} from '@/lib/ringBuffer';
import {injectedHeaders} from './rules';
import {patchSettings, readCapture, readSettings, writeCapture} from './store';
import {detectPreset} from '@/lib/presets';
import {updateBadge} from './badge';
import type {CapturedRequest, HeaderEntry, RequestHop} from '@/types';

const URL_FILTER = {urls: ['http://*/*', 'https://*/*']};

/**
 * Requests are held in memory for the life of the worker and mirrored to
 * session storage on every write, so a restart resumes from what was already
 * recorded rather than from nothing.
 */
const memory = new Map<number, CapturedRequest[]>();

/**
 * Recording a request needs asynchronous reads, while the listeners that
 * trigger it are synchronous and can fire faster than those reads settle. Work
 * for a tab is therefore chained, so a response is never recorded against a
 * request that has not been stored yet.
 */
const queues = new Map<number, Promise<unknown>>();

function enqueue(tabId: number, task: () => Promise<void>): void {
  const previous = queues.get(tabId) ?? Promise.resolve();
  const next = previous.then(task, task);

  queues.set(
    tabId,
    next.catch(() => undefined)
  );
}

async function logFor(tabId: number): Promise<CapturedRequest[]> {
  const cached = memory.get(tabId);
  if (cached) return cached;

  const stored = await readCapture(tabId);
  memory.set(tabId, stored);

  return stored;
}

async function commit(tabId: number, request: CapturedRequest): Promise<void> {
  const {captureLimit} = await readSettings();
  const next = pushRequest(await logFor(tabId), request, captureLimit);

  memory.set(tabId, next);
  await writeCapture(tabId, next);

  if (request.type === 'main_frame') {
    await updateBadge(tabId, request);
  }
}

/**
 * Records which CDN a host runs, which is what Auto injects for. Written only
 * on a change, since every write reconciles the rules.
 */
async function rememberCdn(host: string, headers: HeaderEntry[]): Promise<void> {
  if (!host) return;

  const detected = detectPreset(headers.map((h) => h.name));
  if (!detected) return;

  const settings = await readSettings();
  if (settings.detectedHosts[host] === detected.id) return;

  await patchSettings({
    detectedHosts: {...settings.detectedHosts, [host]: detected.id},
  });
}

/** Mirrors the final hop onto the request, which is what the tables read. */
function withHops(request: CapturedRequest, hops: RequestHop[]): CapturedRequest {
  const last = hops[hops.length - 1];

  return {
    ...request,
    hops,
    url: last?.url ?? request.url,
    method: last?.method ?? request.method,
    requestHeaders: last?.requestHeaders ?? [],
    responseHeaders: last?.responseHeaders ?? [],
    statusCode: last?.statusCode,
    statusLine: last?.statusLine,
  };
}

/** Applies a patch to the hop currently in flight, the last one recorded. */
async function patchLastHop(
  tabId: number,
  requestId: string,
  patch: Partial<RequestHop>
): Promise<void> {
  const log = await logFor(tabId);
  const existing = log.find((r) => r.id === requestId);
  if (!existing || existing.hops.length === 0) return;

  const hops = existing.hops.slice();
  hops[hops.length - 1] = {...hops[hops.length - 1]!, ...patch};

  await commit(tabId, withHops(existing, hops));
}

async function update(
  tabId: number,
  requestId: string,
  patch: Partial<CapturedRequest>
): Promise<void> {
  const log = await logFor(tabId);
  const existing = log.find((r) => r.id === requestId);
  if (!existing) return;

  await commit(tabId, {...existing, ...patch});
}

function toEntries(headers: {name: string; value?: string}[] | undefined): HeaderEntry[] {
  if (!headers) return [];

  return headers.map((h) => ({name: h.name, value: h.value ?? ''}));
}

/**
 * Adds the headers the dynamic rules will set, replacing any observed header of
 * the same name, so the table reflects the request as it reaches the server.
 */
export function withInjected(
  observed: HeaderEntry[],
  injected: {name: string; value: string}[]
): HeaderEntry[] {
  const names = new Set(injected.map((h) => h.name.toLowerCase()));

  return [
    ...observed.filter((h) => !names.has(h.name.toLowerCase())),
    ...injected.map((h) => ({name: h.name, value: h.value, injected: true})),
  ];
}

export function registerCapture(): void {
  browser.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
      if (details.tabId < 0 || !isCapturableUrl(details.url)) return;

      enqueue(details.tabId, async () => {
        const settings = await readSettings();
        const host = hostFromUrl(details.url);

        if (!settings.captureSubresources && details.type !== 'main_frame') return;

        const hop: RequestHop = {
          url: details.url,
          method: details.method,
          requestHeaders: truncateHeaders(
            withInjected(
              toEntries(details.requestHeaders),
              injectedHeaders(settings, host)
            )
          ),
          responseHeaders: [],
        };

        // A redirect reuses the request id, so an id already on file means this
        // is the next hop of a chain rather than a new request.
        const existing = (await logFor(details.tabId)).find(
          (r) => r.id === details.requestId
        );

        if (existing) {
          await commit(details.tabId, withHops(existing, [...existing.hops, hop]));
          return;
        }

        // A top-level navigation starts a fresh log, so the popup only ever
        // shows requests belonging to the page currently on screen.
        if (details.type === 'main_frame') {
          memory.set(details.tabId, []);
        }

        await commit(
          details.tabId,
          withHops(
            {
              id: details.requestId,
              tabId: details.tabId,
              url: details.url,
              host,
              method: details.method,
              type: details.type,
              timeStamp: details.timeStamp,
              hops: [],
              requestHeaders: [],
              responseHeaders: [],
              completed: false,
            },
            [hop]
          )
        );
      });
    },
    URL_FILTER,
    ['requestHeaders', 'extraHeaders']
  );

  browser.webRequest.onHeadersReceived.addListener(
    (details) => {
      if (details.tabId < 0) return;

      enqueue(details.tabId, async () => {
        await patchLastHop(details.tabId, details.requestId, {
          // The status line is surfaced as a pseudo-header, as it always has been.
          responseHeaders: truncateHeaders([
            {name: 'Status', value: details.statusLine},
            ...toEntries(details.responseHeaders),
          ]),
          statusCode: details.statusCode,
          statusLine: details.statusLine,
        });

        await rememberCdn(
          hostFromUrl(details.url),
          toEntries(details.responseHeaders)
        );
      });
    },
    URL_FILTER,
    ['responseHeaders', 'extraHeaders']
  );

  browser.webRequest.onBeforeRedirect.addListener(
    (details) => {
      if (details.tabId < 0) return;

      enqueue(details.tabId, () =>
        patchLastHop(details.tabId, details.requestId, {
          responseHeaders: truncateHeaders([
            {name: 'Status', value: details.statusLine},
            ...toEntries(details.responseHeaders),
          ]),
          statusCode: details.statusCode,
          statusLine: details.statusLine,
          redirectUrl: details.redirectUrl,
        })
      );
    },
    URL_FILTER,
    ['responseHeaders', 'extraHeaders']
  );

  browser.webRequest.onCompleted.addListener((details) => {
    if (details.tabId < 0) return;
    enqueue(details.tabId, () =>
      update(details.tabId, details.requestId, {completed: true})
    );
  }, URL_FILTER);

  browser.webRequest.onErrorOccurred.addListener((details) => {
    if (details.tabId < 0) return;
    enqueue(details.tabId, () =>
      update(details.tabId, details.requestId, {
        completed: true,
        error: details.error,
      })
    );
  }, URL_FILTER);

  browser.tabs.onRemoved.addListener((tabId) => {
    memory.delete(tabId);
    queues.delete(tabId);
    void browser.storage.session.remove(`capture:${tabId}`);
  });
}

export async function snapshot(tabId: number): Promise<CapturedRequest[]> {
  return logFor(tabId);
}

export function forget(tabId: number): void {
  memory.delete(tabId);
}
