import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type { BackendExplanation, ParsedProtocolUrl, ProtocolBackend, ProtocolHandler } from '@flighthq/types/contract';

// Begins delivering deep-link opens to `handler`'s signal by subscribing to the active backend. Wires
// subscribe→onOpenUrl. Idempotent: a prior subscription is torn down first. Drains any URLs that
// arrived before this call (buffered by the backend between process start and first attach) and
// emits each one before activating the live subscription. Pair with
// detachProtocolHandler/disposeProtocolHandler.
export function attachProtocolHandler(handler: ProtocolHandler): void {
  detachProtocolHandler(handler);
  const backend = getProtocolBackend();
  // Drain URLs that arrived between process start and first attach (pre-attach burst).
  const pending = backend.drainPendingUrls();
  for (const url of pending) {
    emitSignal(handler.onOpenUrl, url);
  }
  const unsubscribe = backend.subscribe((url) => emitSignal(handler.onOpenUrl, url));
  _subscriptions.set(handler, unsubscribe);
}

// Allocates a ProtocolHandler event entity with an inert signal; call attachProtocolHandler to start
// delivery.
export function createProtocolHandler(): ProtocolHandler {
  return { onOpenUrl: createSignal() };
}

// Builds a protocol URL string from its parsed components. scheme, host, path, and query are all
// optional; the result is always a valid absolute URI string. Round-trips with parseProtocolUrl for
// well-formed inputs.
export function createProtocolUrl(parts: Readonly<Partial<ParsedProtocolUrl>>): string {
  const scheme = parts.scheme ?? 'unknown';
  const host = parts.host ?? '';
  const path = parts.path ?? '';
  const query = parts.query;
  const authority = host ? `//${host}` : '';
  const normalizedPath = path && !path.startsWith('/') ? `/${path}` : path;
  let url = `${scheme}:${authority}${normalizedPath}`;
  if (query) {
    const entries = Object.entries(query).filter(([k]) => k.length > 0);
    if (entries.length > 0) {
      const qs = entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
      url += `?${qs}`;
    }
  }
  return url;
}

// Stops delivery to `handler` and forgets its subscription. Safe to call when not attached.
export function detachProtocolHandler(handler: ProtocolHandler): void {
  const unsubscribe = _subscriptions.get(handler);
  if (unsubscribe !== undefined) {
    unsubscribe();
    _subscriptions.delete(handler);
  }
}

// Releases `handler` for garbage collection by detaching its backend subscription. The signal remains
// plain GC-managed memory afterward.
export function disposeProtocolHandler(handler: ProtocolHandler): void {
  detachProtocolHandler(handler);
}

export function explainProtocolBackend(): BackendExplanation {
  if (_custom !== null) {
    return { conflict: _hostConflict, layer: 'custom', operation: null, viability: 'unobserved' };
  }
  if (_host !== null) {
    return {
      conflict: _hostConflict,
      layer: 'host',
      operation: _hostObservation !== null ? _hostObservation.operation : null,
      viability: _hostObservation !== null ? _hostObservation.viability : 'unobserved',
    };
  }
  return { conflict: false, layer: 'host-not-enabled', operation: null, viability: 'unobserved' };
}

// The active protocol backend. Precedence: custom > host > sentinel.
export function getProtocolBackend(): ProtocolBackend {
  return _custom ?? _host ?? _sentinel;
}

// Returns the URL the app was launched with via a deep link (cold start), or null when the app was
// not launched via a link. This is a one-shot idempotent query — re-readable. Distinct from
// onOpenUrl, which fires only for warm (subsequent) opens.
export function getProtocolLaunchUrl(): string | null {
  return getProtocolBackend().getLaunchUrl();
}

// Returns all custom URI schemes currently registered by this app. Returns [] when the host cannot
// enumerate registered schemes.
export function getRegisteredProtocolSchemes(): readonly string[] {
  return getProtocolBackend().getRegisteredSchemes();
}

export function installProtocolHostBackend(backend: ProtocolBackend): void {
  if (_host !== null) {
    if (_host !== backend) _hostConflict = true;
    return;
  }
  _host = backend;
}

// True when `scheme` is the OS default handler for deep links. Returns false where the host cannot
// report it (e.g. the web platform).
export function isProtocolSchemeDefault(scheme: string): boolean {
  return getProtocolBackend().isDefault(scheme);
}

// True when `scheme` is currently registered to this app. Returns false where the host cannot report it.
export function isProtocolSchemeRegistered(scheme: string): boolean {
  return getProtocolBackend().isRegistered(scheme);
}

// Returns true when `scheme` is a valid RFC 3986 URI scheme: starts with an ASCII letter followed by
// zero or more letters, digits, '+', '-', or '.'. Reserved schemes ('http', 'https', 'ftp', 'ftps',
// 'mailto', 'file') are rejected to prevent OS conflicts. Scheme is lowercased before validation so
// 'MyApp' is treated identically to 'myapp'.
export function isValidProtocolScheme(scheme: string): boolean {
  if (typeof scheme !== 'string' || scheme.length === 0) return false;
  const lower = scheme.toLowerCase();
  if (_reservedSchemes.has(lower)) return false;
  return _schemePattern.test(lower);
}

export function observeProtocolHostResult(operation: string, succeeded: boolean): void {
  _hostObservation = {
    operation,
    viability: succeeded ? 'available' : 'runtime-api-unavailable',
  };
}

// Parses a deep-link URL into its components. Returns null for malformed or non-custom-scheme URLs.
// query values are percent-decoded. Multi-value query keys: last value wins (matches URLSearchParams
// behavior). This function does not allocate a large object on the happy path — it reads all fields
// before writing to avoid aliasing issues if the caller reuses a buffer.
export function parseProtocolUrl(url: string): ParsedProtocolUrl | null {
  if (typeof url !== 'string' || url.length === 0) return null;
  const colonIdx = url.indexOf(':');
  if (colonIdx <= 0) return null;
  const scheme = url.slice(0, colonIdx).toLowerCase();
  if (!_schemePattern.test(scheme)) return null;

  let rest = url.slice(colonIdx + 1);

  // Authority (//host)
  let host = '';
  if (rest.startsWith('//')) {
    rest = rest.slice(2);
    const slashIdx = rest.indexOf('/');
    const qIdx = rest.indexOf('?');
    let hostEnd: number;
    if (slashIdx >= 0 && (qIdx < 0 || slashIdx < qIdx)) {
      hostEnd = slashIdx;
    } else if (qIdx >= 0) {
      hostEnd = qIdx;
    } else {
      hostEnd = rest.length;
    }
    host = rest.slice(0, hostEnd);
    rest = rest.slice(hostEnd);
  }

  // Path and query
  const qIdx = rest.indexOf('?');
  let path: string;
  let queryString: string;
  if (qIdx >= 0) {
    path = rest.slice(0, qIdx);
    queryString = rest.slice(qIdx + 1);
  } else {
    path = rest;
    queryString = '';
  }

  // Decode query
  const query: Record<string, string> = {};
  if (queryString.length > 0) {
    for (const pair of queryString.split('&')) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx < 0) {
        const k = _safeDecode(pair);
        if (k.length > 0) query[k] = '';
      } else {
        const k = _safeDecode(pair.slice(0, eqIdx));
        if (k.length > 0) query[k] = _safeDecode(pair.slice(eqIdx + 1));
      }
    }
  }

  return { scheme, host, path, query };
}

// Registers a custom URI scheme (for example 'myapp') to this app. Returns false when the scheme is
// invalid (RFC 3986 grammar, no reserved schemes) or when the host denies or does not support
// registration.
export function registerProtocolScheme(scheme: string): boolean {
  if (!isValidProtocolScheme(scheme)) return false;
  return getProtocolBackend().register(scheme);
}

// Registers multiple custom URI schemes in one call. Returns false if any scheme is invalid or if any
// registration fails.
export function registerProtocolSchemes(schemes: readonly string[]): boolean {
  const backend = getProtocolBackend();
  let allOk = true;
  for (const scheme of schemes) {
    if (!isValidProtocolScheme(scheme) || !backend.register(scheme)) allOk = false;
  }
  return allOk;
}

// Removes this app as the OS default handler for `scheme`. Returns false when the host denies or does
// not support it.
export function removeProtocolSchemeAsDefault(scheme: string): boolean {
  return getProtocolBackend().removeAsDefault(scheme);
}

export function resetProtocolBackendForTest(): void {
  _custom = null;
  _host = null;
  _hostConflict = false;
  _hostObservation = null;
}

// Installs a custom protocol backend; pass null to clear the custom override.
export function setProtocolBackend(backend: ProtocolBackend | null): void {
  _custom = backend;
}

// Makes this app the default handler for `scheme`. Returns false when the host denies or does not
// support it.
export function setProtocolSchemeAsDefault(scheme: string): boolean {
  return getProtocolBackend().setAsDefault(scheme);
}

// Unregisters a previously registered custom URI scheme. Returns false when the host denies or does
// not support unregistration.
export function unregisterProtocolScheme(scheme: string): boolean {
  return getProtocolBackend().unregister(scheme);
}

// Unregisters multiple custom URI schemes in one call. Returns false if any unregistration fails.
export function unregisterProtocolSchemes(schemes: readonly string[]): boolean {
  const backend = getProtocolBackend();
  let allOk = true;
  for (const scheme of schemes) {
    if (!backend.unregister(scheme)) allOk = false;
  }
  return allOk;
}

const _sentinel: ProtocolBackend = {
  drainPendingUrls() {
    return [];
  },
  getLaunchUrl() {
    return null;
  },
  getRegisteredSchemes() {
    return [];
  },
  isDefault() {
    return false;
  },
  isRegistered() {
    return false;
  },
  register() {
    return false;
  },
  removeAsDefault() {
    return false;
  },
  setAsDefault() {
    return false;
  },
  subscribe() {
    return () => {};
  },
  unregister() {
    return false;
  },
};

// RFC 3986 scheme grammar: letter followed by zero or more letter/digit/+/-/. (lowercased).
const _schemePattern = /^[a-z][a-z0-9+\-.]*$/;

// Schemes that should never be claimed as custom URI handlers to avoid OS conflicts.
const _reservedSchemes = new Set(['file', 'ftp', 'ftps', 'http', 'https', 'mailto']);

let _custom: ProtocolBackend | null = null;
let _host: ProtocolBackend | null = null;
let _hostConflict = false;
let _hostObservation: { operation: string; viability: 'available' | 'runtime-api-unavailable' } | null = null;
const _subscriptions = new WeakMap<ProtocolHandler, () => void>();

function _safeDecode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s;
  }
}
