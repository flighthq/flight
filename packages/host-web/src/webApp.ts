import { createEntity } from '@flighthq/entity/contract';
import type { HostAppCapabilities } from '@flighthq/types/contract';

type WebAppCapabilities = Required<
  Pick<HostAppCapabilities, 'badge' | 'focus' | 'locale' | 'name' | 'quit' | 'ready' | 'relaunch'>
>;

export function createWebAppCapabilities(): WebAppCapabilities {
  return {
    badge: createEntity({
      setBadgeCount: (count: number) => {
        if (typeof navigator === 'undefined') return false;
        const setAppBadge = Reflect.get(navigator, 'setAppBadge');
        if (typeof setAppBadge !== 'function') return false;
        try {
          Reflect.apply(setAppBadge, navigator, [count]);
          return true;
        } catch {
          return false;
        }
      },
    }),
    focus: createEntity({
      focus: () => {
        try {
          window.focus();
        } catch {}
      },
    }),
    locale: createEntity({
      getLocale: () => {
        return typeof navigator === 'undefined' ? '' : (navigator.language ?? '');
      },
      getPreferredSystemLanguages: () => {
        return typeof navigator === 'undefined' || !Array.isArray(navigator.languages) ? [] : navigator.languages;
      },
      getSystemLocale: () => {
        try {
          return typeof Intl === 'undefined' ? '' : new Intl.DateTimeFormat().resolvedOptions().locale;
        } catch {
          return '';
        }
      },
    }),
    name: createEntity({
      getName: () => {
        return typeof document === 'undefined' ? '' : document.title;
      },
    }),
    quit: createEntity({
      quit: () => {
        try {
          window.close();
        } catch {}
      },
    }),
    ready: createEntity({
      subscribe: (listener: () => void) => {
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
      },
    }),
    relaunch: createEntity({
      relaunch: () => {
        try {
          location.reload();
        } catch {}
      },
    }),
  };
}
