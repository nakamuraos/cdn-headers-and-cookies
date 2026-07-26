import {useCallback, useEffect, useState} from 'react';
import browser from 'webextension-polyfill';

import {defaultSettings, type Settings} from '@/types';

const SETTINGS_KEY = 'settings';

/**
 * Settings are shared across the popup, the options page and the worker, so
 * every surface reads them from storage and stays subscribed to changes rather
 * than holding a private copy.
 */
export function useSettings(): {
  settings: Settings;
  loaded: boolean;
  update: (patch: Partial<Settings>) => Promise<void>;
} {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    void browser.storage.local.get(SETTINGS_KEY).then((stored) => {
      if (!active) return;
      setSettings({...defaultSettings, ...(stored[SETTINGS_KEY] as Partial<Settings>)});
      setLoaded(true);
    });

    const onChanged = (
      changes: Record<string, browser.Storage.StorageChange>,
      area: string
    ): void => {
      if (area !== 'local' || !changes[SETTINGS_KEY]) return;
      setSettings({
        ...defaultSettings,
        ...(changes[SETTINGS_KEY].newValue as Partial<Settings>),
      });
    };

    browser.storage.onChanged.addListener(onChanged);

    return () => {
      active = false;
      browser.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  const update = useCallback(
    async (patch: Partial<Settings>) => {
      const next = {...settings, ...patch};
      setSettings(next);
      await browser.storage.local.set({[SETTINGS_KEY]: next});
    },
    [settings]
  );

  return {settings, loaded, update};
}
