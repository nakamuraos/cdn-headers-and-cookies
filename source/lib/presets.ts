import type {CdnPresetId} from '@/types';

export interface CdnPreset {
  id: CdnPresetId;
  label: string;
  /** Request headers injected to make the CDN emit its debug headers. */
  inject: {name: string; value: string}[];
  /** Response header names grouped ahead of everything else, lower-cased. */
  responseHeaders: string[];
  /** Headers whose values carry cache state, used for the at-a-glance colouring. */
  cacheStateHeaders: string[];
}

const AKAMAI_PRAGMA = [
  'akamai-x-cache-on',
  'akamai-x-cache-remote-on',
  'akamai-x-check-cacheable',
  'akamai-x-get-cache-key',
  'akamai-x-get-extracted-values',
  'akamai-x-get-ssl-client-session-id',
  'akamai-x-get-true-cache-key',
  'akamai-x-serial-no',
  'akamai-x-get-request-id',
  'akamai-x-get-nonces',
  'akamai-x-get-client-ip',
  'akamai-x-feo-trace',
].join(', ');

export const presets: Record<CdnPresetId, CdnPreset> = {
  akamai: {
    id: 'akamai',
    label: 'Akamai',
    inject: [{name: 'Pragma', value: AKAMAI_PRAGMA}],
    responseHeaders: [
      'x-cache',
      'x-cache-key',
      'x-cache-remote',
      'x-check-cacheable',
      'x-true-cache-key',
      'x-serial',
      'x-akamai-request-id',
      'akamai-request-bc',
      'akamai-grn',
    ],
    cacheStateHeaders: ['x-cache', 'x-cache-remote', 'x-check-cacheable'],
  },

  cloudflare: {
    id: 'cloudflare',
    label: 'Cloudflare',
    inject: [],
    responseHeaders: [
      'cf-cache-status',
      'cf-ray',
      'cf-apo-via',
      'cf-edge-cache',
      'cf-polished',
      'age',
    ],
    cacheStateHeaders: ['cf-cache-status'],
  },

  fastly: {
    id: 'fastly',
    label: 'Fastly',
    inject: [{name: 'Fastly-Debug', value: '1'}],
    responseHeaders: [
      'x-served-by',
      'x-cache',
      'x-cache-hits',
      'x-timer',
      'fastly-debug-digest',
      'fastly-debug-path',
      'fastly-debug-ttl',
      'age',
    ],
    cacheStateHeaders: ['x-cache'],
  },

  none: {
    id: 'none',
    label: 'None',
    inject: [],
    responseHeaders: [],
    cacheStateHeaders: [],
  },
};

export const presetList = [
  presets.akamai,
  presets.cloudflare,
  presets.fastly,
  presets.none,
];

export function getPreset(id: CdnPresetId): CdnPreset {
  return presets[id] ?? presets.akamai;
}
