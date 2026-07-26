/**
 * End-to-end check against a real browser.
 *
 * Loads the built extension into Chrome over CDP, drives a live Akamai-fronted
 * page, and asserts on what the service worker actually recorded. Run it after
 * `npm run build:chrome`; it needs network access.
 *
 * The browser binary is auto-detected per platform (macOS, Linux, Windows);
 * set CHROME_PATH to point at a specific Chromium-based executable instead.
 *
 * Chrome 137 removed the --load-extension flag, so the extension is installed
 * with Extensions.loadUnpacked, which requires --enable-unsafe-extension-debugging.
 */
import {spawn} from 'node:child_process';
import {accessSync, constants, mkdtempSync, rmSync} from 'node:fs';
import {homedir, platform, tmpdir} from 'node:os';
import path from 'node:path';

/**
 * Chromium-family browsers the run can use, in preference order per platform.
 * Absolute entries are probed directly; bare names are looked up on PATH.
 */
const BROWSERS = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '~/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  ],
  linux: [
    'google-chrome',
    'google-chrome-stable',
    'google-chrome-beta',
    'chromium',
    'chromium-browser',
    'microsoft-edge',
    'brave-browser',
    '/opt/google/chrome/chrome',
    '/snap/bin/chromium',
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '~\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
    '~\\AppData\\Local\\Google\\Chrome SxS\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    'chrome.exe',
  ],
};

function isExecutable(candidate) {
  try {
    accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Resolves a bare executable name against PATH, honouring PATHEXT on Windows. */
function resolveOnPath(name) {
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const exts =
    platform() === 'win32' ? (process.env.PATHEXT ?? '.EXE').split(';') : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, name + (name.endsWith(ext) ? '' : ext));
      if (isExecutable(candidate)) return candidate;
    }
  }
  return null;
}

function findBrowser() {
  const override = process.env.CHROME_PATH ?? process.env.E2E_BROWSER;
  if (override) {
    if (!isExecutable(override)) {
      throw new Error(`CHROME_PATH is not an executable: ${override}`);
    }
    return override;
  }
  for (const entry of BROWSERS[platform()] ?? []) {
    const candidate = entry.startsWith('~')
      ? path.join(homedir(), entry.slice(2))
      : entry;
    if (path.isAbsolute(candidate)) {
      if (isExecutable(candidate)) return candidate;
      continue;
    }
    const resolved = resolveOnPath(candidate);
    if (resolved) return resolved;
  }
  throw new Error(
    `No Chromium-based browser found for platform ${platform()}. ` +
      'Set CHROME_PATH to the browser executable.'
  );
}

const CHROME = findBrowser();
const PORT = 9333;
const EXT = process.argv[2] ?? path.resolve(import.meta.dirname, '..', 'extension', 'chrome');
const TARGET_URL = 'https://www.mit.edu/';

const profile = mkdtempSync(path.join(tmpdir(), 'cdn-e2e-'));
const results = [];
let failures = 0;

function check(name, ok, detail = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function http(pathname) {
  const res = await fetch(`http://127.0.0.1:${PORT}${pathname}`);
  return res.json();
}

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
      const resolver = this.pending.get(msg.id);
      if (resolver) {
        this.pending.delete(msg.id);
        resolver(msg);
      }
    };
  }

  async send(method, params = {}) {
    await this.ready;
    const id = ++this.id;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({id, method, params}));
    });
  }

  /** Evaluates an async expression in the target and returns its value. */
  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.result?.exceptionDetails) {
      throw new Error(
        res.result.exceptionDetails.exception?.description ??
          JSON.stringify(res.result.exceptionDetails)
      );
    }
    return res.result?.result?.value;
  }

  close() {
    this.ws.close();
  }
}

console.log(`[e2e] browser: ${CHROME}`);

const chrome = spawn(CHROME, [
  `--user-data-dir=${profile}`,
  `--remote-debugging-port=${PORT}`,
  '--enable-unsafe-extension-debugging',
  '--headless=new',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-background-timer-throttling',
  // Chrome's sandbox cannot start as root, which is the norm in CI containers.
  ...(platform() === 'linux' && process.getuid?.() === 0 ? ['--no-sandbox'] : []),
  'about:blank',
]);

chrome.on('error', (error) => {
  process.stderr.write(`[chrome] failed to launch: ${error.message}\n`);
});

chrome.stderr.on('data', (d) => {
  const line = String(d);
  if (/error|fail/i.test(line) && !/DevTools listening/.test(line)) {
    process.stderr.write(`[chrome] ${line}`);
  }
});

async function findServiceWorker() {
  for (let i = 0; i < 40; i += 1) {
    const targets = await http('/json/list').catch(() => []);
    const sw = targets.find((t) => t.url.includes('/assets/js/background.bundle.js'));
    if (sw) return sw;
    await sleep(500);
  }
  return null;
}

try {
  // Wait for the debugging endpoint.
  let version = null;
  for (let i = 0; i < 40 && !version; i += 1) {
    version = await http('/json/version').catch(() => null);
    if (!version) await sleep(500);
  }
  if (!version) throw new Error('Chrome did not expose the debugging endpoint');

  const bootstrap = new CDP(version.webSocketDebuggerUrl);
  const loaded = await bootstrap.send('Extensions.loadUnpacked', {path: EXT});
  check('extension loads unpacked', Boolean(loaded.result?.id), loaded.error?.message ?? '');

  const swTarget = await findServiceWorker();
  check('extension service worker registers', Boolean(swTarget));
  if (!swTarget) throw new Error('no service worker target');

  const extensionId = new URL(swTarget.url).host;
  const sw = new CDP(swTarget.webSocketDebuggerUrl);
  await sw.send('Runtime.enable');

  // --- Auto injects nothing until it has seen what a host runs ---
  const initialRules = await sw.evaluate(
    'chrome.declarativeNetRequest.getDynamicRules()'
  );
  check(
    'Auto injects nothing before any response is seen',
    (initialRules ?? []).length === 0,
    `${(initialRules ?? []).length} rules`
  );

  // --- drive a real page ---
  const browser = new CDP(version.webSocketDebuggerUrl);
  const created = await browser.send('Target.createTarget', {url: TARGET_URL});
  check('opened the test page', Boolean(created.result?.targetId));
  await sleep(12000);

  const capture = await sw.evaluate(`
    (async () => {
      const all = await chrome.storage.session.get(null);
      const key = Object.keys(all).find((k) => k.startsWith('capture:'));
      return {key, requests: key ? all[key] : []};
    })()
  `);

  const requests = capture?.requests ?? [];
  check('service worker recorded requests', requests.length > 0, `${requests.length} captured`);

  const doc = requests.find((r) => r.type === 'main_frame');
  check('captured the top-level document request', Boolean(doc), doc?.url ?? '');

  check(
    'records only the document by default, as 2.0.6 did',
    requests.every((r) => r.type === 'main_frame'),
    [...new Set(requests.map((r) => r.type))].join(', ')
  );

  const firstNames = (doc?.responseHeaders ?? []).map((h) => h.name.toLowerCase());
  check('response headers captured', firstNames.length > 0, `${firstNames.length} headers`);
  check(
    'status line captured as a pseudo-header',
    firstNames.includes('status'),
    doc?.statusLine ?? ''
  );
  check(
    'no headers injected on the first visit, before the CDN is known',
    !doc?.requestHeaders?.some((h) => h.injected)
  );

  // --- having seen the response, Auto learns the host's CDN ---
  const learned = await sw.evaluate(`
    (async () => {
      const {settings = {}} = await chrome.storage.local.get('settings');
      return settings.detectedHosts ?? {};
    })()
  `);
  check(
    'identified the CDN from the response',
    learned?.['mit.edu'] === 'akamai',
    JSON.stringify(learned ?? {})
  );

  const learnedRules = await sw.evaluate(
    'chrome.declarativeNetRequest.getDynamicRules()'
  );
  const pragmaRule = (learnedRules ?? []).find((r) =>
    r.action?.requestHeaders?.some((h) => h.header.toLowerCase() === 'pragma')
  );
  check('a Pragma rule now exists for that host', Boolean(pragmaRule));
  check(
    'the rule is scoped to the host, not applied everywhere',
    Boolean(pragmaRule?.condition?.requestDomains?.length),
    JSON.stringify(pragmaRule?.condition?.requestDomains ?? [])
  );
  check(
    'Pragma value carries the akamai-x directives',
    String(pragmaRule?.action?.requestHeaders?.[0]?.value ?? '').includes(
      'akamai-x-get-true-cache-key'
    )
  );

  // --- the next visit carries them, and the CDN answers ---
  await browser.send('Target.createTarget', {url: `${TARGET_URL}?again=1`});
  await sleep(12000);

  const revisit = await sw.evaluate(`
    (async () => {
      const all = await chrome.storage.session.get(null);
      const reqs = Object.keys(all)
        .filter((k) => k.startsWith('capture:'))
        .flatMap((k) => all[k]);
      return reqs.find((r) => r.type === 'main_frame' && r.url.includes('again=1'));
    })()
  `);

  const pragma = revisit?.requestHeaders?.find((h) => h.name.toLowerCase() === 'pragma');
  check('Pragma header present on the second visit', Boolean(pragma));
  check('Pragma header is marked as injected', pragma?.injected === true);

  const names = (revisit?.responseHeaders ?? []).map((h) => h.name.toLowerCase());
  const xCache = revisit?.responseHeaders?.find((h) => h.name.toLowerCase() === 'x-cache');
  check('Akamai X-Cache present in the response', Boolean(xCache), xCache?.value ?? '');
  check(
    'X-Check-Cacheable present in the response',
    names.includes('x-check-cacheable')
  );

  // --- subresource capture is opt-in ---
  await sw.evaluate(`
    (async () => {
      const {settings = {}} = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({settings: {...settings, captureSubresources: true}});
    })()
  `);
  await sleep(1000);

  const second = await browser.send('Target.createTarget', {url: `${TARGET_URL}?e2e=1`});
  check('opened a second page', Boolean(second.result?.targetId));
  await sleep(12000);

  const afterEnable = await sw.evaluate(`
    (async () => {
      const all = await chrome.storage.session.get(null);
      const keys = Object.keys(all).filter((k) => k.startsWith('capture:'));
      const reqs = keys.flatMap((k) => all[k]);
      return [...new Set(reqs.map((r) => r.type))];
    })()
  `);
  check(
    'enabling subresource capture records more than the document',
    (afterEnable ?? []).length > 1,
    (afterEnable ?? []).join(', ')
  );

  // --- per-host toggle reconciles rules ---
  await sw.evaluate(`
    (async () => {
      const {settings = {}} = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({
        settings: {...settings, hostToggles: {...(settings.hostToggles || {}), 'mit.edu': false}},
      });
    })()
  `);
  await sleep(2500);

  const afterToggle = await sw.evaluate('chrome.declarativeNetRequest.getDynamicRules()');
  const stillInjecting = (afterToggle ?? []).some((r) =>
    r.condition?.requestDomains?.includes('mit.edu')
  );
  check(
    'turning a host off drops its injection rule',
    !stillInjecting,
    JSON.stringify((afterToggle ?? []).map((r) => r.condition?.requestDomains))
  );

  // --- popup page loads without throwing ---
  const popup = await browser.send('Target.createTarget', {
    url: `chrome-extension://${extensionId}/Popup/popup.html`,
  });
  await sleep(3000);
  const popupTarget = (await http('/json/list')).find(
    (t) => t.id === popup.result?.targetId
  );
  if (popupTarget) {
    const page = new CDP(popupTarget.webSocketDebuggerUrl);
    const rendered = await page.evaluate(
      `document.getElementById('popup-root')?.children.length > 0`
    );
    const text = await page.evaluate('document.body.innerText.slice(0, 300)');
    check('popup renders a React tree', rendered === true);
    check('popup stylesheet applied', await page.evaluate(
      `getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().length > 0`
    ) === true);
    console.log('\npopup text:\n' + text + '\n');
    page.close();
  } else {
    check('popup page target created', false);
  }

  sw.close();
  browser.close();
} catch (error) {
  check('run completed without throwing', false, String(error.message ?? error));
} finally {
  console.log('\n' + results.join('\n'));
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  chrome.kill();
  await sleep(500);
  rmSync(profile, {recursive: true, force: true});
  process.exit(failures === 0 ? 0 : 1);
}
