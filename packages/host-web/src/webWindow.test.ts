import { attachWindow, closeWindow, createApplicationWindow } from '@flighthq/application/contract';
import { connectSignal } from '@flighthq/signals/contract';

import { webHost } from './webHost';
import {
  createWebFullscreenTargetHandle,
  createWebWindowResizeTargetHandle,
  initializeWebFullscreenTargetHandle,
  initializeWebWindowResizeTargetHandle,
  resetWebWindowBackendForTest,
  webFullscreenBackend,
  webWindowBackend,
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

    expect(await webFullscreenBackend.request(target)).toBe(true);
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

    webWindowBackend.subscribeResize(createWebWindowResizeTargetHandle(element), vi.fn());

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
    webFullscreenBackend.subscribe(callback);

    resetWebWindowBackendForTest();
    document.dispatchEvent(new Event('fullscreenchange'));

    expect(await webFullscreenBackend.request(target)).toBe(false);
    expect(callback).not.toHaveBeenCalled();
  });
});
describe('webFullscreenBackend', () => {
  it('requests fullscreen for the arbitrary element carried by the opaque handle', async () => {
    const element = document.createElement('div');
    const request = vi.fn().mockResolvedValue(undefined);
    element.requestFullscreen = request;

    expect(await webFullscreenBackend.request(createWebFullscreenTargetHandle(element))).toBe(true);
    expect(request).toHaveBeenCalledOnce();
  });

  it('returns false when a fullscreen request is rejected', async () => {
    const element = document.createElement('div');
    element.requestFullscreen = vi.fn().mockRejectedValue(new Error('denied'));

    expect(await webFullscreenBackend.request(createWebFullscreenTargetHandle(element))).toBe(false);
  });

  it('delegates global exit and reports success', async () => {
    const exit = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit });

    expect(await webFullscreenBackend.exit()).toBe(true);
    expect(exit).toHaveBeenCalledOnce();
  });

  it('subscribes and unsubscribes the exact fullscreen listener', () => {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
    const callback = vi.fn();
    webFullscreenBackend.subscribe(callback);
    document.dispatchEvent(new Event('fullscreenchange'));
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: document.body });
    document.dispatchEvent(new Event('fullscreenchange'));
    webFullscreenBackend.unsubscribe(callback);
    document.dispatchEvent(new Event('fullscreenchange'));

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenNthCalledWith(1, false);
    expect(callback).toHaveBeenNthCalledWith(2, true);
  });
});

describe('webWindowBackend', () => {
  it('adapter-roster axis: publishes the 10 P1 operations plus the five retained window subscriptions', () => {
    expect(
      Object.keys(webWindowBackend)
        .filter((operation) => operation !== 'attach')
        .sort(),
    ).toEqual([
      'center',
      'close',
      'focus',
      'getBounds',
      'open',
      'setFullscreen',
      'setIcon',
      'setPosition',
      'setSize',
      'setTitle',
      'subscribeClose',
      'subscribeMove',
      'subscribeOrientation',
      'subscribeResize',
      'subscribeVisibility',
    ]);
  });

  it('provides close-request cancellation and terminal-close subscriptions with exact cleanup', () => {
    const onCloseRequest = vi.fn().mockReturnValue(true);
    const onClose = vi.fn();
    const unsubscribe = webWindowBackend.subscribeClose(onCloseRequest, onClose);
    const request = new Event('beforeunload', { cancelable: true });

    window.dispatchEvent(request);
    window.dispatchEvent(new Event('pagehide'));
    unsubscribe();
    window.dispatchEvent(new Event('pagehide'));

    expect(onCloseRequest).toHaveBeenCalledOnce();
    expect(request.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('reports the page-window screen position on its browser move proxy', () => {
    vi.stubGlobal('screenX', 100);
    vi.stubGlobal('screenY', 200);
    const listener = vi.fn();
    const unsubscribe = webWindowBackend.subscribeMove(listener);

    window.dispatchEvent(new Event('resize'));
    unsubscribe();
    window.dispatchEvent(new Event('resize'));

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(100, 200);
  });

  it('subscribes to the browser orientation source and removes the exact listener', () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    vi.stubGlobal('screen', { orientation: { addEventListener, removeEventListener } });
    const listener = vi.fn();

    const unsubscribe = webWindowBackend.subscribeOrientation(listener);
    unsubscribe();

    expect(addEventListener).toHaveBeenCalledWith('change', listener);
    expect(removeEventListener).toHaveBeenCalledWith('change', listener);
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
    const unsubscribe = webWindowBackend.subscribeResize(createWebWindowResizeTargetHandle(element), listener);

    callback([{ contentRect: { width: 320.4, height: 199.6 } } as ResizeObserverEntry], {} as ResizeObserver);
    unsubscribe();

    expect(observe).toHaveBeenCalledWith(element);
    expect(listener).toHaveBeenCalledWith(320, 200, 2);
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('reports browser visibility and removes the exact listener', () => {
    let hidden = true;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const listener = vi.fn();
    const unsubscribe = webWindowBackend.subscribeVisibility(listener);

    document.dispatchEvent(new Event('visibilitychange'));
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    unsubscribe();
    document.dispatchEvent(new Event('visibilitychange'));

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, false);
    expect(listener).toHaveBeenNthCalledWith(2, true);
  });

  it('detaches a host-owned page window without closing it', () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    const win = createApplicationWindow();
    expect(attachWindow(webHost, win, window, 'host')).toBe(true);
    expect(attachWindow(webHost, createApplicationWindow(), window, 'host')).toBe(false);

    expect(closeWindow(webHost, win)).toBe(true);
    expect(closeWindow(webHost, win)).toBe(true);

    expect(close).not.toHaveBeenCalled();
  });

  it('closes a Flight-owned page window once', () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    const win = createApplicationWindow();
    expect(attachWindow(webHost, win, window, 'flight')).toBe(true);

    expect(closeWindow(webHost, win)).toBe(true);
    expect(closeWindow(webHost, win)).toBe(true);

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('routes pagehide through the terminal close choke point once', () => {
    const win = createApplicationWindow();
    let closes = 0;
    connectSignal(win.onClose, () => closes++);
    expect(attachWindow(webHost, win, window, 'host')).toBe(true);

    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('pagehide'));

    expect(closes).toBe(1);
  });
});
