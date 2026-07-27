import { beforeEach, describe, expect, it, vi } from "vitest"
import browser from "webextension-polyfill"
import { extraHeadersFor, registerCapture } from "@/Background/capture"

/** Every value Gecko accepts in an extraInfoSpec, from its webRequest schema. */
const GECKO_OPTIONS = new Set(["blocking", "requestBody", "requestHeaders", "responseHeaders"])

const stub = browser as unknown as {
  webRequest: Record<string, { addListener: ReturnType<typeof vi.fn> }>
}

const LISTENERS = [
  "onBeforeSendHeaders",
  "onHeadersReceived",
  "onBeforeRedirect",
  "onCompleted",
  "onErrorOccurred",
]

beforeEach(() => {
  for (const name of LISTENERS) {
    stub.webRequest[name] ??= { addListener: vi.fn() }
    stub.webRequest[name]!.addListener.mockClear()
  }
})

describe("extraHeadersFor", () => {
  it("opts into the hidden headers on Chromium", () => {
    expect(extraHeadersFor("chrome")).toEqual(["extraHeaders"])
  })

  // Gecko validates the spec and throws out of addListener on an unknown value,
  // which costs every listener rather than only the headers it would have added
  // and leaves an extension that loads and captures nothing at all.
  it("asks Gecko for nothing it does not define", () => {
    for (const option of extraHeadersFor("firefox")) {
      expect(GECKO_OPTIONS).toContain(option)
    }

    expect(extraHeadersFor("firefox")).toEqual([])
  })
})

describe("registerCapture", () => {
  it("registers every listener it needs", () => {
    registerCapture()

    for (const name of LISTENERS) {
      expect(stub.webRequest[name]!.addListener).toHaveBeenCalled()
    }
  })

  // The spec is what the browser validates, so it has to be the one the target
  // was decided to get rather than a second opinion written out by hand.
  it("asks for the headers its target defines", () => {
    registerCapture()

    const [, , spec] = stub.webRequest.onBeforeSendHeaders!.addListener.mock.calls.at(-1) ?? []

    expect(spec).toEqual(["requestHeaders", ...extraHeadersFor(__TARGET_BROWSER__)])
  })
})
