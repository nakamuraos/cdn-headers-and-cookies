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
    // Reported as a warning rather than an error: the next sync retries, and a
    // console error here surfaces on the browser's extensions page as a fault
    // the user is expected to act on.
    console.warn('Could not apply header rules, will retry on the next change', error);
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
