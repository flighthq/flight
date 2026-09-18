import { notifyWindowClosed } from '@flighthq/application/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  ApplicationWindow,
  EntityConstruction,
  FullscreenTargetHandle,
  HostElementFullscreenCapability,
  HostWindowAppearanceCapability,
  HostWindowAttachCapability,
  HostWindowFocusCapability,
  HostWindowFullscreenCapability,
  HostWindowGeometryCapability,
  HostWindowLifecycleCapability,
  NativeWindowHandle,
  WindowAttachmentOwnership,
  WindowResizeTargetHandle,
} from '@flighthq/types/contract';

// The web window group, decomposed one capability per independently-coverable concept. Web covers
// attach, appearance, focus, fullscreen, geometry and lifecycle. It omits attention, contentProtection,
// hierarchy, progress, shadow, shell, sizeConstraints, state, visibility and zOrder: a browser tab has no
// window-manager equivalent for those, and an omitted slot is the honest report where an inert method
// would be indistinguishable from a real one.
//
// An operation being present does not promise it has an effect: several degrade to a no-op where the
// browser refuses (script-driven movement, fullscreen without a user gesture). That is a runtime outcome,
// not capability absence — absence is a missing slot, and a caller asking "can I set the title?" deserves
// a yes here rather than a `| undefined` it has to guess about.

export const webHostFullscreen: WebFullscreen = (() => {
  const out = allocateEntity<WebFullscreen>();
  out.exit = async () => {
    if (typeof document === 'undefined' || typeof document.exitFullscreen !== 'function') return false;
    try {
      await document.exitFullscreen();
      return true;
    } catch {
      return false;
    }
  };
  out.request = async (target) => {
    const element = _fullscreenTargets.get(target);
    if (element === undefined || typeof element.requestFullscreen !== 'function') return false;
    try {
      await element.requestFullscreen();
      return true;
    } catch {
      return false;
    }
  };
  out.subscribe = (callback) => {
    out.unsubscribe(callback);
    if (typeof document === 'undefined') return;
    const handler = (): void => callback(document.fullscreenElement !== null);
    _fullscreenListeners.set(callback, handler);
    document.addEventListener('fullscreenchange', handler);
  };
  out.unsubscribe = (callback) => {
    const handler = _fullscreenListeners.get(callback);
    if (handler === undefined) return;
    _fullscreenListeners.delete(callback);
    if (typeof document !== 'undefined') document.removeEventListener('fullscreenchange', handler);
  };
  return finishEntity(out);
})();

export const webHostWindowAppearance: WebWindowAppearance = (() => {
  const out = allocateEntity<WebWindowAppearance>();
  out.setIcon = (win, icon) => {
    const document = getWebWindowHandle(win)?.document;
    if (document === undefined) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link === null) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = icon;
  };
  out.setTitle = (win, title) => {
    const document = getWebWindowHandle(win)?.document;
    if (document !== undefined) document.title = title;
  };
  return finishEntity(out);
})();

export const webHostWindowAttach = (() => {
  const out = allocateEntity<HostWindowAttachCapability>();
  out.attach = (win, handle, ownership) => {
    if (!isWebWindow(handle)) return false;
    return attachWebWindow(win, handle, ownership);
  };
  return finishEntity(out);
})();

export const webHostWindowFocus = (() => {
  const out = allocateEntity<HostWindowFocusCapability>();
  out.focus = (win) => {
    const handle = getWebWindowHandle(win);
    if (handle !== null && typeof handle.focus === 'function') handle.focus();
  };
  return finishEntity(out);
})();

// Page fullscreen, the window-level counterpart of the element-level `host.fullscreen` capability: the
// subject here is the window handle, the browser's only scripting surface for it being the document.
export const webHostWindowFullscreen = (() => {
  const out = allocateEntity<HostWindowFullscreenCapability>();
  out.setFullscreen = (win, fullscreen) => {
    const document = getWebWindowHandle(win)?.document;
    if (document === undefined) return;
    try {
      if (fullscreen) void document.documentElement.requestFullscreen?.().catch(() => {});
      else void document.exitFullscreen?.().catch(() => {});
    } catch {
      /* browser rejected the fullscreen request synchronously */
    }
  };
  return finishEntity(out);
})();

export const webHostWindowGeometry: WebWindowGeometry = (() => {
  const out = allocateEntity<WebWindowGeometry>();
  out.center = (win) => {
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
  };
  out.getBounds = (win, out) => {
    const handle = getWebWindowHandle(win);
    out.x = handle?.screenX ?? win.x;
    out.y = handle?.screenY ?? win.y;
    out.width = handle?.innerWidth ?? win.width;
    out.height = handle?.innerHeight ?? win.height;
    return out;
  };
  out.setPosition = (win, x, y) => {
    const handle = getWebWindowHandle(win);
    if (handle === null || typeof handle.moveTo !== 'function') return;
    try {
      handle.moveTo(x, y);
    } catch {
      /* browser rejected script-driven movement */
    }
  };
  out.setSize = (win, width, height) => {
    const handle = getWebWindowHandle(win);
    if (handle === null || typeof handle.resizeTo !== 'function') return;
    try {
      handle.resizeTo(width, height);
    } catch {
      /* browser rejected script-driven resizing */
    }
  };
  out.subscribeMove = (listener) => {
    if (typeof window === 'undefined') return noop;
    const pageWindow = window;
    const handler = (): void => {
      if (typeof pageWindow.screenX === 'number' && typeof pageWindow.screenY === 'number') {
        listener(pageWindow.screenX, pageWindow.screenY);
      }
    };
    pageWindow.addEventListener('resize', handler);
    return trackWebWindowSubscription(() => pageWindow.removeEventListener('resize', handler));
  };
  out.subscribeResize = (target, listener) => {
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
  };
  return finishEntity(out);
})();

export const webHostWindowLifecycle: WebWindowLifecycle = (() => {
  const out = allocateEntity<WebWindowLifecycle>();
  out.close = (win) => {
    detachWebWindow(win, true);
  };
  out.open = (win) => {
    return typeof window !== 'undefined' && attachWebWindow(win, window, 'host');
  };
  out.subscribeClose = (onCloseRequest, onClose) => {
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
  };
  return finishEntity(out);
})();

export function createWebFullscreenTargetHandle(element: Element): FullscreenTargetHandle {
  const target = allocateEntity<FullscreenTargetHandle>();
  initializeWebFullscreenTargetHandle(target, element);
  return target;
}

export function createWebWindowResizeTargetHandle(element: Element): WindowResizeTargetHandle {
  const target = allocateEntity<WindowResizeTargetHandle>();
  initializeWebWindowResizeTargetHandle(target, element);
  return target;
}

export function initializeWebFullscreenTargetHandle(
  target: EntityConstruction<FullscreenTargetHandle>,
  element: Element,
): void {
  target.__brand = 'FullscreenTargetHandle' as const;
  _fullscreenTargets.set(target, element);
}

export function initializeWebWindowResizeTargetHandle(
  target: EntityConstruction<WindowResizeTargetHandle>,
  element: Element,
): void {
  target.__brand = 'WindowResizeTargetHandle' as const;
  _windowResizeTargets.set(target, element);
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

// What each web window capability actually supplies, required on the const's type: the optional hook is
// present here, so a caller reads the operations rather than testing each one for absent-ness.
type WebFullscreen = HostElementFullscreenCapability &
  Required<Pick<HostElementFullscreenCapability, 'subscribe' | 'unsubscribe'>>;
type WebWindowAppearance = HostWindowAppearanceCapability & Required<Pick<HostWindowAppearanceCapability, 'setIcon'>>;
type WebWindowGeometry = HostWindowGeometryCapability &
  Required<Pick<HostWindowGeometryCapability, 'center' | 'subscribeMove' | 'subscribeResize'>>;
type WebWindowLifecycle = HostWindowLifecycleCapability &
  Required<Pick<HostWindowLifecycleCapability, 'subscribeClose'>>;

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

// The page Window an ApplicationWindow is attached to, or null when it was never opened or attached. The
// drawable capabilities resolve their document through here, which is what makes the window argument to
// surface creation a real lookup rather than a decorative parameter.
export function getWebWindowHandle(win: Readonly<ApplicationWindow>): Window | null {
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
