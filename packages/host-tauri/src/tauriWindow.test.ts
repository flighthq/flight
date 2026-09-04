import { createApplicationWindow, openWindow } from '@flighthq/application/contract';
import { connectSignal } from '@flighthq/signals/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { TauriApi, TauriLogicalSizeLike, TauriPhysicalPositionLike } from '@flighthq/types/contract';

import { createTauriWindowBackend, initializeTauriWindowBackend } from './tauriWindow';

interface FakeWindowState {
  calls: { method: string; args: unknown[] }[];
  moved: ((event: { payload: TauriPhysicalPositionLike }) => void) | null;
  resized: ((event: { payload: TauriLogicalSizeLike }) => void) | null;
  focusChanged: ((event: { payload: boolean }) => void) | null;
  closeRequested: (() => void) | null;
  subscriptions: string[];
  unlistened: string[];
}

function fakeTauri() {
  const state: FakeWindowState = {
    calls: [],
    moved: null,
    resized: null,
    focusChanged: null,
    closeRequested: null,
    subscriptions: [],
    unlistened: [],
  };
  const record =
    (method: string) =>
    async (...args: unknown[]) => {
      state.calls.push({ method, args });
    };
  const window = {
    setTitle: record('setTitle'),
    setSize: record('setSize'),
    setPosition: record('setPosition'),
    setResizable: record('setResizable'),
    setAlwaysOnTop: record('setAlwaysOnTop'),
    setFullscreen: record('setFullscreen'),
    setMinSize: record('setMinSize'),
    setMaxSize: record('setMaxSize'),
    setFocus: record('setFocus'),
    setIcon: record('setIcon'),
    setSkipTaskbar: record('setSkipTaskbar'),
    setContentProtected: record('setContentProtected'),
    setShadow: record('setShadow'),
    requestUserAttention: record('requestUserAttention'),
    minimize: record('minimize'),
    maximize: record('maximize'),
    unmaximize: record('unmaximize'),
    show: record('show'),
    hide: record('hide'),
    center: record('center'),
    close: record('close'),
    async onMoved(handler: (event: { payload: TauriPhysicalPositionLike }) => void) {
      state.moved = handler;
      state.subscriptions.push('moved');
      return () => state.unlistened.push('moved');
    },
    async onResized(handler: (event: { payload: TauriLogicalSizeLike }) => void) {
      state.resized = handler;
      state.subscriptions.push('resized');
      return () => state.unlistened.push('resized');
    },
    async onFocusChanged(handler: (event: { payload: boolean }) => void) {
      state.focusChanged = handler;
      state.subscriptions.push('focusChanged');
      return () => state.unlistened.push('focusChanged');
    },
    async onCloseRequested(handler: () => void) {
      state.closeRequested = handler;
      state.subscriptions.push('closeRequested');
      return () => state.unlistened.push('closeRequested');
    },
  };
  const tauri = {
    window: {
      getCurrentWindow: () => window,
      LogicalPosition: class {
        constructor(
          public x: number,
          public y: number,
        ) {}
      },
      LogicalSize: class {
        constructor(
          public width: number,
          public height: number,
        ) {}
      },
    },
  } as unknown as TauriApi;
  return { tauri, state, window };
}

function methods(state: FakeWindowState): string[] {
  return state.calls.map((c) => c.method);
}

describe('createTauriWindowBackend', () => {
  it('adapter-roster axis: publishes exactly 24 P1 operations and omits the four false members', () => {
    const { tauri } = fakeTauri();
    const backend = createTauriWindowBackend(tauri);

    expect(EntityRuntimeKey in backend).toBe(true);
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
      'setMinimumSize',
      'setPosition',
      'setResizable',
      'setSize',
      'setSkipTaskbar',
      'setTitle',
      'show',
    ]);
  });

  it('opens the current window and applies options', () => {
    const { tauri, state } = fakeTauri();
    const backend = createTauriWindowBackend(tauri);
    const win = createApplicationWindow();
    expect(backend.open!(win, { title: 'Hi', width: 640, height: 480, resizable: false, visible: true })).toBe(true);
    expect(methods(state)).toContain('setTitle');
    expect(methods(state)).toContain('setSize');
    expect(methods(state)).toContain('setResizable');
    expect(methods(state)).toContain('show');
  });

  it('mirrors native move/resize/focus events onto the entity and its signals', () => {
    const { tauri, state } = fakeTauri();
    const backend = createTauriWindowBackend(tauri);
    const win = createApplicationWindow();
    let moves = 0;
    connectSignal(win.onMove, () => moves++);
    backend.open!(win, {});
    state.moved!({ payload: { x: 12, y: 34 } });
    expect(win.x).toBe(12);
    expect(win.y).toBe(34);
    expect(moves).toBe(1);
    state.resized!({ payload: { width: 800, height: 600 } });
    expect(win.width).toBe(800);
    expect(win.height).toBe(600);
    state.focusChanged!({ payload: true });
    expect(win.focused).toBe(true);
  });

  it('routes control methods to the current window and no-ops before open', () => {
    const { tauri, state } = fakeTauri();
    const backend = createTauriWindowBackend(tauri);
    const win = createApplicationWindow();
    // Not opened yet: nothing routes through.
    backend.setTitle!(win, 'ignored');
    expect(state.calls).toHaveLength(0);
    backend.open!(win, {});
    state.calls.length = 0;
    backend.setTitle!(win, 'New');
    backend.minimize!(win);
    backend.setFullscreen!(win, true);
    backend.requestAttention!(win, true);
    expect(methods(state)).toEqual(['setTitle', 'minimize', 'setFullscreen', 'requestUserAttention']);
  });

  it('reports mirrored bounds from the entity', () => {
    const { tauri } = fakeTauri();
    const backend = createTauriWindowBackend(tauri);
    const win = createApplicationWindow();
    win.x = 5;
    win.y = 6;
    win.width = 100;
    win.height = 200;
    backend.open!(win, {});
    const out = { x: 0, y: 0, width: 0, height: 0 };
    expect(backend.getBounds!(win, out)).toBe(out);
    expect(out).toEqual({ x: 5, y: 6, width: 100, height: 200 });
  });

  it('attaches the same existing window idempotently without duplicating event ingress', () => {
    const { tauri, state, window } = fakeTauri();
    const backend = createTauriWindowBackend(tauri);
    const win = createApplicationWindow();

    expect(backend.attach?.(win, window, 'host')).toBe(true);
    expect(backend.attach?.(win, window, 'host')).toBe(true);
    expect(backend.attach?.(createApplicationWindow(), window, 'host')).toBe(false);
    expect(state.subscriptions).toEqual(['moved', 'resized', 'focusChanged', 'closeRequested']);
  });

  it('detaches host-owned windows without closing them and releases all event ingress', async () => {
    const { tauri, state, window } = fakeTauri();
    const backend = createTauriWindowBackend(tauri);
    const win = createApplicationWindow();
    expect(backend.attach?.(win, window, 'host')).toBe(true);

    backend.close!(win);
    backend.close!(win);
    await Promise.resolve();

    expect(methods(state)).not.toContain('close');
    expect(state.unlistened.sort()).toEqual(['closeRequested', 'focusChanged', 'moved', 'resized']);
  });

  it('closes a Flight-owned attached window once', () => {
    const { tauri, state, window } = fakeTauri();
    const backend = createTauriWindowBackend(tauri);
    const win = createApplicationWindow();
    expect(backend.attach?.(win, window, 'flight')).toBe(true);

    backend.close!(win);
    backend.close!(win);

    expect(methods(state).filter((method) => method === 'close')).toHaveLength(1);
  });

  it('routes native close requests through the terminal-close choke point exactly once', async () => {
    const { tauri, state, window } = fakeTauri();
    const backend = createTauriWindowBackend(tauri);
    const win = createApplicationWindow();
    let closes = 0;
    connectSignal(win.onClose, () => closes++);
    expect(backend.attach?.(win, window, 'host')).toBe(true);

    state.closeRequested!();
    state.closeRequested!();
    await Promise.resolve();

    expect(closes).toBe(1);
    expect(state.unlistened).toHaveLength(4);
  });

  it('center-owner axis: lets application perform exactly one post-open center command', () => {
    const { tauri, state } = fakeTauri();
    const backend = createTauriWindowBackend(tauri);

    expect(openWindow({ window: backend }, createApplicationWindow(), { center: true })).toBe(true);

    expect(methods(state).filter((method) => method === 'center')).toHaveLength(1);
  });
});

// ★ THE REJECTION AXIS. `close(win)` releases a Flight-owned window through `handle.close()`, a promise
// the synchronous close path cannot await, so the `.catch` at the call site is the only thing keeping a
// rejected close from escaping as an unhandled rejection. Nothing exercised it before.
describe('createTauriWindowBackend close when the platform close rejects', () => {
  it('still detaches the window and raises no unhandled rejection', async () => {
    const { tauri, window } = fakeTauri();
    window.close = () => Promise.reject(new Error('close refused by the platform'));

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => void unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const backend = createTauriWindowBackend(tauri);
      const win = createApplicationWindow();
      // ATTACHED AS 'flight', deliberately: `open` adopts the pre-existing window as 'host', and the
      // close path only calls the platform close for a window Flight itself owns. Driving this through
      // `open` exercises a branch that never calls `close()` at all, so the test would pass with the
      // `.catch` deleted — which is exactly what it did before this line was corrected.
      expect(backend.attach?.(win, window as never, 'flight')).toBe(true);

      expect(() => backend.close!(win)).not.toThrow();
      // Detached synchronously, so a rejected close cannot strand the window as still attached.
      expect(backend.attach?.(win, window as never, 'flight')).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
describe('initializeTauriWindowBackend', () => {
  it('is the construction initializer of createTauriWindowBackend', () => {
    expect(typeof initializeTauriWindowBackend).toBe('function');
  });
});
