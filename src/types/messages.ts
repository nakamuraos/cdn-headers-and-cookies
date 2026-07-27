import type { CapturedRequest, Settings } from "./index"

export type CaptureStatus = "ok" | "empty" | "restricted"

export interface CaptureSnapshot {
  status: CaptureStatus
  requests: CapturedRequest[]
}

export type ExtensionMessage =
  | { type: "GET_SNAPSHOT"; tabId: number }
  | { type: "CLEAR_TAB"; tabId: number }
  | { type: "SETTINGS_CHANGED" }

export type ExtensionResponse = CaptureSnapshot | Settings | { ok: true } | undefined
