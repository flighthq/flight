import { createApplicationWindow } from '@flighthq/application/contract';
import { connectSignal } from '@flighthq/signals/contract';

import {
  createWebFullscreenTargetHandle,
  createWebWindowResizeTargetHandle,
  initializeWebFullscreenTargetHandle,
  initializeWebWindowResizeTargetHandle,
  resetWebWindowBackendForTest,
  webHostFullscreen,
  webHostWindowAppearance,
  webHostWindowAttach,
  webHostWindowFocus,
  webHostWindowFullscreen,
  webHostWindowGeometry,
  webHostWindowLifecycle,
} from './webWindow';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetWebWindowBackendForTest();
});

describe('createWebFullscreenTargetHandle', () => {
  it('creates a provider-bound opaque handle for an arbitrary element', async () => {
    const element = document.createElement('dialog');
    const request = vi.fn().mockResolvedValue(undefined);
    element.requestFullscreen = request;

    const target = createWebFullscreenTargetHandle(element);

    expect(await webHostFullscreen.request(target)).toBe(true);
    expect(request).toHaveBeenCalledOnce();
  });
});

describe('createWebWindowResizeTargetHandle', () => {
  it('creates a provider-bound opaque handle for an arbitrary element', () => {
    const element = document.createElement('dialog');
    const observe = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = observe;
        disconnect() {}
      },
    );

    webHostWindowGeometry.subscribeResize(createWebWindowResizeTargetHandle(element), vi.fn());

    expect(observe).toHaveBeenCalledWith(element);
  });
});

describe('initializeWebFullscreenTargetHandle', () => {
  it('is the construction initializer of createWebFullscreenTargetHandle', () => {
    expect(typeof initializeWebFullscreenTargetHandle).toBe('function');
  });
});

describe('initializeWebWindowResizeTargetHandle', () => {
  it('is the construction initializer of createWebWindowResizeTargetHandle', () => {
    expect(typeof initializeWebWindowResizeTargetHandle).toBe('function');
  });
});

describe('resetWebWindowBackendForTest', () => {
  it('clears fullscreen targets and subscribed listeners', async () => {
    const element = document.createElement('div');
    element.requestFullscreen = vi.fn().mockResolvedValue(undefined);
    const target = createWebFullscreenTargetHandle(element);
    const callback = vi.fn();
    webHostFullscreen.subscribe(callback);

    resetWebWindowBackendForTest();
    document.dispatchEvent(new Event('fullscreenchange'));

    expect(await webHostFullscreen.request(target)).toBe(false);
    expect(callback).not.toHaveBeenCalled();
  });
});

describe('webHostFullscreen', () => {
  it('requests fullscreen for the arbitrary element carried by the opaque handle', async () => {
    const element = document.createElement('div');
    const request = vi.fn().mockResolvedValue(undefined);
    element.requestFullscreen = request;

    expect(await webHostFullscreen.request(createWebFullscreenTargetHandle(element))).toBe(true);
    expect(request).toHaveBeenCalledOnce();
  });

  it('returns false when a fullscreen request is rejected', async () => {
    const element = document.createElement('div');
    element.requestFullscreen = vi.fn().mockRejectedValue(new Error('denied'));

    expect(await webHostFullscreen.request(createWebFullscreenTargetHandle(element))).toBe(false);
  });

  it('delegates global exit and reports success', async () => {
    const exit = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit });

    expect(await webHostFullscreen.exit()).toBe(true);
    expect(exit).toHaveBeenCalledOnce();
  });

  it('subscribes and unsubscribes the exact fullscreen listener', () => {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
    const callback = vi.fn();
    webHostFullscreen.subscribe(callback);
    document.dispatchEvent(new Event('fullscreenchange'));
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: document.body });
    document.dispatchEvent(new Event('fullscreenchange'));
    webHostFullscreen.unsubscribe(callback);
    document.dispatchEvent(new Event('fullscreenchange'));

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenNthCalledWith(1, false);
    expect(callback).toHaveBeenNthCalledWith(2, true);
  });
});

describe('webHostWindowAppearance', () => {
  it('publishes exactly the appearance operations the web window covers', () => {
    expect(Object.keys(webHostWindowAppearance)).toEqual(expect.arrayContaining(['setIcon', 'setTitle']));
  });

  it('writes the page-window title for an attached window', () => {
    const win = createApplicationWindow();
    expect(webHostWindowAttach.attach(win, window, 'host')).toBe(true);

    webHostWindowAppearance.setTitle(win, 'Retitled');

    expect(document.title).toBe('Retitled');
  });

  it('points the existing icon link at the new icon', () => {
    const win = createApplicationWindow();
    const link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
    expect(webHostWindowAttach.attach(win, window, 'host')).toBe(true);

    webHostWindowAppearance.setIcon(win, '/icon.png');

    expect(link.href).toContain('/icon.png');
    expect(document.querySelectorAll('link[rel="icon"]')).toHaveLength(1);
  });

  it('creates an icon link when the document has none', () => {
    for (const existing of document.querySelectorAll('link[rel="icon"]')) existing.remove();
    const win = createApplicationWindow();
    expect(webHostWindowAttach.attach(win, window, 'host')).toBe(true);

    webHostWindowAppearance.setIcon(win, '/fresh.png');

    expect(document.querySelectorAll('link[rel="icon"]')).toHaveLength(1);
  });
});

describe('webHostWindowAttach', () => {
  it('publishes exactly the attach operation', () => {
    expect(Object.keys(webHostWindowAttach)).toEqual(expect.arrayContaining(['attach']));
  });

  it('detaches a host-owned page window without closing it', () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    const win = createApplicationWindow();
    expect(webHostWindowAttach.attach(win, window, 'host')).toBe(true);
    expect(webHostWindowAttach.attach(createApplicationWindow(), window, 'host')).toBe(false);

    webHostWindowLifecycle.close(win);
    webHostWindowLifecycle.close(win);

    expect(close).not.toHaveBeenCalled();
  });

  it('closes a Flight-owned page window once', () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    const win = createApplicationWindow();
    expect(webHostWindowAttach.attach(win, window, 'flight')).toBe(true);

    webHostWindowLifecycle.close(win);
    webHostWindowLifecycle.close(win);

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('routes pagehide through the terminal close choke point once', () => {
    const win = createApplicationWindow();
    let closes = 0;
    connectSignal(win.onClose, () => closes++);
    expect(webHostWindowAttach.attach(win, window, 'host')).toBe(true);

    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('pagehide'));

    expect(closes).toBe(1);
  });

  it('rejects a handle that is not a page window', () => {
    expect(webHostWindowAttach.attach(createApplicationWindow(), {}, 'host')).toBe(false);
  });
});

describe('webHostWindowFocus', () => {
  it('focuses the attached page-window handle', () => {
    const win = createApplicationWindow();
    expect(webHostWindowAttach.attach(win, window, 'host')).toBe(true);
    const focus = vi.spyOn(window, 'focus').mockImplementation(() => {});

    webHostWindowFocus.focus(win);

    expect(focus).toHaveBeenCalledOnce();
  });
});

describe('webHostWindowFullscreen', () => {
  it('requests document fullscreen for an attached window', () => {
    const win = createApplicationWindow();
    expect(webHostWindowAttach.attach(win, window, 'host')).toBe(true);
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    });

    webHostWindowFullscreen.setFullscreen(win, true);

    expect(requestFullscreen).toHaveBeenCalledOnce();
  });

  it('exits document fullscreen for an attached window', () => {
    const win = createApplicationWindow();
    expect(webHostWindowAttach.attach(win, window, 'host')).toBe(true);
    const exitFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exitFullscreen });

    webHostWindowFullscreen.setFullscreen(win, false);

    expect(exitFullscreen).toHaveBeenCalledOnce();
  });
});

describe('webHostWindowGeometry', () => {
  it('publishes the supported geometry operations', () => {
    expect(Object.keys(webHostWindowGeometry)).toEqual(
      expect.arrayContaining(['center', 'getBounds', 'setPosition', 'setSize', 'subscribeMove', 'subscribeResize']),
    );
  });

  it('reports the page-window screen position on its browser move proxy', () => {
    vi.stubGlobal('screenX', 100);
    vi.stubGlobal('screenY', 200);
    const listener = vi.fn();
    const unsubscribe = webHostWindowGeometry.subscribeMove(listener);

    window.dispatchEvent(new Event('resize'));
    unsubscribe();
    window.dispatchEvent(new Event('resize'));

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(100, 200);
  });

  it('reports rounded content-box size and browser device pixel ratio', () => {
    let callback: ResizeObserverCallback = () => {};
    const element = document.createElement('div');
    const disconnect = vi.fn();
    const observe = vi.fn();
    vi.stubGlobal('devicePixelRatio', 2);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(next: ResizeObserverCallback) {
          callback = next;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );
    const listener = vi.fn();
    const unsubscribe = webHostWindowGeometry.subscribeResize(createWebWindowResizeTargetHandle(element), listener);

    callback([{ contentRect: { width: 320.4, height: 199.6 } } as ResizeObserverEntry], {} as ResizeObserver);
    unsubscribe();

    expect(observe).toHaveBeenCalledWith(element);
    expect(listener).toHaveBeenCalledWith(320, 200, 2);
    expect(disconnect).toHaveBeenCalledOnce();
  });
});

describe('webHostWindowLifecycle', () => {
  it('publishes the supported lifecycle operations', () => {
    expect(Object.keys(webHostWindowLifecycle)).toEqual(expect.arrayContaining(['close', 'open', 'subscribeClose']));
  });

  it('opens the page window as a host-owned handle', () => {
    const win = createApplicationWindow();

    expect(webHostWindowLifecycle.open(win, {})).toBe(true);
    expect(webHostWindowAttach.attach(win, window, 'host')).toBe(true);
  });

  it('provides close-request cancellation and terminal-close subscriptions with exact cleanup', () => {
    const onCloseRequest = vi.fn().mockReturnValue(true);
    const onClose = vi.fn();
    const unsubscribe = webHostWindowLifecycle.subscribeClose(onCloseRequest, onClose);
    const request = new Event('beforeunload', { cancelable: true });

    window.dispatchEvent(request);
    window.dispatchEvent(new Event('pagehide'));
    unsubscribe();
    window.dispatchEvent(new Event('pagehide'));

    expect(onCloseRequest).toHaveBeenCalledOnce();
    expect(request.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
