import {
  attachWindow,
  closeWindow,
  createApplicationWindow,
  resetWindowBackendForTest,
} from '@flighthq/application/contract';
import { connectSignal } from '@flighthq/signals/contract';

import { enableHostWebWindow, resetHostWebWindowForTest } from './webWindow';

describe('enableHostWebWindow', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetHostWebWindowForTest();
    resetWindowBackendForTest();
  });

  it('does not throw on first call', () => {
    expect(() => enableHostWebWindow()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebWindow();
    expect(() => enableHostWebWindow()).not.toThrow();
  });

  it('detaches a host-owned ambient window without closing it', () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    enableHostWebWindow();
    const win = createApplicationWindow();
    expect(attachWindow(win, window, 'host')).toBe(true);
    expect(attachWindow(createApplicationWindow(), window, 'host')).toBe(false);

    expect(closeWindow(win)).toBe(true);
    expect(closeWindow(win)).toBe(true);

    expect(close).not.toHaveBeenCalled();
  });

  it('closes a Flight-owned ambient window once', () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    enableHostWebWindow();
    const win = createApplicationWindow();
    expect(attachWindow(win, window, 'flight')).toBe(true);

    expect(closeWindow(win)).toBe(true);
    expect(closeWindow(win)).toBe(true);

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('routes pagehide through the terminal close choke point once', () => {
    enableHostWebWindow();
    const win = createApplicationWindow();
    let closes = 0;
    connectSignal(win.onClose, () => closes++);
    expect(attachWindow(win, window, 'host')).toBe(true);

    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('pagehide'));

    expect(closes).toBe(1);
  });
});

describe('resetHostWebWindowForTest', () => {
  afterEach(() => resetWindowBackendForTest());

  it('allows re-enabling after reset', () => {
    enableHostWebWindow();
    resetHostWebWindowForTest();
    expect(() => enableHostWebWindow()).not.toThrow();
  });
});
