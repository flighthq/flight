import { notifyWindowClosed } from '@flighthq/application/contract';
import { createEntity } from '@flighthq/entity/contract';
import type {
  ApplicationWindow,
  FullscreenBackend,
  FullscreenTargetHandle,
  NativeWindowHandle,
  WindowAttachmentOwnership,
  WindowBackend,
  WindowResizeTargetHandle,
} from '@flighthq/types/contract';

type WebWindowBackend = WindowBackend &
  Required<
    Pick<
      WindowBackend,
      | 'attach'
      | 'close'
      | 'open'
      | 'subscribeClose'
      | 'subscribeMove'
      | 'subscribeOrientation'
      | 'subscribeResize'
      | 'subscribeVisibility'
    >
  >;

export const webWindowBackend: WebWindowBackend = {
  attach(win, handle, ownership) {
    if (!isWebWindow(handle)) return false;
    return attachWebWindow(win, handle, ownership);
  },
  center(win) {
    const handle = getWebWindowHandle(win);
    if (handle === null || typeof handle.moveTo !== 'function') return;
    try {
      handle.moveTo(
        Math.round((handle.screen.availWidth - win.width) / 2),
        Math.round((handle.screen.availHeight - win.height) / 2),
      );
    } catch {
      /* browser rejected script-driven movement */
    }
  },
  close(win) {
    detachWebWindow(win, true);
  },
  focus(win) {
    const handle = getWebWindowHandle(win);
    if (handle !== null && typeof handle.focus === 'function') handle.focus();
  },
  getBounds(win, out) {
    const handle = getWebWindowHandle(win);
    out.x = handle?.screenX ?? win.x;
    out.y = handle?.screenY ?? win.y;
    out.width = handle?.innerWidth ?? win.width;
    out.height = handle?.innerHeight ?? win.height;
    return out;
  },
  open(win) {
    return typeof window !== 'undefined' && attachWebWindow(win, window, 'host');
  },
  setFullscreen(win, fullscreen) {
    const document = getWebWindowHandle(win)?.document;
    if (document === undefined) return;
    try {
      if (fullscreen) void document.documentElement.requestFullscreen?.().catch(() => {});
      else void document.exitFullscreen?.().catch(() => {});
    } catch {
      /* browser rejected the fullscreen request synchronously */
    }
  },
  setIcon(win, icon) {
    const document = getWebWindowHandle(win)?.document;
    if (document === undefined) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link === null) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = icon;
  },
  setPosition(win, x, y) {
    const handle = getWebWindowHandle(win);
    if (handle === null || typeof handle.moveTo !== 'function') return;
    try {
      handle.moveTo(x, y);
    } catch {
      /* browser rejected script-driven movement */
    }
  },
  setSize(win, width, height) {
    const handle = getWebWindowHandle(win);
    if (handle === null || typeof handle.resizeTo !== 'function') return;
    try {
      handle.resizeTo(width, height);
    } catch {
      /* browser rejected script-driven resizing */
    }
  },
  setTitle(win, title) {
    const document = getWebWindowHandle(win)?.document;
    if (document !== undefined) document.title = title;
  },
  subscribeClose(onCloseRequest, onClose) {
    if (typeof window === 'undefined') return noop;
    const pageWindow = window;
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (!onCloseRequest()) return;
      event.preventDefault();
      event.returnValue = '';
    };
    pageWindow.addEventListener('beforeunload', onBeforeUnload);
    pageWindow.addEventListener('pagehide', onClose);
    return trackWebWindowSubscription(() => {
      pageWindow.removeEventListener('beforeunload', onBeforeUnload);
      pageWindow.removeEventListener('pagehide', onClose);
    });
  },
  subscribeMove(listener) {
    if (typeof window === 'undefined') return noop;
    const pageWindow = window;
    const handler = (): void => {
      if (typeof pageWindow.screenX === 'number' && typeof pageWindow.screenY === 'number') {
        listener(pageWindow.screenX, pageWindow.screenY);
      }
    };
    pageWindow.addEventListener('resize', handler);
    return trackWebWindowSubscription(() => pageWindow.removeEventListener('resize', handler));
  },
  subscribeOrientation(listener) {
    if (typeof screen === 'undefined' || screen.orientation === undefined) return noop;
    const orientation = screen.orientation;
    orientation.addEventListener('change', listener);
    return trackWebWindowSubscription(() => orientation.removeEventListener('change', listener));
  },
  subscribeResize(target, listener) {
    const element = _windowResizeTargets.get(target);
    if (element === undefined || typeof ResizeObserver === 'undefined') return noop;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        listener(
          Math.round(entry.contentRect.width),
          Math.round(entry.contentRect.height),
          typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1,
        );
      }
    });
    observer.observe(element);
    return trackWebWindowSubscription(() => observer.disconnect());
  },
  subscribeVisibility(listener) {
    if (typeof document === 'undefined') return noop;
    const pageDocument = document;
    const handler = (): void => listener(!pageDocument.hidden);
    pageDocument.addEventListener('visibilitychange', handler);
    return trackWebWindowSubscription(() => pageDocument.removeEventListener('visibilitychange', handler));
  },
};

export const webFullscreenBackend: FullscreenBackend & Required<Pick<FullscreenBackend, 'subscribe' | 'unsubscribe'>> =
  {
    async exit() {
      if (typeof document === 'undefined' || typeof document.exitFullscreen !== 'function') return false;
      try {
        await document.exitFullscreen();
        return true;
      } catch {
        return false;
      }
    },
    async request(target) {
      const element = _fullscreenTargets.get(target);
      if (element === undefined || typeof element.requestFullscreen !== 'function') return false;
      try {
        await element.requestFullscreen();
        return true;
      } catch {
        return false;
      }
    },
    subscribe(callback) {
      webFullscreenBackend.unsubscribe(callback);
      if (typeof document === 'undefined') return;
      const handler = (): void => callback(document.fullscreenElement !== null);
      _fullscreenListeners.set(callback, handler);
      document.addEventListener('fullscreenchange', handler);
    },
    unsubscribe(callback) {
      const handler = _fullscreenListeners.get(callback);
      if (handler === undefined) return;
      _fullscreenListeners.delete(callback);
      if (typeof document !== 'undefined') document.removeEventListener('fullscreenchange', handler);
    },
  };

export function createWebFullscreenTargetHandle(element: Element): FullscreenTargetHandle {
  const target: FullscreenTargetHandle = createEntity({ __brand: 'FullscreenTargetHandle' as const });
  _fullscreenTargets.set(target, element);
  return target;
}

export function createWebWindowResizeTargetHandle(element: Element): WindowResizeTargetHandle {
  const target: WindowResizeTargetHandle = createEntity({ __brand: 'WindowResizeTargetHandle' as const });
  _windowResizeTargets.set(target, element);
  return target;
}

export function resetWebWindowBackendForTest(): void {
  for (const handler of _fullscreenListeners.values()) {
    if (typeof document !== 'undefined') document.removeEventListener('fullscreenchange', handler);
  }
  _fullscreenListeners.clear();
  for (const cleanup of [..._windowSubscriptionCleanups]) cleanup();
  _windowSubscriptionCleanups.clear();
  _fullscreenTargets = new WeakMap();
  _windowResizeTargets = new WeakMap();
  _handles = new WeakMap();
  _records = new WeakMap();
}

let _handles = new WeakMap<Window, ApplicationWindow>();
let _records = new WeakMap<ApplicationWindow, WebWindowRecord>();
const _fullscreenListeners = new Map<(fullscreen: boolean) => void, () => void>();
let _fullscreenTargets = new WeakMap<FullscreenTargetHandle, Element>();
const _windowSubscriptionCleanups = new Set<() => void>();
let _windowResizeTargets = new WeakMap<WindowResizeTargetHandle, Element>();

interface WebWindowRecord {
  readonly cleanup: () => void;
  readonly handle: Window;
  readonly ownership: WindowAttachmentOwnership;
}

function attachWebWindow(win: ApplicationWindow, handle: Window, ownership: WindowAttachmentOwnership): boolean {
  const existing = _records.get(win);
  if (existing !== undefined) return existing.handle === handle && existing.ownership === ownership;
  const mapped = _handles.get(handle);
  if (mapped !== undefined && mapped !== win) return false;
  const onPageHide = (): void => {
    detachWebWindow(win, false);
    notifyWindowClosed(win);
  };
  handle.addEventListener('pagehide', onPageHide);
  _records.set(win, {
    cleanup: () => handle.removeEventListener('pagehide', onPageHide),
    handle,
    ownership,
  });
  _handles.set(handle, win);
  return true;
}

function detachWebWindow(win: ApplicationWindow, closeOwned: boolean): void {
  const record = _records.get(win);
  if (record === undefined) return;
  _records.delete(win);
  _handles.delete(record.handle);
  record.cleanup();
  if (!closeOwned || record.ownership !== 'flight') return;
  try {
    record.handle.close();
  } catch {
    /* window already closed or the browser rejected script-driven close */
  }
}

function getWebWindowHandle(win: ApplicationWindow): Window | null {
  return _records.get(win)?.handle ?? null;
}

function isWebWindow(handle: NativeWindowHandle): handle is Window {
  if (typeof handle !== 'object' || handle === null) return false;
  const candidate = handle as Partial<Window>;
  return (
    typeof candidate.addEventListener === 'function' &&
    typeof candidate.close === 'function' &&
    typeof candidate.removeEventListener === 'function'
  );
}

function noop(): void {}

function trackWebWindowSubscription(cleanup: () => void): () => void {
  let active = true;
  const trackedCleanup = (): void => {
    if (!active) return;
    active = false;
    _windowSubscriptionCleanups.delete(trackedCleanup);
    cleanup();
  };
  _windowSubscriptionCleanups.add(trackedCleanup);
  return trackedCleanup;
}
