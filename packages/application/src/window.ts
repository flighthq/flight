import { connectSignal, createSignal, disconnectSignal, emitSignal } from '@flighthq/signals';
import type {
  ApplicationWindow,
  Matrix,
  RenderState,
  WindowBackend,
  WindowBounds,
  WindowOptions,
} from '@flighthq/types';

const kClose = Symbol();
const kDropFile = Symbol();
const kFocus = Symbol();
const kFullscreen = Symbol();
const kMove = Symbol();
const kOrientation = Symbol();
const kRenderContext = Symbol();
const kRenderState = Symbol();
const kResize = Symbol();
const kVisibility = Symbol();

// Wires the browser's beforeunload/pagehide to the window's close signals: beforeunload emits
// onCloseRequest and, if a listener vetoes (cancelSignal), prompts the user via the native unload
// dialog; pagehide emits onClose once the page is actually going away. Idempotent.
export function attachWindowClose(win: ApplicationWindow): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kClose)?.();
  if (typeof window === 'undefined') return;
  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    emitSignal(win.onCloseRequest);
    if (win.onCloseRequest.data?.cancelled === true) {
      e.preventDefault();
      e.returnValue = '';
    }
  };
  const onPageHide = () => emitSignal(win.onClose);
  window.addEventListener('beforeunload', onBeforeUnload);
  window.addEventListener('pagehide', onPageHide);
  observers.set(kClose, () => {
    window.removeEventListener('beforeunload', onBeforeUnload);
    window.removeEventListener('pagehide', onPageHide);
  });
}

export function attachWindowDropFile(win: ApplicationWindow, element: HTMLElement): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kDropFile)?.();
  const onDragOver = (e: DragEvent) => e.preventDefault();
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    for (const file of Array.from(e.dataTransfer?.files ?? [])) {
      emitSignal(win.onDropFile, file.name);
    }
  };
  element.addEventListener('dragover', onDragOver);
  element.addEventListener('drop', onDrop);
  observers.set(kDropFile, () => {
    element.removeEventListener('dragover', onDragOver);
    element.removeEventListener('drop', onDrop);
  });
}

export function attachWindowFocus(win: ApplicationWindow, element: HTMLElement): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kFocus)?.();
  const onFocus = () => emitSignal(win.onFocusIn);
  const onBlur = () => emitSignal(win.onFocusOut);
  element.addEventListener('focus', onFocus);
  element.addEventListener('blur', onBlur);
  observers.set(kFocus, () => {
    element.removeEventListener('focus', onFocus);
    element.removeEventListener('blur', onBlur);
  });
}

export function attachWindowFullscreen(win: ApplicationWindow): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kFullscreen)?.();
  const handler = () => emitSignal(win.onFullscreenChanged);
  document.addEventListener('fullscreenchange', handler);
  observers.set(kFullscreen, () => document.removeEventListener('fullscreenchange', handler));
}

// Wires OS/screen-originated window-move events to win.onMove. On web this is best-effort via
// the window 'resize' event (which fires on page-move too in some browsers) — browsers do not
// expose a reliable 'move' event on the page window. No-op in non-browser environments.
export function attachWindowMove(win: ApplicationWindow): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kMove)?.();
  if (typeof window === 'undefined') return;
  const handler = (): void => {
    // Read back the real screen position from the browser and update the entity if it changed.
    if (typeof window.screenX === 'number' && typeof window.screenY === 'number') {
      const x = window.screenX;
      const y = window.screenY;
      if (win.x !== x || win.y !== y) {
        win.x = x;
        win.y = y;
        emitSignal(win.onMove);
      }
    }
  };
  // Both 'resize' and a polling listener on 'pointermove' are imperfect; 'resize' fires more
  // reliably across browsers as a proxy for page layout change that includes moves.
  window.addEventListener('resize', handler);
  observers.set(kMove, () => window.removeEventListener('resize', handler));
}

export function attachWindowOrientation(win: ApplicationWindow): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kOrientation)?.();
  if (!screen.orientation) return;
  const handler = () => emitSignal(win.onOrientationChanged);
  screen.orientation.addEventListener('change', handler);
  observers.set(kOrientation, () => screen.orientation.removeEventListener('change', handler));
}

export function attachWindowRenderContext(win: ApplicationWindow, canvas: HTMLCanvasElement): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kRenderContext)?.();
  const onContextLost = (e: Event) => {
    e.preventDefault();
    emitSignal(win.onRenderContextLost);
  };
  const onContextRestored = () => emitSignal(win.onRenderContextRestored);
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);
  observers.set(kRenderContext, () => {
    canvas.removeEventListener('webglcontextlost', onContextLost);
    canvas.removeEventListener('webglcontextrestored', onContextRestored);
  });
}

// Binds a canvas render state to the window's size and devicePixelRatio: sizes the canvas backing
// store and writes the device transform (renderTransform2D), then keeps both in sync on every
// onResize, so moving the window between displays or zooming is handled. Pair with attachWindowResize
// — it is the source of the size/DPI updates this reacts to. The render state must have an
// initialized renderTransform2D (every create*RenderState factory does). DOM render states need no
// device transform (the browser rasterizes DOM at device resolution), so this is for canvas/Gl.
export function attachWindowRenderState(win: ApplicationWindow, state: RenderState, canvas: HTMLCanvasElement): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kRenderState)?.();
  const apply = (): void => {
    canvas.width = Math.round(win.width * win.devicePixelRatio);
    canvas.height = Math.round(win.height * win.devicePixelRatio);
    if (state.renderTransform2D !== null) computeWindowDeviceTransform(win, state.renderTransform2D);
  };
  apply();
  connectSignal(win.onResize, apply);
  observers.set(kRenderState, () => disconnectSignal(win.onResize, apply));
}

export function attachWindowResize(win: ApplicationWindow, element: HTMLElement): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kResize)?.();
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      win.width = Math.round(entry.contentRect.width);
      win.height = Math.round(entry.contentRect.height);
      win.devicePixelRatio = window.devicePixelRatio || 1;
      emitSignal(win.onResize);
    }
  });
  observer.observe(element);
  observers.set(kResize, () => observer.disconnect());
}

export function attachWindowVisibility(win: ApplicationWindow): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kVisibility)?.();
  const handler = () => {
    if (document.hidden) {
      emitSignal(win.onDeactivate);
    } else {
      emitSignal(win.onActivate);
    }
  };
  document.addEventListener('visibilitychange', handler);
  observers.set(kVisibility, () => document.removeEventListener('visibilitychange', handler));
}

// Centers the window on its current display via the backend.
export function centerWindow(win: ApplicationWindow): void {
  getWindowBackend().center(win);
}

// Closes the window. First emits onCloseRequest; if a listener vetoes (cancelSignal), the close is
// aborted and this returns false. Otherwise the backend closes the window, onClose fires, and it
// returns true.
export function closeWindow(win: ApplicationWindow): boolean {
  if (!requestWindowClose(win)) return false;
  getWindowBackend().close(win);
  emitSignal(win.onClose);
  return true;
}

// Writes the window's device transform — a uniform scale by devicePixelRatio — into out and returns
// it. DPI is a device concern, so it belongs in a render state's device transform (renderTransform2D),
// leaving the scene authored in logical units. Reads win before writing out, so out may alias an input.
export function computeWindowDeviceTransform(win: Readonly<ApplicationWindow>, out: Matrix): Matrix {
  const scale = win.devicePixelRatio;
  out.a = scale;
  out.b = 0;
  out.c = 0;
  out.d = scale;
  out.tx = 0;
  out.ty = 0;
  return out;
}

export function createApplicationWindow(): ApplicationWindow {
  return {
    alwaysOnTop: false,
    devicePixelRatio: 1,
    focused: false,
    fullscreen: false,
    height: 0,
    icon: '',
    maxHeight: -1,
    maximized: false,
    maxWidth: -1,
    minHeight: 0,
    minimized: false,
    minWidth: 0,
    opacity: 1,
    resizable: true,
    skipTaskbar: false,
    title: '',
    visible: true,
    width: 0,
    x: 0,
    y: 0,
    onActivate: createSignal(),
    onClose: createSignal(),
    onCloseRequest: createSignal(),
    onDeactivate: createSignal(),
    onDropFile: createSignal(),
    onFocusIn: createSignal(),
    onFocusOut: createSignal(),
    onFullscreenChanged: createSignal(),
    onMaximize: createSignal(),
    onMinimize: createSignal(),
    onMove: createSignal(),
    onOrientationChanged: createSignal(),
    onRenderContextLost: createSignal(),
    onRenderContextRestored: createSignal(),
    onResize: createSignal(),
    onRestore: createSignal(),
  };
}

// Builds the default web window backend over the browser page-window. Covers what a browser can do
// (title via document.title, fullscreen, focus, popup move/resize/close); minimize/maximize/restore,
// always-on-top, and size constraints have no browser equivalent and are no-ops — the window command
// functions still update the entity state and emit signals, and native hosts implement the rest.
export function createWebWindowBackend(): WindowBackend {
  return {
    open() {
      return typeof window !== 'undefined';
    },
    close() {
      if (typeof window !== 'undefined' && typeof window.close === 'function') {
        try {
          window.close();
        } catch {
          /* a non-script-opened window cannot be closed by script */
        }
      }
    },
    setTitle(_win, title) {
      if (typeof document !== 'undefined') document.title = title;
    },
    setPosition(_win, x, y) {
      if (typeof window !== 'undefined' && typeof window.moveTo === 'function') {
        try {
          window.moveTo(x, y);
        } catch {
          /* blocked outside a script-opened window */
        }
      }
    },
    setSize(_win, width, height) {
      if (typeof window !== 'undefined' && typeof window.resizeTo === 'function') {
        try {
          window.resizeTo(width, height);
        } catch {
          /* blocked outside a script-opened window */
        }
      }
    },
    getBounds(win, out) {
      if (typeof window === 'undefined') {
        out.x = win.x;
        out.y = win.y;
        out.width = win.width;
        out.height = win.height;
        return out;
      }
      out.x = window.screenX ?? win.x;
      out.y = window.screenY ?? win.y;
      out.width = window.innerWidth ?? win.width;
      out.height = window.innerHeight ?? win.height;
      return out;
    },
    minimize() {},
    maximize() {},
    restore() {},
    focus() {
      if (typeof window !== 'undefined' && typeof window.focus === 'function') window.focus();
    },
    show() {},
    hide() {},
    center(win) {
      if (typeof window === 'undefined' || typeof window.moveTo !== 'function' || typeof screen === 'undefined') return;
      try {
        window.moveTo(
          Math.round((screen.availWidth - win.width) / 2),
          Math.round((screen.availHeight - win.height) / 2),
        );
      } catch {
        /* blocked outside a script-opened window */
      }
    },
    setResizable() {},
    setAlwaysOnTop() {},
    setMinimumSize() {},
    setMaximumSize() {},
    setFullscreen(_win, fullscreen) {
      if (typeof document === 'undefined') return;
      try {
        if (fullscreen) void document.documentElement.requestFullscreen?.();
        else void document.exitFullscreen?.();
      } catch {
        /* fullscreen requires a user gesture; ignore rejection */
      }
    },
    setIcon(_win, icon) {
      // The browser equivalent of a window icon is the page favicon; native hosts set the real icon.
      if (typeof document === 'undefined') return;
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (link === null) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = icon;
    },
    setOpacity() {},
    setSkipTaskbar() {},
    setMenuBarVisible() {},
    setParent() {},
    setProgress() {},
    requestAttention() {},
    setContentProtection() {},
    flashWindowFrame() {},
    setHasShadow() {},
  };
}

export function detachWindowClose(win: ApplicationWindow): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kClose)?.();
  observers.delete(kClose);
}

export function detachWindowDropFile(win: ApplicationWindow): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kDropFile)?.();
  observers.delete(kDropFile);
}

export function detachWindowFocus(win: ApplicationWindow): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kFocus)?.();
  observers.delete(kFocus);
}

export function detachWindowFullscreen(win: ApplicationWindow): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kFullscreen)?.();
  observers.delete(kFullscreen);
}

export function detachWindowMove(win: ApplicationWindow): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kMove)?.();
  observers.delete(kMove);
}

export function detachWindowOrientation(win: ApplicationWindow): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kOrientation)?.();
  observers.delete(kOrientation);
}

export function detachWindowRenderContext(win: ApplicationWindow): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kRenderContext)?.();
  observers.delete(kRenderContext);
}

export function detachWindowRenderState(win: ApplicationWindow): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kRenderState)?.();
  observers.delete(kRenderState);
}

export function detachWindowResize(win: ApplicationWindow): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kResize)?.();
  observers.delete(kResize);
}

export function detachWindowVisibility(win: ApplicationWindow): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kVisibility)?.();
  observers.delete(kVisibility);
}

export function disposeApplicationWindow(win: ApplicationWindow): void {
  const observers = getApplicationWindowObservers(win);
  for (const cleanup of observers.values()) cleanup();
  observers.clear();
}

export function exitApplicationFullscreen(): Promise<void> {
  return document.exitFullscreen();
}

// Releases the Pointer Lock on the document, restoring cursor movement.
export function exitApplicationPointerLock(): Promise<void> {
  if (typeof document === 'undefined' || typeof document.exitPointerLock !== 'function') {
    return Promise.resolve();
  }
  document.exitPointerLock();
  return Promise.resolve();
}

// Briefly flashes the window frame to attract attention. No-op on web; native hosts implement via
// the WindowBackend (e.g. Electron window.flashFrame(true)).
export function flashWindowFrame(win: ApplicationWindow): void {
  getWindowBackend().flashWindowFrame(win);
}

// Brings the window to the foreground and marks it focused.
export function focusWindow(win: ApplicationWindow): void {
  win.focused = true;
  getWindowBackend().focus(win);
}

// The active window backend, or a lazily-created web default. There is always a backend.
export function getWindowBackend(): WindowBackend {
  if (_windowBackend === null) _windowBackend = createWebWindowBackend();
  return _windowBackend;
}

// Fills `out` with the window's current screen bounds and returns it.
export function getWindowBounds(win: Readonly<ApplicationWindow>, out: WindowBounds): WindowBounds {
  return getWindowBackend().getBounds(win as ApplicationWindow, out);
}

// Returns the index of the display (screen) the window is currently on, or -1 if unknown.
// This is a seam: on web it always returns -1 (no multi-monitor API); native backends
// (host-electron, host-winit) resolve the display via @flighthq/screen and return the index.
export function getWindowDisplay(_win: Readonly<ApplicationWindow>): number {
  return -1;
}

// Hides the window without closing it.
export function hideWindow(win: ApplicationWindow): void {
  if (!win.visible) return;
  win.visible = false;
  getWindowBackend().hide(win);
}

// Requests Pointer Lock on an element, hiding and confining the cursor so raw mouse deltas are
// delivered via pointermove events. Returns a promise that resolves on success or rejects if the
// browser denies (requires a prior user gesture). Use exitApplicationPointerLock to release.
export function lockApplicationPointer(element: HTMLElement): Promise<void> {
  if (typeof element.requestPointerLock !== 'function') return Promise.resolve();
  const result = element.requestPointerLock();
  // requestPointerLock returns a Promise in newer browsers and undefined in older ones.
  return (result instanceof Promise ? result : Promise.resolve()) as Promise<void>;
}

// Maximizes the window. Updates state and emits onMaximize when the state changes.
export function maximizeWindow(win: ApplicationWindow): void {
  if (win.maximized) return;
  win.maximized = true;
  getWindowBackend().maximize(win);
  emitSignal(win.onMaximize);
}

// Minimizes the window. Updates state and emits onMinimize when the state changes.
export function minimizeWindow(win: ApplicationWindow): void {
  if (win.minimized) return;
  win.minimized = true;
  getWindowBackend().minimize(win);
  emitSignal(win.onMinimize);
}

// Opens (or configures) the window from options, applying each provided field to the entity and
// delegating to the backend. Returns whether the host opened a window. On web this configures the
// existing page-window; native hosts create a real OS window.
export function openWindow(win: ApplicationWindow, options: Readonly<WindowOptions> = {}): boolean {
  if (options.title !== undefined) win.title = options.title;
  if (options.x !== undefined) win.x = options.x;
  if (options.y !== undefined) win.y = options.y;
  if (options.width !== undefined) win.width = options.width;
  if (options.height !== undefined) win.height = options.height;
  if (options.resizable !== undefined) win.resizable = options.resizable;
  if (options.alwaysOnTop !== undefined) win.alwaysOnTop = options.alwaysOnTop;
  if (options.fullscreen !== undefined) win.fullscreen = options.fullscreen;
  if (options.minimized !== undefined) win.minimized = options.minimized;
  if (options.maximized !== undefined) win.maximized = options.maximized;
  if (options.visible !== undefined) win.visible = options.visible;
  if (options.minWidth !== undefined) win.minWidth = options.minWidth;
  if (options.minHeight !== undefined) win.minHeight = options.minHeight;
  if (options.maxWidth !== undefined) win.maxWidth = options.maxWidth;
  if (options.maxHeight !== undefined) win.maxHeight = options.maxHeight;
  const result = getWindowBackend().open(win, options);
  // Apply center after open so the backend has registered the OS window before moving it.
  if (options.center === true) centerWindow(win);
  return result;
}

// Prepares an element for direct input by setting CSS properties that suppress default browser
// touch/selection/tap-highlight behavior: touch-action:none, user-select:none,
// webkit-tap-highlight-color:transparent. For canvas elements, adds translateZ(0) to promote to
// a GPU compositing layer, reducing canvas flicker on touch. Call once; no teardown needed.
export function prepareElementForInput(element: HTMLElement): void {
  element.style.touchAction = 'none';
  element.style.userSelect = 'none';
  element.style.webkitUserSelect = 'none';
  (element.style as CSSStyleDeclaration & { webkitTapHighlightColor: string }).webkitTapHighlightColor = 'transparent';
  if (element instanceof HTMLCanvasElement) {
    element.style.transform = 'translateZ(0)';
  }
}

export function requestApplicationFullscreen(element: HTMLElement): Promise<void> {
  return element.requestFullscreen();
}

// Requests user attention on the window (taskbar flash / dock bounce); pass false to stop.
export function requestWindowAttention(win: ApplicationWindow, attention: boolean): void {
  getWindowBackend().requestAttention(win, attention);
}

// Emits onCloseRequest and returns whether the close may proceed (false when a listener vetoed by
// calling cancelSignal(win.onCloseRequest)). Use to gate an app-driven close without closing.
export function requestWindowClose(win: ApplicationWindow): boolean {
  emitSignal(win.onCloseRequest);
  return win.onCloseRequest.data?.cancelled !== true;
}

// Restores the window from a minimized/maximized state. Emits onRestore when state changed.
export function restoreWindow(win: ApplicationWindow): void {
  if (!win.minimized && !win.maximized) return;
  win.minimized = false;
  win.maximized = false;
  getWindowBackend().restore(win);
  emitSignal(win.onRestore);
}

// Sets whether the window floats above others.
export function setWindowAlwaysOnTop(win: ApplicationWindow, alwaysOnTop: boolean): void {
  win.alwaysOnTop = alwaysOnTop;
  getWindowBackend().setAlwaysOnTop(win, alwaysOnTop);
}

// Installs a native host window backend; pass null to fall back to the web default.
export function setWindowBackend(backend: WindowBackend | null): void {
  _windowBackend = backend;
}

// Prevents (or allows) the window contents from being captured in screenshots or screen sharing.
// Web no-op; native hosts implement via the WindowBackend (e.g. Electron window.setContentProtection).
export function setWindowContentProtection(win: ApplicationWindow, enabled: boolean): void {
  getWindowBackend().setContentProtection(win, enabled);
}

// Sets fullscreen state. Updates state and emits onFullscreenChanged when the state changes.
export function setWindowFullscreen(win: ApplicationWindow, fullscreen: boolean): void {
  if (win.fullscreen === fullscreen) return;
  win.fullscreen = fullscreen;
  getWindowBackend().setFullscreen(win, fullscreen);
  emitSignal(win.onFullscreenChanged);
}

// Shows or hides the native drop shadow around the window. macOS / native only; web no-op.
export function setWindowHasShadow(win: ApplicationWindow, hasShadow: boolean): void {
  getWindowBackend().setHasShadow(win, hasShadow);
}

// Sets the window icon (path/URL). On web this updates the page favicon.
export function setWindowIcon(win: ApplicationWindow, icon: string): void {
  win.icon = icon;
  getWindowBackend().setIcon(win, icon);
}

// Sets the maximum window size in logical pixels (-1 for unbounded).
export function setWindowMaximumSize(win: ApplicationWindow, width: number, height: number): void {
  win.maxWidth = width;
  win.maxHeight = height;
  getWindowBackend().setMaximumSize(win, width, height);
}

// Shows or hides the window's menu bar (native hosts; no-op on web).
export function setWindowMenuBarVisible(win: ApplicationWindow, visible: boolean): void {
  getWindowBackend().setMenuBarVisible(win, visible);
}

// Sets the minimum window size in logical pixels.
export function setWindowMinimumSize(win: ApplicationWindow, width: number, height: number): void {
  win.minWidth = width;
  win.minHeight = height;
  getWindowBackend().setMinimumSize(win, width, height);
}

// Sets the window opacity in [0, 1].
export function setWindowOpacity(win: ApplicationWindow, opacity: number): void {
  win.opacity = opacity;
  getWindowBackend().setOpacity(win, opacity);
}

// Sets the window's parent (for modal/child relationships); pass null to detach. Native hosts only.
export function setWindowParent(win: ApplicationWindow, parent: ApplicationWindow | null): void {
  getWindowBackend().setParent(win, parent);
}

// Moves the window's top-left to (x, y) in screen coordinates. Updates state and emits onMove.
export function setWindowPosition(win: ApplicationWindow, x: number, y: number): void {
  win.x = x;
  win.y = y;
  getWindowBackend().setPosition(win, x, y);
  emitSignal(win.onMove);
}

// Sets the taskbar/dock progress indicator in [0, 1]; a negative value clears it.
export function setWindowProgress(win: ApplicationWindow, progress: number): void {
  getWindowBackend().setProgress(win, progress);
}

// Sets whether the user can resize the window.
export function setWindowResizable(win: ApplicationWindow, resizable: boolean): void {
  win.resizable = resizable;
  getWindowBackend().setResizable(win, resizable);
}

// Resizes the window to width x height (logical pixels). Updates state and emits onResize.
export function setWindowSize(win: ApplicationWindow, width: number, height: number): void {
  win.width = width;
  win.height = height;
  getWindowBackend().setSize(win, width, height);
  emitSignal(win.onResize);
}

// Sets whether the window is hidden from the taskbar/dock switcher.
export function setWindowSkipTaskbar(win: ApplicationWindow, skip: boolean): void {
  win.skipTaskbar = skip;
  getWindowBackend().setSkipTaskbar(win, skip);
}

// Sets the window title text.
export function setWindowTitle(win: ApplicationWindow, title: string): void {
  win.title = title;
  getWindowBackend().setTitle(win, title);
}

// Shows a hidden window.
export function showWindow(win: ApplicationWindow): void {
  if (win.visible) return;
  win.visible = true;
  getWindowBackend().show(win);
}

// Internal teardown registry, kept off the public ApplicationWindow entity (a side table like
// input's binding map). attach/detach/dispose track cleanup closures internally so callers hold
// nothing.
const _applicationWindowObservers = new WeakMap<ApplicationWindow, Map<symbol, () => void>>();

let _windowBackend: WindowBackend | null = null;

function getApplicationWindowObservers(win: ApplicationWindow): Map<symbol, () => void> {
  let observers = _applicationWindowObservers.get(win);
  if (observers === undefined) {
    observers = new Map();
    _applicationWindowObservers.set(win, observers);
  }
  return observers;
}
