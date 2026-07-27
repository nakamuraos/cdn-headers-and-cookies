import browser from "webextension-polyfill"
import { registerCapture } from "./capture"
import { registerMessaging } from "./messaging"
import { applyRules } from "./rules"
import { readSettings } from "./store"
import { applySurface, registerSurface } from "./surface"

/**
 * Registration is per feature and reported rather than propagated. These run at
 * the top of the worker, where anything thrown takes down every registration
 * after it and leaves an extension that loads but does nothing.
 */
function register(name: string, registration: () => void): void {
  try {
    registration()
  } catch (error) {
    console.error(`Could not register ${name}`, error)
  }
}

register("capture", registerCapture)
register("messaging", registerMessaging)
register("the toolbar surface", registerSurface)

/**
 * Dynamic rules and the toolbar icon's registration are browser state rather
 * than extension state, so they are reconciled against settings whenever the
 * worker starts and whenever the settings that produce them change.
 */
async function syncRules(): Promise<void> {
  try {
    const settings = await readSettings()
    await applyRules(settings)
    await applySurface(settings)
  } catch (error) {
    // Reported as a warning rather than an error: the next sync retries, and a
    // console error here surfaces on the browser's extensions page as a fault
    // the user is expected to act on.
    console.warn("Could not apply settings, will retry on the next change", error)
  }
}

browser.runtime.onInstalled.addListener(() => {
  void syncRules()
})

browser.runtime.onStartup.addListener(() => {
  void syncRules()
})

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.settings) {
    void syncRules()
  }
})

void syncRules()
