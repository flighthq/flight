import type {
  HostAppBadgeCapability,
  HostAppCapabilities,
  HostAppFocusCapability,
  HostAppLocaleCapability,
  HostAppNameCapability,
  HostAppQuitCapability,
  HostAppReadyCapability,
  HostAppRelaunchCapability,
} from '@flighthq/types/contract';

// A capability GROUP: host dispatch infrastructure, not a domain object Flight defines and allocates,
// so it is plain data formed as a literal — no Entity, no runtime tier, no allocate/finish bracket.
type WebAppCapabilities = Required<
  Pick<HostAppCapabilities, 'badge' | 'focus' | 'locale' | 'name' | 'quit' | 'ready' | 'relaunch'>
>;

export function createWebAppCapabilities(): WebAppCapabilities {
  return {
    badge: createWebAppCapability(initializeWebAppBadgeBackend),
    focus: createWebAppCapability(initializeWebAppFocusBackend),
    locale: createWebAppCapability(initializeWebAppLocaleBackend),
    name: createWebAppCapability(initializeWebAppNameBackend),
    quit: createWebAppCapability(initializeWebAppQuitBackend),
    ready: createWebAppCapability(initializeWebAppReadyBackend),
    relaunch: createWebAppCapability(initializeWebAppRelaunchBackend),
  };
}

export function initializeWebAppBadgeBackend(out: HostAppBadgeCapability): void {
  out.setBadgeCount = async (count: number) => {
    if (typeof navigator === 'undefined') return false;
    if (typeof navigator.setAppBadge !== 'function') return false;
    try {
      await navigator.setAppBadge(count);
      return true;
    } catch {
      return false;
    }
  };
}

export function initializeWebAppFocusBackend(out: HostAppFocusCapability): void {
  out.focus = () => {
    try {
      window.focus();
    } catch {}
  };
}

export function initializeWebAppLocaleBackend(out: HostAppLocaleCapability): void {
  out.getLocale = () => {
    return typeof navigator === 'undefined' ? '' : (navigator.language ?? '');
  };
  out.getPreferredSystemLanguages = () => {
    return typeof navigator === 'undefined' || !Array.isArray(navigator.languages) ? [] : navigator.languages;
  };
  out.getSystemLocale = () => {
    try {
      return typeof Intl === 'undefined' ? '' : new Intl.DateTimeFormat().resolvedOptions().locale;
    } catch {
      return '';
    }
  };
}

export function initializeWebAppNameBackend(out: HostAppNameCapability): void {
  out.getName = () => {
    return typeof document === 'undefined' ? '' : document.title;
  };
}

export function initializeWebAppQuitBackend(out: HostAppQuitCapability): void {
  out.quit = () => {
    try {
      window.close();
    } catch {}
  };
}

export function initializeWebAppReadyBackend(out: HostAppReadyCapability): void {
  out.subscribe = (listener: () => void) => {
    if (typeof document !== 'undefined' && document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', listener, { once: true });
      return () => document.removeEventListener('DOMContentLoaded', listener);
    }
    let active = true;
    queueMicrotask(() => {
      if (active) listener();
    });
    return () => {
      active = false;
    };
  };
}

export function initializeWebAppRelaunchBackend(out: HostAppRelaunchCapability): void {
  out.relaunch = () => {
    try {
      location.reload();
    } catch {}
  };
}

export const webHostAppBadge = createWebAppCapability<HostAppBadgeCapability>(initializeWebAppBadgeBackend);
export const webHostAppFocus = createWebAppCapability<HostAppFocusCapability>(initializeWebAppFocusBackend);
export const webHostAppLocale = createWebAppCapability<HostAppLocaleCapability>(initializeWebAppLocaleBackend);
export const webHostAppName = createWebAppCapability<HostAppNameCapability>(initializeWebAppNameBackend);
export const webHostAppQuit = createWebAppCapability<HostAppQuitCapability>(initializeWebAppQuitBackend);
export const webHostAppReady = createWebAppCapability<HostAppReadyCapability>(initializeWebAppReadyBackend);
export const webHostAppRelaunch = createWebAppCapability<HostAppRelaunchCapability>(initializeWebAppRelaunchBackend);

function createWebAppCapability<Capability>(initialize: (out: Capability) => void): Capability {
  const out = {} as Capability;
  initialize(out);
  return out;
}
