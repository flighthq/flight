import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Entity, HostAppCapabilities } from '@flighthq/types/contract';

type WebAppCapabilities = Entity &
  Required<Pick<HostAppCapabilities, 'badge' | 'focus' | 'locale' | 'name' | 'quit' | 'ready' | 'relaunch'>>;

export function createWebAppCapabilities(): WebAppCapabilities {
  const out = allocateEntity<WebAppCapabilities>();
  out.badge = (() => {
    const out = allocateEntity<WebAppCapabilities>();
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
    return finishEntity(out);
  })();
  out.focus = (() => {
    const out = allocateEntity<WebAppCapabilities>();
    out.focus = () => {
      try {
        window.focus();
      } catch {}
    };
    return finishEntity(out);
  })();
  out.locale = (() => {
    const out = allocateEntity<WebAppCapabilities>();
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
    return finishEntity(out);
  })();
  out.name = (() => {
    const out = allocateEntity<WebAppCapabilities>();
    out.getName = () => {
      return typeof document === 'undefined' ? '' : document.title;
    };
    return finishEntity(out);
  })();
  out.quit = (() => {
    const out = allocateEntity<WebAppCapabilities>();
    out.quit = () => {
      try {
        window.close();
      } catch {}
    };
    return finishEntity(out);
  })();
  out.ready = (() => {
    const out = allocateEntity<WebAppCapabilities>();
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
    return finishEntity(out);
  })();
  out.relaunch = (() => {
    const out = allocateEntity<WebAppCapabilities>();
    out.relaunch = () => {
      try {
        location.reload();
      } catch {}
    };
    return finishEntity(out);
  })();
  return finishEntity(out);
}
