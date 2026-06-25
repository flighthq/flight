import { emitSignal } from '@flighthq/signals';
import type { ApplicationWindow, WindowBackend } from '@flighthq/types';

import type { ElectronApi, ElectronBrowserWindow } from './electronModule';

// Maps Flight's WindowBackend onto Electron's BrowserWindow, one BrowserWindow per ApplicationWindow.
// open() constructs the real OS window from WindowOptions and wires BrowserWindow OS events back to
// the entity: each native event mutates the matching ApplicationWindow field and emits its signal, so
// user-driven state changes (minimize, move, focus, …) flow through the same signals the command
// functions emit. Other methods look up the BrowserWindow and no-op when it is absent (already closed
// or never opened). Risky native calls are wrapped so a destroyed window cannot throw across the seam.
export function createElectronWindowBackend(electron: ElectronApi): WindowBackend {
  return {
    open(win, options) {
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
      _windows.set(win, bw);
      bw.on('move', () => {
        const bounds = bw.getBounds();
        win.x = bounds.x;
        win.y = bounds.y;
        emitSignal(win.onMove);
      });
      bw.on('resize', () => {
        const bounds = bw.getBounds();
        win.width = bounds.width;
        win.height = bounds.height;
        emitSignal(win.onResize);
      });
      bw.on('minimize', () => {
        win.minimized = true;
        emitSignal(win.onMinimize);
      });
      bw.on('maximize', () => {
        win.maximized = true;
        emitSignal(win.onMaximize);
      });
      const onUnmaximize = () => {
        win.minimized = false;
        win.maximized = false;
        emitSignal(win.onRestore);
      };
      bw.on('unmaximize', onUnmaximize);
      bw.on('restore', onUnmaximize);
      bw.on('enter-full-screen', () => {
        win.fullscreen = true;
        emitSignal(win.onFullscreenChanged);
      });
      bw.on('leave-full-screen', () => {
        win.fullscreen = false;
        emitSignal(win.onFullscreenChanged);
      });
      bw.on('focus', () => {
        win.focused = true;
        emitSignal(win.onFocusIn);
      });
      bw.on('blur', () => {
        win.focused = false;
        emitSignal(win.onFocusOut);
      });
      bw.on('close', () => emitSignal(win.onClose));
      return true;
    },
    close(win) {
      const bw = _windows.get(win);
      if (bw === undefined) return;
      try {
        bw.close();
      } catch {
        /* window already destroyed */
      }
      _windows.delete(win);
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
  };
}

// The Electron BrowserWindow backing a Flight window opened via openWindow, or null if not (yet)
// opened. The escape hatch a host app needs to do Electron-specific things the seam doesn't cover —
// most importantly loadFile/loadUrl to put content in the window. Host-adapter-only by design.
export function getElectronBrowserWindow(win: Readonly<ApplicationWindow>): ElectronBrowserWindow | null {
  return _windows.get(win as ApplicationWindow) ?? null;
}

// Side table mapping each Flight ApplicationWindow to its Electron BrowserWindow, kept off the public
// entity. Entries are removed on close so a stale BrowserWindow is never reused.
const _windows = new WeakMap<ApplicationWindow, ElectronBrowserWindow>();
