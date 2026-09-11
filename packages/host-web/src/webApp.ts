import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  Entity,
  EntityConstruction,
  HostAppBadgeProvider,
  HostAppCapabilities,
  HostAppFocusProvider,
  HostAppLocaleProvider,
  HostAppNameProvider,
  HostAppQuitProvider,
  HostAppReadyProvider,
  HostAppRelaunchProvider,
} from '@flighthq/types/contract';

type WebAppCapabilities = Entity &
  Required<Pick<HostAppCapabilities, 'badge' | 'focus' | 'locale' | 'name' | 'quit' | 'ready' | 'relaunch'>>;

export function createWebAppCapabilities(): WebAppCapabilities {
  const out = allocateEntity<WebAppCapabilities>();
  initializeWebAppCapabilities(out);
  return finishEntity(out);
}

export function initializeWebAppBadgeBackend(out: EntityConstruction<HostAppBadgeProvider>): void {
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
    const out = allocateEntity<HostAppBadgeProvider>();
    initializeWebAppBadgeBackend(out);
    return finishEntity(out);
  })();
  out.focus = (() => {
    const out = allocateEntity<HostAppFocusProvider>();
    initializeWebAppFocusBackend(out);
    return finishEntity(out);
  })();
  out.locale = (() => {
    const out = allocateEntity<HostAppLocaleProvider>();
    initializeWebAppLocaleBackend(out);
    return finishEntity(out);
  })();
  out.name = (() => {
    const out = allocateEntity<HostAppNameProvider>();
    initializeWebAppNameBackend(out);
    return finishEntity(out);
  })();
  out.quit = (() => {
    const out = allocateEntity<HostAppQuitProvider>();
    initializeWebAppQuitBackend(out);
    return finishEntity(out);
  })();
  out.ready = (() => {
    const out = allocateEntity<HostAppReadyProvider>();
    initializeWebAppReadyBackend(out);
    return finishEntity(out);
  })();
  out.relaunch = (() => {
    const out = allocateEntity<HostAppRelaunchProvider>();
    initializeWebAppRelaunchBackend(out);
    return finishEntity(out);
  })();
}

export function initializeWebAppFocusBackend(out: EntityConstruction<HostAppFocusProvider>): void {
  out.focus = () => {
    try {
      window.focus();
    } catch {}
  };
}

export function initializeWebAppLocaleBackend(out: EntityConstruction<HostAppLocaleProvider>): void {
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

export function initializeWebAppNameBackend(out: EntityConstruction<HostAppNameProvider>): void {
  out.getName = () => {
    return typeof document === 'undefined' ? '' : document.title;
  };
}

export function initializeWebAppQuitBackend(out: EntityConstruction<HostAppQuitProvider>): void {
  out.quit = () => {
    try {
      window.close();
    } catch {}
  };
}

export function initializeWebAppReadyBackend(out: EntityConstruction<HostAppReadyProvider>): void {
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

export function initializeWebAppRelaunchBackend(out: EntityConstruction<HostAppRelaunchProvider>): void {
  out.relaunch = () => {
    try {
      location.reload();
    } catch {}
  };
}

export const webHostAppBadge = createWebAppProvider<HostAppBadgeProvider>(initializeWebAppBadgeBackend);
export const webHostAppFocus = createWebAppProvider<HostAppFocusProvider>(initializeWebAppFocusBackend);
export const webHostAppLocale = createWebAppProvider<HostAppLocaleProvider>(initializeWebAppLocaleBackend);
export const webHostAppName = createWebAppProvider<HostAppNameProvider>(initializeWebAppNameBackend);
export const webHostAppQuit = createWebAppProvider<HostAppQuitProvider>(initializeWebAppQuitBackend);
export const webHostAppReady = createWebAppProvider<HostAppReadyProvider>(initializeWebAppReadyBackend);
export const webHostAppRelaunch = createWebAppProvider<HostAppRelaunchProvider>(initializeWebAppRelaunchBackend);

function createWebAppProvider<Provider extends Entity>(
  initialize: (out: EntityConstruction<Provider>) => void,
): Provider {
  const out = allocateEntity<Provider>();
  initialize(out);
  return finishEntity(out);
}
