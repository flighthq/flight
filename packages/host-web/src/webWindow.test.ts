import { attachWindow, closeWindow, createApplicationWindow } from '@flighthq/application/contract';
import { connectSignal } from '@flighthq/signals/contract';

import { webHost } from './webHost';
import {
  createWebFullscreenTargetHandle,
  resetWebWindowBackendForTest,
  webFullscreenBackend,
  webWindowBackend,
} from './webWindow';

afterEach(() => {
  vi.restoreAllMocks();
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
  it('adapter-roster axis: publishes exactly the 10 genuine P1 operations and omits all 18 false ones', () => {
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
    ]);
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
