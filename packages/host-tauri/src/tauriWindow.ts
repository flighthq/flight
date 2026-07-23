import { emitSignal } from '@flighthq/signals';
import type { ApplicationWindow, WindowBackend, TauriApi, TauriWindow } from '@flighthq/types';

// Maps Flight's WindowBackend onto Tauri's `@tauri-apps/api/window`. Every Tauri window call is async
// while WindowBackend's commands are synchronous (void), so the adapter fires each call and forgets,
// swallowing rejections at the seam. `open` adopts the webview's current OS window (`getCurrentWindow`),
// applies the WindowOptions, and wires Tauri's onMoved/onResized/onFocusChanged/onCloseRequested events
// back onto the entity + its signals — the same pattern the electron seam uses for user-driven state
// changes. `getBounds` cannot read Tauri's async position/size synchronously, so it reports the entity's
// mirrored fields. Scope: this is the single current window (the browser-page-window analogue); creating
// additional OS windows is a `WebviewWindow`-label concern left to the host and not modeled here.
export function createTauriWindowBackend(tauri: TauriApi): WindowBackend {
  const windowModule = tauri.window;
  const windows = new WeakMap<ApplicationWindow, TauriWindow>();
  const run = (win: ApplicationWindow, fn: (w: TauriWindow) => Promise<unknown>): void => {
    const w = windows.get(win);
    if (w === undefined) return;
    fn(w).catch(() => {
      /* window closed or the call is unsupported on this platform */
    });
  };
  return {
    open(win, options) {
      const w = windowModule.getCurrentWindow();
      windows.set(win, w);
      if (options.title !== undefined) w.setTitle(options.title).catch(() => {});
      if (options.width !== undefined && options.height !== undefined) {
        w.setSize(new windowModule.LogicalSize(options.width, options.height)).catch(() => {});
      }
      if (options.x !== undefined && options.y !== undefined) {
        w.setPosition(new windowModule.LogicalPosition(options.x, options.y)).catch(() => {});
      }
      if (options.resizable !== undefined) w.setResizable(options.resizable).catch(() => {});
      if (options.alwaysOnTop !== undefined) w.setAlwaysOnTop(options.alwaysOnTop).catch(() => {});
      if (options.fullscreen !== undefined) w.setFullscreen(options.fullscreen).catch(() => {});
      if (options.minWidth !== undefined && options.minHeight !== undefined) {
        w.setMinSize(new windowModule.LogicalSize(options.minWidth, options.minHeight)).catch(() => {});
      }
      if (options.maxWidth !== undefined && options.maxWidth >= 0 && options.maxHeight !== undefined) {
        w.setMaxSize(new windowModule.LogicalSize(options.maxWidth, options.maxHeight)).catch(() => {});
      }
      if (options.center) w.center().catch(() => {});
      if (options.maximized) w.maximize().catch(() => {});
      if (options.minimized) w.minimize().catch(() => {});
      if (options.visible === false) w.hide().catch(() => {});
      else w.show().catch(() => {});
      w.onMoved((event) => {
        win.x = event.payload.x;
        win.y = event.payload.y;
        emitSignal(win.onMove);
      }).catch(() => {});
      w.onResized((event) => {
        win.width = event.payload.width;
        win.height = event.payload.height;
        emitSignal(win.onResize);
      }).catch(() => {});
      w.onFocusChanged((event) => {
        win.focused = event.payload;
        emitSignal(event.payload ? win.onFocusIn : win.onFocusOut);
      }).catch(() => {});
      w.onCloseRequested(() => emitSignal(win.onClose)).catch(() => {});
      return true;
    },
    close(win) {
      const w = windows.get(win);
      if (w === undefined) return;
      w.close().catch(() => {});
      windows.delete(win);
    },
    setTitle(win, title) {
      run(win, (w) => w.setTitle(title));
    },
    setPosition(win, x, y) {
      run(win, (w) => w.setPosition(new windowModule.LogicalPosition(x, y)));
    },
    setSize(win, width, height) {
      run(win, (w) => w.setSize(new windowModule.LogicalSize(width, height)));
    },
    getBounds(win, out) {
      // Tauri's position/size are async; report the entity's mirrored bounds rather than block.
      out.x = win.x;
      out.y = win.y;
      out.width = win.width;
      out.height = win.height;
      return out;
    },
    minimize(win) {
      run(win, (w) => w.minimize());
    },
    maximize(win) {
      run(win, (w) => w.maximize());
    },
    restore(win) {
      run(win, (w) => w.unmaximize());
    },
    focus(win) {
      run(win, (w) => w.setFocus());
    },
    show(win) {
      run(win, (w) => w.show());
    },
    hide(win) {
      run(win, (w) => w.hide());
    },
    center(win) {
      run(win, (w) => w.center());
    },
    setResizable(win, resizable) {
      run(win, (w) => w.setResizable(resizable));
    },
    setAlwaysOnTop(win, alwaysOnTop) {
      run(win, (w) => w.setAlwaysOnTop(alwaysOnTop));
    },
    setMinimumSize(win, width, height) {
      run(win, (w) => w.setMinSize(new windowModule.LogicalSize(width, height)));
    },
    setMaximumSize(win, width, height) {
      run(win, (w) => w.setMaxSize(new windowModule.LogicalSize(width, height)));
    },
    setFullscreen(win, fullscreen) {
      run(win, (w) => w.setFullscreen(fullscreen));
    },
    setIcon(win, icon) {
      run(win, (w) => w.setIcon(icon));
    },
    setOpacity() {
      // Tauri's window API exposes no opacity control; no-op.
    },
    setSkipTaskbar(win, skip) {
      run(win, (w) => w.setSkipTaskbar(skip));
    },
    setMenuBarVisible() {
      // Tauri menus are not a per-window menu bar toggled here; no-op.
    },
    setParent() {
      // Parenting an already-created window is not modeled through the current-window seam; no-op.
    },
    setProgress() {
      // Taskbar progress is available via Tauri's setProgressBar but not modeled here; no-op.
    },
    requestAttention(win, attention) {
      // Tauri's requestUserAttention takes a UserAttentionType (1 = Critical) or null to cancel.
      run(win, (w) => w.requestUserAttention(attention ? 1 : null));
    },
    setContentProtection(win, enabled) {
      run(win, (w) => w.setContentProtected(enabled));
    },
    flashWindowFrame(win) {
      // Map a one-shot frame flash to an informational (2) attention request.
      run(win, (w) => w.requestUserAttention(2));
    },
    setHasShadow(win, hasShadow) {
      run(win, (w) => w.setShadow(hasShadow));
    },
  };
}
