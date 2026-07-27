import browser from "webextension-polyfill"
import { type Settings, defaultSettings } from "@/types"
import type { CapturedRequest } from "@/types"

const SETTINGS_KEY = "settings"
const CAPTURE_PREFIX = "capture:"

export async function readSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get(SETTINGS_KEY)
  const value = stored[SETTINGS_KEY] as Partial<Settings> | undefined

  return { ...defaultSettings, ...value }
}

export async function writeSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_KEY]: settings })
}

export async function patchSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await readSettings()), ...patch }
  await writeSettings(next)

  return next
}

/**
 * Capture logs live in session storage so that a terminated service worker
 * comes back to whatever it had already recorded.
 */
export async function readCapture(tabId: number): Promise<CapturedRequest[]> {
  const key = CAPTURE_PREFIX + tabId
  const stored = await browser.storage.session.get(key)

  return (stored[key] as CapturedRequest[] | undefined) ?? []
}

export async function writeCapture(tabId: number, requests: CapturedRequest[]): Promise<void> {
  await browser.storage.session.set({ [CAPTURE_PREFIX + tabId]: requests })
}

export async function clearCapture(tabId: number): Promise<void> {
  await browser.storage.session.remove(CAPTURE_PREFIX + tabId)
}

export async function clearAll(): Promise<void> {
  await browser.storage.local.clear()
  await browser.storage.session.clear()
}
