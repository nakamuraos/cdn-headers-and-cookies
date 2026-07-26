/**
 * Captures the store screenshots.
 *
 * Loads the built extension into Chrome, drives a real page, and photographs
 * the popup. The popup is smaller than the 1280x800 the stores ask for, so each
 * shot is composited onto a canvas at that size rather than stretched.
 *
 * Run after `npm run build:chrome`: `npm run screenshots`. Needs network access.
 */
import {spawn} from 'node:child_process';
import {mkdirSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9350;
const ROOT = path.resolve(import.meta.dirname, '..');
const EXT = path.join(ROOT, 'extension', 'chrome');
const OUT = path.join(ROOT, 'docs', 'screenshots');

/** A page that is behind a CDN, so the CDN grouping has something to show. */
const TARGET = 'https://developer.mozilla.org/en-US/';

const CANVAS = {width: 1280, height: 800};
const SCALE = 2;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(path.join(tmpdir(), 'cdn-shots-'));

mkdirSync(OUT, {recursive: true});

const chrome = spawn(CHROME, [
  `--user-data-dir=${profile}`,
  `--remote-debugging-port=${PORT}`,
  '--enable-unsafe-extension-debugging',
  '--headless=new',
  '--no-first-run',
  '--no-default-browser-check',
  '--hide-scrollbars',
  'about:blank',
]);

const http = async (p) => (await fetch(`http://127.0.0.1:${PORT}${p}`)).json();

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        this.pending.get(msg.id)(msg);
        this.pending.delete(msg.id);
      }
    };
  }

  async send(method, params = {}, sessionId) {
    await this.ready;
    const id = ++this.id;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.ws.send(
        JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})})
      );
    });
  }

  async evaluate(expression, sessionId) {
    const res = await this.send(
      'Runtime.evaluate',
      {expression, awaitPromise: true, returnByValue: true},
      sessionId
    );
    return res.result?.result?.value;
  }
}

const DARK = ['#101317', '#1b2430'];
const LIGHT = ['#eef2f7', '#dbe4f0'];

/** A quiet backdrop keyed to the extension's accent, so the popup stays the subject. */
function backdrop(dark) {
  const [from, to] = dark ? DARK : LIGHT;

  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width}" height="${CANVAS.height}">
       <defs>
         <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
           <stop offset="0%" stop-color="${from}"/>
           <stop offset="100%" stop-color="${to}"/>
         </linearGradient>
       </defs>
       <rect width="100%" height="100%" fill="url(#g)"/>
     </svg>`
  );
}

/** Backdrop for the split shot: dark above the diagonal, light below it. */
function splitBackdrop() {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS.width}" height="${CANVAS.height}">
       <defs>
         <linearGradient id="d" x1="0" y1="0" x2="1" y2="1">
           <stop offset="0%" stop-color="${DARK[0]}"/>
           <stop offset="100%" stop-color="${DARK[1]}"/>
         </linearGradient>
         <linearGradient id="l" x1="0" y1="0" x2="1" y2="1">
           <stop offset="0%" stop-color="${LIGHT[0]}"/>
           <stop offset="100%" stop-color="${LIGHT[1]}"/>
         </linearGradient>
       </defs>
       <rect width="100%" height="100%" fill="url(#d)"/>
       <polygon points="0,${CANVAS.height} ${CANVAS.width},0 ${CANVAS.width},${CANVAS.height}" fill="url(#l)"/>
     </svg>`
  );
}

/**
 * Cuts the light shot along the leading diagonal and lays it over the dark one,
 * so a single image shows both themes of the same view.
 */
async function diagonal(darkPng, lightPng, width, height) {
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
       <polygon points="0,${height} ${width},0 ${width},${height}" fill="#fff"/>
     </svg>`
  );

  const lightHalf = await sharp(lightPng)
    .composite([{input: mask, blend: 'dest-in'}])
    .png()
    .toBuffer();

  const seam = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
       <line x1="0" y1="${height}" x2="${width}" y2="0" stroke="#3794ff" stroke-width="2"/>
     </svg>`
  );

  return sharp(darkPng)
    .composite([{input: lightHalf}, {input: seam}])
    .png()
    .toBuffer();
}

/** Wide enough to read at store size, with the backdrop still framing it. */
const POPUP_WIDTH = 930;

async function compose(name, shot, dark) {
  const inner = await sharp(shot)
    .resize({width: POPUP_WIDTH, fit: 'inside'})
    .png()
    .toBuffer();

  await sharp(backdrop(dark))
    .composite([{input: inner, gravity: 'center'}])
    .png({compressionLevel: 9})
    .toFile(path.join(OUT, `${name}.png`));

  process.stdout.write(`${name}.png\n`);
}

try {
  let version = null;
  for (let i = 0; i < 40 && !version; i += 1) {
    version = await http('/json/version').catch(() => null);
    if (!version) await sleep(500);
  }

  const browser = new CDP(version.webSocketDebuggerUrl);
  await browser.send('Extensions.loadUnpacked', {path: EXT});

  let swTarget = null;
  for (let i = 0; i < 40 && !swTarget; i += 1) {
    swTarget = (await http('/json/list')).find((t) =>
      t.url.includes('background.bundle.js')
    );
    if (!swTarget) await sleep(500);
  }

  const extensionId = new URL(swTarget.url).host;
  const sw = new CDP(swTarget.webSocketDebuggerUrl);
  await sw.send('Runtime.enable');

  const settings = (patch) =>
    sw.evaluate(`(async () => {
      const {settings = {}} = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({settings: {...settings, ${patch}}});
    })()`);

  // Subresources on, so the request picker has something to pick between.
  await settings('captureSubresources: true');

  // First visit teaches Auto which CDN this host runs; the second carries the
  // injected directives, which is the state worth photographing.
  const first = await browser.send('Target.createTarget', {url: TARGET});
  await sleep(13000);
  await browser.send('Target.closeTarget', {targetId: first.result.targetId});

  const page = await browser.send('Target.createTarget', {url: TARGET});
  await sleep(13000);

  /** Photographs the popup on the given tab, in the given skin and theme. */
  async function capture({tab, skin, dark}) {
    await settings(`skin: '${skin}', theme: '${dark ? 'dark' : 'light'}'`);
    await sleep(600);

    const target = await browser.send('Target.createTarget', {
      url: `chrome-extension://${extensionId}/Popup/popup.html`,
    });
    const attached = await browser.send('Target.attachToTarget', {
      targetId: target.result.targetId,
      flatten: true,
    });
    const sid = attached.result.sessionId;

    await browser.send('Page.enable', {}, sid);
    await browser.send(
      'Emulation.setDeviceMetricsOverride',
      {width: skin === 'classic' ? 760 : 780, height: 600, deviceScaleFactor: SCALE},
      sid
    );

    // The popup reads the active tab, so hand focus back to the page first.
    await browser.send('Target.activateTarget', {targetId: page.result.targetId});
    await sleep(400);
    await browser.send('Page.reload', {}, sid);
    await sleep(3000);

    await browser.evaluate(
      `[...document.querySelectorAll('[role=tab]')]
         .find((t) => t.textContent.trim().startsWith('${tab}'))?.click()`,
      sid
    );
    await sleep(900);

    // Clip to the document's own box: the viewport can be narrower than the
    // popup lays out at, which silently crops the right-hand column.
    const box = await browser.evaluate(
      `JSON.stringify({w: document.body.scrollWidth, h: document.body.scrollHeight})`,
      sid
    );
    const {w, h} = JSON.parse(box);

    const shot = await browser.send(
      'Page.captureScreenshot',
      {
        format: 'png',
        captureBeyondViewport: true,
        clip: {x: 0, y: 0, width: w, height: h, scale: SCALE},
      },
      sid
    );
    await browser.send('Target.closeTarget', {targetId: target.result.targetId});

    return {data: Buffer.from(shot.result.data, 'base64'), width: w * SCALE, height: h * SCALE};
  }

  const shots = [
    {name: '1-response-headers', tab: 'Response Headers', skin: 'modern', dark: true},
    {name: '2-request-headers', tab: 'Request Headers', skin: 'modern', dark: true},
    {name: '3-cookies', tab: 'Cookies', skin: 'modern', dark: true},
    {name: '5-light-mode', tab: 'Response Headers', skin: 'modern', dark: false},
    {name: '6-classic-skin', tab: 'Response Headers', skin: 'classic', dark: false},
  ];

  for (const shot of shots) {
    const {data} = await capture(shot);
    await compose(shot.name, data, shot.dark);
  }

  // Both themes of the same view, split along the diagonal.
  const darkShot = await capture({tab: 'Response Headers', skin: 'modern', dark: true});
  const lightShot = await capture({tab: 'Response Headers', skin: 'modern', dark: false});

  const split = await diagonal(
    darkShot.data,
    lightShot.data,
    darkShot.width,
    darkShot.height
  );

  const splitInner = await sharp(split)
    .resize({width: POPUP_WIDTH, fit: 'inside'})
    .png()
    .toBuffer();

  await sharp(splitBackdrop())
    .composite([{input: splitInner, gravity: 'center'}])
    .png({compressionLevel: 9})
    .toFile(path.join(OUT, '4-light-and-dark.png'));
  process.stdout.write('4-light-and-dark.png\n');

  // The options page is a normal page, so it is photographed at full size.
  await settings("skin: 'modern', theme: 'dark'");
  const options = await browser.send('Target.createTarget', {
    url: `chrome-extension://${extensionId}/Options/options.html`,
  });
  const optionsAttached = await browser.send('Target.attachToTarget', {
    targetId: options.result.targetId,
    flatten: true,
  });
  const osid = optionsAttached.result.sessionId;

  await browser.send('Page.enable', {}, osid);
  await browser.send(
    'Emulation.setDeviceMetricsOverride',
    {width: CANVAS.width, height: CANVAS.height, deviceScaleFactor: SCALE},
    osid
  );
  await browser.send('Page.reload', {}, osid);
  await sleep(2500);

  const optionsShot = await browser.send('Page.captureScreenshot', {format: 'png'}, osid);
  await sharp(Buffer.from(optionsShot.result.data, 'base64'))
    .resize(CANVAS.width, CANVAS.height, {fit: 'cover', position: 'top'})
    .png({compressionLevel: 9})
    .toFile(path.join(OUT, '7-settings.png'));
  process.stdout.write('7-settings.png\n');
} catch (error) {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
} finally {
  chrome.kill();
  await sleep(500);
  rmSync(profile, {recursive: true, force: true});
}
