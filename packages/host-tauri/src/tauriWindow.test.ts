import { createApplicationWindow } from '@flighthq/application';
import { connectSignal } from '@flighthq/signals';
import type { TauriApi, TauriLogicalSizeLike, TauriPhysicalPositionLike } from '@flighthq/types';

import { createTauriWindowBackend } from './tauriWindow';

interface FakeWindowState {
  calls: { method: string; args: unknown[] }[];
  moved: ((event: { payload: TauriPhysicalPositionLike }) => void) | null;
  resized: ((event: { payload: TauriLogicalSizeLike }) => void) | null;
  focusChanged: ((event: { payload: boolean }) => void) | null;
  closeRequested: (() => void) | null;
}

function fakeTauri() {
  const state: FakeWindowState = { calls: [], moved: null, resized: null, focusChanged: null, closeRequested: null };
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
      return () => {};
    },
    async onResized(handler: (event: { payload: TauriLogicalSizeLike }) => void) {
      state.resized = handler;
      return () => {};
    },
    async onFocusChanged(handler: (event: { payload: boolean }) => void) {
      state.focusChanged = handler;
      return () => {};
    },
    async onCloseRequested(handler: () => void) {
      state.closeRequested = handler;
      return () => {};
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
  return { tauri, state };
}

function methods(state: FakeWindowState): string[] {
  return state.calls.map((c) => c.method);
}

describe('createTauriWindowBackend', () => {
  it('opens the current window and applies options', () => {
    const { tauri, state } = fakeTauri();
    const backend = createTauriWindowBackend(tauri);
    const win = createApplicationWindow();
    expect(backend.open(win, { title: 'Hi', width: 640, height: 480, resizable: false, visible: true })).toBe(true);
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
    backend.open(win, {});
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
    backend.setTitle(win, 'ignored');
    expect(state.calls).toHaveLength(0);
    backend.open(win, {});
    state.calls.length = 0;
    backend.setTitle(win, 'New');
    backend.minimize(win);
    backend.setFullscreen(win, true);
    backend.requestAttention(win, true);
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
    backend.open(win, {});
    const out = { x: 0, y: 0, width: 0, height: 0 };
    expect(backend.getBounds(win, out)).toBe(out);
    expect(out).toEqual({ x: 5, y: 6, width: 100, height: 200 });
  });
});
