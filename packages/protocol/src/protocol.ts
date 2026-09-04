import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { clearSignal, createSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  EntityConstruction,
  HasProtocolDefault,
  HasProtocolLaunch,
  HasProtocolOpen,
  HasProtocolRegistration,
  HasProtocolRegistrationQuery,
  HasProtocolUnregistration,
  ParsedProtocolUrl,
  ProtocolHandler,
} from '@flighthq/types/contract';

export function attachProtocolHandler(host: HasProtocolOpen, handler: ProtocolHandler): void {
  detachProtocolHandler(handler);
  const backend = host.protocol.open;
  _subscriptions.set(
    handler,
    backend.subscribe((url) => emitSignal(handler.onOpenUrl, url)),
  );
}

export function createProtocolHandler(): ProtocolHandler {
  const out = allocateEntity<ProtocolHandler>();
  out.onOpenUrl = createSignal();
  return finishEntity(out);
}

export function createProtocolUrl(parts: Readonly<Partial<ParsedProtocolUrl>>): string {
  const scheme = parts.scheme ?? 'unknown';
  const host = parts.host ?? '';
  const path = parts.path ?? '';
  const query = parts.query;
  const authority = host ? `//${host}` : '';
  const normalizedPath = path && !path.startsWith('/') ? `/${path}` : path;
  let url = `${scheme}:${authority}${normalizedPath}`;
  if (query) {
    const entries = Object.entries(query).filter(([key]) => key.length > 0);
    if (entries.length > 0) {
      const queryString = entries
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');
      url += `?${queryString}`;
    }
  }
  return url;
}

export function detachProtocolHandler(handler: ProtocolHandler): void {
  _subscriptions.get(handler)?.();
  _subscriptions.delete(handler);
}

export function disposeProtocolHandler(handler: ProtocolHandler): void {
  detachProtocolHandler(handler);
  clearSignal(handler.onOpenUrl);
}

export function getProtocolLaunchUrl(host: HasProtocolLaunch): string | null {
  return host.protocol.launch.getLaunchUrl();
}

export function getRegisteredProtocolSchemes(host: HasProtocolRegistration): readonly string[] {
  return host.protocol.registration.getRegisteredSchemes();
}

export function isProtocolSchemeDefault(host: HasProtocolDefault, scheme: string): boolean {
  return isValidProtocolScheme(scheme) && host.protocol.default.isDefault(scheme);
}

export function isProtocolSchemeRegistered(host: HasProtocolRegistrationQuery, scheme: string): boolean {
  return isValidProtocolScheme(scheme) && host.protocol.registrationQuery.isRegistered(scheme);
}

export function isValidProtocolScheme(scheme: string): boolean {
  if (typeof scheme !== 'string' || scheme.length === 0) return false;
  const lower = scheme.toLowerCase();
  if (_reservedSchemes.has(lower)) return false;
  return _schemePattern.test(lower);
}

export function parseProtocolUrl(url: string): ParsedProtocolUrl | null {
  if (typeof url !== 'string' || url.length === 0) return null;
  const colonIndex = url.indexOf(':');
  if (colonIndex <= 0) return null;
  const scheme = url.slice(0, colonIndex).toLowerCase();
  if (!_schemePattern.test(scheme)) return null;

  let rest = url.slice(colonIndex + 1);
  let host = '';
  if (rest.startsWith('//')) {
    rest = rest.slice(2);
    const slashIndex = rest.indexOf('/');
    const queryIndex = rest.indexOf('?');
    const hostEnd =
      slashIndex >= 0 && (queryIndex < 0 || slashIndex < queryIndex)
        ? slashIndex
        : queryIndex >= 0
          ? queryIndex
          : rest.length;
    host = rest.slice(0, hostEnd);
    rest = rest.slice(hostEnd);
  }

  const queryIndex = rest.indexOf('?');
  const path = queryIndex >= 0 ? rest.slice(0, queryIndex) : rest;
  const queryString = queryIndex >= 0 ? rest.slice(queryIndex + 1) : '';
  const query: Record<string, string> = {};
  if (queryString.length > 0) {
    for (const pair of queryString.split('&')) {
      const equalsIndex = pair.indexOf('=');
      if (equalsIndex < 0) {
        const key = safeDecodeProtocolComponent(pair);
        if (key.length > 0) query[key] = '';
      } else {
        const key = safeDecodeProtocolComponent(pair.slice(0, equalsIndex));
        if (key.length > 0) query[key] = safeDecodeProtocolComponent(pair.slice(equalsIndex + 1));
      }
    }
  }
  return { host, path, query, scheme };
}

export function registerProtocolScheme(host: HasProtocolRegistration, scheme: string): boolean {
  return isValidProtocolScheme(scheme) && host.protocol.registration.register(scheme);
}

export function registerProtocolSchemes(host: HasProtocolRegistration, schemes: readonly string[]): boolean {
  if (!schemes.every(isValidProtocolScheme)) return false;
  const backend = host.protocol.registration;
  let allSucceeded = true;
  for (const scheme of schemes) {
    if (!backend.register(scheme)) allSucceeded = false;
  }
  return allSucceeded;
}

export function removeProtocolSchemeAsDefault(host: HasProtocolDefault, scheme: string): boolean {
  return isValidProtocolScheme(scheme) && host.protocol.default.removeAsDefault(scheme);
}

export function setProtocolSchemeAsDefault(host: HasProtocolDefault, scheme: string): boolean {
  return isValidProtocolScheme(scheme) && host.protocol.default.setAsDefault(scheme);
}

export function unregisterProtocolScheme(host: HasProtocolUnregistration, scheme: string): boolean {
  return isValidProtocolScheme(scheme) && host.protocol.unregistration.unregister(scheme);
}

export function unregisterProtocolSchemes(host: HasProtocolUnregistration, schemes: readonly string[]): boolean {
  if (!schemes.every(isValidProtocolScheme)) return false;
  const backend = host.protocol.unregistration;
  let allSucceeded = true;
  for (const scheme of schemes) {
    if (!backend.unregister(scheme)) allSucceeded = false;
  }
  return allSucceeded;
}

const _schemePattern = /^[a-z][a-z0-9+\-.]*$/;
const _reservedSchemes = new Set(['file', 'ftp', 'ftps', 'http', 'https', 'mailto']);
const _subscriptions = new WeakMap<ProtocolHandler, () => void>();

function safeDecodeProtocolComponent(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}
