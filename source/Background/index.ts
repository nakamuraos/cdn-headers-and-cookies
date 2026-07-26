import browser from 'webextension-polyfill';

import {registerCapture} from './capture';
import {registerMessaging} from './messaging';
import {applyRules} from './rules';
import {readSettings} from './store';

registerCapture();
registerMessaging();

/**
 * Dynamic rules are browser state rather than extension state, so they are
 * reconciled against settings whenever the worker starts and whenever the
 * settings that produce them change.
 */
async function syncRules(): Promise<void> {
  try {
    await applyRules(await readSettings());
  } catch (error) {
    console.error('Failed to apply header rules', error);
  }
}

browser.runtime.onInstalled.addListener(() => {
  void syncRules();
});

browser.runtime.onStartup.addListener(() => {
  void syncRules();
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) {
    void syncRules();
  }
});

void syncRules();
