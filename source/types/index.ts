export type Skin = 'modern' | 'classic';

export type ThemePreference = 'system' | 'light' | 'dark';

export type CdnPresetId = 'akamai' | 'cloudflare' | 'fastly' | 'none';

export interface HeaderEntry {
  name: string;
  value: string;
  /** Set on request headers this extension added, so they can be told apart from the browser's. */
  injected?: boolean;
}

export interface CustomHeader {
  name: string;
  value: string;
  enabled: boolean;
}

export interface CapturedRequest {
  id: string;
  tabId: number;
  url: string;
  host: string;
  method: string;
  type: string;
  timeStamp: number;
  requestHeaders: HeaderEntry[];
  responseHeaders: HeaderEntry[];
  statusCode?: number;
  statusLine?: string;
  /** Set once the request reaches a terminal state, whether it succeeded or failed. */
  completed: boolean;
  error?: string;
}

export interface Settings {
  preset: CdnPresetId;
  /** Per-host injection toggles. A host absent from this map defaults to enabled. */
  hostToggles: Record<string, boolean>;
  /** Custom request headers keyed by host. */
  hostHeaders: Record<string, CustomHeader[]>;
  /** Custom request headers applied to every host. */
  globalHeaders: CustomHeader[];
  captureLimit: number;
  /** When off, only the top-level document request is recorded, as in 2.0.6. */
  captureSubresources: boolean;
  skin: Skin;
  theme: ThemePreference;
}

export const defaultSettings: Settings = {
  preset: 'akamai',
  hostToggles: {},
  hostHeaders: {},
  globalHeaders: [],
  captureLimit: 200,
  captureSubresources: false,
  skin: 'modern',
  theme: 'system',
};

export type SameSite = 'unspecified' | 'no_restriction' | 'lax' | 'strict';

/** Cookies are edited in the popup as plain objects and mapped onto the cookies API on save. */
export interface CookieRecord {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: SameSite;
  session: boolean;
  expirationDate?: number;
  storeId?: string;
}
