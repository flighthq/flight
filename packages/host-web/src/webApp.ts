import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  Entity,
  EntityConstruction,
  HostAppBadgeCapability,
  HostAppCapabilities,
  HostAppFocusCapability,
  HostAppLocaleCapability,
  HostAppNameCapability,
  HostAppQuitCapability,
  HostAppReadyCapability,
  HostAppRelaunchCapability,
} from '@flighthq/types/contract';

type WebAppCapabilities = Entity &
  Required<Pick<HostAppCapabilities, 'badge' | 'focus' | 'locale' | 'name' | 'quit' | 'ready' | 'relaunch'>>;

export function createWebAppCapabilities(): WebAppCapabilities {
  const out = allocateEntity<WebAppCapabilities>();
  initializeWebAppCapabilities(out);
  return finishEntity(out);
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

export function initializeWebAppCapabilities(out: EntityConstruction<WebAppCapabilities>): void {
  out.badge = (() => {
    const out = {} as HostAppBadgeCapability;
    initializeWebAppBadgeBackend(out);
    return out;
  })();
  out.focus = (() => {
    const out = {} as HostAppFocusCapability;
    initializeWebAppFocusBackend(out);
    return out;
  })();
  out.locale = (() => {
    const out = {} as HostAppLocaleCapability;
    initializeWebAppLocaleBackend(out);
    return out;
  })();
  out.name = (() => {
    const out = {} as HostAppNameCapability;
    initializeWebAppNameBackend(out);
    return out;
  })();
  out.quit = (() => {
    const out = {} as HostAppQuitCapability;
    initializeWebAppQuitBackend(out);
    return out;
  })();
  out.ready = (() => {
    const out = {} as HostAppReadyCapability;
    initializeWebAppReadyBackend(out);
    return out;
  })();
  out.relaunch = (() => {
    const out = {} as HostAppRelaunchCapability;
    initializeWebAppRelaunchBackend(out);
    return out;
  })();
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
