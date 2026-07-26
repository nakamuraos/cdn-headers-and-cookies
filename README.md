# CDN Headers & Cookies

Inspect request headers, response headers, CDN debug headers and cookies for
any request on the page.

A Manifest V3 rewrite of the Chrome extension
[CDN Headers & Cookies 2.0.6](https://chrome.google.com/webstore/detail/cdn-headers-cookies/obldlamadkihjlkdjblncejeblbogmnb),
whose last release was in 2019. No public source existed for the original, so
this is a reimplementation rather than a fork. The design is written up in
[docs/superpowers/specs](docs/superpowers/specs/2026-07-27-cdn-headers-cookies-mv3-design.md).

## What it does

- Captures every request on the page, not only the top-level document, and lets
  you pick which one to inspect.
- Groups CDN debug headers ahead of the rest, with presets for Akamai,
  Cloudflare and Fastly. Cache state is colour-coded.
- Injects the preset's debug headers plus your own custom headers, per host or
  globally. Injected headers are marked in the request table.
- Full cookie create, read, update and delete for the current domain.
- Exports headers and cookies as CSV or JSON, and request headers as a curl
  command.
- Two skins: a modern interface with dark mode, and a recreation of the
  original 2.0.6 interface.

## Requirements

Chrome 116+ or Firefox 128+. Firefox 128 is the floor because header injection
uses `declarativeNetRequest` `modifyHeaders` on both browsers rather than
maintaining a second code path against Firefox's blocking `webRequest`.

## Development

```bash
npm install

npm run dev:chrome      # rebuild on change into extension/chrome
npm run dev:firefox     # rebuild on change into extension/firefox

npm run build           # production build for both browsers
npm test                # unit and component tests
npm run lint
```

Load the result as an unpacked extension: `chrome://extensions` with developer
mode on, or `about:debugging` in Firefox, pointing at `extension/chrome` or
`extension/firefox`.

## Layout

```
source/
  Background/    service worker: capture, DNR rules, storage, messaging
  Popup/         popup UI and its three panels
  Options/       settings page
  components/    shared primitives, written once against the skin tokens
  lib/           pure logic: presets, header grouping, ring buffer, export
  styles/        Tailwind entry and the skin and theme token blocks
test/            unit and component tests
```

`lib/` and `Background/rules.ts` hold the logic worth testing and are free of
browser APIs by construction. Browser APIs are reached only through
`Background/store.ts` and `Background/messaging.ts`, which is where tests stub
them.

## Credits

Built from [web-extension-starter](https://github.com/abhijithvijayan/web-extension-starter)
by abhijithvijayan.
