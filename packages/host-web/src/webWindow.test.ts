import {
  attachWindow,
  closeWindow,
  createApplicationWindow,
  getWindowBackend,
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

  it('adapter-roster axis: publishes exactly the 10 genuine P1 operations and omits all 18 false ones', () => {
    enableHostWebWindow();

    expect(
      Object.keys(getWindowBackend())
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
