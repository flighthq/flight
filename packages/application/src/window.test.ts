import { createEntity } from '@flighthq/entity/contract';
import { cancelSignal, connectSignal, emitSignal } from '@flighthq/signals/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import type {
  EntityWithoutRuntime,
  FullscreenBackend,
  FullscreenTargetHandle,
  HasGraphicsRenderContextSubscription,
  HasGraphicsRenderSurface,
  HasInputDropFileSubscription,
  HasInputFocusSubscription,
  HasInputPointerLock,
  InputDropFileBackend,
  InputFocusBackend,
  InputPointerLockBackend,
  InputPointerLockExitOutcome,
  InputPointerLockRequestOutcome,
  InputTargetBackend,
  InputTargetHandle,
  Matrix,
  RenderContextBackend,
  RenderState,
  RenderSurfaceBackend,
  WindowBackend,
  WindowResizeTargetHandle,
} from '@flighthq/types/contract';

import {
  attachWindow,
  attachWindowClose,
  attachWindowDropFile,
  attachWindowFocus,
  attachWindowFullscreen,
  attachWindowMove,
  attachWindowOrientation,
  attachWindowRenderContext,
  attachWindowRenderState,
  attachWindowResize,
  attachWindowVisibility,
  centerWindow,
  closeWindow,
  computeWindowDeviceTransform,
  createApplicationWindow,
  detachWindowClose,
  detachWindowDropFile,
  detachWindowFocus,
  detachWindowFullscreen,
  detachWindowMove,
  detachWindowOrientation,
  detachWindowRenderContext,
  detachWindowRenderState,
  detachWindowResize,
  detachWindowVisibility,
  disposeApplicationWindow,
  exitApplicationFullscreen,
  exitApplicationPointerLock,
  flashWindowFrame,
  focusWindow,
  getWindowBounds,
  hideWindow,
  lockApplicationPointer,
  maximizeWindow,
  minimizeWindow,
  notifyWindowClosed,
  openWindow,
  prepareElementForInput,
  requestApplicationFullscreen,
  requestWindowAttention,
  requestWindowClose,
  restoreWindow,
  setWindowAlwaysOnTop,
  setWindowContentProtection,
  setWindowFullscreen,
  setWindowHasShadow,
  setWindowIcon,
  setWindowMaximumSize,
  setWindowMenuBarVisible,
  setWindowMinimumSize,
  setWindowOpacity,
  setWindowParent,
  setWindowPosition,
  setWindowProgress,
  setWindowResizable,
  setWindowSize,
  setWindowSkipTaskbar,
  setWindowTitle,
  showWindow,
} from './window';

type RecordingWindowBackend = Required<WindowBackend> & {
  readonly calls: string[];
  emitCloseRequest(): boolean;
  emitClosed(): void;
  emitMove(x: number, y: number): void;
  emitOrientation(): void;
  emitResize(width: number, height: number, devicePixelRatio: number): void;
  emitVisibility(visible: boolean): void;
};

type RecordingFullscreenBackend = Required<FullscreenBackend> & {
  readonly calls: string[];
  emit(fullscreen: boolean): void;
};

type RecordingInputDropFileBackend = InputDropFileBackend & {
  readonly calls: string[];
  emit(path: string): void;
};

type RecordingInputFocusBackend = InputFocusBackend & {
  readonly calls: string[];
  emitBlur(): void;
  emitFocus(): void;
};

type RecordingInputPointerLockBackend = InputPointerLockBackend & { readonly calls: string[] };

type RecordingRenderContextBackend = RenderContextBackend & {
  readonly calls: string[];
  emitLost(): void;
  emitRestored(): void;
};

type RecordingRenderSurfaceBackend = RenderSurfaceBackend & { readonly calls: string[] };

type TestHost = {
  readonly graphics: {
    readonly renderContext: RecordingRenderContextBackend;
    readonly renderSurface: RecordingRenderSurfaceBackend;
  };
  readonly input: {
    readonly dropFile: RecordingInputDropFileBackend;
    readonly focus: RecordingInputFocusBackend;
    readonly pointerLock: RecordingInputPointerLockBackend;
  };
  readonly ui: { readonly fullscreen: RecordingFullscreenBackend };
  readonly window: RecordingWindowBackend;
};

type WindowTargetHost = HasGraphicsRenderContextSubscription &
  HasGraphicsRenderSurface &
  HasInputDropFileSubscription &
  HasInputFocusSubscription &
  HasInputPointerLock;

function makeRenderState(): RenderState {
  return { renderTransform2D: { a: 0, b: 0, c: 0, d: 0, tx: 0, ty: 0 } } as unknown as RenderState;
}

function recordingWindowBackend(): RecordingWindowBackend {
  const closeSubscriptions = new Set<{
    readonly onClose: () => void;
    readonly onCloseRequest: () => boolean;
  }>();
  const moveListeners = new Set<(x: number, y: number) => void>();
  const orientationListeners = new Set<() => void>();
  const resizeListeners = new Set<(width: number, height: number, devicePixelRatio: number) => void>();
  const visibilityListeners = new Set<(visible: boolean) => void>();
  const calls: string[] = [];
  return {
    calls,
    emitCloseRequest() {
      let cancelled = false;
      for (const subscription of closeSubscriptions) {
        if (subscription.onCloseRequest()) cancelled = true;
      }
      return cancelled;
    },
    emitClosed() {
      for (const subscription of closeSubscriptions) subscription.onClose();
    },
    emitMove(x, y) {
      for (const listener of moveListeners) listener(x, y);
    },
    emitOrientation() {
      for (const listener of orientationListeners) listener();
    },
    emitResize(width, height, devicePixelRatio) {
      for (const listener of resizeListeners) listener(width, height, devicePixelRatio);
    },
    emitVisibility(visible) {
      for (const listener of visibilityListeners) listener(visible);
    },
    attach(_win, _handle, ownership) {
      calls.push(`attach:${ownership}`);
      return true;
    },
    open(_win, options) {
      calls.push(`open:${options.title ?? ''}`);
      return true;
    },
    close() {
      calls.push('close');
    },
    setTitle(_win, title) {
      calls.push(`setTitle:${title}`);
    },
    setPosition(_win, x, y) {
      calls.push(`setPosition:${x},${y}`);
    },
    setSize(_win, width, height) {
      calls.push(`setSize:${width},${height}`);
    },
    getBounds(_win, out) {
      calls.push('getBounds');
      out.x = 1;
      out.y = 2;
      out.width = 3;
      out.height = 4;
      return out;
    },
    minimize() {
      calls.push('minimize');
    },
    maximize() {
      calls.push('maximize');
    },
    restore() {
      calls.push('restore');
    },
    focus() {
      calls.push('focus');
    },
    show() {
      calls.push('show');
    },
    hide() {
      calls.push('hide');
    },
    center() {
      calls.push('center');
    },
    setResizable(_win, resizable) {
      calls.push(`setResizable:${resizable}`);
    },
    setAlwaysOnTop(_win, alwaysOnTop) {
      calls.push(`setAlwaysOnTop:${alwaysOnTop}`);
    },
    setMinimumSize(_win, width, height) {
      calls.push(`setMinimumSize:${width},${height}`);
    },
    setMaximumSize(_win, width, height) {
      calls.push(`setMaximumSize:${width},${height}`);
    },
    setFullscreen(_win, fullscreen) {
      calls.push(`setFullscreen:${fullscreen}`);
    },
    setIcon(_win, icon) {
      calls.push(`setIcon:${icon}`);
    },
    setOpacity(_win, opacity) {
      calls.push(`setOpacity:${opacity}`);
    },
    setSkipTaskbar(_win, skip) {
      calls.push(`setSkipTaskbar:${skip}`);
    },
    setMenuBarVisible(_win, visible) {
      calls.push(`setMenuBarVisible:${visible}`);
    },
    setParent(_win, parent) {
      calls.push(`setParent:${parent === null ? 'null' : 'win'}`);
    },
    setProgress(_win, progress) {
      calls.push(`setProgress:${progress}`);
    },
    requestAttention(_win, attention) {
      calls.push(`requestAttention:${attention}`);
    },
    setContentProtection(_win, enabled) {
      calls.push(`setContentProtection:${enabled}`);
    },
    flashWindowFrame() {
      calls.push('flashWindowFrame');
    },
    setHasShadow(_win, hasShadow) {
      calls.push(`setHasShadow:${hasShadow}`);
    },
    subscribeClose(onCloseRequest, onClose) {
      const subscription = { onClose, onCloseRequest };
      closeSubscriptions.add(subscription);
      return () => closeSubscriptions.delete(subscription);
    },
    subscribeMove(listener) {
      moveListeners.add(listener);
      return () => moveListeners.delete(listener);
    },
    subscribeOrientation(listener) {
      orientationListeners.add(listener);
      return () => orientationListeners.delete(listener);
    },
    subscribeResize(_target, listener) {
      resizeListeners.add(listener);
      return () => resizeListeners.delete(listener);
    },
    subscribeVisibility(listener) {
      visibilityListeners.add(listener);
      return () => visibilityListeners.delete(listener);
    },
  };
}

function createInputTarget(): InputTargetHandle {
  return createEntity({ __brand: 'InputTargetHandle' as const });
}

function createWindowResizeTarget(): WindowResizeTargetHandle {
  return createEntity({ __brand: 'WindowResizeTargetHandle' as const });
}

function recordingFullscreenBackend(): RecordingFullscreenBackend {
  const callbacks = new Set<(fullscreen: boolean) => void>();
  const calls: string[] = [];
  return {
    calls,
    emit(fullscreen) {
      for (const callback of callbacks) callback(fullscreen);
    },
    async exit() {
      calls.push('exit');
      return true;
    },
    async request() {
      calls.push('request');
      return true;
    },
    subscribe(callback) {
      calls.push('subscribe');
      callbacks.add(callback);
    },
    unsubscribe(callback) {
      calls.push('unsubscribe');
      callbacks.delete(callback);
    },
  };
}

function recordingInputDropFileBackend(): RecordingInputDropFileBackend {
  let listener: ((path: string) => void) | null = null;
  const calls: string[] = [];
  return createEntity<EntityWithoutRuntime<RecordingInputDropFileBackend>>({
    calls,
    emit(path: string) {
      listener?.(path);
    },
    subscribe(_target: InputTargetHandle, next: (path: string) => void) {
      calls.push('subscribe');
      listener = next;
      return () => {
        calls.push('release');
        if (listener === next) listener = null;
      };
    },
  });
}

function recordingInputFocusBackend(): RecordingInputFocusBackend {
  let onBlur: (() => void) | null = null;
  let onFocus: (() => void) | null = null;
  const calls: string[] = [];
  return createEntity<EntityWithoutRuntime<RecordingInputFocusBackend>>({
    calls,
    emitBlur() {
      onBlur?.();
    },
    emitFocus() {
      onFocus?.();
    },
    subscribe(_target: InputTargetHandle, nextFocus: () => void, nextBlur: () => void) {
      calls.push('subscribe');
      onFocus = nextFocus;
      onBlur = nextBlur;
      return () => {
        calls.push('release');
        if (onFocus === nextFocus) onFocus = null;
        if (onBlur === nextBlur) onBlur = null;
      };
    },
  });
}

function recordingInputPointerLockBackend(): RecordingInputPointerLockBackend {
  const calls: string[] = [];
  return createEntity<EntityWithoutRuntime<RecordingInputPointerLockBackend>>({
    calls,
    async exit() {
      calls.push('exit');
      return { reason: 'ok' };
    },
    async request(_target: InputTargetHandle) {
      calls.push('request');
      return { reason: 'ok' };
    },
  });
}

function recordingRenderContextBackend(): RecordingRenderContextBackend {
  let onLost: (() => void) | null = null;
  let onRestored: (() => void) | null = null;
  const calls: string[] = [];
  return createEntity<EntityWithoutRuntime<RecordingRenderContextBackend>>({
    calls,
    emitLost() {
      onLost?.();
    },
    emitRestored() {
      onRestored?.();
    },
    subscribe(_target: InputTargetHandle, nextLost: () => void, nextRestored: () => void) {
      calls.push('subscribe');
      onLost = nextLost;
      onRestored = nextRestored;
      return () => {
        calls.push('release');
        if (onLost === nextLost) onLost = null;
        if (onRestored === nextRestored) onRestored = null;
      };
    },
  });
}

function recordingRenderSurfaceBackend(): RecordingRenderSurfaceBackend {
  const calls: string[] = [];
  return createEntity<EntityWithoutRuntime<RecordingRenderSurfaceBackend>>({
    calls,
    resize(_target: InputTargetHandle, width: number, height: number) {
      calls.push(`resize:${width},${height}`);
    },
  });
}

function createTestHost(windowBackend: RecordingWindowBackend = recordingWindowBackend()): TestHost {
  return {
    graphics: { renderContext: recordingRenderContextBackend(), renderSurface: recordingRenderSurfaceBackend() },
    input: {
      dropFile: recordingInputDropFileBackend(),
      focus: recordingInputFocusBackend(),
      pointerLock: recordingInputPointerLockBackend(),
    },
    ui: { fullscreen: recordingFullscreenBackend() },
    window: windowBackend,
  };
}

let host: TestHost;

beforeEach(() => {
  host = createTestHost();
});

describe('attachWindow', () => {
  it('attaches an existing handle without creating an Application and preserves identity', () => {
    const backend = recordingWindowBackend();
    const seen: { handle: unknown; win: unknown }[] = [];
    backend.attach = (win, handle) => {
      seen.push({ handle, win });
      return true;
    };
    host = createTestHost(backend);
    const win = createApplicationWindow();
    const handle = { id: 41 };

    expect(attachWindow(host, win, handle, 'host')).toBe(true);
    expect(seen).toEqual([{ handle, win }]);
  });

  it('uses one explicit host for two independently attached windows', () => {
    const backend = recordingWindowBackend();
    const attached: unknown[] = [];
    const closed: unknown[] = [];
    backend.attach = (win) => {
      attached.push(win);
      return true;
    };
    backend.close = (win) => closed.push(win);
    host = createTestHost(backend);
    const first = createApplicationWindow();
    const second = createApplicationWindow();

    expect(attachWindow(host, first, { id: 1 }, 'host')).toBe(true);
    expect(attachWindow(host, second, { id: 2 }, 'flight')).toBe(true);
    expect(attached).toEqual([first, second]);
    expect(closeWindow(host, first)).toBe(true);
    expect(closeWindow(host, first)).toBe(true);
    expect(closed).toEqual([first]);
  });

  it('emits one terminal close when a synchronous native callback and closeWindow converge', () => {
    const backend = recordingWindowBackend();
    backend.close = (win) => notifyWindowClosed(win);
    host = createTestHost(backend);
    const win = createApplicationWindow();
    let closed = 0;
    let forwarded = 0;
    connectSignal(win.onClose, () => closed++);
    connectSignal(win.onFullscreenChanged, () => forwarded++);
    expect(attachWindow(host, win, { id: 1 }, 'flight')).toBe(true);
    attachWindowFullscreen(host, win);

    expect(closeWindow(host, win)).toBe(true);
    notifyWindowClosed(win);
    host.ui.fullscreen.emit(true);
    expect(closed).toBe(1);
    expect(forwarded).toBe(0);
  });

  it('clears terminal state after the same window successfully reattaches', () => {
    const backend = recordingWindowBackend();
    host = createTestHost(backend);
    const win = createApplicationWindow();
    let closed = 0;
    connectSignal(win.onClose, () => closed++);

    expect(attachWindow(host, win, { id: 1 }, 'host')).toBe(true);
    expect(closeWindow(host, win)).toBe(true);
    expect(attachWindow(host, win, { id: 1 }, 'host')).toBe(true);
    expect(closeWindow(host, win)).toBe(true);
    expect(closed).toBe(2);
  });

  it('pins close to the host that attached the window', () => {
    const origin = createTestHost();
    const active = createTestHost();
    const win = createApplicationWindow();

    expect(attachWindow(origin, win, { id: 1 }, 'host')).toBe(true);
    expect(closeWindow(active, win)).toBe(true);

    expect(origin.window.calls).toEqual(['attach:host', 'close']);
    expect(active.window.calls).toEqual([]);
  });
});

describe('attachWindowClose', () => {
  it('emits onClose when the host reports a terminal close', () => {
    const win = createApplicationWindow();
    let closed = false;
    connectSignal(win.onClose, () => {
      closed = true;
    });
    attachWindowClose(host, win);
    host.window.emitClosed();
    expect(closed).toBe(true);
  });

  it('emits onCloseRequest and reports whether it was cancelled to the host', () => {
    const win = createApplicationWindow();
    let requested = false;
    connectSignal(win.onCloseRequest, () => {
      requested = true;
      cancelSignal(win.onCloseRequest);
    });
    attachWindowClose(host, win);

    expect(host.window.emitCloseRequest()).toBe(true);
    expect(requested).toBe(true);
  });
});

describe('attachWindowDropFile', () => {
  it('forwards host-emitted paths to onDropFile', () => {
    const win = createApplicationWindow();
    let received: string | null = null;
    connectSignal(win.onDropFile, (path) => {
      received = path;
    });
    attachWindowDropFile(host, win, createInputTarget());
    host.input.dropFile.emit('test.png');

    expect(received).toBe('test.png');
  });

  it('releases the origin provider before attaching a replacement provider', () => {
    const origin = createTestHost();
    const replacement = createTestHost();
    const win = createApplicationWindow();
    const target = createInputTarget();

    attachWindowDropFile(origin, win, target);
    attachWindowDropFile(replacement, win, target);
    detachWindowDropFile(win);

    expect(origin.input.dropFile.calls).toEqual(['subscribe', 'release']);
    expect(replacement.input.dropFile.calls).toEqual(['subscribe', 'release']);
  });
});

describe('attachWindowFocus', () => {
  it('emits onFocusIn from host focus ingress', () => {
    const win = createApplicationWindow();
    let called = false;
    connectSignal(win.onFocusIn, () => {
      called = true;
    });
    attachWindowFocus(host, win, createInputTarget());
    host.input.focus.emitFocus();
    expect(called).toBe(true);
  });

  it('emits onFocusOut from host blur ingress', () => {
    const win = createApplicationWindow();
    let called = false;
    connectSignal(win.onFocusOut, () => {
      called = true;
    });
    attachWindowFocus(host, win, createInputTarget());
    host.input.focus.emitBlur();
    expect(called).toBe(true);
  });

  it('releases the origin provider before attaching a replacement provider', () => {
    const origin = createTestHost();
    const replacement = createTestHost();
    const win = createApplicationWindow();
    const target = createInputTarget();

    attachWindowFocus(origin, win, target);
    attachWindowFocus(replacement, win, target);
    detachWindowFocus(win);

    expect(origin.input.focus.calls).toEqual(['subscribe', 'release']);
    expect(replacement.input.focus.calls).toEqual(['subscribe', 'release']);
  });
});

describe('attachWindowFullscreen', () => {
  it('mirrors subscribed fullscreen state and emits onFullscreenChanged', () => {
    const win = createApplicationWindow();
    let called = false;
    connectSignal(win.onFullscreenChanged, () => {
      called = true;
    });
    attachWindowFullscreen(host, win);
    host.ui.fullscreen.emit(true);
    expect(win.fullscreen).toBe(true);
    expect(called).toBe(true);
    expect(host.ui.fullscreen.calls).toEqual(['subscribe']);
  });
});

describe('attachWindowMove', () => {
  it('emits onMove and updates position when the host position changes', () => {
    const win = createApplicationWindow();
    win.x = 0;
    win.y = 0;
    let moved = false;
    connectSignal(win.onMove, () => {
      moved = true;
    });

    attachWindowMove(host, win);
    host.window.emitMove(100, 200);

    expect(moved).toBe(true);
    expect(win.x).toBe(100);
    expect(win.y).toBe(200);
  });

  it('does not emit onMove when position has not changed', () => {
    const win = createApplicationWindow();
    win.x = 50;
    win.y = 50;
    let moved = false;
    connectSignal(win.onMove, () => {
      moved = true;
    });

    attachWindowMove(host, win);
    host.window.emitMove(50, 50);

    expect(moved).toBe(false);
  });
});

describe('attachWindowOrientation', () => {
  it('emits onOrientationChanged on change', () => {
    const win = createApplicationWindow();
    let called = false;
    connectSignal(win.onOrientationChanged, () => {
      called = true;
    });

    attachWindowOrientation(host, win);
    host.window.emitOrientation();
    expect(called).toBe(true);
  });
});

describe('attachWindowRenderContext', () => {
  it('emits onRenderContextLost from host render-context ingress', () => {
    const win = createApplicationWindow();
    let called = false;
    connectSignal(win.onRenderContextLost, () => {
      called = true;
    });
    attachWindowRenderContext(host, win, createInputTarget());
    host.graphics.renderContext.emitLost();
    expect(called).toBe(true);
  });

  it('emits onRenderContextRestored from host render-context ingress', () => {
    const win = createApplicationWindow();
    let called = false;
    connectSignal(win.onRenderContextRestored, () => {
      called = true;
    });
    attachWindowRenderContext(host, win, createInputTarget());
    host.graphics.renderContext.emitRestored();
    expect(called).toBe(true);
  });

  it('releases the origin provider before attaching a replacement provider', () => {
    const origin = createTestHost();
    const replacement = createTestHost();
    const win = createApplicationWindow();
    const target = createInputTarget();

    attachWindowRenderContext(origin, win, target);
    attachWindowRenderContext(replacement, win, target);
    detachWindowRenderContext(win);

    expect(origin.graphics.renderContext.calls).toEqual(['subscribe', 'release']);
    expect(replacement.graphics.renderContext.calls).toEqual(['subscribe', 'release']);
  });
});

describe('attachWindowRenderState', () => {
  it('sizes the opaque render surface and writes the device transform from the window', () => {
    const win = createApplicationWindow();
    win.width = 800;
    win.height = 600;
    win.devicePixelRatio = 2;
    const state = makeRenderState();
    attachWindowRenderState(host, win, state, createInputTarget());
    expect(host.graphics.renderSurface.calls).toEqual(['resize:1600,1200']);
    expect(state.renderTransform2D?.a).toBe(2);
    expect(state.renderTransform2D?.d).toBe(2);
  });

  it('keeps onResize core-owned while reapplying the backing size and transform', () => {
    const win = createApplicationWindow();
    win.width = 800;
    win.height = 600;
    win.devicePixelRatio = 1;
    const state = makeRenderState();
    attachWindowRenderState(host, win, state, createInputTarget());
    win.width = 400;
    win.devicePixelRatio = 2;
    emitSignal(win.onResize);
    expect(host.graphics.renderSurface.calls).toEqual(['resize:800,600', 'resize:800,1200']);
    expect(state.renderTransform2D?.a).toBe(2);
  });

  it('pins resize commands to the provider captured by the core signal attachment', () => {
    const origin = createTestHost();
    const active = createTestHost();
    const win = createApplicationWindow();
    win.width = 320;
    win.height = 200;
    const state = makeRenderState();

    attachWindowRenderState(origin, win, state, createInputTarget());
    host = active;
    win.width = 640;
    emitSignal(win.onResize);

    expect(origin.graphics.renderSurface.calls).toEqual(['resize:320,200', 'resize:640,200']);
    expect(active.graphics.renderSurface.calls).toEqual([]);
  });

  it('composes the five retained seams as explicit trait intersections', async () => {
    const targetHost = createTestHost();
    const composedHost: WindowTargetHost = targetHost;
    const target = createInputTarget();
    const win = createApplicationWindow();

    attachWindowDropFile(composedHost, win, target);
    attachWindowFocus(composedHost, win, target);
    attachWindowRenderContext(composedHost, win, target);
    attachWindowRenderState(composedHost, win, makeRenderState(), target);
    await lockApplicationPointer(composedHost, target);

    expect(targetHost.input.dropFile.calls).toEqual(['subscribe']);
    expect(targetHost.input.focus.calls).toEqual(['subscribe']);
    expect(targetHost.graphics.renderContext.calls).toEqual(['subscribe']);
    expect(targetHost.graphics.renderSurface.calls).toEqual(['resize:0,0']);
    expect(targetHost.input.pointerLock.calls).toEqual(['request']);
    await exitApplicationPointerLock(targetHost);
  });
});

describe('attachWindowResize', () => {
  it('emits onResize and updates dimensions', () => {
    const win = createApplicationWindow();
    let called = false;
    connectSignal(win.onResize, () => {
      called = true;
    });

    attachWindowResize(host, win, createWindowResizeTarget());
    host.window.emitResize(1280, 720, 2);

    expect(called).toBe(true);
    expect(win.width).toBe(1280);
    expect(win.height).toBe(720);
    expect(win.devicePixelRatio).toBe(2);
  });

  it('replaces a previous observer when called again', () => {
    const win = createApplicationWindow();
    let resized = 0;
    connectSignal(win.onResize, () => resized++);
    attachWindowResize(host, win, createWindowResizeTarget());
    attachWindowResize(host, win, createWindowResizeTarget());

    host.window.emitResize(320, 240, 1);
    expect(resized).toBe(1);
    expect(win.width).toBe(320);
    expect(win.height).toBe(240);
  });
});

describe('attachWindowVisibility', () => {
  it('emits onDeactivate when page is hidden', () => {
    const win = createApplicationWindow();
    let called = false;
    connectSignal(win.onDeactivate, () => {
      called = true;
    });

    attachWindowVisibility(host, win);
    host.window.emitVisibility(false);

    expect(called).toBe(true);
  });

  it('emits onActivate when page becomes visible', () => {
    const win = createApplicationWindow();
    let called = false;
    connectSignal(win.onActivate, () => {
      called = true;
    });

    attachWindowVisibility(host, win);
    host.window.emitVisibility(true);

    expect(called).toBe(true);
  });
});

describe('centerWindow', () => {
  it('delegates to the backend', () => {
    const backend = recordingWindowBackend();
    host = createTestHost(backend);
    centerWindow(host, createApplicationWindow());
    expect(backend.calls).toContain('center');
  });
});

describe('closeWindow', () => {
  it('closes and emits onClose when not vetoed', () => {
    const backend = recordingWindowBackend();
    host = createTestHost(backend);
    const win = createApplicationWindow();
    let closed = false;
    connectSignal(win.onClose, () => {
      closed = true;
    });
    expect(closeWindow(host, win)).toBe(true);
    expect(backend.calls).toContain('close');
    expect(closed).toBe(true);
  });

  it('aborts and returns false when a listener vetoes', () => {
    const backend = recordingWindowBackend();
    host = createTestHost(backend);
    const win = createApplicationWindow();
    connectSignal(win.onCloseRequest, () => cancelSignal(win.onCloseRequest));
    expect(closeWindow(host, win)).toBe(false);
    expect(backend.calls).not.toContain('close');
  });

  it('closes terminal state once when called repeatedly', () => {
    const win = createApplicationWindow();
    let closed = 0;
    connectSignal(win.onClose, () => closed++);

    expect(closeWindow(host, win)).toBe(true);
    expect(closeWindow(host, win)).toBe(true);

    expect(closed).toBe(1);
    expect(host.window.calls).toEqual(['close']);
  });
});

describe('computeWindowDeviceTransform', () => {
  it('writes a uniform devicePixelRatio scale into out and returns it', () => {
    const win = createApplicationWindow();
    win.devicePixelRatio = 3;
    const out = { a: 0, b: 0, c: 0, d: 0, tx: 9, ty: 9 } as unknown as Matrix;
    const result = computeWindowDeviceTransform(win, out);
    expect(result).toBe(out);
    expect(out.a).toBe(3);
    expect(out.d).toBe(3);
    expect(out.b).toBe(0);
    expect(out.c).toBe(0);
    expect(out.tx).toBe(0);
    expect(out.ty).toBe(0);
  });

  it('overwrites every field when out already carries stale values (read-before-write)', () => {
    const win = createApplicationWindow();
    win.devicePixelRatio = 2;
    // out's only input is win (a different object), so out cannot alias an input here; this asserts
    // the read-before-write guarantee by handing the function a fully-populated out it must clobber.
    const out = { a: 99, b: 99, c: 99, d: 99, tx: 99, ty: 99 } as unknown as Matrix;
    const result = computeWindowDeviceTransform(win, out);
    expect(result).toBe(out);
    expect(out.a).toBe(2);
    expect(out.b).toBe(0);
    expect(out.c).toBe(0);
    expect(out.d).toBe(2);
    expect(out.tx).toBe(0);
    expect(out.ty).toBe(0);
  });
});

describe('createApplicationWindow', () => {
  it('returns all signals with no side effects', () => {
    const win = createApplicationWindow();
    expect(EntityRuntimeKey in win).toBe(true);
    expect(win.onActivate).toBeDefined();
    expect(win.onClose).toBeDefined();
    expect(win.onDeactivate).toBeDefined();
    expect(win.onDropFile).toBeDefined();
    expect(win.onFocusIn).toBeDefined();
    expect(win.onFocusOut).toBeDefined();
    expect(win.onFullscreenChanged).toBeDefined();
    expect(win.onMaximize).toBeDefined();
    expect(win.onMinimize).toBeDefined();
    expect(win.onMove).toBeDefined();
    expect(win.onOrientationChanged).toBeDefined();
    expect(win.onRenderContextLost).toBeDefined();
    expect(win.onRenderContextRestored).toBeDefined();
    expect(win.onResize).toBeDefined();
    expect(win.onRestore).toBeDefined();

    let called = false;
    connectSignal(win.onFullscreenChanged, () => {
      called = true;
    });
    host.ui.fullscreen.emit(true);
    expect(called).toBe(false);
  });

  it('initializes dimensions and devicePixelRatio to defaults', () => {
    const win = createApplicationWindow();
    expect(win.width).toBe(0);
    expect(win.height).toBe(0);
    expect(win.devicePixelRatio).toBe(1);
  });
});

describe('detachWindowClose', () => {
  it('stops emitting onClose after detach', () => {
    const win = createApplicationWindow();
    let closed = false;
    connectSignal(win.onClose, () => {
      closed = true;
    });
    attachWindowClose(host, win);
    detachWindowClose(win);
    host.window.emitClosed();
    expect(closed).toBe(false);
  });
});

describe('detachWindowDropFile', () => {
  it('releases the host subscription', () => {
    const win = createApplicationWindow();
    let called = false;
    connectSignal(win.onDropFile, () => {
      called = true;
    });
    attachWindowDropFile(host, win, createInputTarget());
    detachWindowDropFile(win);
    host.input.dropFile.emit('ignored.txt');

    expect(called).toBe(false);
    expect(host.input.dropFile.calls).toEqual(['subscribe', 'release']);
  });
});

describe('detachWindowFocus', () => {
  it('releases both host event paths', () => {
    const win = createApplicationWindow();
    let called = false;
    connectSignal(win.onFocusIn, () => {
      called = true;
    });
    attachWindowFocus(host, win, createInputTarget());
    detachWindowFocus(win);
    host.input.focus.emitFocus();
    expect(called).toBe(false);
    expect(host.input.focus.calls).toEqual(['subscribe', 'release']);
  });
});

describe('detachWindowFullscreen', () => {
  it('removes the listener', () => {
    const win = createApplicationWindow();
    let called = false;
    connectSignal(win.onFullscreenChanged, () => {
      called = true;
    });
    attachWindowFullscreen(host, win);
    detachWindowFullscreen(win);
    host.ui.fullscreen.emit(true);
    expect(called).toBe(false);
    expect(host.ui.fullscreen.calls).toEqual(['subscribe', 'unsubscribe']);
  });
});

describe('detachWindowMove', () => {
  it('removes the listener so onMove no longer fires', () => {
    const win = createApplicationWindow();
    win.x = 0;
    let moved = false;
    connectSignal(win.onMove, () => {
      moved = true;
    });

    attachWindowMove(host, win);
    detachWindowMove(win);
    host.window.emitMove(100, 100);

    expect(moved).toBe(false);
  });
});

describe('detachWindowOrientation', () => {
  it('removes the listener', () => {
    const win = createApplicationWindow();
    let called = false;
    connectSignal(win.onOrientationChanged, () => {
      called = true;
    });
    attachWindowOrientation(host, win);
    detachWindowOrientation(win);
    host.window.emitOrientation();

    expect(called).toBe(false);
  });
});

describe('detachWindowRenderContext', () => {
  it('releases render-context ingress', () => {
    const win = createApplicationWindow();
    let called = false;
    connectSignal(win.onRenderContextLost, () => {
      called = true;
    });
    attachWindowRenderContext(host, win, createInputTarget());
    detachWindowRenderContext(win);
    host.graphics.renderContext.emitLost();
    expect(called).toBe(false);
    expect(host.graphics.renderContext.calls).toEqual(['subscribe', 'release']);
  });
});

describe('detachWindowRenderState', () => {
  it('stops reacting to window resize', () => {
    const win = createApplicationWindow();
    win.width = 800;
    win.height = 600;
    win.devicePixelRatio = 1;
    const state = makeRenderState();
    attachWindowRenderState(host, win, state, createInputTarget());
    detachWindowRenderState(win);
    win.width = 400;
    emitSignal(win.onResize);
    expect(host.graphics.renderSurface.calls).toEqual(['resize:800,600']);
  });
});

describe('detachWindowResize', () => {
  it('disconnects the observer', () => {
    const win = createApplicationWindow();
    attachWindowResize(host, win, createWindowResizeTarget());
    detachWindowResize(win);
    host.window.emitResize(640, 480, 2);

    expect(win.width).toBe(0);
    expect(win.height).toBe(0);
  });
});

describe('detachWindowVisibility', () => {
  it('removes the listener', () => {
    const win = createApplicationWindow();
    let called = false;
    connectSignal(win.onDeactivate, () => {
      called = true;
    });

    attachWindowVisibility(host, win);
    detachWindowVisibility(win);
    host.window.emitVisibility(false);

    expect(called).toBe(false);
  });
});

describe('disposeApplicationWindow', () => {
  it('runs all teardown so attached observers stop firing', () => {
    const win = createApplicationWindow();
    attachWindowResize(host, win, createWindowResizeTarget());
    attachWindowFullscreen(host, win);

    disposeApplicationWindow(win);

    host.window.emitResize(640, 480, 2);
    expect(win.width).toBe(0);
    let called = false;
    connectSignal(win.onFullscreenChanged, () => {
      called = true;
    });
    host.ui.fullscreen.emit(true);
    expect(called).toBe(false);
    expect(host.ui.fullscreen.calls).toEqual(['subscribe', 'unsubscribe']);
  });
});

describe('exitApplicationFullscreen', () => {
  it('delegates to the fullscreen capability', async () => {
    await expect(exitApplicationFullscreen(host)).resolves.toBe(true);
    expect(host.ui.fullscreen.calls).toEqual(['exit']);
  });
});

describe('exitApplicationPointerLock', () => {
  it('delegates to the input pointer-lock command capability', async () => {
    await expect(exitApplicationPointerLock(host)).resolves.toEqual({ reason: 'ok' });
    expect(host.input.pointerLock.calls).toEqual(['exit']);
  });

  it.each(['api-unavailable', 'operation-failed'] satisfies InputPointerLockExitOutcome['reason'][])(
    'retains the request origin after %s so exit can be retried',
    async (reason) => {
      const origin = createTestHost();
      const active = createTestHost();
      let attempts = 0;
      origin.input.pointerLock.exit = async () => {
        attempts++;
        origin.input.pointerLock.calls.push(`exit:${attempts}`);
        return attempts === 1 ? { reason } : { reason: 'ok' };
      };

      await lockApplicationPointer(origin, createInputTarget());
      await expect(exitApplicationPointerLock(active)).resolves.toEqual({ reason });
      await expect(exitApplicationPointerLock(active)).resolves.toEqual({ reason: 'ok' });

      expect(origin.input.pointerLock.calls).toEqual(['request', 'exit:1', 'exit:2']);
      expect(active.input.pointerLock.calls).toEqual([]);
    },
  );

  it('keeps backend defects visible and retains the origin for retry', async () => {
    const origin = createTestHost();
    const active = createTestHost();
    let attempts = 0;
    origin.input.pointerLock.exit = async () => {
      attempts++;
      origin.input.pointerLock.calls.push(`exit:${attempts}`);
      if (attempts === 1) throw new Error('busy');
      return { reason: 'ok' };
    };

    await lockApplicationPointer(origin, createInputTarget());
    await expect(exitApplicationPointerLock(active)).rejects.toThrow('busy');
    await expect(exitApplicationPointerLock(active)).resolves.toEqual({ reason: 'ok' });

    expect(origin.input.pointerLock.calls).toEqual(['request', 'exit:1', 'exit:2']);
    expect(active.input.pointerLock.calls).toEqual([]);
  });
});

describe('flashWindowFrame', () => {
  it('delegates to the backend', () => {
    const backend = recordingWindowBackend();
    host = createTestHost(backend);
    const win = createApplicationWindow();
    flashWindowFrame(host, win);
    expect(backend.calls).toContain('flashWindowFrame');
  });
});

describe('focusWindow', () => {
  it('marks focused and delegates to the backend', () => {
    const backend = recordingWindowBackend();
    host = createTestHost(backend);
    const win = createApplicationWindow();
    focusWindow(host, win);
    expect(win.focused).toBe(true);
    expect(backend.calls).toContain('focus');
  });
});

describe('getWindowBounds', () => {
  it('fills the out bounds from the backend', () => {
    host = createTestHost();
    const out = { x: 0, y: 0, width: 0, height: 0 };
    expect(getWindowBounds(host, createApplicationWindow(), out)).toBe(out);
    expect(out.width).toBe(3);
    expect(host.window.calls).toEqual(['getBounds']);
  });
});

describe('hideWindow', () => {
  it('marks not visible and delegates to the backend', () => {
    const backend = recordingWindowBackend();
    host = createTestHost(backend);
    const win = createApplicationWindow();
    hideWindow(host, win);
    expect(win.visible).toBe(false);
    expect(backend.calls).toContain('hide');
  });
});

describe('lockApplicationPointer', () => {
  it('passes the opaque target to the pointer-lock command capability', async () => {
    const target = createInputTarget();
    await expect(lockApplicationPointer(host, target)).resolves.toEqual({ reason: 'ok' });
    expect(host.input.pointerLock.calls).toEqual(['request']);
    await exitApplicationPointerLock(host);
  });

  it('exits through the successful request origin after a different host becomes active', async () => {
    const origin = createTestHost();
    const active = createTestHost();

    await lockApplicationPointer(origin, createInputTarget());
    await exitApplicationPointerLock(active);

    expect(origin.input.pointerLock.calls).toEqual(['request', 'exit']);
    expect(active.input.pointerLock.calls).toEqual([]);
  });

  it.each([
    'api-unavailable',
    'denied',
    'operation-failed',
    'target-not-found',
  ] satisfies InputPointerLockRequestOutcome['reason'][])(
    'does not replace a successful origin after %s',
    async (reason) => {
      const origin = createTestHost();
      const declined = createTestHost();
      const active = createTestHost();
      declined.input.pointerLock.request = async () => {
        declined.input.pointerLock.calls.push(`request:${reason}`);
        return { reason };
      };

      await lockApplicationPointer(origin, createInputTarget());
      await expect(lockApplicationPointer(declined, createInputTarget())).resolves.toEqual({ reason });
      await exitApplicationPointerLock(active);

      expect(origin.input.pointerLock.calls).toEqual(['request', 'exit']);
      expect(declined.input.pointerLock.calls).toEqual([`request:${reason}`]);
      expect(active.input.pointerLock.calls).toEqual([]);
    },
  );

  it('keeps backend defects visible without replacing a successful origin', async () => {
    const origin = createTestHost();
    const rejected = createTestHost();
    const active = createTestHost();
    rejected.input.pointerLock.request = async () => {
      rejected.input.pointerLock.calls.push('request:rejected');
      throw new Error('defect');
    };

    await lockApplicationPointer(origin, createInputTarget());
    await expect(lockApplicationPointer(rejected, createInputTarget())).rejects.toThrow('defect');
    await exitApplicationPointerLock(active);

    expect(origin.input.pointerLock.calls).toEqual(['request', 'exit']);
    expect(rejected.input.pointerLock.calls).toEqual(['request:rejected']);
    expect(active.input.pointerLock.calls).toEqual([]);
  });

  it('replaces the request origin only after a later success', async () => {
    const origin = createTestHost();
    const replacement = createTestHost();
    const active = createTestHost();

    await lockApplicationPointer(origin, createInputTarget());
    await lockApplicationPointer(replacement, createInputTarget());
    await exitApplicationPointerLock(active);

    expect(origin.input.pointerLock.calls).toEqual(['request']);
    expect(replacement.input.pointerLock.calls).toEqual(['request', 'exit']);
    expect(active.input.pointerLock.calls).toEqual([]);
  });
});

describe('maximizeWindow', () => {
  it('sets maximized and emits onMaximize once', () => {
    const backend = recordingWindowBackend();
    host = createTestHost(backend);
    const win = createApplicationWindow();
    let count = 0;
    connectSignal(win.onMaximize, () => count++);
    maximizeWindow(host, win);
    maximizeWindow(host, win);
    expect(win.maximized).toBe(true);
    expect(count).toBe(1);
    expect(backend.calls).toContain('maximize');
  });
});

describe('minimizeWindow', () => {
  it('sets minimized and emits onMinimize', () => {
    const backend = recordingWindowBackend();
    host = createTestHost(backend);
    const win = createApplicationWindow();
    let called = false;
    connectSignal(win.onMinimize, () => {
      called = true;
    });
    minimizeWindow(host, win);
    expect(win.minimized).toBe(true);
    expect(called).toBe(true);
  });
});

describe('notifyWindowClosed', () => {
  it('emits once before draining application observers, then remains idempotent', () => {
    const win = createApplicationWindow();
    const order: string[] = [];
    let forwarded = 0;
    connectSignal(win.onFullscreenChanged, () => forwarded++);
    attachWindowFullscreen(host, win);
    connectSignal(win.onClose, () => {
      order.push('close');
      host.ui.fullscreen.emit(true);
      order.push(`observer:${forwarded}`);
    });

    notifyWindowClosed(win);
    host.ui.fullscreen.emit(true);
    notifyWindowClosed(win);

    expect(order).toEqual(['close', 'observer:1']);
    expect(forwarded).toBe(1);
  });

  it('still drains application observers when a terminal listener throws', () => {
    const win = createApplicationWindow();
    let forwarded = 0;
    connectSignal(win.onFullscreenChanged, () => forwarded++);
    attachWindowFullscreen(host, win);
    connectSignal(win.onClose, () => {
      throw new Error('close listener failed');
    });

    expect(() => notifyWindowClosed(win)).toThrow('close listener failed');
    host.ui.fullscreen.emit(true);
    expect(() => notifyWindowClosed(win)).not.toThrow();

    expect(forwarded).toBe(0);
  });
});

describe('openWindow', () => {
  it('applies options to the entity and delegates to the backend', () => {
    const backend = recordingWindowBackend();
    host = createTestHost(backend);
    const win = createApplicationWindow();
    expect(openWindow(host, win, { title: 'Game', width: 640, height: 480, alwaysOnTop: true })).toBe(true);
    expect(win.title).toBe('Game');
    expect(win.width).toBe(640);
    expect(win.alwaysOnTop).toBe(true);
    expect(backend.calls).toContain('open:Game');
  });

  it('centers the window after open when center option is true', () => {
    const backend = recordingWindowBackend();
    host = createTestHost(backend);
    const win = createApplicationWindow();
    openWindow(host, win, { title: 'Centered', center: true });
    expect(backend.calls.filter((call) => call === 'center')).toHaveLength(1);
  });

  it('does not center when center option is not set', () => {
    const backend = recordingWindowBackend();
    host = createTestHost(backend);
    const win = createApplicationWindow();
    openWindow(host, win, { title: 'Normal' });
    expect(backend.calls).not.toContain('center');
  });

  it('re-arms terminal close and observer disposal after a successful reopen', () => {
    const backend = recordingWindowBackend();
    host = createTestHost(backend);
    const win = createApplicationWindow();
    let closed = 0;
    let forwarded = 0;
    connectSignal(win.onClose, () => closed++);
    connectSignal(win.onFullscreenChanged, () => forwarded++);

    expect(openWindow(host, win)).toBe(true);
    attachWindowFullscreen(host, win);
    expect(closeWindow(host, win)).toBe(true);
    host.ui.fullscreen.emit(true);
    expect(forwarded).toBe(0);

    expect(openWindow(host, win)).toBe(true);
    attachWindowFullscreen(host, win);
    host.ui.fullscreen.emit(true);
    expect(forwarded).toBe(1);
    expect(closeWindow(host, win)).toBe(true);
    host.ui.fullscreen.emit(true);

    expect(closed).toBe(2);
    expect(forwarded).toBe(1);
  });

  it('releases through the origin host after a different host becomes active', () => {
    const calls: string[] = [];
    const origin = createTestHost();
    origin.window.close = () => {
      calls.push('origin:close');
    };
    origin.window.open = () => {
      calls.push('origin:open');
      return true;
    };
    const active = createTestHost();
    active.window.close = () => {
      calls.push('active:close');
    };
    const win = createApplicationWindow();
    let closed = 0;
    connectSignal(win.onClose, () => closed++);

    expect(openWindow(origin, win)).toBe(true);
    expect(closeWindow(active, win)).toBe(true);

    expect(calls).toEqual(['origin:open', 'origin:close']);
    expect(closed).toBe(1);
  });
});

describe('prepareElementForInput', () => {
  it('passes the opaque target to the explicit input preparation capability', () => {
    const prepare = vi.fn();
    const backend = createEntity<{ prepare: typeof prepare }>({ prepare }) satisfies InputTargetBackend;
    const target: InputTargetHandle = createEntity({ __brand: 'InputTargetHandle' as const });

    prepareElementForInput({ input: { target: backend } }, target);

    expect(prepare).toHaveBeenCalledOnce();
    expect(prepare).toHaveBeenCalledWith(target);
  });
});

describe('requestApplicationFullscreen', () => {
  it('passes the opaque target to the fullscreen capability', async () => {
    const target: FullscreenTargetHandle = createEntity({ __brand: 'FullscreenTargetHandle' as const });
    await expect(requestApplicationFullscreen(host, target)).resolves.toBe(true);
    expect(host.ui.fullscreen.calls).toEqual(['request']);
  });
});

describe('requestWindowAttention', () => {
  it('delegates to the backend', () => {
    const backend = recordingWindowBackend();
    host = createTestHost(backend);
    requestWindowAttention(host, createApplicationWindow(), true);
    expect(backend.calls).toContain('requestAttention:true');
  });
});

describe('requestWindowClose', () => {
  it('returns true when not vetoed', () => {
    host = createTestHost();
    expect(requestWindowClose(createApplicationWindow())).toBe(true);
  });

  it('returns false when a listener vetoes', () => {
    const win = createApplicationWindow();
    connectSignal(win.onCloseRequest, () => cancelSignal(win.onCloseRequest));
    expect(requestWindowClose(win)).toBe(false);
  });
});

describe('restoreWindow', () => {
  it('clears minimized/maximized and emits onRestore', () => {
    const backend = recordingWindowBackend();
    host = createTestHost(backend);
    const win = createApplicationWindow();
    maximizeWindow(host, win);
    let restored = false;
    connectSignal(win.onRestore, () => {
      restored = true;
    });
    restoreWindow(host, win);
    expect(win.maximized).toBe(false);
    expect(restored).toBe(true);
    expect(backend.calls).toContain('restore');
  });
});

describe('setWindowAlwaysOnTop', () => {
  it('sets state and delegates', () => {
    const backend = recordingWindowBackend();
    host = createTestHost(backend);
    const win = createApplicationWindow();
    setWindowAlwaysOnTop(host, win, true);
    expect(win.alwaysOnTop).toBe(true);
    expect(backend.calls).toContain('setAlwaysOnTop:true');
  });
});

describe('setWindowContentProtection', () => {
  it('delegates to the backend', () => {
    const backend = recordingWindowBackend();
    host = createTestHost(backend);
    const win = createApplicationWindow();
    setWindowContentProtection(host, win, true);
    expect(backend.calls).toContain('setContentProtection:true');
  });
});

describe('setWindowFullscreen', () => {
  it('sets state and emits onFullscreenChanged once', () => {
    const backend = recordingWindowBackend();
    host = createTestHost(backend);
    const win = createApplicationWindow();
    let count = 0;
    connectSignal(win.onFullscreenChanged, () => count++);
    setWindowFullscreen(host, win, true);
    setWindowFullscreen(host, win, true);
    expect(win.fullscreen).toBe(true);
    expect(count).toBe(1);
  });
});

describe('setWindowHasShadow', () => {
  it('delegates to the backend', () => {
    const backend = recordingWindowBackend();
    host = createTestHost(backend);
    const win = createApplicationWindow();
    setWindowHasShadow(host, win, false);
    expect(backend.calls).toContain('setHasShadow:false');
  });
});

describe('setWindowIcon', () => {
  it('sets the icon and delegates', () => {
    const backend = recordingWindowBackend();
    host = createTestHost(backend);
    const win = createApplicationWindow();
    setWindowIcon(host, win, 'icon.png');
    expect(win.icon).toBe('icon.png');
    expect(backend.calls).toContain('setIcon:icon.png');
  });
});

describe('setWindowMaximumSize', () => {
  it('sets constraints and delegates', () => {
    const backend = recordingWindowBackend();
    host = createTestHost(backend);
    const win = createApplicationWindow();
    setWindowMaximumSize(host, win, 1920, 1080);
    expect(win.maxWidth).toBe(1920);
    expect(win.maxHeight).toBe(1080);
    expect(backend.calls).toContain('setMaximumSize:1920,1080');
  });
});

describe('setWindowMenuBarVisible', () => {
  it('delegates to the backend', () => {
    const backend = recordingWindowBackend();
    host = createTestHost(backend);
    setWindowMenuBarVisible(host, createApplicationWindow(), false);
    expect(backend.calls).toContain('setMenuBarVisible:false');
  });
});

describe('setWindowMinimumSize', () => {
  it('sets constraints and delegates', () => {
    const backend = recordingWindowBackend();
    host = createTestHost(backend);
    const win = createApplicationWindow();
    setWindowMinimumSize(host, win, 320, 240);
    expect(win.minWidth).toBe(320);
    expect(win.minHeight).toBe(240);
  });
});

describe('setWindowOpacity', () => {
  it('sets opacity and delegates', () => {
    const backend = recordingWindowBackend();
    host = createTestHost(backend);
    const win = createApplicationWindow();
    setWindowOpacity(host, win, 0.5);
    expect(win.opacity).toBe(0.5);
    expect(backend.calls).toContain('setOpacity:0.5');
  });
});

describe('setWindowParent', () => {
  it('delegates to the backend with null', () => {
    const backend = recordingWindowBackend();
    host = createTestHost(backend);
    setWindowParent(host, createApplicationWindow(), null);
    expect(backend.calls).toContain('setParent:null');
  });
});

describe('setWindowPosition', () => {
  it('sets position and emits onMove', () => {
    const backend = recordingWindowBackend();
    host = createTestHost(backend);
    const win = createApplicationWindow();
    let moved = false;
    connectSignal(win.onMove, () => {
      moved = true;
    });
    setWindowPosition(host, win, 100, 50);
    expect(win.x).toBe(100);
    expect(win.y).toBe(50);
    expect(moved).toBe(true);
  });
});

describe('setWindowProgress', () => {
  it('delegates to the backend', () => {
    const backend = recordingWindowBackend();
    host = createTestHost(backend);
    setWindowProgress(host, createApplicationWindow(), 0.25);
    expect(backend.calls).toContain('setProgress:0.25');
  });
});

describe('setWindowResizable', () => {
  it('sets state and delegates', () => {
    const backend = recordingWindowBackend();
    host = createTestHost(backend);
    const win = createApplicationWindow();
    setWindowResizable(host, win, false);
    expect(win.resizable).toBe(false);
    expect(backend.calls).toContain('setResizable:false');
  });
});

describe('setWindowSize', () => {
  it('sets size and emits onResize', () => {
    const backend = recordingWindowBackend();
    host = createTestHost(backend);
    const win = createApplicationWindow();
    let resized = false;
    connectSignal(win.onResize, () => {
      resized = true;
    });
    setWindowSize(host, win, 800, 600);
    expect(win.width).toBe(800);
    expect(win.height).toBe(600);
    expect(resized).toBe(true);
  });
});

describe('setWindowSkipTaskbar', () => {
  it('sets state and delegates', () => {
    const backend = recordingWindowBackend();
    host = createTestHost(backend);
    const win = createApplicationWindow();
    setWindowSkipTaskbar(host, win, true);
    expect(win.skipTaskbar).toBe(true);
    expect(backend.calls).toContain('setSkipTaskbar:true');
  });
});

describe('setWindowTitle', () => {
  it('sets the title and delegates', () => {
    const backend = recordingWindowBackend();
    host = createTestHost(backend);
    const win = createApplicationWindow();
    setWindowTitle(host, win, 'My App');
    expect(win.title).toBe('My App');
    expect(backend.calls).toContain('setTitle:My App');
  });
});

describe('showWindow', () => {
  it('marks visible and delegates to the backend', () => {
    const backend = recordingWindowBackend();
    host = createTestHost(backend);
    const win = createApplicationWindow();
    hideWindow(host, win);
    showWindow(host, win);
    expect(win.visible).toBe(true);
    expect(backend.calls).toContain('show');
  });
});
