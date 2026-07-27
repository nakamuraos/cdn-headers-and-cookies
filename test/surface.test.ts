import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import browser from "webextension-polyfill"
import { applySurface, openPanel, panelSupported, registerSurface } from "@/Background/surface"
import { type Settings, type Surface, defaultSettings } from "@/types"

function settings(surface: Surface): Settings {
  return { ...defaultSettings, surface }
}

const stub = browser as unknown as {
  action: {
    setPopup: ReturnType<typeof vi.fn>
    onClicked: { addListener: ReturnType<typeof vi.fn> }
  }
  sidePanel?: unknown
  sidebarAction?: unknown
}

/** Chrome opens the panel from the click itself, through the panel behaviour. */
function asChrome(): {
  setPanelBehavior: ReturnType<typeof vi.fn>
  open: ReturnType<typeof vi.fn>
} {
  const sidePanel = {
    setPanelBehavior: vi.fn(async () => undefined),
    open: vi.fn(async () => undefined),
  }

  stub.sidePanel = sidePanel

  return sidePanel
}

/** Firefox exposes the sidebar under its own namespace and has no behaviour to set. */
function asFirefox(): { open: ReturnType<typeof vi.fn> } {
  const sidebarAction = { open: vi.fn(async () => undefined) }

  stub.sidebarAction = sidebarAction

  return sidebarAction
}

beforeEach(() => {
  stub.action.setPopup.mockClear()
})

afterEach(() => {
  delete stub.sidePanel
  delete stub.sidebarAction
})

describe("panelSupported", () => {
  it("recognises either namespace", () => {
    asChrome()
    expect(panelSupported()).toBe(true)

    delete stub.sidePanel
    asFirefox()
    expect(panelSupported()).toBe(true)
  })

  it("reports no panel where neither namespace exists", () => {
    expect(panelSupported()).toBe(false)
  })
})

describe("applySurface", () => {
  it("registers the popup page when the popup is the chosen surface", async () => {
    await applySurface(settings("popup"))

    expect(stub.action.setPopup).toHaveBeenCalledWith({ popup: "Popup/popup.html" })
  })

  it("clears the popup so the click reaches the panel", async () => {
    asFirefox()

    await applySurface(settings("panel"))

    expect(stub.action.setPopup).toHaveBeenCalledWith({ popup: "" })
  })

  it("turns the click-to-open behaviour on with the panel", async () => {
    const sidePanel = asChrome()

    await applySurface(settings("panel"))

    expect(sidePanel.setPanelBehavior).toHaveBeenLastCalledWith({
      openPanelOnActionClick: true,
    })
  })

  // The behaviour outranks a registered popup, so leaving it on would keep
  // opening the panel however the popup is registered.
  it("turns the click-to-open behaviour back off when the popup is chosen", async () => {
    const sidePanel = asChrome()

    await applySurface(settings("panel"))
    await applySurface(settings("popup"))

    expect(sidePanel.setPanelBehavior).toHaveBeenLastCalledWith({
      openPanelOnActionClick: false,
    })
    expect(stub.action.setPopup).toHaveBeenLastCalledWith({ popup: "Popup/popup.html" })
  })

  // Mobile builds carry no panel namespace, and a cleared popup there would
  // leave the toolbar click doing nothing with no way back to the setting.
  it("keeps the popup registered where no panel can open", async () => {
    await applySurface(settings("panel"))

    expect(stub.action.setPopup).toHaveBeenCalledWith({ popup: "Popup/popup.html" })
  })
})

describe("openPanel", () => {
  it("leaves the opening to the browser where the click already does it", () => {
    const sidePanel = asChrome()

    openPanel(7)

    expect(sidePanel.open).not.toHaveBeenCalled()
  })

  it("opens the sidebar where the browser will not open it from the click", () => {
    const sidebarAction = asFirefox()

    openPanel(7)

    expect(sidebarAction.open).toHaveBeenCalled()
  })

  // A click only arrives with no popup registered, which is the panel surface.
  // Re-reading the setting here would cost the gesture the panel needs.
  it("opens from a click without consulting the setting again", () => {
    const sidebarAction = asFirefox()

    registerSurface()
    const [onClicked] = stub.action.onClicked.addListener.mock.calls.at(-1) ?? []
    ;(onClicked as (tab: { windowId: number }) => void)({ windowId: 3 })

    expect(sidebarAction.open).toHaveBeenCalled()
  })

  it("opens the panel directly when the namespace has no behaviour to defer to", () => {
    const sidePanel = { open: vi.fn(async () => undefined) }
    stub.sidePanel = sidePanel

    openPanel(7)

    expect(sidePanel.open).toHaveBeenCalledWith({ windowId: 7 })
  })
})
