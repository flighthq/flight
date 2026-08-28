import { createApplicationWindow } from '@flighthq/application/contract';
import { connectSignal } from '@flighthq/signals/contract';
import type { ElectronApi, ElectronBrowserWindowOptions, ElectronRectangle } from '@flighthq/types/contract';

import {
  createElectronWindowBackend,
  getApplicationWindowForElectronId,
  getElectronBrowserWindow,
  getElectronWindowId,
  resetElectronWindowBackendForTest,
} from './electronWindow';

interface FakeBrowserWindow {
  id: number;
  options: ElectronBrowserWindowOptions;
  calls: { method: string; args: unknown[] }[];
  bounds: ElectronRectangle;
  minimized: boolean;
  fire(event: string): void;
  listenerCount(event: string): number;
}

function fakeElectron(): { electron: ElectronApi; created: FakeBrowserWindow[] } {
  const created: FakeBrowserWindow[] = [];
  let nextId = 1;
  class FakeWindow {
    id = nextId++;
    options: ElectronBrowserWindowOptions;
    calls: { method: string; args: unknown[] }[] = [];
    bounds: ElectronRectangle = { x: 0, y: 0, width: 0, height: 0 };
    minimized = false;
    listeners = new Map<string, (() => void)[]>();
    constructor(options?: ElectronBrowserWindowOptions) {
      this.options = options ?? {};
      created.push(this as unknown as FakeBrowserWindow);
    }
    record(method: string, ...args: unknown[]) {
      this.calls.push({ method, args });
    }
    setTitle(title: string) {
      this.record('setTitle', title);
    }
    setPosition(x: number, y: number) {
      this.record('setPosition', x, y);
    }
    setSize(width: number, height: number) {
      this.record('setSize', width, height);
    }
    getBounds() {
      return this.bounds;
    }
    minimize() {
      this.record('minimize');
    }
    maximize() {
      this.record('maximize');
    }
    unmaximize() {
      this.record('unmaximize');
    }
    restore() {
      this.record('restore');
    }
    isMinimized() {
      return this.minimized;
    }
    isMaximized() {
      return false;
    }
    focus() {
      this.record('focus');
    }
    show() {
      this.record('show');
    }
    hide() {
      this.record('hide');
    }
    center() {
      this.record('center');
    }
    setResizable(flag: boolean) {
      this.record('setResizable', flag);
    }
    setAlwaysOnTop(flag: boolean) {
      this.record('setAlwaysOnTop', flag);
    }
    setMinimumSize(width: number, height: number) {
      this.record('setMinimumSize', width, height);
    }
    setMaximumSize(width: number, height: number) {
      this.record('setMaximumSize', width, height);
    }
    setFullScreen(flag: boolean) {
      this.record('setFullScreen', flag);
    }
    setIcon(icon: unknown) {
      this.record('setIcon', icon);
    }
    setOpacity(opacity: number) {
      this.record('setOpacity', opacity);
    }
    setProgressBar(progress: number) {
      this.record('setProgressBar', progress);
    }
    flashFrame(flag: boolean) {
      this.record('flashFrame', flag);
    }
    setSkipTaskbar(skip: boolean) {
      this.record('setSkipTaskbar', skip);
    }
    setMenuBarVisibility(visible: boolean) {
      this.record('setMenuBarVisibility', visible);
    }
    setParentWindow(parent: unknown) {
      this.record('setParentWindow', parent);
    }
    close() {
      this.record('close');
    }
    on(event: string, cb: () => void) {
      const list = this.listeners.get(event) ?? [];
      list.push(cb);
      this.listeners.set(event, list);
    }
    off(event: string, cb: () => void) {
      const list = this.listeners.get(event) ?? [];
      this.listeners.set(
        event,
        list.filter((listener) => listener !== cb),
      );
    }
    fire(event: string) {
      for (const cb of this.listeners.get(event) ?? []) cb();
    }
    listenerCount(event: string) {
      return this.listeners.get(event)?.length ?? 0;
    }
  }
  const electron = { BrowserWindow: FakeWindow } as unknown as ElectronApi;
  return { electron, created };
}

beforeEach(() => resetElectronWindowBackendForTest());

describe('createElectronWindowBackend', () => {
  it('adapter-roster axis: publishes all 28 P1 operations without false omissions', () => {
    const { electron } = fakeElectron();
    const backend = createElectronWindowBackend(electron);

    expect(
      Object.keys(backend)
        .filter((operation) => operation !== 'attach')
        .sort(),
    ).toEqual([
      'center',
      'close',
      'flashWindowFrame',
      'focus',
      'getBounds',
      'hide',
      'maximize',
      'minimize',
      'open',
      'requestAttention',
      'restore',
      'setAlwaysOnTop',
      'setContentProtection',
      'setFullscreen',
      'setHasShadow',
      'setIcon',
      'setMaximumSize',
      'setMenuBarVisible',
      'setMinimumSize',
      'setOpacity',
      'setParent',
      'setPosition',
      'setProgress',
      'setResizable',
      'setSize',
      'setSkipTaskbar',
      'setTitle',
      'show',
    ]);
  });

  it('open creates a BrowserWindow and forwards commands to it', () => {
    const { electron, created } = fakeElectron();
    const backend = createElectronWindowBackend(electron);
    const win = createApplicationWindow();
    expect(backend.open(win, { title: 'Flight', width: 640, height: 480 })).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0].options.title).toBe('Flight');
    backend.setTitle!(win, 'Renamed');
    expect(created[0].calls).toContainEqual({ method: 'setTitle', args: ['Renamed'] });
  });

  it('getBounds reads from the BrowserWindow into out', () => {
    const { electron, created } = fakeElectron();
    const backend = createElectronWindowBackend(electron);
    const win = createApplicationWindow();
    backend.open(win, {});
    created[0].bounds = { x: 10, y: 20, width: 300, height: 400 };
    const out = { x: 0, y: 0, width: 0, height: 0 };
    const result = backend.getBounds!(win, out);
    expect(result).toBe(out);
    expect(out).toEqual({ x: 10, y: 20, width: 300, height: 400 });
  });

  it('getBounds falls back to the entity when no window is mapped', () => {
    const { electron } = fakeElectron();
    const backend = createElectronWindowBackend(electron);
    const win = createApplicationWindow();
    win.x = 5;
    win.y = 6;
    win.width = 70;
    win.height = 80;
    const out = { x: 0, y: 0, width: 0, height: 0 };
    backend.getBounds!(win, out);
    expect(out).toEqual({ x: 5, y: 6, width: 70, height: 80 });
  });

  it('forwards an OS minimize event to the entity and emits onMinimize', () => {
    const { electron, created } = fakeElectron();
    const backend = createElectronWindowBackend(electron);
    const win = createApplicationWindow();
    backend.open(win, {});
    let emitted = false;
    connectSignal(win.onMinimize, () => {
      emitted = true;
    });
    created[0].fire('minimize');
    expect(win.minimized).toBe(true);
    expect(emitted).toBe(true);
  });

  it('attaches an existing BrowserWindow with stable identity and no duplicate listeners', () => {
    const { electron, created } = fakeElectron();
    const native = new electron.BrowserWindow({ title: 'Existing' }) as unknown as FakeBrowserWindow;
    const backend = createElectronWindowBackend(electron);
    const win = createApplicationWindow();

    expect(backend.attach?.(win, native, 'host')).toBe(true);
    expect(backend.attach?.(win, native, 'host')).toBe(true);
    expect(backend.attach?.(createApplicationWindow(), native, 'host')).toBe(false);
    expect(created).toHaveLength(1);
    expect(getElectronBrowserWindow(win)).toBe(native);
    expect(native.listenerCount('move')).toBe(1);
  });

  it('detaches host-owned windows without closing them and does so idempotently', () => {
    const { electron } = fakeElectron();
    const native = new electron.BrowserWindow({}) as unknown as FakeBrowserWindow;
    const backend = createElectronWindowBackend(electron);
    const win = createApplicationWindow();
    expect(backend.attach?.(win, native, 'host')).toBe(true);

    backend.close(win);
    backend.close(win);

    expect(native.calls.filter((call) => call.method === 'close')).toHaveLength(0);
    expect(native.listenerCount('move')).toBe(0);
    expect(getElectronBrowserWindow(win)).toBeNull();
  });

  it('closes a Flight-owned native window exactly once', () => {
    const { electron } = fakeElectron();
    const native = new electron.BrowserWindow({}) as unknown as FakeBrowserWindow;
    const backend = createElectronWindowBackend(electron);
    const win = createApplicationWindow();
    expect(backend.attach?.(win, native, 'flight')).toBe(true);

    backend.close(win);
    backend.close(win);

    expect(native.calls.filter((call) => call.method === 'close')).toHaveLength(1);
  });

  it('routes a native close through the application choke point once and drops identity maps', () => {
    const { electron } = fakeElectron();
    const native = new electron.BrowserWindow({}) as unknown as FakeBrowserWindow;
    const backend = createElectronWindowBackend(electron);
    const win = createApplicationWindow();
    let closes = 0;
    connectSignal(win.onClose, () => closes++);
    expect(backend.attach?.(win, native, 'host')).toBe(true);

    native.fire('closed');
    native.fire('closed');

    expect(closes).toBe(1);
    expect(getApplicationWindowForElectronId(native.id)).toBeNull();
    expect(getElectronBrowserWindow(win)).toBeNull();
  });
});

describe('getApplicationWindowForElectronId', () => {
  it('returns the ApplicationWindow for a known Electron id and null for an unknown one', () => {
    const { electron, created } = fakeElectron();
    const backend = createElectronWindowBackend(electron);
    const win = createApplicationWindow();
    backend.open(win, {});
    const id = created[0].id;
    expect(getApplicationWindowForElectronId(id)).toBe(win);
    expect(getApplicationWindowForElectronId(9999)).toBeNull();
  });
});

describe('getElectronBrowserWindow', () => {
  it('returns the backing BrowserWindow after open and null before', () => {
    const { electron, created } = fakeElectron();
    const backend = createElectronWindowBackend(electron);
    const win = createApplicationWindow();
    expect(getElectronBrowserWindow(win)).toBeNull();
    backend.open(win, {});
    expect(getElectronBrowserWindow(win)).toBe(created[0]);
  });
});

describe('getElectronWindowId', () => {
  it('returns the numeric Electron window id after open and -1 before', () => {
    const { electron, created } = fakeElectron();
    const backend = createElectronWindowBackend(electron);
    const win = createApplicationWindow();
    expect(getElectronWindowId(win)).toBe(-1);
    backend.open(win, {});
    const expectedId = created[0].id;
    expect(getElectronWindowId(win)).toBe(expectedId);
  });
});

describe('resetElectronWindowBackendForTest', () => {
  it('clears the window identity maps', () => {
    const { electron, created } = fakeElectron();
    const backend = createElectronWindowBackend(electron);
    const win = createApplicationWindow();
    expect(backend.open(win, {})).toBe(true);
    expect(getElectronBrowserWindow(win)).toBe(created[0]);

    resetElectronWindowBackendForTest();

    expect(getElectronBrowserWindow(win)).toBeNull();
    expect(getApplicationWindowForElectronId(created[0].id)).toBeNull();
  });
});
