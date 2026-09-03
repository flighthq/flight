import { notifyWindowClosed } from '@flighthq/application/contract';
import { createEntity } from '@flighthq/entity/contract';
import { emitSignal } from '@flighthq/signals/contract';
import type {
  ApplicationWindow,
  ElectronApi,
  ElectronBrowserWindow,
  EntityWithoutRuntime,
  NativeWindowHandle,
  WindowAttachmentOwnership,
  WindowBackend,
} from '@flighthq/types/contract';

// Maps Flight's WindowBackend onto Electron's BrowserWindow, one BrowserWindow per ApplicationWindow.
// open() constructs the real OS window from WindowOptions and wires BrowserWindow OS events back to
// the entity: each native event mutates the matching ApplicationWindow field and emits its signal, so
// user-driven state changes (minimize, move, focus, …) flow through the same signals the command
// functions emit. Other methods look up the BrowserWindow and no-op when it is absent (already closed
// or never opened). Risky native calls are wrapped so a destroyed window cannot throw across the seam.
export function createElectronWindowBackend(
  electron: ElectronApi,
): WindowBackend & Required<Pick<WindowBackend, 'attach' | 'close' | 'open'>> {
  return createEntity<EntityWithoutRuntime<WindowBackend & Required<Pick<WindowBackend, 'attach' | 'close' | 'open'>>>>(
    {
      attach(win, handle, ownership) {
        if (!isElectronBrowserWindow(handle)) return false;
        return attachElectronWindow(win, handle, ownership);
      },
      open(win, options) {
        if (_windowRecords.has(win)) return true;
        const bw = new electron.BrowserWindow({
          title: options.title,
          x: options.x,
          y: options.y,
          width: options.width,
          height: options.height,
          resizable: options.resizable,
          alwaysOnTop: options.alwaysOnTop,
          fullscreen: options.fullscreen,
          show: options.visible,
          minWidth: options.minWidth,
          minHeight: options.minHeight,
          maxWidth: options.maxWidth,
          maxHeight: options.maxHeight,
          frame: options.frame,
          transparent: options.transparent,
        });
        if (attachElectronWindow(win, bw, 'flight')) return true;
        try {
          bw.close();
        } catch {
          /* construction succeeded but attachment failed */
        }
        return false;
      },
      close(win) {
        detachElectronWindow(win, true);
      },
      setTitle(win, title) {
        const bw = _windows.get(win);
        if (bw === undefined) return;
        try {
          bw.setTitle(title);
        } catch {
          /* window already destroyed */
        }
      },
      setPosition(win, x, y) {
        const bw = _windows.get(win);
        if (bw === undefined) return;
        try {
          bw.setPosition(x, y);
        } catch {
          /* window already destroyed */
        }
      },
      setSize(win, width, height) {
        const bw = _windows.get(win);
        if (bw === undefined) return;
        try {
          bw.setSize(width, height);
        } catch {
          /* window already destroyed */
        }
      },
      getBounds(win, out) {
        const bw = _windows.get(win);
        if (bw === undefined) {
          out.x = win.x;
          out.y = win.y;
          out.width = win.width;
          out.height = win.height;
          return out;
        }
        try {
          const bounds = bw.getBounds();
          out.x = bounds.x;
          out.y = bounds.y;
          out.width = bounds.width;
          out.height = bounds.height;
        } catch {
          out.x = win.x;
          out.y = win.y;
          out.width = win.width;
          out.height = win.height;
        }
        return out;
      },
      minimize(win) {
        const bw = _windows.get(win);
        if (bw === undefined) return;
        try {
          bw.minimize();
        } catch {
          /* window already destroyed */
        }
      },
      maximize(win) {
        const bw = _windows.get(win);
        if (bw === undefined) return;
        try {
          bw.maximize();
        } catch {
          /* window already destroyed */
        }
      },
      restore(win) {
        const bw = _windows.get(win);
        if (bw === undefined) return;
        try {
          if (bw.isMinimized()) bw.restore();
          else bw.unmaximize();
        } catch {
          /* window already destroyed */
        }
      },
      focus(win) {
        const bw = _windows.get(win);
        if (bw === undefined) return;
        try {
          bw.focus();
        } catch {
          /* window already destroyed */
        }
      },
      show(win) {
        const bw = _windows.get(win);
        if (bw === undefined) return;
        try {
          bw.show();
        } catch {
          /* window already destroyed */
        }
      },
      hide(win) {
        const bw = _windows.get(win);
        if (bw === undefined) return;
        try {
          bw.hide();
        } catch {
          /* window already destroyed */
        }
      },
      center(win) {
        const bw = _windows.get(win);
        if (bw === undefined) return;
        try {
          bw.center();
        } catch {
          /* window already destroyed */
        }
      },
      setResizable(win, resizable) {
        const bw = _windows.get(win);
        if (bw === undefined) return;
        try {
          bw.setResizable(resizable);
        } catch {
          /* window already destroyed */
        }
      },
      setAlwaysOnTop(win, alwaysOnTop) {
        const bw = _windows.get(win);
        if (bw === undefined) return;
        try {
          bw.setAlwaysOnTop(alwaysOnTop);
        } catch {
          /* window already destroyed */
        }
      },
      setMinimumSize(win, width, height) {
        const bw = _windows.get(win);
        if (bw === undefined) return;
        try {
          bw.setMinimumSize(width, height);
        } catch {
          /* window already destroyed */
        }
      },
      setMaximumSize(win, width, height) {
        const bw = _windows.get(win);
        if (bw === undefined) return;
        try {
          bw.setMaximumSize(width, height);
        } catch {
          /* window already destroyed */
        }
      },
      setFullscreen(win, fullscreen) {
        const bw = _windows.get(win);
        if (bw === undefined) return;
        try {
          bw.setFullScreen(fullscreen);
        } catch {
          /* window already destroyed */
        }
      },
      setIcon(win, icon) {
        const bw = _windows.get(win);
        if (bw === undefined) return;
        try {
          bw.setIcon(icon);
        } catch {
          /* window already destroyed */
        }
      },
      setOpacity(win, opacity) {
        const bw = _windows.get(win);
        if (bw === undefined) return;
        try {
          bw.setOpacity(opacity);
        } catch {
          /* window already destroyed */
        }
      },
      setSkipTaskbar(win, skip) {
        const bw = _windows.get(win);
        if (bw === undefined) return;
        try {
          bw.setSkipTaskbar(skip);
        } catch {
          /* window already destroyed */
        }
      },
      setMenuBarVisible(win, visible) {
        const bw = _windows.get(win);
        if (bw === undefined) return;
        try {
          bw.setMenuBarVisibility(visible);
        } catch {
          /* window already destroyed */
        }
      },
      setParent(win, parent) {
        const bw = _windows.get(win);
        if (bw === undefined) return;
        const parentBw = parent === null ? null : (_windows.get(parent) ?? null);
        try {
          bw.setParentWindow(parentBw);
        } catch {
          /* window already destroyed */
        }
      },
      setProgress(win, progress) {
        const bw = _windows.get(win);
        if (bw === undefined) return;
        try {
          bw.setProgressBar(progress);
        } catch {
          /* window already destroyed */
        }
      },
      requestAttention(win, attention) {
        const bw = _windows.get(win);
        if (bw === undefined) return;
        try {
          bw.flashFrame(attention);
        } catch {
          /* window already destroyed */
        }
      },
      setContentProtection(win, enabled) {
        const bw = _windows.get(win);
        if (bw === undefined) return;
        try {
          bw.setContentProtection(enabled);
        } catch {
          /* window already destroyed */
        }
      },
      flashWindowFrame(win) {
        const bw = _windows.get(win);
        if (bw === undefined) return;
        try {
          bw.flashFrame(true);
        } catch {
          /* window already destroyed */
        }
      },
      setHasShadow(win, hasShadow) {
        const bw = _windows.get(win);
        if (bw === undefined) return;
        try {
          bw.setHasShadow(hasShadow);
        } catch {
          /* window already destroyed */
        }
      },
    },
  );
}

// Returns the ApplicationWindow mapped to the given Electron BrowserWindow id, or null when unknown.
// Allows tray/menu/protocol handlers to resolve a native window id back into a Flight window entity.
export function getApplicationWindowForElectronId(id: number): ApplicationWindow | null {
  return _windowsById.get(id) ?? null;
}

// The Electron BrowserWindow backing a Flight window opened via openWindow, or null if not (yet)
// opened. The escape hatch a host app needs to do Electron-specific things the seam doesn't cover —
// most importantly loadFile/loadURL to put content in the window. Host-adapter-only by design.
export function getElectronBrowserWindow(win: Readonly<ApplicationWindow>): ElectronBrowserWindow | null {
  return _windows.get(win as ApplicationWindow) ?? null;
}

// Returns the Electron BrowserWindow id for a Flight window, or -1 when the window is not mapped.
// Useful for tray/menu click handlers that receive a native window id and need to resolve back to an
// ApplicationWindow; pair with getApplicationWindowForElectronId.
export function getElectronWindowId(win: Readonly<ApplicationWindow>): number {
  return _windows.get(win as ApplicationWindow)?.id ?? -1;
}

export function resetElectronWindowBackendForTest(): void {
  _windows = new WeakMap();
  _windowRecords = new WeakMap();
  _windowsById.clear();
}

// Side table mapping each Flight ApplicationWindow to its Electron BrowserWindow, kept off the public
// entity. Entries are removed on close so a stale BrowserWindow is never reused.
let _windows = new WeakMap<ApplicationWindow, ElectronBrowserWindow>();

interface ElectronWindowRecord {
  readonly cleanup: (() => void)[];
  readonly handle: ElectronBrowserWindow;
  readonly ownership: WindowAttachmentOwnership;
}

let _windowRecords = new WeakMap<ApplicationWindow, ElectronWindowRecord>();

// Reverse lookup by Electron BrowserWindow id for getApplicationWindowForElectronId. Maintained in
// lockstep with _windows; entries are removed on close as well.
const _windowsById = new Map<number, ApplicationWindow>();

function attachElectronWindow(
  win: ApplicationWindow,
  handle: ElectronBrowserWindow,
  ownership: WindowAttachmentOwnership,
): boolean {
  const existing = _windowRecords.get(win);
  if (existing !== undefined) return existing.handle === handle && existing.ownership === ownership;
  const mapped = _windowsById.get(handle.id);
  if (mapped !== undefined && mapped !== win) return false;

  const record: ElectronWindowRecord = { cleanup: [], handle, ownership };
  _windowRecords.set(win, record);
  _windows.set(win, handle);
  _windowsById.set(handle.id, win);

  addElectronWindowListener(record, 'move', () => {
    const bounds = handle.getBounds();
    win.x = bounds.x;
    win.y = bounds.y;
    emitSignal(win.onMove);
  });
  addElectronWindowListener(record, 'resize', () => {
    const bounds = handle.getBounds();
    win.width = bounds.width;
    win.height = bounds.height;
    emitSignal(win.onResize);
  });
  addElectronWindowListener(record, 'minimize', () => {
    win.minimized = true;
    emitSignal(win.onMinimize);
  });
  addElectronWindowListener(record, 'maximize', () => {
    win.maximized = true;
    emitSignal(win.onMaximize);
  });
  const onUnmaximize = () => {
    win.minimized = false;
    win.maximized = false;
    emitSignal(win.onRestore);
  };
  addElectronWindowListener(record, 'unmaximize', onUnmaximize);
  addElectronWindowListener(record, 'restore', onUnmaximize);
  addElectronWindowListener(record, 'enter-full-screen', () => {
    win.fullscreen = true;
    emitSignal(win.onFullscreenChanged);
  });
  addElectronWindowListener(record, 'leave-full-screen', () => {
    win.fullscreen = false;
    emitSignal(win.onFullscreenChanged);
  });
  addElectronWindowListener(record, 'focus', () => {
    win.focused = true;
    emitSignal(win.onFocusIn);
  });
  addElectronWindowListener(record, 'blur', () => {
    win.focused = false;
    emitSignal(win.onFocusOut);
  });
  addElectronWindowListener(record, 'closed', () => {
    detachElectronWindow(win, false);
    notifyWindowClosed(win);
  });
  return true;
}

function addElectronWindowListener(
  record: ElectronWindowRecord,
  event: string,
  listener: (...args: unknown[]) => void,
): void {
  record.handle.on(event, listener);
  record.cleanup.push(() => record.handle.off(event, listener));
}

function detachElectronWindow(win: ApplicationWindow, closeOwned: boolean): void {
  const record = _windowRecords.get(win);
  if (record === undefined) return;
  _windowRecords.delete(win);
  _windows.delete(win);
  _windowsById.delete(record.handle.id);
  for (const cleanup of record.cleanup) cleanup();
  record.cleanup.length = 0;
  if (!closeOwned || record.ownership !== 'flight') return;
  try {
    record.handle.close();
  } catch {
    /* window already destroyed */
  }
}

function isElectronBrowserWindow(handle: NativeWindowHandle): handle is ElectronBrowserWindow {
  if (typeof handle !== 'object' || handle === null) return false;
  const candidate = handle as Partial<ElectronBrowserWindow>;
  return (
    typeof candidate.id === 'number' &&
    typeof candidate.on === 'function' &&
    typeof candidate.off === 'function' &&
    typeof candidate.close === 'function'
  );
}
