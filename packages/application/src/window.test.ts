import { cancelSignal, connectSignal, emitSignal } from '@flighthq/signals';
import type { Matrix, RenderState, WindowBackend } from '@flighthq/types';

import {
  attachWindowClose,
  attachWindowDropFile,
  attachWindowFocus,
  attachWindowFullscreen,
  attachWindowOrientation,
  attachWindowRenderContext,
  attachWindowRenderState,
  attachWindowResize,
  attachWindowVisibility,
  centerWindow,
  closeWindow,
  computeWindowDeviceTransform,
  createApplicationWindow,
  createWebWindowBackend,
  detachWindowClose,
  detachWindowDropFile,
  detachWindowFocus,
  detachWindowFullscreen,
  detachWindowOrientation,
  detachWindowRenderContext,
  detachWindowRenderState,
  detachWindowResize,
  detachWindowVisibility,
  disposeApplicationWindow,
  exitApplicationFullscreen,
  focusWindow,
  getWindowBackend,
  getWindowBounds,
  hideWindow,
  lockApplicationPointer,
  maximizeWindow,
  minimizeWindow,
  openWindow,
  requestApplicationFullscreen,
  requestWindowAttention,
  requestWindowClose,
  restoreWindow,
  setWindowAlwaysOnTop,
  setWindowBackend,
  setWindowFullscreen,
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

function makeRenderState(): RenderState {
  return { renderTransform2D: { a: 0, b: 0, c: 0, d: 0, tx: 0, ty: 0 } } as unknown as RenderState;
}

function recordingWindowBackend(): WindowBackend & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
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
  };
}

afterEach(() => setWindowBackend(null));

describe('attachWindowClose', () => {
  it('emits onClose on pagehide', () => {
    const win = createApplicationWindow();
    let closed = false;
    connectSignal(win.onClose, () => {
      closed = true;
    });
    attachWindowClose(win);
    window.dispatchEvent(new Event('pagehide'));
    expect(closed).toBe(true);
  });

  it('emits onCloseRequest on beforeunload', () => {
    const win = createApplicationWindow();
    let requested = false;
    connectSignal(win.onCloseRequest, () => {
      requested = true;
    });
    attachWindowClose(win);
    window.dispatchEvent(new Event('beforeunload'));
    expect(requested).toBe(true);
  });
});

describe('attachWindowDropFile', () => {
  it('emits onDropFile with file name', () => {
    const element = document.createElement('div');
    const win = createApplicationWindow();
    let received: string | null = null;
    connectSignal(win.onDropFile, (path) => {
      received = path;
    });
    attachWindowDropFile(win, element);

    const event = new Event('drop') as Event & { dataTransfer: { files: { name: string }[] } };
    Object.defineProperty(event, 'dataTransfer', {
      value: { files: [{ name: 'test.png' }] },
    });
    element.dispatchEvent(event);

    expect(received).toBe('test.png');
  });
});

describe('attachWindowFocus', () => {
  it('emits onFocusIn on focus', () => {
    const element = document.createElement('div');
    const win = createApplicationWindow();
    let called = false;
    connectSignal(win.onFocusIn, () => {
      called = true;
    });
    attachWindowFocus(win, element);
    element.dispatchEvent(new Event('focus'));
    expect(called).toBe(true);
  });

  it('emits onFocusOut on blur', () => {
    const element = document.createElement('div');
    const win = createApplicationWindow();
    let called = false;
    connectSignal(win.onFocusOut, () => {
      called = true;
    });
    attachWindowFocus(win, element);
    element.dispatchEvent(new Event('blur'));
    expect(called).toBe(true);
  });
});

describe('attachWindowFullscreen', () => {
  it('emits onFullscreenChanged', () => {
    const win = createApplicationWindow();
    let called = false;
    connectSignal(win.onFullscreenChanged, () => {
      called = true;
    });
    attachWindowFullscreen(win);
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(called).toBe(true);
  });
});

describe('attachWindowOrientation', () => {
  it('emits onOrientationChanged on change', () => {
    const win = createApplicationWindow();
    let called = false;
    connectSignal(win.onOrientationChanged, () => {
      called = true;
    });

    let capturedHandler: (() => void) | null = null;
    Object.defineProperty(screen, 'orientation', {
      value: {
        addEventListener: (_: string, fn: () => void) => {
          capturedHandler = fn;
        },
        removeEventListener: vi.fn(),
      },
      configurable: true,
    });

    attachWindowOrientation(win);
    capturedHandler!();
    expect(called).toBe(true);
  });
});

describe('attachWindowRenderContext', () => {
  it('emits onRenderContextLost on webglcontextlost', () => {
    const canvas = document.createElement('canvas');
    const win = createApplicationWindow();
    let called = false;
    connectSignal(win.onRenderContextLost, () => {
      called = true;
    });
    attachWindowRenderContext(win, canvas);
    canvas.dispatchEvent(new Event('webglcontextlost'));
    expect(called).toBe(true);
  });

  it('emits onRenderContextRestored on webglcontextrestored', () => {
    const canvas = document.createElement('canvas');
    const win = createApplicationWindow();
    let called = false;
    connectSignal(win.onRenderContextRestored, () => {
      called = true;
    });
    attachWindowRenderContext(win, canvas);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(called).toBe(true);
  });
});

describe('attachWindowRenderState', () => {
  it('sizes the canvas backing store and writes the device transform from the window', () => {
    const win = createApplicationWindow();
    win.width = 800;
    win.height = 600;
    win.devicePixelRatio = 2;
    const canvas = document.createElement('canvas');
    const state = makeRenderState();
    attachWindowRenderState(win, state, canvas);
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(1200);
    expect(state.renderTransform2D?.a).toBe(2);
    expect(state.renderTransform2D?.d).toBe(2);
  });

  it('reapplies the backing size and transform on window resize', () => {
    const win = createApplicationWindow();
    win.width = 800;
    win.height = 600;
    win.devicePixelRatio = 1;
    const canvas = document.createElement('canvas');
    const state = makeRenderState();
    attachWindowRenderState(win, state, canvas);
    win.width = 400;
    win.devicePixelRatio = 2;
    emitSignal(win.onResize);
    expect(canvas.width).toBe(800);
    expect(state.renderTransform2D?.a).toBe(2);
  });
});

describe('attachWindowResize', () => {
  let resizeCallback: ResizeObserverCallback;
  let disconnectFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    disconnectFn = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: ResizeObserverCallback) {
          resizeCallback = cb;
        }
        observe() {}
        disconnect = disconnectFn;
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('emits onResize and updates dimensions', () => {
    vi.stubGlobal('devicePixelRatio', 2);
    const win = createApplicationWindow();
    let called = false;
    connectSignal(win.onResize, () => {
      called = true;
    });

    attachWindowResize(win, document.createElement('div'));
    resizeCallback([{ contentRect: { width: 1280, height: 720 } } as ResizeObserverEntry], {} as ResizeObserver);

    expect(called).toBe(true);
    expect(win.width).toBe(1280);
    expect(win.height).toBe(720);
    expect(win.devicePixelRatio).toBe(2);
  });

  it('replaces a previous observer when called again', () => {
    const win = createApplicationWindow();
    attachWindowResize(win, document.createElement('div'));
    attachWindowResize(win, document.createElement('div'));
    expect(disconnectFn).toHaveBeenCalledTimes(1);
  });
});

describe('attachWindowVisibility', () => {
  it('emits onDeactivate when page is hidden', () => {
    const win = createApplicationWindow();
    let called = false;
    connectSignal(win.onDeactivate, () => {
      called = true;
    });

    attachWindowVisibility(win);
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });

    expect(called).toBe(true);
  });

  it('emits onActivate when page becomes visible', () => {
    const win = createApplicationWindow();
    let called = false;
    connectSignal(win.onActivate, () => {
      called = true;
    });

    attachWindowVisibility(win);
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(called).toBe(true);
  });
});

describe('centerWindow', () => {
  it('delegates to the backend', () => {
    const backend = recordingWindowBackend();
    setWindowBackend(backend);
    centerWindow(createApplicationWindow());
    expect(backend.calls).toContain('center');
  });
});

describe('closeWindow', () => {
  it('closes and emits onClose when not vetoed', () => {
    const backend = recordingWindowBackend();
    setWindowBackend(backend);
    const win = createApplicationWindow();
    let closed = false;
    connectSignal(win.onClose, () => {
      closed = true;
    });
    expect(closeWindow(win)).toBe(true);
    expect(backend.calls).toContain('close');
    expect(closed).toBe(true);
  });

  it('aborts and returns false when a listener vetoes', () => {
    const backend = recordingWindowBackend();
    setWindowBackend(backend);
    const win = createApplicationWindow();
    connectSignal(win.onCloseRequest, () => cancelSignal(win.onCloseRequest));
    expect(closeWindow(win)).toBe(false);
    expect(backend.calls).not.toContain('close');
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
});

describe('createApplicationWindow', () => {
  it('returns all signals with no side effects', () => {
    const win = createApplicationWindow();
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
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(called).toBe(false);
  });

  it('initializes dimensions and devicePixelRatio to defaults', () => {
    const win = createApplicationWindow();
    expect(win.width).toBe(0);
    expect(win.height).toBe(0);
    expect(win.devicePixelRatio).toBe(1);
  });
});

describe('createWebWindowBackend', () => {
  it('sets document.title and reports bounds without throwing', () => {
    const backend = createWebWindowBackend();
    const win = createApplicationWindow();
    backend.setTitle(win, 'Hello');
    expect(document.title).toBe('Hello');
    const bounds = backend.getBounds(win, { x: 0, y: 0, width: 0, height: 0 });
    expect(typeof bounds.width).toBe('number');
  });
});

describe('detachWindowClose', () => {
  it('stops emitting onClose after detach', () => {
    const win = createApplicationWindow();
    let closed = false;
    connectSignal(win.onClose, () => {
      closed = true;
    });
    attachWindowClose(win);
    detachWindowClose(win);
    window.dispatchEvent(new Event('pagehide'));
    expect(closed).toBe(false);
  });
});

describe('detachWindowDropFile', () => {
  it('removes listeners', () => {
    const element = document.createElement('div');
    const win = createApplicationWindow();
    let called = false;
    connectSignal(win.onDropFile, () => {
      called = true;
    });
    attachWindowDropFile(win, element);
    detachWindowDropFile(win);

    const event = new Event('drop');
    Object.defineProperty(event, 'dataTransfer', { value: { files: [] } });
    element.dispatchEvent(event);

    expect(called).toBe(false);
  });
});

describe('detachWindowFocus', () => {
  it('removes both listeners', () => {
    const element = document.createElement('div');
    const win = createApplicationWindow();
    let called = false;
    connectSignal(win.onFocusIn, () => {
      called = true;
    });
    attachWindowFocus(win, element);
    detachWindowFocus(win);
    element.dispatchEvent(new Event('focus'));
    expect(called).toBe(false);
  });
});

describe('detachWindowFullscreen', () => {
  it('removes the listener', () => {
    const win = createApplicationWindow();
    let called = false;
    connectSignal(win.onFullscreenChanged, () => {
      called = true;
    });
    attachWindowFullscreen(win);
    detachWindowFullscreen(win);
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(called).toBe(false);
  });
});

describe('detachWindowOrientation', () => {
  it('removes the listener', () => {
    const removeListener = vi.fn();
    Object.defineProperty(screen, 'orientation', {
      value: { addEventListener: vi.fn(), removeEventListener: removeListener },
      configurable: true,
    });

    const win = createApplicationWindow();
    attachWindowOrientation(win);
    detachWindowOrientation(win);
    expect(removeListener).toHaveBeenCalled();
  });
});

describe('detachWindowRenderContext', () => {
  it('removes render context listeners', () => {
    const canvas = document.createElement('canvas');
    const win = createApplicationWindow();
    let called = false;
    connectSignal(win.onRenderContextLost, () => {
      called = true;
    });
    attachWindowRenderContext(win, canvas);
    detachWindowRenderContext(win);
    canvas.dispatchEvent(new Event('webglcontextlost'));
    expect(called).toBe(false);
  });
});

describe('detachWindowRenderState', () => {
  it('stops reacting to window resize', () => {
    const win = createApplicationWindow();
    win.width = 800;
    win.height = 600;
    win.devicePixelRatio = 1;
    const canvas = document.createElement('canvas');
    const state = makeRenderState();
    attachWindowRenderState(win, state, canvas);
    detachWindowRenderState(win);
    win.width = 400;
    emitSignal(win.onResize);
    expect(canvas.width).toBe(800);
  });
});

describe('detachWindowResize', () => {
  it('disconnects the observer', () => {
    const disconnectFn = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor() {}
        observe() {}
        disconnect = disconnectFn;
      },
    );

    const win = createApplicationWindow();
    attachWindowResize(win, document.createElement('div'));
    detachWindowResize(win);

    expect(disconnectFn).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('detachWindowVisibility', () => {
  it('removes the listener', () => {
    const win = createApplicationWindow();
    let called = false;
    connectSignal(win.onDeactivate, () => {
      called = true;
    });

    attachWindowVisibility(win);
    detachWindowVisibility(win);
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });

    expect(called).toBe(false);
  });
});

describe('disposeApplicationWindow', () => {
  it('runs all teardown so attached observers stop firing', () => {
    const disconnectFn = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor() {}
        observe() {}
        disconnect = disconnectFn;
      },
    );

    const win = createApplicationWindow();
    attachWindowResize(win, document.createElement('div'));
    attachWindowFullscreen(win);

    disposeApplicationWindow(win);

    expect(disconnectFn).toHaveBeenCalled();
    let called = false;
    connectSignal(win.onFullscreenChanged, () => {
      called = true;
    });
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(called).toBe(false);

    vi.unstubAllGlobals();
  });
});

describe('exitApplicationFullscreen', () => {
  it('calls document.exitFullscreen', async () => {
    const mock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document, 'exitFullscreen', { value: mock, configurable: true });
    await exitApplicationFullscreen();
    expect(mock).toHaveBeenCalled();
  });
});

describe('focusWindow', () => {
  it('marks focused and delegates to the backend', () => {
    const backend = recordingWindowBackend();
    setWindowBackend(backend);
    const win = createApplicationWindow();
    focusWindow(win);
    expect(win.focused).toBe(true);
    expect(backend.calls).toContain('focus');
  });
});

describe('getWindowBackend', () => {
  it('falls back to a web backend', () => {
    expect(getWindowBackend()).not.toBeNull();
  });

  it('returns the registered backend', () => {
    const backend = recordingWindowBackend();
    setWindowBackend(backend);
    expect(getWindowBackend()).toBe(backend);
  });
});

describe('getWindowBounds', () => {
  it('fills the out bounds from the backend', () => {
    setWindowBackend(recordingWindowBackend());
    const out = { x: 0, y: 0, width: 0, height: 0 };
    expect(getWindowBounds(createApplicationWindow(), out)).toBe(out);
    expect(out.width).toBe(3);
  });
});

describe('hideWindow', () => {
  it('marks not visible and delegates to the backend', () => {
    const backend = recordingWindowBackend();
    setWindowBackend(backend);
    const win = createApplicationWindow();
    hideWindow(win);
    expect(win.visible).toBe(false);
    expect(backend.calls).toContain('hide');
  });
});

describe('lockApplicationPointer', () => {
  it('sets touch-action and user-select', () => {
    const element = document.createElement('div');
    lockApplicationPointer(element);
    expect(element.style.touchAction).toBe('none');
    expect(element.style.userSelect).toBe('none');
  });

  it('sets transform on canvas elements', () => {
    const canvas = document.createElement('canvas');
    lockApplicationPointer(canvas);
    expect(canvas.style.transform).toBe('translateZ(0)');
  });

  it('does not set transform on non-canvas elements', () => {
    const div = document.createElement('div');
    lockApplicationPointer(div);
    expect(div.style.transform).toBe('');
  });
});

describe('maximizeWindow', () => {
  it('sets maximized and emits onMaximize once', () => {
    const backend = recordingWindowBackend();
    setWindowBackend(backend);
    const win = createApplicationWindow();
    let count = 0;
    connectSignal(win.onMaximize, () => count++);
    maximizeWindow(win);
    maximizeWindow(win);
    expect(win.maximized).toBe(true);
    expect(count).toBe(1);
    expect(backend.calls).toContain('maximize');
  });
});

describe('minimizeWindow', () => {
  it('sets minimized and emits onMinimize', () => {
    const backend = recordingWindowBackend();
    setWindowBackend(backend);
    const win = createApplicationWindow();
    let called = false;
    connectSignal(win.onMinimize, () => {
      called = true;
    });
    minimizeWindow(win);
    expect(win.minimized).toBe(true);
    expect(called).toBe(true);
  });
});

describe('openWindow', () => {
  it('applies options to the entity and delegates to the backend', () => {
    const backend = recordingWindowBackend();
    setWindowBackend(backend);
    const win = createApplicationWindow();
    expect(openWindow(win, { title: 'Game', width: 640, height: 480, alwaysOnTop: true })).toBe(true);
    expect(win.title).toBe('Game');
    expect(win.width).toBe(640);
    expect(win.alwaysOnTop).toBe(true);
    expect(backend.calls).toContain('open:Game');
  });
});

describe('requestApplicationFullscreen', () => {
  it('calls requestFullscreen on the element', async () => {
    const element = document.createElement('div');
    const mock = vi.fn().mockResolvedValue(undefined);
    element.requestFullscreen = mock;
    await requestApplicationFullscreen(element);
    expect(mock).toHaveBeenCalled();
  });
});

describe('requestWindowAttention', () => {
  it('delegates to the backend', () => {
    const backend = recordingWindowBackend();
    setWindowBackend(backend);
    requestWindowAttention(createApplicationWindow(), true);
    expect(backend.calls).toContain('requestAttention:true');
  });
});

describe('requestWindowClose', () => {
  it('returns true when not vetoed', () => {
    setWindowBackend(recordingWindowBackend());
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
    setWindowBackend(backend);
    const win = createApplicationWindow();
    maximizeWindow(win);
    let restored = false;
    connectSignal(win.onRestore, () => {
      restored = true;
    });
    restoreWindow(win);
    expect(win.maximized).toBe(false);
    expect(restored).toBe(true);
    expect(backend.calls).toContain('restore');
  });
});

describe('setWindowAlwaysOnTop', () => {
  it('sets state and delegates', () => {
    const backend = recordingWindowBackend();
    setWindowBackend(backend);
    const win = createApplicationWindow();
    setWindowAlwaysOnTop(win, true);
    expect(win.alwaysOnTop).toBe(true);
    expect(backend.calls).toContain('setAlwaysOnTop:true');
  });
});

describe('setWindowBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setWindowBackend(recordingWindowBackend());
    setWindowBackend(null);
    expect(getWindowBackend()).not.toBeNull();
  });
});

describe('setWindowFullscreen', () => {
  it('sets state and emits onFullscreenChanged once', () => {
    const backend = recordingWindowBackend();
    setWindowBackend(backend);
    const win = createApplicationWindow();
    let count = 0;
    connectSignal(win.onFullscreenChanged, () => count++);
    setWindowFullscreen(win, true);
    setWindowFullscreen(win, true);
    expect(win.fullscreen).toBe(true);
    expect(count).toBe(1);
  });
});

describe('setWindowIcon', () => {
  it('sets the icon and delegates', () => {
    const backend = recordingWindowBackend();
    setWindowBackend(backend);
    const win = createApplicationWindow();
    setWindowIcon(win, 'icon.png');
    expect(win.icon).toBe('icon.png');
    expect(backend.calls).toContain('setIcon:icon.png');
  });
});

describe('setWindowMaximumSize', () => {
  it('sets constraints and delegates', () => {
    const backend = recordingWindowBackend();
    setWindowBackend(backend);
    const win = createApplicationWindow();
    setWindowMaximumSize(win, 1920, 1080);
    expect(win.maxWidth).toBe(1920);
    expect(win.maxHeight).toBe(1080);
    expect(backend.calls).toContain('setMaximumSize:1920,1080');
  });
});

describe('setWindowMenuBarVisible', () => {
  it('delegates to the backend', () => {
    const backend = recordingWindowBackend();
    setWindowBackend(backend);
    setWindowMenuBarVisible(createApplicationWindow(), false);
    expect(backend.calls).toContain('setMenuBarVisible:false');
  });
});

describe('setWindowMinimumSize', () => {
  it('sets constraints and delegates', () => {
    const backend = recordingWindowBackend();
    setWindowBackend(backend);
    const win = createApplicationWindow();
    setWindowMinimumSize(win, 320, 240);
    expect(win.minWidth).toBe(320);
    expect(win.minHeight).toBe(240);
  });
});

describe('setWindowOpacity', () => {
  it('sets opacity and delegates', () => {
    const backend = recordingWindowBackend();
    setWindowBackend(backend);
    const win = createApplicationWindow();
    setWindowOpacity(win, 0.5);
    expect(win.opacity).toBe(0.5);
    expect(backend.calls).toContain('setOpacity:0.5');
  });
});

describe('setWindowParent', () => {
  it('delegates to the backend with null', () => {
    const backend = recordingWindowBackend();
    setWindowBackend(backend);
    setWindowParent(createApplicationWindow(), null);
    expect(backend.calls).toContain('setParent:null');
  });
});

describe('setWindowPosition', () => {
  it('sets position and emits onMove', () => {
    const backend = recordingWindowBackend();
    setWindowBackend(backend);
    const win = createApplicationWindow();
    let moved = false;
    connectSignal(win.onMove, () => {
      moved = true;
    });
    setWindowPosition(win, 100, 50);
    expect(win.x).toBe(100);
    expect(win.y).toBe(50);
    expect(moved).toBe(true);
  });
});

describe('setWindowProgress', () => {
  it('delegates to the backend', () => {
    const backend = recordingWindowBackend();
    setWindowBackend(backend);
    setWindowProgress(createApplicationWindow(), 0.25);
    expect(backend.calls).toContain('setProgress:0.25');
  });
});

describe('setWindowResizable', () => {
  it('sets state and delegates', () => {
    const backend = recordingWindowBackend();
    setWindowBackend(backend);
    const win = createApplicationWindow();
    setWindowResizable(win, false);
    expect(win.resizable).toBe(false);
    expect(backend.calls).toContain('setResizable:false');
  });
});

describe('setWindowSize', () => {
  it('sets size and emits onResize', () => {
    const backend = recordingWindowBackend();
    setWindowBackend(backend);
    const win = createApplicationWindow();
    let resized = false;
    connectSignal(win.onResize, () => {
      resized = true;
    });
    setWindowSize(win, 800, 600);
    expect(win.width).toBe(800);
    expect(win.height).toBe(600);
    expect(resized).toBe(true);
  });
});

describe('setWindowSkipTaskbar', () => {
  it('sets state and delegates', () => {
    const backend = recordingWindowBackend();
    setWindowBackend(backend);
    const win = createApplicationWindow();
    setWindowSkipTaskbar(win, true);
    expect(win.skipTaskbar).toBe(true);
    expect(backend.calls).toContain('setSkipTaskbar:true');
  });
});

describe('setWindowTitle', () => {
  it('sets the title and delegates', () => {
    const backend = recordingWindowBackend();
    setWindowBackend(backend);
    const win = createApplicationWindow();
    setWindowTitle(win, 'My App');
    expect(win.title).toBe('My App');
    expect(backend.calls).toContain('setTitle:My App');
  });
});

describe('showWindow', () => {
  it('marks visible and delegates to the backend', () => {
    const backend = recordingWindowBackend();
    setWindowBackend(backend);
    const win = createApplicationWindow();
    hideWindow(win);
    showWindow(win);
    expect(win.visible).toBe(true);
    expect(backend.calls).toContain('show');
  });
});
