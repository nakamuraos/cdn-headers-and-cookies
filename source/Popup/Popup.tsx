import {useCallback, useEffect, useMemo, useState} from 'react';
import browser from 'webextension-polyfill';

import {Button} from '@/components/Button';
import {Select} from '@/components/Field';
import {SettingsPanel} from './SettingsPanel';
import {Toolbar, type ExportFormat} from './Toolbar';
import {CookiePanel} from './panels/CookiePanel';
import {RequestPanel} from './panels/RequestPanel';
import {ResponsePanel} from './panels/ResponsePanel';
import {useAppearance} from '@/hooks/useAppearance';
import {useSettings} from '@/hooks/useSettings';
import {listCookies, removeCookie, saveCookie} from '@/lib/cookies';
import {
  cookiesToCsv,
  copyText,
  downloadText,
  headersToCsv,
  requestToCurl,
  requestToJson,
  safeFilename,
} from '@/lib/format';
import {getPreset} from '@/lib/presets';
import {requestSnapshot} from '@/Background/messaging';
import {captureRelevance} from '@/lib/hosts';
import type {CaptureStatus} from '@/types/messages';
import type {CapturedRequest, CookieRecord, CustomHeader} from '@/types';

type Tab = 'request' | 'response' | 'cookies';

const TABS: {id: Tab; label: string}[] = [
  {id: 'request', label: 'Request Headers'},
  {id: 'response', label: 'Response Headers'},
  {id: 'cookies', label: 'Cookies'},
];

function shortLabel(request: CapturedRequest): string {
  let path = request.url;
  try {
    const parsed = new URL(request.url);
    path = parsed.pathname + parsed.search;
  } catch {
    // A URL that will not parse is shown as-is.
  }

  const trimmed = path.length > 40 ? `${path.slice(0, 39)}…` : path;

  return `${request.method}  ${request.statusCode ?? '···'}  ${request.type}  ${trimmed}`;
}

export function Popup(): React.JSX.Element {
  const {settings, update} = useSettings();
  useAppearance(settings);

  const [tabId, setTabId] = useState<number | null>(null);
  const [tabUrl, setTabUrl] = useState('');
  const [status, setStatus] = useState<CaptureStatus>('empty');
  const [requests, setRequests] = useState<CapturedRequest[]>([]);
  const [selected, setSelected] = useState(0);
  const [cookies, setCookies] = useState<CookieRecord[]>([]);
  const [tab, setTab] = useState<Tab>('request');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState('');

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 1800);
  }, []);

  useEffect(() => {
    void (async () => {
      const [active] = await browser.tabs.query({active: true, currentWindow: true});
      if (!active?.id) {
        setStatus('restricted');
        return;
      }

      setTabId(active.id);
      setTabUrl(active.url ?? '');

      const snapshot = await requestSnapshot(active.id);
      setStatus(snapshot.status);
      setRequests(snapshot.requests);

      if (active.url?.startsWith('http')) {
        setCookies(await listCookies(active.url).catch(() => []));
      }
    })();
  }, []);

  const request = requests[selected];
  const host = request?.host ?? '';
  const preset = getPreset(settings.preset);

  const customHeaders = useMemo(
    () => settings.hostHeaders[host] ?? [],
    [settings.hostHeaders, host]
  );

  // History-API navigation changes the address without issuing a request, so
  // the captured document can describe a page that is no longer on screen.
  // A page can change its address without issuing a request, through the
  // history API or by activating a page the browser prerendered. Same-origin,
  // the captured headers still describe the document on screen; cross-origin,
  // they belong to a site the user has left.
  const documentRequest = requests.find((r) => r.type === 'main_frame');
  const relevance = captureRelevance(tabUrl, documentRequest?.url);
  const stale = relevance === 'same-document';
  const foreign = relevance === 'foreign';

  const refreshCookies = useCallback(async () => {
    if (!tabUrl.startsWith('http')) return;
    setCookies(await listCookies(tabUrl).catch(() => []));
  }, [tabUrl]);

  const onCustomHeadersChange = (next: CustomHeader[]): void => {
    void update({hostHeaders: {...settings.hostHeaders, [host]: next}});
  };

  const onToggleInject = (enabled: boolean): void => {
    void update({hostToggles: {...settings.hostToggles, [host]: enabled}});
  };

  const onExport = (format: ExportFormat): void => {
    if (!request) return;

    if (format === 'csv') {
      const contents = [
        'Request Headers',
        headersToCsv(request.requestHeaders),
        '',
        'Response Headers',
        headersToCsv(request.responseHeaders),
        '',
        'Cookies',
        cookiesToCsv(cookies),
      ].join('\r\n');

      downloadText(safeFilename(host, 'all', 'csv'), contents, 'text/csv');
      notify('Downloaded as CSV');
      return;
    }

    if (format === 'json') {
      downloadText(
        safeFilename(host, 'all', 'json'),
        requestToJson(request, cookies),
        'application/json'
      );
      notify('Downloaded as JSON');
      return;
    }

    const text =
      format === 'curl' ? requestToCurl(request) : requestToJson(request, cookies);

    void copyText(text).then(
      () => notify(format === 'curl' ? 'Copied as curl' : 'Copied as JSON'),
      () => notify('Could not copy to the clipboard')
    );
  };

  const exportTable = (which: 'request' | 'response' | 'cookies'): void => {
    if (!request) return;

    const contents =
      which === 'cookies'
        ? cookiesToCsv(cookies)
        : headersToCsv(
            which === 'request' ? request.requestHeaders : request.responseHeaders
          );

    downloadText(safeFilename(host, which, 'csv'), contents, 'text/csv');
    notify('Downloaded as CSV');
  };

  const reload = (): void => {
    if (tabId === null) return;
    void browser.tabs.reload(tabId);
    window.close();
  };

  if (status !== 'ok' || !request || foreign) {
    return (
      <main className="skin-popup flex flex-col overflow-hidden bg-surface text-ink">
        <Toolbar
          url={tabUrl || 'No page'}
          settingsOpen={settingsOpen}
          onToggleSettings={() => setSettingsOpen((open) => !open)}
          onReload={reload}
          onExport={() => undefined}
        />

        {settings.skin === 'classic' ? (
          // The 2.0.6 empty state, kept word for word.
          <div className="flex flex-1 flex-col">
            <div className="skin-display flex h-[60px] items-center justify-center bg-[#eee] text-[20px] font-bold text-[#939597]">
              CDN Headers &amp; Cookies
            </div>
            <div className="skin-display mt-16 text-center text-[100px] leading-none text-[#c0c7c1]">
              Oops...
            </div>
            <div className="skin-display mt-4 text-center text-[22px] text-[#bec4bf] italic">
              {status === 'restricted' ? (
                'This page is off limits to extensions.'
              ) : (
                <>
                  I did not catch the fish yet.
                  <br />
                  Please reload the current page.
                </>
              )}
            </div>
            {status === 'restricted' ? null : (
              <div className="mt-6 text-center">
                <Button variant="primary" onClick={reload}>
                  Reload page
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-ink-dim">
            <strong className="text-sm text-ink">
              {status === 'restricted'
                ? 'This page cannot be captured'
                : 'Nothing captured yet'}
            </strong>
            <span>
              {status === 'restricted'
                ? 'Browser pages such as chrome:// and the extensions gallery are off limits to extensions.'
                : foreign
                  ? 'The browser opened this page without making a request the extension could see, which happens when it was prerendered. Reload it to capture its headers.'
                  : 'This page loaded before the extension started. Reload it to capture its headers.'}
            </span>
            {status === 'restricted' ? null : (
              <Button variant="primary" onClick={reload}>
                Reload page
              </Button>
            )}
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="skin-popup relative flex flex-col overflow-hidden bg-surface text-ink">
      <Toolbar
        url={tabUrl || request.url}
        settingsOpen={settingsOpen}
        onToggleSettings={() => setSettingsOpen((open) => !open)}
        onReload={reload}
        onExport={onExport}
      />

      {stale ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-warn-soft px-3 py-2 text-warn">
          <span>
            This page changed its address without making a request, so these headers
            are from <span className="skin-mono">{request.url}</span>
          </span>
          <Button onClick={reload}>Reload to capture</Button>
        </div>
      ) : null}

      {settingsOpen ? (
        <SettingsPanel
          settings={settings}
          host={host}
          injectEnabled={settings.hostToggles[host] !== false}
          onToggleInject={onToggleInject}
          onChange={(patch) => void update(patch)}
        />
      ) : null}

      {/* With subresource capture off there is only ever the document request. */}
      {settings.captureSubresources ? (
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <Select
          value={selected}
          onChange={(e) => setSelected(Number(e.target.value))}
          aria-label="Captured request"
          className="skin-mono flex-1"
        >
          {requests.map((r, index) => (
            <option key={r.id} value={index}>
              {shortLabel(r)}
            </option>
          ))}
        </Select>
        <span className="skin-sm shrink-0 text-ink-dim tabular-nums">
          {requests.length} captured
        </span>
      </div>
      ) : null}

      <div role="tablist" className="flex shrink-0 gap-0 border-b border-line classic:h-[45px] classic:items-end">
        {TABS.map(({id, label}) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className="-mb-px flex-1 cursor-pointer border-b-2 border-transparent px-3 py-2.5 text-center text-ink-dim aria-selected:border-accent aria-selected:font-semibold aria-selected:text-accent classic:skin-display classic:h-[35px] classic:w-1/3 classic:rounded-t classic:border classic:border-transparent classic:border-b-line classic:px-0 classic:py-0 classic:text-center classic:text-[14px] classic:font-bold classic:text-accent classic:aria-selected:border-line classic:aria-selected:border-b-transparent classic:aria-selected:bg-surface classic:aria-selected:font-bold classic:aria-selected:text-[#555]"
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'request' ? (
        <RequestPanel
          request={request}
          preset={preset}
          host={host}
          customHeaders={customHeaders}
          onCustomHeadersChange={onCustomHeadersChange}
          onExport={() => exportTable('request')}
        />
      ) : null}

      {tab === 'response' ? (
        <ResponsePanel
          request={request}
          preset={preset}
          skin={settings.skin}
          onExport={() => exportTable('response')}
          onUsePreset={(id) => void update({preset: id})}
        />
      ) : null}

      {tab === 'cookies' ? (
        <CookiePanel
          cookies={cookies}
          domain={host}
          onSave={(cookie) => {
            void saveCookie(cookie).then(refreshCookies, () =>
              notify('Could not save that cookie')
            );
          }}
          onDelete={(cookie) => {
            void removeCookie(cookie).then(refreshCookies, () =>
              notify('Could not delete that cookie')
            );
          }}
          onExport={() => exportTable('cookies')}
        />
      ) : null}

      {toast ? (
        <div
          role="status"
          className="absolute bottom-3.5 left-1/2 z-30 -translate-x-1/2 rounded-full bg-ink px-3 py-1.5 whitespace-nowrap text-surface"
        >
          {toast}
        </div>
      ) : null}
    </main>
  );
}
