import { notifyWindowClosed } from '@flighthq/app/contract';
import { emitSignal } from '@flighthq/signals/contract';
import type {
  AppWindow,
  NativeWindowHandle,
  TauriApi,
  TauriUnlisten,
  TauriWindow,
  WindowAttachmentOwnership,
  WindowBounds,
  HostWindowAppearanceCapability,
  HostWindowAttachCapability,
  HostWindowAttentionCapability,
  HostWindowCapabilities,
  HostWindowContentProtectionCapability,
  HostWindowFocusCapability,
  HostWindowFullscreenCapability,
  HostWindowGeometryCapability,
  HostWindowLifecycleCapability,
  HostWindowShadowCapability,
  HostWindowShellCapability,
  HostWindowSizeConstraintsCapability,
  HostWindowStateCapability,
  HostWindowVisibilityCapability,
  HostWindowZOrderCapability,
} from '@flighthq/types/contract';

// Maps Flight's window capability slots onto Tauri's `@tauri-apps/api/window`. Every Tauri window call
// is async while the capability commands are synchronous (void), so the adapter fires each call and
// forgets, swallowing rejections at the seam. `open` adopts the webview's current OS window
// (`getCurrentWindow`), applies the WindowOptions, and wires Tauri's onMoved/onResized/onFocusChanged/
// onCloseRequested events back onto the entity + its signals — the same pattern the electron seam uses
// for user-driven state changes. `getBounds` cannot read Tauri's async position/size synchronously, so
// it reports the entity's mirrored fields. Scope: this is the single current window (the
// browser-page-window analogue); creating additional OS windows is a `WebviewWindow`-label concern left
// to the host and not modeled here.
//
// Tauri omits the hierarchy and progress slots (it has no setParent or taskbar-progress call) and, as
// electron does, the subscribe hooks inside geometry, lifecycle and visibility — an attached window's
// Tauri events are wired straight to the window's own signals in attach, so a second host-side
// subscription would report every change twice.
export function tauriHostWindow(tauri: TauriApi): TauriHostWindowCapabilities {
  const context = buildTauriWindowContext(tauri);
  return {
    appearance: tauriHostWindowAppearance(context),
    attach: tauriHostWindowAttach(context),
    attention: tauriHostWindowAttention(context),
    contentProtection: tauriHostWindowContentProtection(context),
    focus: tauriHostWindowFocus(context),
    fullscreen: tauriHostWindowFullscreen(context),
    geometry: tauriHostWindowGeometry(context),
    lifecycle: tauriHostWindowLifecycle(context),
    shadow: tauriHostWindowShadow(context),
    shell: tauriHostWindowShell(context),
    sizeConstraints: tauriHostWindowSizeConstraints(context),
    state: tauriHostWindowState(context),
    visibility: tauriHostWindowVisibility(context),
    zOrder: tauriHostWindowZOrder(context),
  };
}

function tauriHostWindowAppearance(context: Readonly<TauriWindowContext>): HostWindowAppearanceCapability {
  const out = {} as HostWindowAppearanceCapability;
  out.setTitle = (win, title) => {
    context.run(win, (w) => w.setTitle(title));
  };
  out.setIcon = (win, icon) => {
    context.run(win, (w) => w.setIcon(icon));
  };
  return out;
}

function tauriHostWindowAttach(context: Readonly<TauriWindowContext>): HostWindowAttachCapability {
  const out = {} as HostWindowAttachCapability;
  out.attach = (win, handle, ownership) => {
    if (!isTauriWindow(handle)) return false;
    return context.attach(win, handle, ownership);
  };
  return out;
}

function tauriHostWindowAttention(context: Readonly<TauriWindowContext>): HostWindowAttentionCapability {
  const out = {} as HostWindowAttentionCapability;
  out.requestAttention = (win, attention) => {
    // Tauri's requestUserAttention takes a UserAttentionType (1 = Critical) or null to cancel.
    context.run(win, (w) => w.requestUserAttention(attention ? 1 : null));
  };
  out.flashWindowFrame = (win) => {
    // Map a one-shot frame flash to an informational (2) attention request.
    context.run(win, (w) => w.requestUserAttention(2));
  };
  return out;
}

function tauriHostWindowContentProtection(
  context: Readonly<TauriWindowContext>,
): HostWindowContentProtectionCapability {
  const out = {} as HostWindowContentProtectionCapability;
  out.setContentProtection = (win, enabled) => {
    context.run(win, (w) => w.setContentProtected(enabled));
  };
  return out;
}

function tauriHostWindowFocus(context: Readonly<TauriWindowContext>): HostWindowFocusCapability {
  const out = {} as HostWindowFocusCapability;
  out.focus = (win) => {
    context.run(win, (w) => w.setFocus());
  };
  return out;
}

function tauriHostWindowFullscreen(context: Readonly<TauriWindowContext>): HostWindowFullscreenCapability {
  const out = {} as HostWindowFullscreenCapability;
  out.setFullscreen = (win, fullscreen) => {
    context.run(win, (w) => w.setFullscreen(fullscreen));
  };
  return out;
}

function tauriHostWindowGeometry(context: Readonly<TauriWindowContext>): HostWindowGeometryCapability {
  const out = {} as HostWindowGeometryCapability;
  out.setPosition = (win, x, y) => {
    context.run(win, (w) => w.setPosition(new context.windowModule.LogicalPosition(x, y)));
  };
  out.setSize = (win, width, height) => {
    context.run(win, (w) => w.setSize(new context.windowModule.LogicalSize(width, height)));
  };
  out.getBounds = (win, out: WindowBounds) => {
    // Tauri's position/size are async; report the entity's mirrored bounds rather than block.
    out.x = win.x;
    out.y = win.y;
    out.width = win.width;
    out.height = win.height;
    return out;
  };
  out.center = (win) => {
    context.run(win, (w) => w.center());
  };
  return out;
}

function tauriHostWindowLifecycle(context: Readonly<TauriWindowContext>): HostWindowLifecycleCapability {
  const out = {} as HostWindowLifecycleCapability;
  out.open = (win, options) => {
    const windowModule = context.windowModule;
    const w = windowModule.getCurrentWindow();
    if (!context.attach(win, w, 'host')) return false;
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
    if (options.maximized) w.maximize().catch(() => {});
    if (options.minimized) w.minimize().catch(() => {});
    if (options.visible === false) w.hide().catch(() => {});
    else w.show().catch(() => {});
    return true;
  };
  out.close = (win) => {
    const record = context.detach(win);
    if (record?.ownership === 'flight') record.handle.close().catch(() => {});
  };
  return out;
}

function tauriHostWindowShadow(context: Readonly<TauriWindowContext>): HostWindowShadowCapability {
  const out = {} as HostWindowShadowCapability;
  out.setHasShadow = (win, hasShadow) => {
    context.run(win, (w) => w.setShadow(hasShadow));
  };
  return out;
}

function tauriHostWindowShell(context: Readonly<TauriWindowContext>): HostWindowShellCapability {
  const out = {} as HostWindowShellCapability;
  out.setSkipTaskbar = (win, skip) => {
    context.run(win, (w) => w.setSkipTaskbar(skip));
  };
  return out;
}

function tauriHostWindowSizeConstraints(context: Readonly<TauriWindowContext>): HostWindowSizeConstraintsCapability {
  const out = {} as HostWindowSizeConstraintsCapability;
  out.setMinimumSize = (win, width, height) => {
    context.run(win, (w) => w.setMinSize(new context.windowModule.LogicalSize(width, height)));
  };
  out.setMaximumSize = (win, width, height) => {
    context.run(win, (w) => w.setMaxSize(new context.windowModule.LogicalSize(width, height)));
  };
  out.setResizable = (win, resizable) => {
    context.run(win, (w) => w.setResizable(resizable));
  };
  return out;
}

function tauriHostWindowState(context: Readonly<TauriWindowContext>): HostWindowStateCapability {
  const out = {} as HostWindowStateCapability;
  out.minimize = (win) => {
    context.run(win, (w) => w.minimize());
  };
  out.maximize = (win) => {
    context.run(win, (w) => w.maximize());
  };
  out.restore = (win) => {
    context.run(win, (w) => w.unmaximize());
  };
  return out;
}

function tauriHostWindowVisibility(context: Readonly<TauriWindowContext>): HostWindowVisibilityCapability {
  const out = {} as HostWindowVisibilityCapability;
  out.show = (win) => {
    context.run(win, (w) => w.show());
  };
  out.hide = (win) => {
    context.run(win, (w) => w.hide());
  };
  return out;
}

function tauriHostWindowZOrder(context: Readonly<TauriWindowContext>): HostWindowZOrderCapability {
  const out = {} as HostWindowZOrderCapability;
  out.setAlwaysOnTop = (win, alwaysOnTop) => {
    context.run(win, (w) => w.setAlwaysOnTop(alwaysOnTop));
  };
  return out;
}

// The window slots Tauri guarantees, mirroring TauriHost['window']. Kept in step by the
// `satisfies Omit<TauriHost<Profile>, …>` assertion in tauriHost.ts, which fails if they diverge.
type TauriHostWindowCapabilities = HostWindowCapabilities &
  Required<
    Pick<
      HostWindowCapabilities,
      | 'appearance'
      | 'attach'
      | 'attention'
      | 'contentProtection'
      | 'focus'
      | 'fullscreen'
      | 'geometry'
      | 'lifecycle'
      | 'shadow'
      | 'shell'
      | 'sizeConstraints'
      | 'state'
      | 'visibility'
      | 'zOrder'
    >
  >;

interface TauriWindowRecord {
  readonly cleanup: TauriUnlisten[];
  detached: boolean;
  readonly handle: TauriWindow;
  readonly ownership: WindowAttachmentOwnership;
}

// Per-host window state. Kept per `tauriHostWindow` call rather than at module scope so two hosts in one
// process cannot see each other's window↔handle mappings.
interface TauriWindowContext {
  readonly windowModule: TauriApi['window'];
  attach(win: AppWindow, handle: TauriWindow, ownership: WindowAttachmentOwnership): boolean;
  detach(win: AppWindow): TauriWindowRecord | null;
  run(win: AppWindow, fn: (w: TauriWindow) => Promise<unknown>): void;
}

function buildTauriWindowContext(tauri: TauriApi): TauriWindowContext {
  const windowModule = tauri.window;
  const handles = new WeakMap<TauriWindow, AppWindow>();
  const windows = new WeakMap<AppWindow, TauriWindowRecord>();
  const run = (win: AppWindow, fn: (w: TauriWindow) => Promise<unknown>): void => {
    const record = windows.get(win);
    if (record === undefined) return;
    fn(record.handle).catch(() => {
      /* window closed or the call is unsupported on this platform */
    });
  };
  const detach = (win: AppWindow): TauriWindowRecord | null => {
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
  const attach = (win: AppWindow, handle: TauriWindow, ownership: WindowAttachmentOwnership): boolean => {
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
  return { attach, detach, run, windowModule };
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
