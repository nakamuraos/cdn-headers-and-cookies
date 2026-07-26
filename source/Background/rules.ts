import browser from 'webextension-polyfill';

import {getPreset} from '@/lib/presets';
import type {CustomHeader, Settings} from '@/types';

/** Rule ids are partitioned so the rule families can be reasoned about independently. */
const PRESET_RULE_ID = 1;
const GLOBAL_RULE_ID = 2;
const HOST_RULE_BASE = 1_000;

export interface HeaderRule {
  id: number;
  priority: number;
  action: {
    type: 'modifyHeaders';
    requestHeaders: {header: string; operation: 'set'; value: string}[];
  };
  condition: {
    requestDomains?: string[];
    excludedRequestDomains?: string[];
    resourceTypes: string[];
  };
}

const RESOURCE_TYPES = [
  'main_frame',
  'sub_frame',
  'stylesheet',
  'script',
  'image',
  'font',
  'object',
  'xmlhttprequest',
  'ping',
  'csp_report',
  'media',
  'websocket',
  'other',
];

const HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
// Matching control characters is the point: they are what makes a value invalid.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

/**
 * Header names must be HTTP tokens and values must be free of control
 * characters. An invalid rule causes the browser to reject the entire batch,
 * so candidates are screened before they are ever submitted.
 */
export function validateHeader(header: {name: string; value: string}): string | null {
  if (!header.name.trim()) return 'Header name is required';
  if (!HEADER_NAME.test(header.name)) {
    return "Header name may only contain letters, digits and !#$%&'*+-.^_`|~";
  }
  if (CONTROL_CHARS.test(header.value)) {
    return 'Header value may not contain control characters';
  }

  return null;
}

function enabledHeaders(headers: CustomHeader[]): CustomHeader[] {
  return headers.filter((h) => h.enabled && validateHeader(h) === null);
}

function modifyAction(headers: {name: string; value: string}[]): HeaderRule['action'] {
  return {
    type: 'modifyHeaders',
    requestHeaders: headers.map((h) => ({
      header: h.name,
      operation: 'set',
      value: h.value,
    })),
  };
}

/**
 * Builds the complete set of dynamic rules implied by the current settings.
 * Pure, so the mapping from settings to rules is testable without a browser.
 *
 * Preset injection applies everywhere by default and is subtracted per host,
 * matching the toggle semantics the extension has always had.
 */
export function desiredRules(settings: Settings): HeaderRule[] {
  const rules: HeaderRule[] = [];
  const preset = getPreset(settings.preset);

  if (preset.inject.length > 0) {
    const disabled = Object.entries(settings.hostToggles)
      .filter(([, on]) => on === false)
      .map(([host]) => host);

    rules.push({
      id: PRESET_RULE_ID,
      priority: 1,
      action: modifyAction(preset.inject),
      condition: {
        ...(disabled.length > 0 ? {excludedRequestDomains: disabled} : {}),
        resourceTypes: RESOURCE_TYPES,
      },
    });
  }

  const globals = enabledHeaders(settings.globalHeaders);
  if (globals.length > 0) {
    rules.push({
      id: GLOBAL_RULE_ID,
      priority: 2,
      action: modifyAction(globals),
      condition: {resourceTypes: RESOURCE_TYPES},
    });
  }

  // Ids are positional rather than hashed: the whole set is replaced on every
  // reconcile, and hashing hosts into a fixed range collides.
  let hostRuleId = HOST_RULE_BASE;

  for (const [host, headers] of Object.entries(settings.hostHeaders)) {
    const enabled = enabledHeaders(headers);
    if (enabled.length === 0) continue;

    hostRuleId += 1;

    rules.push({
      id: hostRuleId,
      priority: 3,
      action: modifyAction(enabled),
      condition: {
        requestDomains: [host],
        resourceTypes: RESOURCE_TYPES,
      },
    });
  }

  return rules;
}

/**
 * The headers the dynamic rules add for a host, in the order they are applied.
 *
 * Chrome runs webRequest observers before declarativeNetRequest rewrites the
 * request, so injected headers are never visible to the capture listeners.
 * The captured list is completed from this instead of by detection.
 */
export function injectedHeaders(
  settings: Settings,
  host: string
): {name: string; value: string}[] {
  const headers: {name: string; value: string}[] = [];
  const preset = getPreset(settings.preset);

  if (settings.hostToggles[host] !== false) {
    headers.push(...preset.inject.map((h) => ({name: h.name, value: h.value})));
  }
  for (const h of enabledHeaders(settings.globalHeaders)) {
    headers.push({name: h.name, value: h.value});
  }
  for (const h of enabledHeaders(settings.hostHeaders[host] ?? [])) {
    headers.push({name: h.name, value: h.value});
  }

  return headers;
}

/** Every header this extension would inject for a host, lower-cased. */
export function injectedHeaderNames(settings: Settings, host: string): Set<string> {
  return new Set(injectedHeaders(settings, host).map((h) => h.name.toLowerCase()));
}

interface DynamicRuleApi {
  getDynamicRules(): Promise<{id: number}[]>;
  updateDynamicRules(options: {
    removeRuleIds?: number[];
    addRules?: HeaderRule[];
  }): Promise<void>;
}

function dnr(): DynamicRuleApi {
  return (browser as unknown as {declarativeNetRequest: DynamicRuleApi})
    .declarativeNetRequest;
}

/**
 * Reconciling reads the installed rules before replacing them, and the worker
 * has several independent triggers for it. Runs are therefore chained, so one
 * can never submit ids that another added after it took its snapshot.
 */
let pending: Promise<unknown> = Promise.resolve();

export async function applyRules(settings: Settings): Promise<void> {
  const reconcile = async (): Promise<void> => {
    const desired = desiredRules(settings);
    const current = await dnr().getDynamicRules();

    // Removals are applied before additions within a single call, so listing
    // the ids about to be added guarantees they are free even if the snapshot
    // above is already stale or rules survive from an earlier version.
    const removeRuleIds = [
      ...new Set([...current.map((rule) => rule.id), ...desired.map((rule) => rule.id)]),
    ];

    try {
      await dnr().updateDynamicRules({removeRuleIds, addRules: desired});
    } catch {
      // A batch is rejected whole, which would leave injection silently off.
      // Dropping every installed rule first gives the retry a clean store.
      const stale = await dnr().getDynamicRules();
      await dnr().updateDynamicRules({removeRuleIds: stale.map((rule) => rule.id)});
      await dnr().updateDynamicRules({addRules: desired});
    }
  };

  const next = pending.then(reconcile, reconcile);
  pending = next.catch(() => undefined);

  return next;
}
