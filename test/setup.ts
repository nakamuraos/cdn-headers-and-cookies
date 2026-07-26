import '@testing-library/jest-dom/vitest';
import {vi} from 'vitest';

/**
 * The extension APIs are only ever reached through the store and messaging
 * wrappers, so a single stub at the polyfill boundary covers every test.
 */
vi.mock('webextension-polyfill', () => {
  const storage = new Map<string, unknown>();

  const area = {
    get: vi.fn(async (key: string | string[] | null) => {
      if (key === null) return Object.fromEntries(storage);
      const keys = Array.isArray(key) ? key : [key];
      return Object.fromEntries(
        keys.filter((k) => storage.has(k)).map((k) => [k, storage.get(k)])
      );
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(items)) storage.set(k, v);
    }),
    remove: vi.fn(async (key: string) => {
      storage.delete(key);
    }),
    clear: vi.fn(async () => {
      storage.clear();
    }),
  };

  return {
    default: {
      storage: {
        local: area,
        session: area,
        onChanged: {addListener: vi.fn(), removeListener: vi.fn()},
      },
      tabs: {
        query: vi.fn(async () => []),
        get: vi.fn(async () => undefined),
        reload: vi.fn(),
        onRemoved: {addListener: vi.fn()},
      },
      runtime: {
        sendMessage: vi.fn(async () => undefined),
        onMessage: {addListener: vi.fn()},
        onInstalled: {addListener: vi.fn()},
        onStartup: {addListener: vi.fn()},
      },
      webRequest: {
        onBeforeSendHeaders: {addListener: vi.fn()},
        onHeadersReceived: {addListener: vi.fn()},
        onCompleted: {addListener: vi.fn()},
        onErrorOccurred: {addListener: vi.fn()},
      },
      declarativeNetRequest: {
        getDynamicRules: vi.fn(async () => []),
        updateDynamicRules: vi.fn(async () => undefined),
      },
      cookies: {
        getAll: vi.fn(async () => []),
        set: vi.fn(async () => undefined),
        remove: vi.fn(async () => undefined),
      },
    },
  };
});
