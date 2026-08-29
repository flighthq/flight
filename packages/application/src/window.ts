import { connectSignal, createSignal, disconnectSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  ApplicationWindow,
  FullscreenTargetHandle,
  HasUiFullscreen,
  HasUiFullscreenSubscription,
  HasWindowAttach,
  HasWindowOpen,
  Matrix,
  NativeWindowHandle,
  RenderState,
  WindowAttachmentOwnership,
  WindowBackend,
  WindowBounds,
  WindowOptions,
} from '@flighthq/types/contract';

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

// Attaches an existing native window without requiring an Application. A false result leaves the
// window's current lifecycle unchanged; success pins its eventual close to this exact host backend.
export function attachWindow(
  host: HasWindowAttach,
  win: ApplicationWindow,
  handle: NativeWindowHandle,
  ownership: WindowAttachmentOwnership,
): boolean {
  const backend = host.window;
  const attached = backend.attach(win, handle, ownership);
  if (attached) {
    _windowBackends.set(win, backend);
    _terminalWindows.delete(win);
  }
  return attached;
}

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
  const onPageHide = () => notifyWindowClosed(win);
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

export function attachWindowFullscreen(host: HasUiFullscreenSubscription, win: ApplicationWindow): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kFullscreen)?.();
  const handler = (fullscreen: boolean): void => {
    win.fullscreen = fullscreen;
    emitSignal(win.onFullscreenChanged);
  };
  host.ui.fullscreen.subscribe(handler);
  observers.set(kFullscreen, () => host.ui.fullscreen.unsubscribe(handler));
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
export function centerWindow(host: WindowOperationHost<'center'>, win: ApplicationWindow): void {
  host.window.center(win);
}

// Closes the window. First emits onCloseRequest; if a listener vetoes (cancelSignal), the close is
// aborted and this returns false. Otherwise the backend closes the window, onClose fires, and it
// returns true.
export function closeWindow(host: WindowOperationHost<'close'>, win: ApplicationWindow): boolean {
  if (_terminalWindows.has(win)) return true;
  if (!requestWindowClose(win)) return false;
  (_windowBackends.get(win) ?? host.window).close(win);
  notifyWindowClosed(win);
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

export function exitApplicationFullscreen(host: HasUiFullscreen): Promise<boolean> {
  return host.ui.fullscreen.exit();
}

// Releases the Pointer Lock on the document, restoring cursor movement.
export function exitApplicationPointerLock(): Promise<void> {
  if (typeof document === 'undefined' || typeof document.exitPointerLock !== 'function') {
    return Promise.resolve();
  }
  document.exitPointerLock();
  return Promise.resolve();
}

// Briefly flashes the window frame to attract attention. Native hosts may implement it via the
// WindowBackend (for example Electron window.flashFrame(true)).
export function flashWindowFrame(host: WindowOperationHost<'flashWindowFrame'>, win: ApplicationWindow): void {
  host.window.flashWindowFrame(win);
}

// Brings the window to the foreground and marks it focused.
export function focusWindow(host: WindowOperationHost<'focus'>, win: ApplicationWindow): void {
  win.focused = true;
  host.window.focus(win);
}

// Fills `out` with the host window's current screen bounds and returns it.
export function getWindowBounds(
  host: WindowOperationHost<'getBounds'>,
  win: Readonly<ApplicationWindow>,
  out: WindowBounds,
): WindowBounds {
  return host.window.getBounds(win as ApplicationWindow, out);
}

// Returns the index of the display (screen) the window is currently on, or -1 if unknown.
// This is a seam: on web it always returns -1 (no multi-monitor API); native backends
// (host-electron, host-winit) resolve the display via @flighthq/screen and return the index.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getWindowDisplay(win: Readonly<ApplicationWindow>): number {
  return -1;
}

// Hides the window without closing it.
export function hideWindow(host: WindowOperationHost<'hide'>, win: ApplicationWindow): void {
  if (!win.visible) return;
  win.visible = false;
  host.window.hide(win);
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
export function maximizeWindow(host: WindowOperationHost<'maximize'>, win: ApplicationWindow): void {
  if (win.maximized) return;
  win.maximized = true;
  host.window.maximize(win);
  emitSignal(win.onMaximize);
}

// Minimizes the window. Updates state and emits onMinimize when the state changes.
export function minimizeWindow(host: WindowOperationHost<'minimize'>, win: ApplicationWindow): void {
  if (win.minimized) return;
  win.minimized = true;
  host.window.minimize(win);
  emitSignal(win.onMinimize);
}

// The single terminal-close choke point for both app-driven and host-driven closes. Native callbacks may
// fire synchronously inside backend.close; whichever path arrives first emits and every later path no-ops.
// After the terminal signal is delivered, application-side observers are drained even when a listener
// throws. This state belongs to the ApplicationWindow entity, never to an Application or per-app registry.
export function notifyWindowClosed(win: ApplicationWindow): void {
  if (_terminalWindows.has(win)) return;
  _terminalWindows.add(win);
  _windowBackends.delete(win);
  try {
    emitSignal(win.onClose);
  } finally {
    disposeApplicationWindow(win);
  }
}

// Opens (or configures) the window from options, applying each provided field to the entity and
// delegating to the backend. Returns whether the host opened a window. On web this configures the
// existing page-window; native hosts create a real OS window.
export function openWindow(
  host: HasWindowOpen,
  win: ApplicationWindow,
  options: Readonly<WindowOptions> = {},
): boolean {
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
  const backend = host.window;
  const result = backend.open(win, options);
  if (result) {
    _windowBackends.set(win, backend);
    _terminalWindows.delete(win);
  }
  // Apply center after open so the backend has registered the OS window before moving it.
  if (result && options.center === true) backend.center?.(win);
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

export function requestApplicationFullscreen(host: HasUiFullscreen, target: FullscreenTargetHandle): Promise<boolean> {
  return host.ui.fullscreen.request(target);
}

// Requests user attention on the window (taskbar flash / dock bounce); pass false to stop.
export function requestWindowAttention(
  host: WindowOperationHost<'requestAttention'>,
  win: ApplicationWindow,
  attention: boolean,
): void {
  host.window.requestAttention(win, attention);
}

// Emits onCloseRequest and returns whether the close may proceed (false when a listener vetoed by
// calling cancelSignal(win.onCloseRequest)). Use to gate an app-driven close without closing.
export function requestWindowClose(win: ApplicationWindow): boolean {
  emitSignal(win.onCloseRequest);
  return win.onCloseRequest.data?.cancelled !== true;
}

// Restores the window from a minimized/maximized state. Emits onRestore when state changed.
export function restoreWindow(host: WindowOperationHost<'restore'>, win: ApplicationWindow): void {
  if (!win.minimized && !win.maximized) return;
  win.minimized = false;
  win.maximized = false;
  host.window.restore(win);
  emitSignal(win.onRestore);
}

// Sets whether the window floats above others.
export function setWindowAlwaysOnTop(
  host: WindowOperationHost<'setAlwaysOnTop'>,
  win: ApplicationWindow,
  alwaysOnTop: boolean,
): void {
  win.alwaysOnTop = alwaysOnTop;
  host.window.setAlwaysOnTop(win, alwaysOnTop);
}

// Prevents (or allows) the window contents from being captured in screenshots or screen sharing.
// Native hosts may implement it via the WindowBackend (for example Electron setContentProtection).
export function setWindowContentProtection(
  host: WindowOperationHost<'setContentProtection'>,
  win: ApplicationWindow,
  enabled: boolean,
): void {
  host.window.setContentProtection(win, enabled);
}

// Sets fullscreen state. Updates state and emits onFullscreenChanged when the state changes.
export function setWindowFullscreen(
  host: WindowOperationHost<'setFullscreen'>,
  win: ApplicationWindow,
  fullscreen: boolean,
): void {
  if (win.fullscreen === fullscreen) return;
  win.fullscreen = fullscreen;
  host.window.setFullscreen(win, fullscreen);
  emitSignal(win.onFullscreenChanged);
}

// Shows or hides the native drop shadow around the window when the host supports it.
export function setWindowHasShadow(
  host: WindowOperationHost<'setHasShadow'>,
  win: ApplicationWindow,
  hasShadow: boolean,
): void {
  host.window.setHasShadow(win, hasShadow);
}

// Sets the window icon (path/URL). On web this updates the page favicon.
export function setWindowIcon(host: WindowOperationHost<'setIcon'>, win: ApplicationWindow, icon: string): void {
  win.icon = icon;
  host.window.setIcon(win, icon);
}

// Sets the maximum window size in logical pixels (-1 for unbounded).
export function setWindowMaximumSize(
  host: WindowOperationHost<'setMaximumSize'>,
  win: ApplicationWindow,
  width: number,
  height: number,
): void {
  win.maxWidth = width;
  win.maxHeight = height;
  host.window.setMaximumSize(win, width, height);
}

// Shows or hides the window's menu bar when the host supports it.
export function setWindowMenuBarVisible(
  host: WindowOperationHost<'setMenuBarVisible'>,
  win: ApplicationWindow,
  visible: boolean,
): void {
  host.window.setMenuBarVisible(win, visible);
}

// Sets the minimum window size in logical pixels.
export function setWindowMinimumSize(
  host: WindowOperationHost<'setMinimumSize'>,
  win: ApplicationWindow,
  width: number,
  height: number,
): void {
  win.minWidth = width;
  win.minHeight = height;
  host.window.setMinimumSize(win, width, height);
}

// Sets the window opacity in [0, 1].
export function setWindowOpacity(
  host: WindowOperationHost<'setOpacity'>,
  win: ApplicationWindow,
  opacity: number,
): void {
  win.opacity = opacity;
  host.window.setOpacity(win, opacity);
}

// Sets the window's parent (for modal/child relationships); pass null to detach. Native hosts only.
export function setWindowParent(
  host: WindowOperationHost<'setParent'>,
  win: ApplicationWindow,
  parent: ApplicationWindow | null,
): void {
  host.window.setParent(win, parent);
}

// Moves the window's top-left to (x, y) in screen coordinates. Updates state and emits onMove.
export function setWindowPosition(
  host: WindowOperationHost<'setPosition'>,
  win: ApplicationWindow,
  x: number,
  y: number,
): void {
  win.x = x;
  win.y = y;
  host.window.setPosition(win, x, y);
  emitSignal(win.onMove);
}

// Sets the taskbar/dock progress indicator in [0, 1]; a negative value clears it.
export function setWindowProgress(
  host: WindowOperationHost<'setProgress'>,
  win: ApplicationWindow,
  progress: number,
): void {
  host.window.setProgress(win, progress);
}

// Sets whether the user can resize the window.
export function setWindowResizable(
  host: WindowOperationHost<'setResizable'>,
  win: ApplicationWindow,
  resizable: boolean,
): void {
  win.resizable = resizable;
  host.window.setResizable(win, resizable);
}

// Resizes the window to width x height (logical pixels). Updates state and emits onResize.
export function setWindowSize(
  host: WindowOperationHost<'setSize'>,
  win: ApplicationWindow,
  width: number,
  height: number,
): void {
  win.width = width;
  win.height = height;
  host.window.setSize(win, width, height);
  emitSignal(win.onResize);
}

// Sets whether the window is hidden from the taskbar/dock switcher.
export function setWindowSkipTaskbar(
  host: WindowOperationHost<'setSkipTaskbar'>,
  win: ApplicationWindow,
  skip: boolean,
): void {
  win.skipTaskbar = skip;
  host.window.setSkipTaskbar(win, skip);
}

// Sets the window title text.
export function setWindowTitle(host: WindowOperationHost<'setTitle'>, win: ApplicationWindow, title: string): void {
  win.title = title;
  host.window.setTitle(win, title);
}

// Shows a hidden window.
export function showWindow(host: WindowOperationHost<'show'>, win: ApplicationWindow): void {
  if (win.visible) return;
  win.visible = true;
  host.window.show(win);
}

// Internal teardown registry, kept off the public ApplicationWindow entity (a side table like
// input's binding map). attach/detach/dispose track cleanup closures internally so callers hold
// nothing.
const _applicationWindowObservers = new WeakMap<ApplicationWindow, Map<symbol, () => void>>();

const _terminalWindows = new WeakSet<ApplicationWindow>();
const _windowBackends = new WeakMap<ApplicationWindow, Required<Pick<WindowBackend, 'close'>>>();

function getApplicationWindowObservers(win: ApplicationWindow): Map<symbol, () => void> {
  let observers = _applicationWindowObservers.get(win);
  if (observers === undefined) {
    observers = new Map();
    _applicationWindowObservers.set(win, observers);
  }
  return observers;
}

type WindowOperationHost<Operation extends keyof WindowBackend> = {
  readonly window: Required<Pick<WindowBackend, Operation>>;
};
