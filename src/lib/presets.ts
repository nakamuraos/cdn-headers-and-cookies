import type { CdnPresetId } from "@/types"

export interface CdnPreset {
  id: CdnPresetId
  label: string
  /** Request headers injected to make the CDN emit its debug headers. */
  inject: { name: string; value: string }[]
  /** Response header names grouped ahead of everything else, lower-cased. */
  responseHeaders: string[]
  /** Headers whose values carry cache state, used for the at-a-glance colouring. */
  cacheStateHeaders: string[]
  /** Response headers whose presence identifies this CDN, lower-cased. */
  fingerprint: string[]
}

const AKAMAI_PRAGMA = [
  "akamai-x-cache-on",
  "akamai-x-cache-remote-on",
  "akamai-x-check-cacheable",
  "akamai-x-get-cache-key",
  "akamai-x-get-extracted-values",
  "akamai-x-get-ssl-client-session-id",
  "akamai-x-get-true-cache-key",
  "akamai-x-serial-no",
  "akamai-x-get-request-id",
  "akamai-x-get-nonces",
  "akamai-x-get-client-ip",
  "akamai-x-feo-trace",
].join(", ")

export const presets: Record<CdnPresetId, CdnPreset> = {
  akamai: {
    id: "akamai",
    label: "Akamai",
    inject: [{ name: "Pragma", value: AKAMAI_PRAGMA }],
    responseHeaders: [
      "x-cache",
      "x-cache-remote",
      "x-check-cacheable",
      "x-cache-key",
      "x-true-cache-key",
      "x-cache-key-extended-internal-use-only",
      "x-serial",
      "x-akamai-request-id",
      "akamai-request-bc",
      "akamai-grn",
      "akamai-cache-status",
      "x-akamai-ssl-client-sid",
      "x-akamai-staging",
      "x-akamai-transformed",
      "age",
    ],
    cacheStateHeaders: ["x-cache", "x-cache-remote", "x-check-cacheable"],
    fingerprint: ["x-akamai-request-id", "akamai-request-bc", "akamai-grn"],
  },

  cloudflare: {
    id: "cloudflare",
    label: "Cloudflare",
    inject: [],
    responseHeaders: [
      "cf-cache-status",
      "cf-ray",
      "cf-apo-via",
      "cf-edge-cache",
      "cf-polished",
      "cf-bgj",
      "cf-connecting-ip",
      "cdn-loop",
      "age",
    ],
    cacheStateHeaders: ["cf-cache-status"],
    fingerprint: ["cf-ray", "cf-cache-status"],
  },

  fastly: {
    id: "fastly",
    label: "Fastly",
    inject: [{ name: "Fastly-Debug", value: "1" }],
    responseHeaders: [
      "x-cache",
      "x-cache-hits",
      "x-served-by",
      "x-timer",
      "fastly-debug-digest",
      "fastly-debug-path",
      "fastly-debug-ttl",
      "fastly-debug-state",
      "surrogate-key",
      "surrogate-control",
      "age",
    ],
    cacheStateHeaders: ["x-cache"],
    fingerprint: ["x-served-by", "x-timer", "fastly-debug-digest"],
  },

  cloudfront: {
    id: "cloudfront",
    label: "CloudFront",
    inject: [],
    responseHeaders: [
      "x-cache",
      "x-amz-cf-pop",
      "x-amz-cf-id",
      "x-amz-server-side-encryption",
      "x-amz-request-id",
      "via",
      "age",
    ],
    cacheStateHeaders: ["x-cache"],
    fingerprint: ["x-amz-cf-id", "x-amz-cf-pop"],
  },

  azure: {
    id: "azure",
    label: "Azure Front Door",
    inject: [],
    responseHeaders: [
      "x-cache",
      "x-azure-ref",
      "x-azure-ref-originshield",
      "x-fd-int-roxy-purgeid",
      "x-ms-request-id",
      "x-ec-custom-error",
      "age",
    ],
    cacheStateHeaders: ["x-cache"],
    fingerprint: ["x-azure-ref", "x-fd-int-roxy-purgeid"],
  },

  google: {
    id: "google",
    label: "Google Cloud CDN",
    inject: [],
    responseHeaders: [
      "x-goog-cache-status",
      "x-goog-generation",
      "x-goog-metageneration",
      "x-goog-stored-content-encoding",
      "x-guploader-uploadid",
      "via",
      "age",
    ],
    cacheStateHeaders: ["x-goog-cache-status"],
    fingerprint: ["x-goog-cache-status", "x-guploader-uploadid"],
  },

  bunny: {
    id: "bunny",
    label: "BunnyCDN",
    inject: [],
    responseHeaders: [
      "cdn-cache",
      "cdn-cachedat",
      "cdn-status",
      "cdn-edgestorageid",
      "cdn-pullzone",
      "cdn-requestid",
      "cdn-requestcountrycode",
      "cdn-proxyver",
      "age",
    ],
    cacheStateHeaders: ["cdn-cache"],
    fingerprint: ["cdn-pullzone", "cdn-edgestorageid"],
  },

  varnish: {
    id: "varnish",
    label: "Varnish",
    inject: [],
    responseHeaders: ["x-cache", "x-cache-hits", "x-varnish", "x-varnish-cache", "via", "age"],
    cacheStateHeaders: ["x-cache", "x-varnish-cache"],
    fingerprint: ["x-varnish"],
  },

  netlify: {
    id: "netlify",
    label: "Netlify",
    inject: [],
    responseHeaders: [
      // Netlify reports cache state through RFC 9211's Cache-Status.
      "cache-status",
      "x-nf-request-id",
      "x-nf-cache-result",
      "netlify-vary",
      "x-nf-srv-version",
      "age",
    ],
    cacheStateHeaders: ["cache-status", "x-nf-cache-result"],
    fingerprint: ["x-nf-request-id", "netlify-vary"],
  },

  /**
   * Groups every header the named presets know, so a response reads correctly
   * without being told which CDN served it. It injects nothing of its own:
   * blanket-injecting every debug directive would put them on every request to
   * every site. Injection instead follows detection, per host.
   */
  auto: {
    id: "auto",
    label: "Auto",
    inject: [],
    responseHeaders: [],
    cacheStateHeaders: [],
    fingerprint: [],
  },
}

const NAMED = [
  presets.akamai,
  presets.cloudflare,
  presets.fastly,
  presets.cloudfront,
  presets.azure,
  presets.google,
  presets.bunny,
  presets.netlify,
  presets.varnish,
]

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

presets.auto.responseHeaders = unique(NAMED.flatMap((p) => p.responseHeaders))
presets.auto.cacheStateHeaders = unique(NAMED.flatMap((p) => p.cacheStateHeaders))

export const presetList = [presets.auto, ...NAMED]

/** Falls back to Auto, which also covers ids retired from earlier versions. */
export function getPreset(id: CdnPresetId): CdnPreset {
  return presets[id] ?? presets.auto
}

/**
 * Names the CDN a response came from by its identifying headers, so the popup
 * can say when the active preset does not match what actually served the page.
 */
export function detectPreset(headerNames: string[]): CdnPreset | null {
  const present = new Set(headerNames.map((name) => name.toLowerCase()))

  for (const preset of NAMED) {
    if (preset.fingerprint.some((name) => present.has(name))) return preset
  }

  return null
}
