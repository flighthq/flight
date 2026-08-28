import { installWindowHostBackend, notifyWindowClosed, observeWindowHostResult } from '@flighthq/application/contract';
import type {
  ApplicationWindow,
  NativeWindowHandle,
  WindowAttachmentOwnership,
  WindowBackend,
} from '@flighthq/types/contract';

export function enableHostWebWindow(): void {
  if (_enabled) return;
  _enabled = true;
  const handles = new WeakMap<Window, ApplicationWindow>();
  const records = new WeakMap<ApplicationWindow, WebWindowRecord>();
  const detach = (win: ApplicationWindow, closeOwned: boolean): void => {
    const record = records.get(win);
    if (record === undefined) return;
    records.delete(win);
    handles.delete(record.handle);
    record.cleanup();
    if (closeOwned && record.ownership === 'flight') {
      try {
        record.handle.close();
      } catch {
        /* window already closed or the browser rejected script-driven close */
      }
    }
  };
  const attach = (win: ApplicationWindow, handle: Window, ownership: WindowAttachmentOwnership): boolean => {
    const existing = records.get(win);
    if (existing !== undefined) return existing.handle === handle && existing.ownership === ownership;
    const mapped = handles.get(handle);
    if (mapped !== undefined && mapped !== win) return false;
    const onPageHide = () => {
      detach(win, false);
      notifyWindowClosed(win);
    };
    handle.addEventListener('pagehide', onPageHide);
    records.set(win, {
      cleanup: () => handle.removeEventListener('pagehide', onPageHide),
      handle,
      ownership,
    });
    handles.set(handle, win);
    return true;
  };
  const getHandle = (win: ApplicationWindow): Window | null => records.get(win)?.handle ?? null;
  const backend: WindowBackend = {
    attach(win, handle, ownership) {
      if (!isWebWindow(handle)) return false;
      return attach(win, handle, ownership);
    },
    center(win) {
      const handle = getHandle(win);
      if (handle === null || typeof handle.moveTo !== 'function') return;
      try {
        handle.moveTo(
          Math.round((handle.screen.availWidth - win.width) / 2),
          Math.round((handle.screen.availHeight - win.height) / 2),
        );
        observeWindowHostResult('center', true);
      } catch {
        observeWindowHostResult('center', false);
      }
    },
    close(win) {
      detach(win, true);
      observeWindowHostResult('close', true);
    },
    focus(win) {
      const handle = getHandle(win);
      if (handle !== null && typeof handle.focus === 'function') {
        handle.focus();
        observeWindowHostResult('focus', true);
      }
    },
    getBounds(win, out) {
      const handle = getHandle(win);
      if (handle === null) {
        out.x = win.x;
        out.y = win.y;
        out.width = win.width;
        out.height = win.height;
        observeWindowHostResult('getBounds', true);
        return out;
      }
      out.x = handle.screenX ?? win.x;
      out.y = handle.screenY ?? win.y;
      out.width = handle.innerWidth ?? win.width;
      out.height = handle.innerHeight ?? win.height;
      observeWindowHostResult('getBounds', true);
      return out;
    },
    open(win) {
      const result = typeof window !== 'undefined' && attach(win, window, 'host');
      observeWindowHostResult('open', result);
      return result;
    },
    setFullscreen(win, fullscreen) {
      const document = getHandle(win)?.document;
      if (document === undefined) return;
      try {
        if (fullscreen) void document.documentElement.requestFullscreen?.();
        else void document.exitFullscreen?.();
        observeWindowHostResult('setFullscreen', true);
      } catch {
        observeWindowHostResult('setFullscreen', false);
      }
    },
    setIcon(win, icon) {
      const document = getHandle(win)?.document;
      if (document === undefined) return;
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (link === null) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = icon;
      observeWindowHostResult('setIcon', true);
    },
    setPosition(win, x, y) {
      const handle = getHandle(win);
      if (handle !== null && typeof handle.moveTo === 'function') {
        try {
          handle.moveTo(x, y);
          observeWindowHostResult('setPosition', true);
        } catch {
          observeWindowHostResult('setPosition', false);
        }
      }
    },
    setSize(win, width, height) {
      const handle = getHandle(win);
      if (handle !== null && typeof handle.resizeTo === 'function') {
        try {
          handle.resizeTo(width, height);
          observeWindowHostResult('setSize', true);
        } catch {
          observeWindowHostResult('setSize', false);
        }
      }
    },
    setTitle(win, title) {
      const document = getHandle(win)?.document;
      if (document !== undefined) {
        document.title = title;
        observeWindowHostResult('setTitle', true);
      }
    },
  };
  installWindowHostBackend(backend);
}

export function resetHostWebWindowForTest(): void {
  _enabled = false;
}

let _enabled = false;

interface WebWindowRecord {
  readonly cleanup: () => void;
  readonly handle: Window;
  readonly ownership: WindowAttachmentOwnership;
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
