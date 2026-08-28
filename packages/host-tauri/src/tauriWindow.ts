import { notifyWindowClosed } from '@flighthq/application/contract';
import { emitSignal } from '@flighthq/signals/contract';
import type {
  ApplicationWindow,
  NativeWindowHandle,
  TauriApi,
  TauriUnlisten,
  TauriWindow,
  WindowAttachmentOwnership,
  WindowBackend,
} from '@flighthq/types/contract';

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
  const handles = new WeakMap<TauriWindow, ApplicationWindow>();
  const windows = new WeakMap<ApplicationWindow, TauriWindowRecord>();
  const run = (win: ApplicationWindow, fn: (w: TauriWindow) => Promise<unknown>): void => {
    const record = windows.get(win);
    if (record === undefined) return;
    fn(record.handle).catch(() => {
      /* window closed or the call is unsupported on this platform */
    });
  };
  const detach = (win: ApplicationWindow): TauriWindowRecord | null => {
    const record = windows.get(win);
    if (record === undefined) return null;
    windows.delete(win);
    handles.delete(record.handle);
    record.detached = true;
    for (const cleanup of record.cleanup) cleanup();
    record.cleanup.length = 0;
    return record;
  };
  const addCleanup = (record: TauriWindowRecord, pending: Promise<TauriUnlisten>): void => {
    pending
      .then((cleanup) => {
        if (record.detached) cleanup();
        else record.cleanup.push(cleanup);
      })
      .catch(() => {});
  };
  const attach = (win: ApplicationWindow, handle: TauriWindow, ownership: WindowAttachmentOwnership): boolean => {
    const existing = windows.get(win);
    if (existing !== undefined) return existing.handle === handle && existing.ownership === ownership;
    const mapped = handles.get(handle);
    if (mapped !== undefined && mapped !== win) return false;
    const record: TauriWindowRecord = { cleanup: [], detached: false, handle, ownership };
    windows.set(win, record);
    handles.set(handle, win);
    addCleanup(
      record,
      handle.onMoved((event) => {
        win.x = event.payload.x;
        win.y = event.payload.y;
        emitSignal(win.onMove);
      }),
    );
    addCleanup(
      record,
      handle.onResized((event) => {
        win.width = event.payload.width;
        win.height = event.payload.height;
        emitSignal(win.onResize);
      }),
    );
    addCleanup(
      record,
      handle.onFocusChanged((event) => {
        win.focused = event.payload;
        emitSignal(event.payload ? win.onFocusIn : win.onFocusOut);
      }),
    );
    addCleanup(
      record,
      handle.onCloseRequested(() => {
        detach(win);
        notifyWindowClosed(win);
      }),
    );
    return true;
  };
  return {
    attach(win, handle, ownership) {
      if (!isTauriWindow(handle)) return false;
      return attach(win, handle, ownership);
    },
    open(win, options) {
      const w = windowModule.getCurrentWindow();
      if (!attach(win, w, 'host')) return false;
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
      return true;
    },
    close(win) {
      const record = detach(win);
      if (record?.ownership === 'flight') record.handle.close().catch(() => {});
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

interface TauriWindowRecord {
  readonly cleanup: TauriUnlisten[];
  detached: boolean;
  readonly handle: TauriWindow;
  readonly ownership: WindowAttachmentOwnership;
}

function isTauriWindow(handle: NativeWindowHandle): handle is TauriWindow {
  if (typeof handle !== 'object' || handle === null) return false;
  const candidate = handle as Partial<TauriWindow>;
  return (
    typeof candidate.close === 'function' &&
    typeof candidate.onCloseRequested === 'function' &&
    typeof candidate.onFocusChanged === 'function' &&
    typeof candidate.onMoved === 'function' &&
    typeof candidate.onResized === 'function'
  );
}
