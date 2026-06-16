import { connectSignal } from '@flighthq/signals';

import {
  attachWindowDropFile,
  attachWindowFocus,
  attachWindowFullscreen,
  attachWindowOrientation,
  attachWindowRenderContext,
  attachWindowResize,
  attachWindowVisibility,
  createApplicationWindow,
  detachWindowDropFile,
  detachWindowFocus,
  detachWindowFullscreen,
  detachWindowOrientation,
  detachWindowRenderContext,
  detachWindowResize,
  detachWindowVisibility,
  disposeApplicationWindow,
  exitApplicationFullscreen,
  lockApplicationPointer,
  requestApplicationFullscreen,
} from './window';

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

describe('requestApplicationFullscreen', () => {
  it('calls requestFullscreen on the element', async () => {
    const element = document.createElement('div');
    const mock = vi.fn().mockResolvedValue(undefined);
    element.requestFullscreen = mock;
    await requestApplicationFullscreen(element);
    expect(mock).toHaveBeenCalled();
  });
});
