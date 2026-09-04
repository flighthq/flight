import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  AppBadgeBackend,
  AppFocusBackend,
  AppLocaleBackend,
  AppNameBackend,
  AppQuitBackend,
  AppReadyBackend,
  AppRelaunchBackend,
  Entity,
  EntityConstruction,
  HostAppCapabilities,
} from '@flighthq/types/contract';

type WebAppCapabilities = Entity &
  Required<Pick<HostAppCapabilities, 'badge' | 'focus' | 'locale' | 'name' | 'quit' | 'ready' | 'relaunch'>>;

export function createWebAppCapabilities(): WebAppCapabilities {
  const out = allocateEntity<WebAppCapabilities>();
  initializeWebAppCapabilities(out);
  return finishEntity(out);
}

export function initializeWebAppBadgeBackend(out: EntityConstruction<AppBadgeBackend>): void {
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
    const out = allocateEntity<AppBadgeBackend>();
    initializeWebAppBadgeBackend(out);
    return finishEntity(out);
  })();
  out.focus = (() => {
    const out = allocateEntity<AppFocusBackend>();
    initializeWebAppFocusBackend(out);
    return finishEntity(out);
  })();
  out.locale = (() => {
    const out = allocateEntity<AppLocaleBackend>();
    initializeWebAppLocaleBackend(out);
    return finishEntity(out);
  })();
  out.name = (() => {
    const out = allocateEntity<AppNameBackend>();
    initializeWebAppNameBackend(out);
    return finishEntity(out);
  })();
  out.quit = (() => {
    const out = allocateEntity<AppQuitBackend>();
    initializeWebAppQuitBackend(out);
    return finishEntity(out);
  })();
  out.ready = (() => {
    const out = allocateEntity<AppReadyBackend>();
    initializeWebAppReadyBackend(out);
    return finishEntity(out);
  })();
  out.relaunch = (() => {
    const out = allocateEntity<AppRelaunchBackend>();
    initializeWebAppRelaunchBackend(out);
    return finishEntity(out);
  })();
}

export function initializeWebAppFocusBackend(out: EntityConstruction<AppFocusBackend>): void {
  out.focus = () => {
    try {
      window.focus();
    } catch {}
  };
}

export function initializeWebAppLocaleBackend(out: EntityConstruction<AppLocaleBackend>): void {
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

export function initializeWebAppNameBackend(out: EntityConstruction<AppNameBackend>): void {
  out.getName = () => {
    return typeof document === 'undefined' ? '' : document.title;
  };
}

export function initializeWebAppQuitBackend(out: EntityConstruction<AppQuitBackend>): void {
  out.quit = () => {
    try {
      window.close();
    } catch {}
  };
}

export function initializeWebAppReadyBackend(out: EntityConstruction<AppReadyBackend>): void {
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

export function initializeWebAppRelaunchBackend(out: EntityConstruction<AppRelaunchBackend>): void {
  out.relaunch = () => {
    try {
      location.reload();
    } catch {}
  };
}
