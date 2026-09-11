import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { connectSignal, createSignal, disconnectSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  ApplicationWindow,
  EntityConstruction,
  FullscreenTargetHandle,
  HostRenderContextProvider,
  HostRenderSurfaceProvider,
  HostInputDropFileProvider,
  HostInputFocusProvider,
  HostInputPointerLockProvider,
  HostInputTargetProvider,
  HostFullscreenProvider,
  HostWindowProvider,
  InputPointerLockExitOutcome,
  InputPointerLockRequestOutcome,
  InputTargetHandle,
  Matrix,
  NativeWindowHandle,
  RenderState,
  WindowAttachmentOwnership,
  WindowBounds,
  WindowOptions,
  WindowResizeTargetHandle,
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
// window's current lifecycle unchanged; success pins its eventual close to this exact host provider.
export function attachWindow(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'attach' | 'close'>>>,
  win: ApplicationWindow,
  handle: NativeWindowHandle,
  ownership: WindowAttachmentOwnership,
): boolean {
  const backend = hostWindow;
  const attached = backend.attach(win, handle, ownership);
  if (attached) {
    _windowBackends.set(win, backend);
    _terminalWindows.delete(win);
  }
  return attached;
}

// Wires the host's close-request and terminal-close sources to the window's signals. A vetoed
// request is reported back to the host so it can keep the native window alive. Idempotent.
export function attachWindowClose(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'subscribeClose'>>>,
  win: ApplicationWindow,
): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kClose)?.();
  observers.set(
    kClose,
    hostWindow.subscribeClose(
      () => {
        emitSignal(win.onCloseRequest);
        return win.onCloseRequest.data?.cancelled === true;
      },
      () => notifyWindowClosed(win),
    ),
  );
}

export function attachWindowDropFile(
  hostInputDropFile: Readonly<HostInputDropFileProvider>,
  win: ApplicationWindow,
  target: InputTargetHandle,
): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kDropFile)?.();
  observers.set(
    kDropFile,
    hostInputDropFile.subscribe(target, (path) => emitSignal(win.onDropFile, path)),
  );
}

export function attachWindowFocus(
  hostInputFocus: Readonly<HostInputFocusProvider>,
  win: ApplicationWindow,
  target: InputTargetHandle,
): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kFocus)?.();
  observers.set(
    kFocus,
    hostInputFocus.subscribe(
      target,
      () => emitSignal(win.onFocusIn),
      () => emitSignal(win.onFocusOut),
    ),
  );
}

export function attachWindowFullscreen(
  hostFullscreen: Readonly<Required<Pick<HostFullscreenProvider, 'subscribe' | 'unsubscribe'>>>,
  win: ApplicationWindow,
): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kFullscreen)?.();
  const handler = (fullscreen: boolean): void => {
    win.fullscreen = fullscreen;
    emitSignal(win.onFullscreenChanged);
  };
  hostFullscreen.subscribe(handler);
  observers.set(kFullscreen, () => hostFullscreen.unsubscribe(handler));
}

// Wires host-originated window movement to the entity and its onMove signal.
export function attachWindowMove(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'subscribeMove'>>>,
  win: ApplicationWindow,
): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kMove)?.();
  observers.set(
    kMove,
    hostWindow.subscribeMove((x, y) => {
      if (win.x !== x || win.y !== y) {
        win.x = x;
        win.y = y;
        emitSignal(win.onMove);
      }
    }),
  );
}

export function attachWindowOrientation(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'subscribeOrientation'>>>,
  win: ApplicationWindow,
): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kOrientation)?.();
  observers.set(
    kOrientation,
    hostWindow.subscribeOrientation(() => emitSignal(win.onOrientationChanged)),
  );
}

export function attachWindowRenderContext(
  hostRenderContext: Readonly<HostRenderContextProvider>,
  win: ApplicationWindow,
  target: InputTargetHandle,
): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kRenderContext)?.();
  observers.set(
    kRenderContext,
    hostRenderContext.subscribe(
      target,
      () => emitSignal(win.onRenderContextLost),
      () => emitSignal(win.onRenderContextRestored),
    ),
  );
}

// Binds a canvas render state to the window's size and devicePixelRatio: sizes the canvas backing
// store and writes the device transform (renderTransform2D), then keeps both in sync on every
// onResize, so moving the window between displays or zooming is handled. Pair with attachWindowResize
// — it is the source of the size/DPI updates this reacts to. The render state must have an
// initialized renderTransform2D (every create*RenderState factory does). DOM render states need no
// device transform (the browser rasterizes DOM at device resolution), so this is for canvas/Gl.
export function attachWindowRenderState(
  hostRenderSurface: Readonly<HostRenderSurfaceProvider>,
  win: ApplicationWindow,
  state: RenderState,
  target: InputTargetHandle,
): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kRenderState)?.();
  const renderSurface = hostRenderSurface;
  const apply = (): void => {
    renderSurface.resize(
      target,
      Math.round(win.width * win.devicePixelRatio),
      Math.round(win.height * win.devicePixelRatio),
    );
    if (state.renderTransform2D !== null) computeWindowDeviceTransform(win, state.renderTransform2D);
  };
  apply();
  connectSignal(win.onResize, apply);
  observers.set(kRenderState, () => disconnectSignal(win.onResize, apply));
}

export function attachWindowResize(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'subscribeResize'>>>,
  win: ApplicationWindow,
  target: WindowResizeTargetHandle,
): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kResize)?.();
  observers.set(
    kResize,
    hostWindow.subscribeResize(target, (width, height, devicePixelRatio) => {
      win.width = width;
      win.height = height;
      win.devicePixelRatio = devicePixelRatio;
      emitSignal(win.onResize);
    }),
  );
}

export function attachWindowVisibility(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'subscribeVisibility'>>>,
  win: ApplicationWindow,
): void {
  const observers = getApplicationWindowObservers(win);
  observers.get(kVisibility)?.();
  observers.set(
    kVisibility,
    hostWindow.subscribeVisibility((visible) => {
      emitSignal(visible ? win.onActivate : win.onDeactivate);
    }),
  );
}

// Centers the window on its current display through the supplied provider.
export function centerWindow(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'center'>>>,
  win: ApplicationWindow,
): void {
  hostWindow.center(win);
}

// Closes the window. First emits onCloseRequest; if a listener vetoes (cancelSignal), the close is
// aborted and this returns false. Otherwise the origin provider closes the window, onClose fires, and it
// returns true.
export function closeWindow(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'close'>>>,
  win: ApplicationWindow,
): boolean {
  if (_terminalWindows.has(win)) return true;
  if (!requestWindowClose(win)) return false;
  (_windowBackends.get(win) ?? hostWindow).close(win);
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
  const out = allocateEntity<ApplicationWindow>();
  initializeApplicationWindow(out);
  return finishEntity(out);
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

export function exitApplicationFullscreen(hostFullscreen: Readonly<HostFullscreenProvider>): Promise<boolean> {
  return hostFullscreen.exit();
}

// Releases the host's active Pointer Lock, restoring cursor movement.
export async function exitApplicationPointerLock(
  hostInputPointerLock: Readonly<HostInputPointerLockProvider>,
): Promise<InputPointerLockExitOutcome> {
  const backend = _pointerLockBackend ?? hostInputPointerLock;
  const outcome = await backend.exit();
  if (outcome.reason === 'ok' && _pointerLockBackend === backend) _pointerLockBackend = null;
  return outcome;
}

// Briefly flashes the window frame to attract attention. Native hosts may implement it through their
// HostWindowProvider (for example Electron window.flashFrame(true)).
export function flashWindowFrame(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'flashWindowFrame'>>>,
  win: ApplicationWindow,
): void {
  hostWindow.flashWindowFrame(win);
}

// Brings the window to the foreground and marks it focused.
export function focusWindow(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'focus'>>>,
  win: ApplicationWindow,
): void {
  win.focused = true;
  hostWindow.focus(win);
}

// Fills `out` with the host window's current screen bounds and returns it.
export function getWindowBounds(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'getBounds'>>>,
  win: Readonly<ApplicationWindow>,
  out: WindowBounds,
): WindowBounds {
  return hostWindow.getBounds(win as ApplicationWindow, out);
}

// Hides the window without closing it.
export function hideWindow(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'hide'>>>,
  win: ApplicationWindow,
): void {
  if (!win.visible) return;
  win.visible = false;
  hostWindow.hide(win);
}

export function initializeApplicationWindow(out: EntityConstruction<ApplicationWindow>): void {
  out.alwaysOnTop = false;
  out.devicePixelRatio = 1;
  out.focused = false;
  out.fullscreen = false;
  out.height = 0;
  out.icon = '';
  out.maxHeight = -1;
  out.maximized = false;
  out.maxWidth = -1;
  out.minHeight = 0;
  out.minimized = false;
  out.minWidth = 0;
  out.opacity = 1;
  out.resizable = true;
  out.skipTaskbar = false;
  out.title = '';
  out.visible = true;
  out.width = 0;
  out.x = 0;
  out.y = 0;
  out.onActivate = createSignal();
  out.onClose = createSignal();
  out.onCloseRequest = createSignal();
  out.onDeactivate = createSignal();
  out.onDropFile = createSignal();
  out.onFocusIn = createSignal();
  out.onFocusOut = createSignal();
  out.onFullscreenChanged = createSignal();
  out.onMaximize = createSignal();
  out.onMinimize = createSignal();
  out.onMove = createSignal();
  out.onOrientationChanged = createSignal();
  out.onRenderContextLost = createSignal();
  out.onRenderContextRestored = createSignal();
  out.onResize = createSignal();
  out.onRestore = createSignal();
}

// Requests Pointer Lock on an opaque target, hiding and confining the cursor so raw mouse deltas are
// delivered via pointermove events. Expected target, availability, denial, and operation failures are
// returned as method-tight outcomes. Only successful acquisition pins its eventual exit to this exact
// provider even if the caller later supplies a different provider.
export async function lockApplicationPointer(
  hostInputPointerLock: Readonly<HostInputPointerLockProvider>,
  target: InputTargetHandle,
): Promise<InputPointerLockRequestOutcome> {
  const backend = hostInputPointerLock;
  const outcome = await backend.request(target);
  if (outcome.reason === 'ok') _pointerLockBackend = backend;
  return outcome;
}

// Maximizes the window. Updates state and emits onMaximize when the state changes.
export function maximizeWindow(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'maximize'>>>,
  win: ApplicationWindow,
): void {
  if (win.maximized) return;
  win.maximized = true;
  hostWindow.maximize(win);
  emitSignal(win.onMaximize);
}

// Minimizes the window. Updates state and emits onMinimize when the state changes.
export function minimizeWindow(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'minimize'>>>,
  win: ApplicationWindow,
): void {
  if (win.minimized) return;
  win.minimized = true;
  hostWindow.minimize(win);
  emitSignal(win.onMinimize);
}

// The single terminal-close choke point for both app-driven and host-driven closes. Native callbacks may
// fire synchronously inside provider.close; whichever path arrives first emits and every later path no-ops.
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
// delegating to the supplied provider. Returns whether the host opened a window. On web this configures the
// existing page-window; native hosts create a real OS window.
export function openWindow(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'close' | 'open'>>>,
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
  const backend = hostWindow;
  const result = backend.open(win, options);
  if (result) {
    _windowBackends.set(win, backend);
    _terminalWindows.delete(win);
  }
  // Apply center after open so the provider has registered the OS window before moving it.
  if (result && options.center === true) backend.center?.(win);
  return result;
}

// Prepares a provider-bound target for direct input. The provider owns platform details such as
// browser CSS and canvas compositing; the application contract only carries opaque identity.
export function prepareElementForInput(
  hostInputTarget: Readonly<HostInputTargetProvider>,
  target: InputTargetHandle,
): void {
  hostInputTarget.prepare(target);
}

export function requestApplicationFullscreen(
  hostFullscreen: Readonly<HostFullscreenProvider>,
  target: FullscreenTargetHandle,
): Promise<boolean> {
  return hostFullscreen.request(target);
}

// Requests user attention on the window (taskbar flash / dock bounce); pass false to stop.
export function requestWindowAttention(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'requestAttention'>>>,
  win: ApplicationWindow,
  attention: boolean,
): void {
  hostWindow.requestAttention(win, attention);
}

// Emits onCloseRequest and returns whether the close may proceed (false when a listener vetoed by
// calling cancelSignal(win.onCloseRequest)). Use to gate an app-driven close without closing.
export function requestWindowClose(win: ApplicationWindow): boolean {
  emitSignal(win.onCloseRequest);
  return win.onCloseRequest.data?.cancelled !== true;
}

// Restores the window from a minimized/maximized state. Emits onRestore when state changed.
export function restoreWindow(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'restore'>>>,
  win: ApplicationWindow,
): void {
  if (!win.minimized && !win.maximized) return;
  win.minimized = false;
  win.maximized = false;
  hostWindow.restore(win);
  emitSignal(win.onRestore);
}

// Sets whether the window floats above others.
export function setWindowAlwaysOnTop(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'setAlwaysOnTop'>>>,
  win: ApplicationWindow,
  alwaysOnTop: boolean,
): void {
  win.alwaysOnTop = alwaysOnTop;
  hostWindow.setAlwaysOnTop(win, alwaysOnTop);
}

// Prevents (or allows) the window contents from being captured in screenshots or screen sharing.
// Native hosts may implement it through their HostWindowProvider (for example Electron setContentProtection).
export function setWindowContentProtection(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'setContentProtection'>>>,
  win: ApplicationWindow,
  enabled: boolean,
): void {
  hostWindow.setContentProtection(win, enabled);
}

// Sets fullscreen state. Updates state and emits onFullscreenChanged when the state changes.
export function setWindowFullscreen(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'setFullscreen'>>>,
  win: ApplicationWindow,
  fullscreen: boolean,
): void {
  if (win.fullscreen === fullscreen) return;
  win.fullscreen = fullscreen;
  hostWindow.setFullscreen(win, fullscreen);
  emitSignal(win.onFullscreenChanged);
}

// Shows or hides the native drop shadow around the window when the host supports it.
export function setWindowHasShadow(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'setHasShadow'>>>,
  win: ApplicationWindow,
  hasShadow: boolean,
): void {
  hostWindow.setHasShadow(win, hasShadow);
}

// Sets the window icon (path/URL). On web this updates the page favicon.
export function setWindowIcon(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'setIcon'>>>,
  win: ApplicationWindow,
  icon: string,
): void {
  win.icon = icon;
  hostWindow.setIcon(win, icon);
}

// Sets the maximum window size in logical pixels (-1 for unbounded).
export function setWindowMaximumSize(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'setMaximumSize'>>>,
  win: ApplicationWindow,
  width: number,
  height: number,
): void {
  win.maxWidth = width;
  win.maxHeight = height;
  hostWindow.setMaximumSize(win, width, height);
}

// Shows or hides the window's menu bar when the host supports it.
export function setWindowMenuBarVisible(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'setMenuBarVisible'>>>,
  win: ApplicationWindow,
  visible: boolean,
): void {
  hostWindow.setMenuBarVisible(win, visible);
}

// Sets the minimum window size in logical pixels.
export function setWindowMinimumSize(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'setMinimumSize'>>>,
  win: ApplicationWindow,
  width: number,
  height: number,
): void {
  win.minWidth = width;
  win.minHeight = height;
  hostWindow.setMinimumSize(win, width, height);
}

// Sets the window opacity in [0, 1].
export function setWindowOpacity(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'setOpacity'>>>,
  win: ApplicationWindow,
  opacity: number,
): void {
  win.opacity = opacity;
  hostWindow.setOpacity(win, opacity);
}

// Sets the window's parent (for modal/child relationships); pass null to detach. Native hosts only.
export function setWindowParent(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'setParent'>>>,
  win: ApplicationWindow,
  parent: ApplicationWindow | null,
): void {
  hostWindow.setParent(win, parent);
}

// Moves the window's top-left to (x, y) in screen coordinates. Updates state and emits onMove.
export function setWindowPosition(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'setPosition'>>>,
  win: ApplicationWindow,
  x: number,
  y: number,
): void {
  win.x = x;
  win.y = y;
  hostWindow.setPosition(win, x, y);
  emitSignal(win.onMove);
}

// Sets the taskbar/dock progress indicator in [0, 1]; a negative value clears it.
export function setWindowProgress(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'setProgress'>>>,
  win: ApplicationWindow,
  progress: number,
): void {
  hostWindow.setProgress(win, progress);
}

// Sets whether the user can resize the window.
export function setWindowResizable(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'setResizable'>>>,
  win: ApplicationWindow,
  resizable: boolean,
): void {
  win.resizable = resizable;
  hostWindow.setResizable(win, resizable);
}

// Resizes the window to width x height (logical pixels). Updates state and emits onResize.
export function setWindowSize(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'setSize'>>>,
  win: ApplicationWindow,
  width: number,
  height: number,
): void {
  win.width = width;
  win.height = height;
  hostWindow.setSize(win, width, height);
  emitSignal(win.onResize);
}

// Sets whether the window is hidden from the taskbar/dock switcher.
export function setWindowSkipTaskbar(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'setSkipTaskbar'>>>,
  win: ApplicationWindow,
  skip: boolean,
): void {
  win.skipTaskbar = skip;
  hostWindow.setSkipTaskbar(win, skip);
}

// Sets the window title text.
export function setWindowTitle(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'setTitle'>>>,
  win: ApplicationWindow,
  title: string,
): void {
  win.title = title;
  hostWindow.setTitle(win, title);
}

// Shows a hidden window.
export function showWindow(
  hostWindow: Readonly<HostWindowProvider & Required<Pick<HostWindowProvider, 'show'>>>,
  win: ApplicationWindow,
): void {
  if (win.visible) return;
  win.visible = true;
  hostWindow.show(win);
}

// Internal teardown registry, kept off the public ApplicationWindow entity (a side table like
// input's binding map). attach/detach/dispose track cleanup closures internally so callers hold
// nothing.
const _applicationWindowObservers = new WeakMap<ApplicationWindow, Map<symbol, () => void>>();

const _terminalWindows = new WeakSet<ApplicationWindow>();
const _windowBackends = new WeakMap<ApplicationWindow, Required<Pick<HostWindowProvider, 'close'>>>();
let _pointerLockBackend: HostInputPointerLockProvider | null = null;

function getApplicationWindowObservers(win: ApplicationWindow): Map<symbol, () => void> {
  let observers = _applicationWindowObservers.get(win);
  if (observers === undefined) {
    observers = new Map();
    _applicationWindowObservers.set(win, observers);
  }
  return observers;
}
