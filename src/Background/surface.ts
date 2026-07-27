import browser from 'webextension-polyfill';

import type {Settings} from '@/types';

const POPUP_PAGE = 'Popup/popup.html';

interface SidePanelApi {
  setPanelBehavior?: (options: {openPanelOnActionClick: boolean}) => Promise<void>;
  open: (options: {windowId?: number}) => Promise<void>;
}

interface SidebarActionApi {
  open: () => Promise<void>;
}

function sidePanel(): SidePanelApi | undefined {
  return (browser as unknown as {sidePanel?: SidePanelApi}).sidePanel;
}

function sidebarAction(): SidebarActionApi | undefined {
  return (browser as unknown as {sidebarAction?: SidebarActionApi}).sidebarAction;
}

/**
 * Points the toolbar icon at the surface the settings ask for. Both halves have
 * to be set every time: a browser that opens the panel from the click outranks
 * any registered popup, so clearing the popup alone would not bring the popup
 * back, and clearing the behaviour alone would leave the click doing nothing.
 */
export async function applySurface(settings: Settings): Promise<void> {
  const panel = settings.surface === 'panel';

  await browser.action.setPopup({popup: panel ? '' : POPUP_PAGE});

  // Opening from the click keeps the user gesture out of extension code, which
  // is the only way to open a panel without one to hand.
  await sidePanel()
    ?.setPanelBehavior?.({openPanelOnActionClick: panel})
    .catch(() => {
      // A browser that declares the namespace without the behaviour falls back
      // to opening from the click handler below.
    });
}

/**
 * Opens the panel for browsers that do not open it from the click themselves.
 * Called synchronously from the click so the gesture is still in hand.
 */
export function openPanel(windowId: number | undefined): void {
  const panel = sidePanel();

  if (panel && !panel.setPanelBehavior) {
    void panel.open({windowId});
    return;
  }

  void sidebarAction()?.open();
}

/**
 * A click only reaches here when no popup is registered, which is exactly when
 * the panel is the chosen surface. Reading the setting again would mean waiting
 * on storage, and the user gesture the panel needs does not survive the wait.
 */
export function registerSurface(): void {
  browser.action.onClicked.addListener((tab) => openPanel(tab.windowId));
}
