/**
 * Captures the screenshots.
 *
 * Loads the built extension into Chrome, drives a real page, and photographs
 * the popup. Every shot is written twice: on its own for the README, taken at
 * twice the popup's own size so it stays sharp wherever it is scaled down to,
 * and laid on a canvas at the size the stores ask for. Each is photographed in
 * the frame it will be published in rather than resized into it afterwards,
 * because resampling a screenshot softens every glyph in it.
 *
 * Run after `yarn build:chrome`: `yarn screenshots`. Needs network access.
 */
import { spawn } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import process from "node:process"
import sharp from "sharp"

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const PORT = 9350
const ROOT = path.resolve(import.meta.dirname, "..")
const EXT = path.join(ROOT, "extension", "chrome")
const OUT = path.join(ROOT, "docs", "screenshots")
const STORE = path.join(OUT, "store")

/**
 * A page that is behind a CDN, so the CDN grouping has something to show, and
 * that answers with a redirect, so the chain has a hop in it. The redirect is
 * between two HTTPS addresses on purpose: a plain HTTP address would be
 * upgraded by the browser itself once the host's HSTS policy is known, and the
 * hop would never reach the network to be recorded.
 */
const TARGET = "https://developer.mozilla.org/docs/Web/HTTP"

/**
 * The header shots come from TARGET, which sets no cookies at all. The cookie
 * table is worth photographing with rows in it, so that one shot is taken over
 * a site that sets several, with a spread of flags between them.
 */
const COOKIE_TARGET = "https://github.com/"

/** Cookie values that identify the visit rather than describe it. */
const REDACTED = {
  _gh_sess: "EXAMPLE-SESSION-VALUE-NOT-A-REAL-TOKEN-" + "x".repeat(180) + "--EXAMPLE-SIGNATURE",
  _octo: "GH1.1.0000000000.0000000000",
}

/** The size the stores ask for, which the store copy is written at exactly. */
const CANVAS = { width: 1280, height: 800 }
const SCALE = 2

/**
 * Taller than a real popup, which the browser caps at 600. The cap is a limit
 * on the window rather than on the layout, so overriding the frame's height
 * lets a shot carry the rows a user would have to scroll for. A popup is far
 * taller than it is wide either way, so it is laid on the canvas rather than
 * stretched to fill it.
 */
const SHOT_HEIGHT = 1000

/** Breathing room between the shot and the edge of the canvas. */
const MARGIN = 24

/**
 * The store copy is photographed at exactly the height it will occupy on the
 * canvas, and at plain scale, so it lands pixel for pixel. Scaling a denser
 * shot down to fit would resample every glyph and soften the whole image.
 */
const STORE_HEIGHT = CANVAS.height - MARGIN * 2

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const profile = mkdtempSync(path.join(tmpdir(), "cdn-shots-"))

mkdirSync(STORE, { recursive: true })

// Fixed clock: sites that record the visitor's timezone in a cookie would
// otherwise put wherever the shot was taken from into the published image.
const chrome = spawn(
  CHROME,
  [
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${PORT}`,
    "--enable-unsafe-extension-debugging",
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "about:blank",
  ],
  { env: { ...process.env, TZ: "UTC" } },
)

const http = async (p) => (await fetch(`http://127.0.0.1:${PORT}${p}`)).json()

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url)
    this.id = 0
    this.pending = new Map()
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = resolve
      this.ws.onerror = reject
    })
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id && this.pending.has(msg.id)) {
        this.pending.get(msg.id)(msg)
        this.pending.delete(msg.id)
      }
    }
  }

  async send(method, params = {}, sessionId) {
    await this.ready
    const id = ++this.id
    return new Promise((resolve) => {
      this.pending.set(id, resolve)
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
  }

  async evaluate(expression, sessionId) {
    const res = await this.send(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true },
      sessionId,
    )
    return res.result?.result?.value
  }
}

/**
 * Cuts the light shot along the leading diagonal and lays it over the dark one,
 * so a single image shows both themes of the same view.
 */
async function diagonal(darkPng, lightPng, width, height) {
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
       <polygon points="0,${height} ${width},0 ${width},${height}" fill="#fff"/>
     </svg>`,
  )

  const lightHalf = await sharp(lightPng)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer()

  const seam = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
       <line x1="0" y1="${height}" x2="${width}" y2="0" stroke="#3794ff" stroke-width="2"/>
     </svg>`,
  )

  return sharp(darkPng)
    .composite([{ input: lightHalf }, { input: seam }])
    .png()
    .toBuffer()
}

const FONT = "Helvetica Neue, Helvetica, Arial, sans-serif"
const TITLE = "CDN Headers & Cookies"
const TAGLINE = "See what the edge actually did"

/**
 * Roughly how wide the title sets at a given size. Text is drawn by the SVG
 * renderer, which reports nothing back, so the width the layout reserves for it
 * is estimated from the average advance of the face rather than measured.
 */
const titleWidth = (size) => Math.round(TITLE.length * 0.58 * size)

/**
 * The promo tiles the Chrome Web Store lists the extension with. The tall one
 * stacks the mark over the name; the wide one sets them side by side, because
 * centred text on a 2.5:1 canvas leaves the tile looking empty at both ends.
 */
const PROMOS = [
  { name: "promo-small-440x280", width: 440, height: 280, layout: "stacked" },
  { name: "promo-marquee-1400x560", width: 1400, height: 560, layout: "beside" },
]

/** Fills the canvas whatever its aspect, since the two tiles differ sharply. */
function promoBackdrop(width, height) {
  return `<defs>
       <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
         <stop offset="0%" stop-color="#f4f7fb"/>
         <stop offset="100%" stop-color="#cfdcec"/>
       </linearGradient>
     </defs>
     <rect width="${width}" height="${height}" fill="url(#g)"/>`
}

/**
 * Draws a promo tile. It is artwork rather than a screenshot: at these sizes a
 * capture of the interface reads as texture, so the tile carries the mark and
 * the name instead.
 */
async function writePromo({ name, width, height, layout }) {
  const stacked = layout === "stacked"

  const logoHeight = stacked ? 112 : 200
  const logo = await sharp(path.join(ROOT, "assets", "logo.png"))
    .resize({ height: logoHeight })
    .png()
    .toBuffer()

  const { width: logoWidth } = await sharp(logo).metadata()

  const titleSize = stacked ? 30 : 56
  const taglineSize = stacked ? 16 : 26

  // Stacked centres the column; beside sets the mark and the text as one group,
  // so the pair is centred rather than each half being centred in its own half.
  const gap = stacked ? 0 : 56
  const group = stacked ? 0 : logoWidth + gap + titleWidth(titleSize)
  const groupLeft = stacked ? 0 : Math.round((width - group) / 2)

  const logoTop = stacked ? 30 : Math.round((height - logoHeight) / 2)
  const logoLeft = stacked ? Math.round((width - logoWidth) / 2) : groupLeft

  const anchor = stacked ? "middle" : "start"
  const textX = stacked ? width / 2 : groupLeft + logoWidth + gap
  const titleY = stacked ? 196 : height / 2 - 6

  const art = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
       ${promoBackdrop(width, height)}
       <text x="${textX}" y="${titleY}" text-anchor="${anchor}" font-family="${FONT}"
             font-size="${titleSize}" font-weight="700" fill="#16202c">${TITLE.replace("&", "&amp;")}</text>
       <text x="${textX}" y="${titleY + (stacked ? 32 : 52)}" text-anchor="${anchor}"
             font-family="${FONT}" font-size="${taglineSize}" fill="#4a5b70">${TAGLINE}</text>
       <rect x="${stacked ? width / 2 - 50 : textX}" y="${titleY + (stacked ? 52 : 84)}"
             width="${stacked ? 100 : 180}" height="${stacked ? 3 : 5}" rx="2.5" fill="#3794ff"/>
     </svg>`,
  )

  await sharp(art)
    .composite([{ input: logo, top: logoTop, left: logoLeft }])
    // The store takes 24-bit only. Flattening composites onto the background
    // but leaves the channel behind, so it is dropped as well.
    .flatten({ background: "#f4f7fb" })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(path.join(STORE, `${name}.png`))

  process.stdout.write(`store/${name}.png\n`)
}

/** A quiet backdrop keyed to the extension's accent, so the shot stays the subject. */
function backdrop() {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width}" height="${CANVAS.height}">
       <defs>
         <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
           <stop offset="0%" stop-color="#eef2f7"/>
           <stop offset="100%" stop-color="#dbe4f0"/>
         </linearGradient>
       </defs>
       <rect width="100%" height="100%" fill="url(#g)"/>
     </svg>`,
  )
}

/** The README copy: the shot on its own, where a backdrop would only be padding. */
async function writeReadme(name, shot) {
  await sharp(shot)
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, `${name}.png`))

  process.stdout.write(`${name}.png\n`)
}

/**
 * The store copy, laid on the canvas at the size it was photographed at. The
 * resize only engages if a shot came out wider than the canvas allows, so the
 * usual case copies pixels rather than resampling them.
 */
async function writeStore(name, shot) {
  const inner = await sharp(shot)
    .resize({
      width: CANVAS.width - MARGIN * 2,
      height: STORE_HEIGHT,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer()

  await sharp(backdrop())
    .composite([{ input: inner, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(STORE, `${name}.png`))

  process.stdout.write(`store/${name}.png\n`)
}

try {
  let version = null
  for (let i = 0; i < 40 && !version; i += 1) {
    version = await http("/json/version").catch(() => null)
    if (!version) await sleep(500)
  }

  const browser = new CDP(version.webSocketDebuggerUrl)
  await browser.send("Extensions.loadUnpacked", { path: EXT })

  let swTarget = null
  for (let i = 0; i < 40 && !swTarget; i += 1) {
    swTarget = (await http("/json/list")).find((t) => t.url.includes("background.bundle.js"))
    if (!swTarget) await sleep(500)
  }

  const extensionId = new URL(swTarget.url).host
  const sw = new CDP(swTarget.webSocketDebuggerUrl)
  await sw.send("Runtime.enable")

  const settings = (patch) =>
    sw.evaluate(`(async () => {
      const {settings = {}} = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({settings: {...settings, ${patch}}});
    })()`)

  /**
   * Replaces the cookie values that identify a visit, keeping every other
   * attribute. A session token is a live credential and a device id tracks the
   * machine the shot was taken on, so neither is photographed as issued. The
   * stand-ins keep the shape of the originals, so the table still shows a value
   * long enough to wrap and one short enough not to.
   */
  const redact = () =>
    sw.evaluate(`(async () => {
      const stand_ins = ${JSON.stringify(REDACTED)};
      const cookies = await chrome.cookies.getAll({domain: 'github.com'});

      for (const cookie of cookies) {
        const value = stand_ins[cookie.name];
        if (!value) continue;

        await chrome.cookies.set({
          url: 'https://' + cookie.domain.replace(/^\\./, '') + cookie.path,
          name: cookie.name,
          value,
          // A host-only cookie has no domain of its own, and supplying one
          // would write a second, wider cookie beside the original rather than
          // replace it.
          ...(cookie.hostOnly ? {} : {domain: cookie.domain}),
          path: cookie.path,
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
          sameSite: cookie.sameSite,
          expirationDate: cookie.expirationDate,
        });
      }
    })()`)

  // Subresources on, so the request picker has something to pick between.
  await settings("captureSubresources: true")

  // First visit teaches Auto which CDN this host runs; the second carries the
  // injected directives, which is the state worth photographing.
  const first = await browser.send("Target.createTarget", { url: TARGET })
  await sleep(13000)
  await browser.send("Target.closeTarget", { targetId: first.result.targetId })

  const page = await browser.send("Target.createTarget", { url: TARGET })
  await sleep(13000)

  const cookiePage = await browser.send("Target.createTarget", { url: COOKIE_TARGET })
  await sleep(13000)

  await redact()

  /** Photographs the popup over the given page, in the given skin and theme. */
  async function capture({
    tab,
    skin,
    dark,
    over = page,
    scale = SCALE,
    frameHeight = SHOT_HEIGHT,
  }) {
    await settings(`skin: '${skin}', theme: '${dark ? "dark" : "light"}'`)
    await sleep(600)

    const target = await browser.send("Target.createTarget", {
      url: `chrome-extension://${extensionId}/Popup/popup.html`,
    })
    const attached = await browser.send("Target.attachToTarget", {
      targetId: target.result.targetId,
      flatten: true,
    })
    const sid = attached.result.sessionId

    const width = skin === "classic" ? 760 : 780

    await browser.send("Page.enable", {}, sid)
    await browser.send(
      "Emulation.setDeviceMetricsOverride",
      { width, height: frameHeight, deviceScaleFactor: scale },
      sid,
    )

    // The popup reads the active tab, so hand focus back to the page first.
    await browser.send("Target.activateTarget", { targetId: over.result.targetId })
    await sleep(400)
    await browser.send("Page.reload", {}, sid)
    await sleep(3000)

    // The frame states its own height because a popup window has no viewport to
    // derive one from, so the shot's height is set the same way.
    await browser.evaluate(
      `document.documentElement.style.setProperty('--skin-height', '${frameHeight}px')`,
      sid,
    )

    await browser.evaluate(
      `[...document.querySelectorAll('[role=tab]')]
         .find((t) => t.textContent.trim().startsWith('${tab}'))?.click()`,
      sid,
    )
    await sleep(900)

    // Clip to the width the popup lays out at rather than the viewport's, which
    // can be narrower and would silently crop the right-hand column.
    const laidOut = await browser.evaluate(`document.body.scrollWidth`, sid)
    const w = Math.max(laidOut, width)

    const shot = await browser.send(
      "Page.captureScreenshot",
      {
        format: "png",
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: w, height: frameHeight, scale },
      },
      sid,
    )
    await browser.send("Target.closeTarget", { targetId: target.result.targetId })

    return {
      data: Buffer.from(shot.result.data, "base64"),
      width: w * scale,
      height: frameHeight * scale,
    }
  }

  const shots = [
    { name: "1-response-headers", tab: "Response Headers", skin: "modern", dark: false },
    { name: "2-request-headers", tab: "Request Headers", skin: "modern", dark: false },
    { name: "3-cookies", tab: "Cookies", skin: "modern", dark: false, over: cookiePage },
    { name: "5-classic-skin", tab: "Response Headers", skin: "classic", dark: false },
  ]

  /** The frame the store copy is photographed in, to land on the canvas as taken. */
  const asStore = { scale: 1, frameHeight: STORE_HEIGHT }

  for (const shot of shots) {
    await writeReadme(shot.name, (await capture(shot)).data)
    await writeStore(shot.name, (await capture({ ...shot, ...asStore })).data)
  }

  // Both themes of the same view, split along the diagonal.
  const split = async (options) => {
    const dark = await capture({ tab: "Response Headers", skin: "modern", dark: true, ...options })
    const light = await capture({
      tab: "Response Headers",
      skin: "modern",
      dark: false,
      ...options,
    })

    return diagonal(dark.data, light.data, dark.width, dark.height)
  }

  await writeReadme("4-light-and-dark", await split({}))
  await writeStore("4-light-and-dark", await split(asStore))

  // The options page is a normal page, so it is photographed at full size.
  await settings("skin: 'modern', theme: 'light'")
  const options = await browser.send("Target.createTarget", {
    url: `chrome-extension://${extensionId}/Options/options.html`,
  })
  const optionsAttached = await browser.send("Target.attachToTarget", {
    targetId: options.result.targetId,
    flatten: true,
  })
  const osid = optionsAttached.result.sessionId

  await browser.send("Page.enable", {}, osid)

  /** Photographs the whole page rather than the fold the viewport happens to cut. */
  async function captureOptions(width, scale) {
    await browser.send(
      "Emulation.setDeviceMetricsOverride",
      { width, height: CANVAS.height, deviceScaleFactor: scale },
      osid,
    )
    await browser.send("Page.reload", {}, osid)
    await sleep(2500)

    const box = await browser.evaluate(
      `JSON.stringify({w: document.body.scrollWidth, h: document.body.scrollHeight})`,
      osid,
    )
    const { w, h } = JSON.parse(box)

    const shot = await browser.send(
      "Page.captureScreenshot",
      {
        format: "png",
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: w, height: h, scale },
      },
      osid,
    )

    return Buffer.from(shot.result.data, "base64")
  }

  await writeReadme("6-settings", await captureOptions(CANVAS.width, SCALE))
  await writeStore("6-settings", await captureOptions(CANVAS.width - MARGIN * 2, 1))

  for (const promo of PROMOS) await writePromo(promo)
} catch (error) {
  process.stderr.write(`${error?.stack ?? error}\n`)
  process.exitCode = 1
} finally {
  chrome.kill()
  await sleep(500)
  rmSync(profile, { recursive: true, force: true })
}
