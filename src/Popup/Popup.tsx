import browser from "webextension-polyfill"
import { useCallback, useMemo, useState } from "react"
import { badgeText } from "@/Background/badge"
import { Button } from "@/components/Button"
import { Chip } from "@/components/Chip"
import { Select } from "@/components/Field"
import type { DataFormat } from "@/components/SplitButton"
import { useActiveTab } from "@/hooks/useActiveTab"
import { useAppearance } from "@/hooks/useAppearance"
import { useSettings } from "@/hooks/useSettings"
import { removeCookie, saveCookie } from "@/lib/cookies"
import {
  cookiesToCsv,
  cookiesToJson,
  cookiesToText,
  copyText,
  downloadText,
  headersToCsv,
  headersToJson,
  headersToText,
  requestToCurl,
  requestToJson,
  safeFilename,
} from "@/lib/format"
import { statusSeverity } from "@/lib/headers"
import { captureRelevance } from "@/lib/hosts"
import { getPreset } from "@/lib/presets"
import type { CapturedRequest, CustomHeader, HeaderEntry } from "@/types"
import { SettingsPanel } from "./SettingsPanel"
import { type ExportFormat, Toolbar } from "./Toolbar"
import { CookiePanel } from "./panels/CookiePanel"
import { RequestPanel } from "./panels/RequestPanel"
import { ResponsePanel } from "./panels/ResponsePanel"

type Tab = "request" | "response" | "cookies"

const TABS: { id: Tab; label: string }[] = [
  { id: "request", label: "Request Headers" },
  { id: "response", label: "Response Headers" },
  { id: "cookies", label: "Cookies" },
]

function shortLabel(request: CapturedRequest): string {
  let path = request.url
  try {
    const parsed = new URL(request.url)
    path = parsed.pathname + parsed.search
  } catch {
    // A URL that will not parse is shown as-is.
  }

  const trimmed = path.length > 40 ? `${path.slice(0, 39)}…` : path

  return `${request.method}  ${request.statusCode ?? "···"}  ${request.type}  ${trimmed}`
}

export function Popup(): React.JSX.Element {
  const { settings, update } = useSettings()
  useAppearance(settings)

  const { tabId, tabUrl, status, requests, cookies, refreshCookies } = useActiveTab()

  // The selection indexes into one tab's requests, so it is held against the
  // tab it was made on and falls back to the first request on any other.
  const [selection, setSelection] = useState<{ tabId: number | null; index: number }>({
    tabId: null,
    index: 0,
  })
  const selected = selection.tabId === tabId ? selection.index : 0
  const setSelected = (index: number): void => setSelection({ tabId, index })

  const [tab, setTab] = useState<Tab>("request")
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toast, setToast] = useState("")

  const notify = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(""), 1800)
  }, [])

  const request = requests[selected]
  const host = request?.host ?? ""
  const preset = getPreset(settings.preset)

  const customHeaders = useMemo(
    () => settings.hostHeaders[host] ?? [],
    [settings.hostHeaders, host],
  )

  // History-API navigation changes the address without issuing a request, so
  // the captured document can describe a page that is no longer on screen.
  // A page can change its address without issuing a request, through the
  // history API or by activating a page the browser prerendered. Same-origin,
  // the captured headers still describe the document on screen; cross-origin,
  // they belong to a site the user has left.
  // The same summary the toolbar icon carries: the status, or the number of
  // round trips once the request redirected.
  const outcome = badgeText(request)

  const documentRequest = requests.find((r) => r.type === "main_frame")
  const relevance = captureRelevance(tabUrl, documentRequest?.url)
  const stale = relevance === "same-document"
  const foreign = relevance === "foreign"

  const onCustomHeadersChange = (next: CustomHeader[]): void => {
    void update({ hostHeaders: { ...settings.hostHeaders, [host]: next } })
  }

  const onToggleInject = (enabled: boolean): void => {
    void update({ hostToggles: { ...settings.hostToggles, [host]: enabled } })
  }

  const onExport = (format: ExportFormat): void => {
    if (!request) return

    if (format === "csv") {
      const contents = [
        "Request Headers",
        headersToCsv(request.requestHeaders),
        "",
        "Response Headers",
        headersToCsv(request.responseHeaders),
        "",
        "Cookies",
        cookiesToCsv(cookies),
      ].join("\r\n")

      downloadText(safeFilename(host, "all", "csv"), contents, "text/csv")
      notify("Downloaded as CSV")
      return
    }

    if (format === "json") {
      downloadText(
        safeFilename(host, "all", "json"),
        requestToJson(request, cookies),
        "application/json",
      )
      notify("Downloaded as JSON")
      return
    }

    const text = format === "curl" ? requestToCurl(request) : requestToJson(request, cookies)

    void copyText(text).then(
      () => notify(format === "curl" ? "Copied as curl" : "Copied as JSON"),
      () => notify("Could not copy to the clipboard"),
    )
  }

  const copyDone = (): void => notify("Copied to the clipboard")
  const copyFailed = (): void => notify("Could not copy to the clipboard")

  const copyHeaders = (format: DataFormat, headers: HeaderEntry[]): void => {
    if (!request) return

    const text =
      format === "curl"
        ? requestToCurl(request)
        : format === "csv"
          ? headersToCsv(headers)
          : format === "text"
            ? headersToText(headers)
            : headersToJson(headers)

    void copyText(text).then(copyDone, copyFailed)
  }

  const copyCookies = (format: DataFormat): void => {
    const text =
      format === "csv"
        ? cookiesToCsv(cookies)
        : format === "text"
          ? cookiesToText(cookies)
          : cookiesToJson(cookies)

    void copyText(text).then(copyDone, copyFailed)
  }

  const MIME: Record<DataFormat, string> = {
    csv: "text/csv",
    json: "application/json",
    text: "text/plain",
    curl: "text/plain",
  }

  const EXTENSION: Record<DataFormat, string> = {
    csv: "csv",
    json: "json",
    text: "txt",
    curl: "sh",
  }

  const exportTable = (which: "request" | "response" | "cookies", format: DataFormat): void => {
    if (!request) return

    const headers = which === "request" ? request.requestHeaders : request.responseHeaders

    const contents =
      which === "cookies"
        ? format === "json"
          ? cookiesToJson(cookies)
          : format === "text"
            ? cookiesToText(cookies)
            : cookiesToCsv(cookies)
        : format === "json"
          ? headersToJson(headers)
          : format === "text"
            ? headersToText(headers)
            : format === "curl"
              ? requestToCurl(request)
              : headersToCsv(headers)

    downloadText(safeFilename(host, which, EXTENSION[format]), contents, MIME[format])
    notify(`Downloaded as ${format.toUpperCase()}`)
  }

  const reload = (): void => {
    if (tabId === null) return
    void browser.tabs.reload(tabId)
    // A popup is in the way of the page it just reloaded and is cheap to
    // reopen. A panel sits beside the page and is meant to stay.
    if (document.body.classList.contains("popup-frame")) window.close()
  }

  if (status !== "ok" || !request || foreign) {
    return (
      <main className='skin-popup flex flex-col overflow-hidden bg-surface text-ink'>
        <Toolbar
          url={tabUrl || "No page"}
          settingsOpen={settingsOpen}
          onToggleSettings={() => setSettingsOpen((open) => !open)}
          onReload={reload}
          onExport={() => undefined}
        />

        {settings.skin === "classic" ? (
          // The 2.0.6 empty state, kept word for word.
          <div className='flex flex-1 flex-col'>
            <div className='skin-display flex h-[60px] items-center justify-center bg-[#eee] text-[20px] font-bold text-[#939597]'>
              CDN Headers &amp; Cookies
            </div>
            <div className='skin-display mt-16 text-center text-[100px] leading-none text-[#c0c7c1]'>
              Oops...
            </div>
            <div className='skin-display mt-4 text-center text-[22px] text-[#bec4bf] italic'>
              {status === "restricted" ? (
                "This page is off limits to extensions."
              ) : (
                <>
                  I did not catch the fish yet.
                  <br />
                  Please reload the current page.
                </>
              )}
            </div>
            {status === "restricted" ? null : (
              <div className='mt-6 text-center'>
                <Button variant='primary' onClick={reload}>
                  Reload page
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className='flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-ink-dim'>
            <strong className='text-sm text-ink'>
              {status === "restricted" ? "This page cannot be captured" : "Nothing captured yet"}
            </strong>
            <span>
              {status === "restricted"
                ? "Browser pages such as chrome:// and the extensions gallery are off limits to extensions."
                : foreign
                  ? "The browser opened this page without making a request the extension could see, which happens when it was prerendered. Reload it to capture its headers."
                  : "This page loaded before the extension started. Reload it to capture its headers."}
            </span>
            {status === "restricted" ? null : (
              <Button variant='primary' onClick={reload}>
                Reload page
              </Button>
            )}
          </div>
        )}
      </main>
    )
  }

  return (
    <main className='skin-popup relative flex flex-col overflow-hidden bg-surface text-ink'>
      <Toolbar
        url={tabUrl || request.url}
        settingsOpen={settingsOpen}
        onToggleSettings={() => setSettingsOpen((open) => !open)}
        onReload={reload}
        onExport={onExport}
      />

      {stale ? (
        <div className='flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-warn-soft px-3 py-2 text-warn'>
          <span>
            This page changed its address without making a request, so these headers are from{" "}
            <span className='skin-mono'>{request.url}</span>
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
        <div className='flex shrink-0 items-center gap-2 border-b border-line px-3 py-2'>
          <Select
            value={selected}
            onChange={(e) => setSelected(Number(e.target.value))}
            aria-label='Captured request'
            className='skin-mono flex-1'
          >
            {requests.map((r, index) => (
              <option key={r.id} value={index}>
                {shortLabel(r)}
              </option>
            ))}
          </Select>
          <span className='skin-sm shrink-0 text-ink-dim tabular-nums'>
            {requests.length} captured
          </span>
        </div>
      ) : null}

      <div
        role='tablist'
        className='flex shrink-0 gap-0 border-b border-line classic:h-[45px] classic:items-end'
      >
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type='button'
            role='tab'
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className='-mb-px flex flex-1 cursor-pointer items-center justify-center gap-1.5 border-b-2 border-transparent px-3 py-2.5 text-center text-ink-dim aria-selected:border-accent aria-selected:font-semibold aria-selected:text-accent classic:skin-display classic:h-[35px] classic:w-1/3 classic:rounded-t classic:border classic:border-transparent classic:border-b-line classic:px-0 classic:py-0 classic:text-center classic:text-[14px] classic:font-bold classic:text-accent classic:aria-selected:border-line classic:aria-selected:border-b-transparent classic:aria-selected:bg-surface classic:aria-selected:font-bold classic:aria-selected:text-[#555]'
          >
            <span>{label}</span>
            {id === "response" && outcome ? (
              <span className='font-normal'>
                <Chip tone={statusSeverity(request.statusCode)}>{outcome}</Chip>
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "request" ? (
        <RequestPanel
          request={request}
          preset={preset}
          host={host}
          customHeaders={customHeaders}
          onCustomHeadersChange={onCustomHeadersChange}
          onExport={(format) => exportTable("request", format)}
          onCopy={(format) => copyHeaders(format, request.requestHeaders)}
        />
      ) : null}

      {tab === "response" ? (
        <ResponsePanel
          request={request}
          preset={preset}
          skin={settings.skin}
          onExport={(format) => exportTable("response", format)}
          onCopy={copyHeaders}
          onUsePreset={(id) => void update({ preset: id })}
        />
      ) : null}

      {tab === "cookies" ? (
        <CookiePanel
          cookies={cookies}
          domain={host}
          onSave={(cookie) => {
            void saveCookie(cookie).then(refreshCookies, () => notify("Could not save that cookie"))
          }}
          onDelete={(cookie) => {
            void removeCookie(cookie).then(refreshCookies, () =>
              notify("Could not delete that cookie"),
            )
          }}
          onExport={(format) => exportTable("cookies", format)}
          onCopy={copyCookies}
        />
      ) : null}

      {toast ? (
        <div
          role='status'
          className='absolute bottom-3.5 left-1/2 z-30 -translate-x-1/2 rounded-full bg-ink px-3 py-1.5 whitespace-nowrap text-surface'
        >
          {toast}
        </div>
      ) : null}
    </main>
  )
}
