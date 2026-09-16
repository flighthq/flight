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

export function initializeWebAppBadgeBackend(out: EntityConstruction<HostAppBadgeCapability>): void {
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
    const out = allocateEntity<HostAppBadgeCapability>();
    initializeWebAppBadgeBackend(out);
    return finishEntity(out);
  })();
  out.focus = (() => {
    const out = allocateEntity<HostAppFocusCapability>();
    initializeWebAppFocusBackend(out);
    return finishEntity(out);
  })();
  out.locale = (() => {
    const out = allocateEntity<HostAppLocaleCapability>();
    initializeWebAppLocaleBackend(out);
    return finishEntity(out);
  })();
  out.name = (() => {
    const out = allocateEntity<HostAppNameCapability>();
    initializeWebAppNameBackend(out);
    return finishEntity(out);
  })();
  out.quit = (() => {
    const out = allocateEntity<HostAppQuitCapability>();
    initializeWebAppQuitBackend(out);
    return finishEntity(out);
  })();
  out.ready = (() => {
    const out = allocateEntity<HostAppReadyCapability>();
    initializeWebAppReadyBackend(out);
    return finishEntity(out);
  })();
  out.relaunch = (() => {
    const out = allocateEntity<HostAppRelaunchCapability>();
    initializeWebAppRelaunchBackend(out);
    return finishEntity(out);
  })();
}

export function initializeWebAppFocusBackend(out: EntityConstruction<HostAppFocusCapability>): void {
  out.focus = () => {
    try {
      window.focus();
    } catch {}
  };
}

export function initializeWebAppLocaleBackend(out: EntityConstruction<HostAppLocaleCapability>): void {
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

export function initializeWebAppNameBackend(out: EntityConstruction<HostAppNameCapability>): void {
  out.getName = () => {
    return typeof document === 'undefined' ? '' : document.title;
  };
}

export function initializeWebAppQuitBackend(out: EntityConstruction<HostAppQuitCapability>): void {
  out.quit = () => {
    try {
      window.close();
    } catch {}
  };
}

export function initializeWebAppReadyBackend(out: EntityConstruction<HostAppReadyCapability>): void {
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

export function initializeWebAppRelaunchBackend(out: EntityConstruction<HostAppRelaunchCapability>): void {
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

function createWebAppCapability<Capability extends Entity>(
  initialize: (out: EntityConstruction<Capability>) => void,
): Capability {
  const out = allocateEntity<Capability>();
  initialize(out);
  return finishEntity(out);
}
