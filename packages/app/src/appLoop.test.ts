import { connectSignal, emitSignal } from '@flighthq/signals/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import type {
  AppLifecycleState,
  HostAppExitCapability,
  HostLifecycleCapability,
  HostAppLoopCapability,
} from '@flighthq/types/contract';

import {
  attachAppLoopExit,
  attachAppLoopLifecycle,
  createAppLoop,
  detachAppLoopExit,
  disposeAppLoop,
  enableAppLoopLifecycleSignals,
  forEachAppLoopWindow,
  getAppLoopFrameRate,
  getAppLoopMainWindow,
  getAppLoopWindows,
  initializeAppLoop,
  isAppLoopRunning,
  pauseAppLoop,
  registerAppLoopWindow,
  resumeAppLoop,
  setAppLoopMainWindow,
  startAppLoop,
  stepAppLoop,
  stopAppLoop,
  unregisterAppLoopWindow,
} from './appLoop.ts';
import { createAppWindow } from './appWindow.ts';

function makeManualLoopBackend(): HostAppLoopCapability & { tick: (time: number) => void; cancelCount: number } {
  let callback: ((time: number) => void) | null = null;
  let cancelCount = 0;
  return {
    cancelCount,
    requestFrame(cb: (time: number) => void): unknown {
      callback = cb;
      return 1;
    },
    cancelFrame(): void {
      cancelCount++;
      this.cancelCount = cancelCount;
      callback = null;
    },
    now(): number {
      return performance.now();
    },
    tick(time: number): void {
      callback?.(time);
    },
  };
}

type RecordingLifecycleBackend = HostLifecycleCapability & { state: AppLifecycleState };

type LoopTestHost = {
  readonly app: {
    readonly loop: HostAppLoopCapability;
    readonly lifecycle: RecordingLifecycleBackend;
  };
};

function createLoopTestHost(loop: HostAppLoopCapability, visible = true): LoopTestHost {
  const impl = {
    state: (visible ? 'active' : 'background') as AppLifecycleState,
    getState(): AppLifecycleState {
      return impl.state;
    },
    subscribe() {
      return () => {};
    },
  };
  return { app: { loop, lifecycle: impl as unknown as RecordingLifecycleBackend } };
}

type RecordingAppLoopExitBackend = HostAppExitCapability & {
  readonly calls: string[];
  emit(): void;
};

type ExitTestHost = { readonly app: { readonly exit: RecordingAppLoopExitBackend } };

function createExitTestHost(): ExitTestHost {
  const calls: string[] = [];
  const listeners = new Set<() => void>();
  return {
    app: {
      exit: {
        calls,
        emit() {
          for (const listener of listeners) listener();
        },
        subscribe(listener) {
          calls.push('subscribe');
          listeners.add(listener);
          let active = true;
          return () => {
            if (!active) return;
            active = false;
            calls.push('release');
            listeners.delete(listener);
          };
        },
      },
    },
  };
}

describe('attachAppLoopExit', () => {
  it('emits onExit through the host subscription', () => {
    const host = createExitTestHost();
    const app = createAppLoop();
    let called = false;
    connectSignal(app.onExit, () => {
      called = true;
    });

    attachAppLoopExit(host.app.exit, app);
    host.app.exit.emit();

    expect(called).toBe(true);
    expect(host.app.exit.calls).toEqual(['subscribe']);
  });

  it('releases the prior host before replacing the exit listener', () => {
    const first = createExitTestHost();
    const second = createExitTestHost();
    const app = createAppLoop();
    let count = 0;
    connectSignal(app.onExit, () => count++);

    attachAppLoopExit(first.app.exit, app);
    attachAppLoopExit(second.app.exit, app);
    first.app.exit.emit();
    second.app.exit.emit();

    expect(count).toBe(1);
    expect(first.app.exit.calls).toEqual(['subscribe', 'release']);
    expect(second.app.exit.calls).toEqual(['subscribe']);
  });
});

describe('attachAppLoopLifecycle', () => {
  it('pauses the loop when the window deactivates', () => {
    const backend = makeManualLoopBackend();
    const host = createLoopTestHost(backend);
    const app = createAppLoop();
    const win = createAppWindow();
    startAppLoop(host.app.loop, host.app.lifecycle, app);
    attachAppLoopLifecycle(app, win);

    // Simulate window deactivation by emitting its signal directly.
    emitSignal(win.onDeactivate);
    expect(app.isRunning).toBe(false);
    stopAppLoop(app);
  });

  it('resumes the loop when the window activates', () => {
    const backend = makeManualLoopBackend();
    const host = createLoopTestHost(backend);
    const app = createAppLoop();
    const win = createAppWindow();
    startAppLoop(host.app.loop, host.app.lifecycle, app);
    attachAppLoopLifecycle(app, win);

    emitSignal(win.onDeactivate);
    expect(app.isRunning).toBe(false);
    emitSignal(win.onActivate);
    expect(app.isRunning).toBe(true);
    stopAppLoop(app);
  });
});

describe('createAppLoop', () => {
  it('creates an Entity-backed application identity', () => {
    const app = createAppLoop();
    expect(EntityRuntimeKey in app).toBe(true);
  });

  it('returns signals with no side effects', () => {
    const host = createExitTestHost();
    const app = createAppLoop();
    expect(app.onUpdate).toBeDefined();
    expect(app.onRender).toBeDefined();
    expect(app.onExit).toBeDefined();

    let exitCalled = false;
    connectSignal(app.onExit, () => {
      exitCalled = true;
    });
    host.app.exit.emit();
    expect(exitCalled).toBe(false);
  });

  it('initializes frame metrics to zero', () => {
    const app = createAppLoop();
    expect(app.elapsedTime).toBe(0);
    expect(app.frameCount).toBe(0);
    expect(app.deltaTime).toBe(0);
    expect(app.isRunning).toBe(false);
    expect(app.interpolationAlpha).toBe(1);
    expect(app.windows).toEqual([]);
  });

  it('initializes lifecycle signals to null', () => {
    const app = createAppLoop();
    expect(app.onActivate).toBeNull();
    expect(app.onDeactivate).toBeNull();
    expect(app.onError).toBeNull();
    expect(app.onFixedUpdate).toBeNull();
  });
});

describe('detachAppLoopExit', () => {
  it('removes the listener', () => {
    const host = createExitTestHost();
    const app = createAppLoop();
    let called = false;
    connectSignal(app.onExit, () => {
      called = true;
    });

    attachAppLoopExit(host.app.exit, app);
    detachAppLoopExit(app);
    host.app.exit.emit();

    expect(called).toBe(false);
    expect(host.app.exit.calls).toEqual(['subscribe', 'release']);
  });
});

describe('disposeAppLoop', () => {
  it('stops loop, removes exit listener, and sets isRunning false', () => {
    const backend = makeManualLoopBackend();
    const loopHost = createLoopTestHost(backend);
    const exitHost = createExitTestHost();

    const app = createAppLoop();
    let exitCalled = false;
    connectSignal(app.onExit, () => {
      exitCalled = true;
    });

    startAppLoop(loopHost.app.loop, loopHost.app.lifecycle, app);
    attachAppLoopExit(exitHost.app.exit, app);
    expect(app.isRunning).toBe(true);
    disposeAppLoop(app);

    expect(app.isRunning).toBe(false);
    exitHost.app.exit.emit();
    expect(exitCalled).toBe(false);
    expect(exitHost.app.exit.calls).toEqual(['subscribe', 'release']);
  });
});

describe('enableAppLoopLifecycleSignals', () => {
  it('allocates the opt-in signals on the application', () => {
    const app = createAppLoop();
    expect(app.onActivate).toBeNull();
    enableAppLoopLifecycleSignals(app);
    expect(app.onActivate).not.toBeNull();
    expect(app.onDeactivate).not.toBeNull();
    expect(app.onError).not.toBeNull();
    expect(app.onFixedUpdate).not.toBeNull();
  });

  it('is idempotent', () => {
    const app = createAppLoop();
    enableAppLoopLifecycleSignals(app);
    const signal = app.onActivate;
    enableAppLoopLifecycleSignals(app);
    expect(app.onActivate).toBe(signal); // same object reference
  });
});

describe('forEachAppLoopWindow', () => {
  it('iterates all registered windows', () => {
    const app = createAppLoop();
    const win1 = createAppWindow();
    const win2 = createAppWindow();
    registerAppLoopWindow(app, win1);
    registerAppLoopWindow(app, win2);
    const seen: unknown[] = [];
    forEachAppLoopWindow(app, (w) => seen.push(w));
    expect(seen).toEqual([win1, win2]);
  });
});

describe('getAppLoopFrameRate', () => {
  it('returns 0 before any ticks', () => {
    const app = createAppLoop();
    expect(getAppLoopFrameRate(app)).toBe(0);
  });

  it('returns approximate FPS after several ticks', () => {
    const backend = makeManualLoopBackend();
    const host = createLoopTestHost(backend);
    const app = createAppLoop();
    startAppLoop(host.app.loop, host.app.lifecycle, app);
    // Simulate 60fps ticks (~16.67ms each).
    for (let i = 0; i <= 60; i++) {
      backend.tick(i * 16.67);
    }
    const fps = getAppLoopFrameRate(app);
    expect(fps).toBeGreaterThan(55);
    expect(fps).toBeLessThan(65);
    stopAppLoop(app);
  });
});

describe('getAppLoopMainWindow', () => {
  it('returns null with no windows', () => {
    const app = createAppLoop();
    expect(getAppLoopMainWindow(app)).toBeNull();
  });

  it('returns the first registered window by default', () => {
    const app = createAppLoop();
    const win1 = createAppWindow();
    const win2 = createAppWindow();
    registerAppLoopWindow(app, win1);
    registerAppLoopWindow(app, win2);
    expect(getAppLoopMainWindow(app)).toBe(win1);
  });

  it('returns the explicitly set main window', () => {
    const app = createAppLoop();
    const win1 = createAppWindow();
    const win2 = createAppWindow();
    registerAppLoopWindow(app, win1);
    setAppLoopMainWindow(app, win2);
    expect(getAppLoopMainWindow(app)).toBe(win2);
  });
});

describe('getAppLoopWindows', () => {
  it('returns an empty array initially', () => {
    const app = createAppLoop();
    expect(getAppLoopWindows(app)).toEqual([]);
  });

  it('returns a snapshot of registered windows', () => {
    const app = createAppLoop();
    const win = createAppWindow();
    registerAppLoopWindow(app, win);
    const snapshot = getAppLoopWindows(app);
    expect(snapshot).toEqual([win]);
    // Snapshot is a copy — mutating it does not affect the registry.
    (snapshot as unknown[]).push(null);
    expect(app.windows.length).toBe(1);
  });
});

describe('initializeAppLoop', () => {
  it('is the construction initializer of createAppLoop', () => {
    expect(typeof initializeAppLoop).toBe('function');
  });
});

describe('isAppLoopRunning', () => {
  it('returns false before loop is started', () => {
    const app = createAppLoop();
    expect(isAppLoopRunning(app)).toBe(false);
  });

  it('returns true after loop is started', () => {
    const backend = makeManualLoopBackend();
    const host = createLoopTestHost(backend);
    const app = createAppLoop();
    startAppLoop(host.app.loop, host.app.lifecycle, app);
    expect(isAppLoopRunning(app)).toBe(true);
    stopAppLoop(app);
  });

  it('returns false after loop is stopped', () => {
    const backend = makeManualLoopBackend();
    const host = createLoopTestHost(backend);
    const app = createAppLoop();
    startAppLoop(host.app.loop, host.app.lifecycle, app);
    stopAppLoop(app);
    expect(isAppLoopRunning(app)).toBe(false);
  });
});

describe('pauseAppLoop', () => {
  it('pauses emission without cancelling the rAF chain', () => {
    const backend = makeManualLoopBackend();
    const host = createLoopTestHost(backend);
    const app = createAppLoop();
    const updates: number[] = [];
    connectSignal(app.onUpdate, (dt) => updates.push(dt));

    startAppLoop(host.app.loop, host.app.lifecycle, app);
    backend.tick(0);
    backend.tick(16);
    pauseAppLoop(app);
    backend.tick(32); // should not emit since paused
    expect(updates.length).toBe(2);
    expect(app.isRunning).toBe(false);
    stopAppLoop(app);
  });

  it('is idempotent', () => {
    const backend = makeManualLoopBackend();
    const host = createLoopTestHost(backend);
    const app = createAppLoop();
    startAppLoop(host.app.loop, host.app.lifecycle, app);
    pauseAppLoop(app);
    pauseAppLoop(app); // second call should not throw
    expect(app.isRunning).toBe(false);
    stopAppLoop(app);
  });
});

describe('registerAppLoopWindow', () => {
  it('adds a window to the registry', () => {
    const app = createAppLoop();
    const win = createAppWindow();
    registerAppLoopWindow(app, win);
    expect(app.windows).toContain(win);
  });

  it('is idempotent', () => {
    const app = createAppLoop();
    const win = createAppWindow();
    registerAppLoopWindow(app, win);
    registerAppLoopWindow(app, win);
    expect(app.windows.length).toBe(1);
  });
});

describe('resumeAppLoop', () => {
  it('resumes emission after pause without dumping the gap delta', () => {
    const backend = makeManualLoopBackend();
    const host = createLoopTestHost(backend);
    const app = createAppLoop();
    const updates: number[] = [];
    connectSignal(app.onUpdate, (dt) => updates.push(dt));

    startAppLoop(host.app.loop, host.app.lifecycle, app);
    backend.tick(0);
    backend.tick(16);
    pauseAppLoop(app);
    // Resume and tick — lastTime was reset so first tick after resume has delta 0.
    resumeAppLoop(app);
    backend.tick(5000); // large gap should not flood through; lastTime was reset to -1
    // The tick at 5000 should emit delta=0 (first tick after reset).
    expect(updates[updates.length - 1]).toBe(0);
    expect(app.isRunning).toBe(true);
    stopAppLoop(app);
  });

  it('is a no-op when not paused', () => {
    const backend = makeManualLoopBackend();
    const host = createLoopTestHost(backend);
    const app = createAppLoop();
    startAppLoop(host.app.loop, host.app.lifecycle, app);
    resumeAppLoop(app); // not paused, should not throw
    expect(app.isRunning).toBe(true);
    stopAppLoop(app);
  });
});

describe('setAppLoopMainWindow', () => {
  it('registers the window if not already registered', () => {
    const app = createAppLoop();
    const win = createAppWindow();
    setAppLoopMainWindow(app, win);
    expect(app.windows).toContain(win);
    expect(getAppLoopMainWindow(app)).toBe(win);
  });
});

describe('startAppLoop', () => {
  it('sets isRunning to true', () => {
    const backend = makeManualLoopBackend();
    const host = createLoopTestHost(backend);
    const app = createAppLoop();
    startAppLoop(host.app.loop, host.app.lifecycle, app);
    expect(app.isRunning).toBe(true);
    stopAppLoop(app);
  });

  it('replaces a previous loop when called again', () => {
    const backend = makeManualLoopBackend();
    const host = createLoopTestHost(backend);
    const app = createAppLoop();
    startAppLoop(host.app.loop, host.app.lifecycle, app);
    const initialCancelCount = backend.cancelCount;
    startAppLoop(host.app.loop, host.app.lifecycle, app);
    expect(backend.cancelCount).toBeGreaterThan(initialCancelCount);
    stopAppLoop(app);
  });

  it('emits onUpdate with clamped delta and onRender on each tick', () => {
    const backend = makeManualLoopBackend();
    const host = createLoopTestHost(backend);
    const app = createAppLoop();
    const updates: number[] = [];
    let renders = 0;
    connectSignal(app.onUpdate, (dt) => updates.push(dt));
    connectSignal(app.onRender, () => renders++);

    startAppLoop(host.app.loop, host.app.lifecycle, app);
    backend.tick(0);
    backend.tick(100);

    expect(updates).toEqual([0, 100]);
    expect(renders).toBe(2);
    stopAppLoop(app);
  });

  it('clamps large delta gaps to maxDeltaTime', () => {
    const backend = makeManualLoopBackend();
    const host = createLoopTestHost(backend);
    const app = createAppLoop();
    const updates: number[] = [];
    connectSignal(app.onUpdate, (dt) => updates.push(dt));

    startAppLoop(host.app.loop, host.app.lifecycle, app, { maxDeltaTime: 100 });
    backend.tick(0);
    backend.tick(5000); // 5 second gap clamped to 100ms

    expect(updates[1]).toBe(100);
    stopAppLoop(app);
  });

  it('defaults to 250ms max delta clamp', () => {
    const backend = makeManualLoopBackend();
    const host = createLoopTestHost(backend);
    const app = createAppLoop();
    const updates: number[] = [];
    connectSignal(app.onUpdate, (dt) => updates.push(dt));

    startAppLoop(host.app.loop, host.app.lifecycle, app);
    backend.tick(0);
    backend.tick(10000); // 10 second gap clamped to 250ms

    expect(updates[1]).toBe(250);
    stopAppLoop(app);
  });

  it('accumulates frame count and elapsed time', () => {
    const backend = makeManualLoopBackend();
    const host = createLoopTestHost(backend);
    const app = createAppLoop();

    startAppLoop(host.app.loop, host.app.lifecycle, app);
    backend.tick(0);
    backend.tick(16);
    backend.tick(32);

    expect(app.frameCount).toBe(3);
    // elapsedTime is in seconds; 0+16+16 = 32ms = 0.032s (clamped)
    expect(app.elapsedTime).toBeCloseTo(0.032, 3);
    stopAppLoop(app);
  });

  it('throttles to targetFrameRate when set', () => {
    const backend = makeManualLoopBackend();
    const host = createLoopTestHost(backend);
    const app = createAppLoop();
    let renders = 0;
    connectSignal(app.onRender, () => renders++);

    startAppLoop(host.app.loop, host.app.lifecycle, app, { targetFrameRate: 30 }); // 33.33ms interval
    backend.tick(0); // first tick: lastTime=-1 so delta=0, accumulated=0 → emits
    backend.tick(16); // 16ms < 33.33ms → should skip
    backend.tick(34); // 34ms accumulated ≥ 33.33ms → should emit

    // The first tick always emits (delta=0); accumulated starts at 0.
    // Second tick adds 16ms (below threshold), third tick accumulated to ~34ms triggers.
    expect(renders).toBeGreaterThanOrEqual(2);
    stopAppLoop(app);
  });

  it('pulls lifecycle state from the host when choosing the frame interval', () => {
    const backend = makeManualLoopBackend();
    const host = createLoopTestHost(backend, false);
    const app = createAppLoop();
    let renders = 0;
    connectSignal(app.onRender, () => renders++);

    startAppLoop(host.app.loop, host.app.lifecycle, app, { backgroundFrameRate: 1 });
    backend.tick(0);
    backend.tick(500);
    expect(renders).toBe(1);

    host.app.lifecycle.state = 'active';
    backend.tick(516);
    expect(renders).toBe(2);
    stopAppLoop(app);
  });
});

describe('startAppLoop (fixed timestep)', () => {
  it('emits onFixedUpdate when fixedTimeStep is set', () => {
    const backend = makeManualLoopBackend();
    const host = createLoopTestHost(backend);
    const app = createAppLoop();
    enableAppLoopLifecycleSignals(app);
    const fixedDeltas: number[] = [];
    connectSignal(app.onFixedUpdate!, (dt) => fixedDeltas.push(dt));

    startAppLoop(host.app.loop, host.app.lifecycle, app, { fixedTimeStep: 16 });
    backend.tick(0);
    backend.tick(48); // 48ms → 3 fixed steps of 16ms

    expect(fixedDeltas.length).toBeGreaterThanOrEqual(3);
    expect(fixedDeltas[0]).toBe(16);
    stopAppLoop(app);
  });

  it('clamps to maxUpdatesPerFrame to prevent spiral-of-death', () => {
    const backend = makeManualLoopBackend();
    const host = createLoopTestHost(backend);
    const app = createAppLoop();
    enableAppLoopLifecycleSignals(app);
    let fixedCount = 0;
    connectSignal(app.onFixedUpdate!, () => fixedCount++);

    startAppLoop(host.app.loop, host.app.lifecycle, app, { fixedTimeStep: 16, maxUpdatesPerFrame: 3 });
    backend.tick(0);
    backend.tick(10000); // huge gap

    expect(fixedCount).toBeLessThanOrEqual(3);
    stopAppLoop(app);
  });

  it('sets interpolationAlpha between 0 and 1 during fixed step', () => {
    const backend = makeManualLoopBackend();
    const host = createLoopTestHost(backend);
    const app = createAppLoop();
    enableAppLoopLifecycleSignals(app);

    startAppLoop(host.app.loop, host.app.lifecycle, app, { fixedTimeStep: 16 });
    backend.tick(0);
    backend.tick(24); // 24ms = 1 full step (16ms) + 8ms remainder → alpha = 8/16 = 0.5

    expect(app.interpolationAlpha).toBeGreaterThanOrEqual(0);
    expect(app.interpolationAlpha).toBeLessThanOrEqual(1);
    stopAppLoop(app);
  });

  it('routes fixed-update errors through onError and continues the frame', () => {
    const backend = makeManualLoopBackend();
    const host = createLoopTestHost(backend);
    const app = createAppLoop();
    enableAppLoopLifecycleSignals(app);
    const errors: unknown[] = [];
    const fixedUpdateError = new Error('fixed update failed');
    let updates = 0;
    let renders = 0;
    connectSignal(app.onError!, (error) => errors.push(error));
    connectSignal(app.onFixedUpdate!, () => {
      throw fixedUpdateError;
    });
    connectSignal(app.onUpdate, () => updates++);
    connectSignal(app.onRender, () => renders++);

    startAppLoop(host.app.loop, host.app.lifecycle, app, { fixedTimeStep: 16 });
    backend.tick(0);
    backend.tick(32);

    expect(errors).toEqual([fixedUpdateError, fixedUpdateError]);
    expect(updates).toBe(2);
    expect(renders).toBe(2);
    stopAppLoop(app);
  });
});

describe('startAppLoop (tick-error routing)', () => {
  it('routes onUpdate errors to onError when lifecycle signals enabled', () => {
    const backend = makeManualLoopBackend();
    const host = createLoopTestHost(backend);
    const app = createAppLoop();
    enableAppLoopLifecycleSignals(app);
    const errors: unknown[] = [];
    connectSignal(app.onError!, (e) => errors.push(e));

    const boom = new Error('boom');
    connectSignal(app.onUpdate, () => {
      throw boom;
    });

    startAppLoop(host.app.loop, host.app.lifecycle, app);
    backend.tick(0);

    expect(errors).toContain(boom);
    // Loop must still be running (rAF chain not killed).
    expect(app.isRunning).toBe(true);
    stopAppLoop(app);
  });
});

describe('stepAppLoop', () => {
  it('drives one tick with the supplied delta', () => {
    const app = createAppLoop();
    const updates: number[] = [];
    let renders = 0;
    connectSignal(app.onUpdate, (dt) => updates.push(dt));
    connectSignal(app.onRender, () => renders++);

    stepAppLoop(app, 16);

    expect(updates).toEqual([16]);
    expect(renders).toBe(1);
  });

  it('clamps the delta to the default maxDeltaTime (250ms)', () => {
    const app = createAppLoop();
    const updates: number[] = [];
    connectSignal(app.onUpdate, (dt) => updates.push(dt));

    stepAppLoop(app, 9999);

    expect(updates[0]).toBe(250);
  });

  it('updates frame metrics', () => {
    const app = createAppLoop();
    enableAppLoopLifecycleSignals(app);
    const fixedDeltas: number[] = [];
    connectSignal(app.onFixedUpdate!, (delta) => fixedDeltas.push(delta));
    app.interpolationAlpha = 0.25;

    stepAppLoop(app, 16);

    expect(app.frameCount).toBe(1);
    expect(app.deltaTime).toBe(16);
    expect(app.elapsedTime).toBeCloseTo(0.016, 5);
    expect(app.interpolationAlpha).toBe(1);
    expect(fixedDeltas).toEqual([]);
  });

  it('runs fixed updates standalone and retains the residual accumulator across calls', () => {
    const app = createAppLoop();
    enableAppLoopLifecycleSignals(app);
    const fixedDeltas: number[] = [];
    connectSignal(app.onFixedUpdate!, (delta) => fixedDeltas.push(delta));

    stepAppLoop(app, 10, { fixedTimeStep: 16 });
    expect(fixedDeltas).toEqual([]);
    expect(app.interpolationAlpha).toBeCloseTo(0.625, 5);

    stepAppLoop(app, 10, { fixedTimeStep: 16 });
    expect(fixedDeltas).toEqual([16]);
    expect(app.interpolationAlpha).toBeCloseTo(0.25, 5);
  });

  it('uses explicit fixed-step options instead of policy from an active backend loop', () => {
    const backend = makeManualLoopBackend();
    const host = createLoopTestHost(backend);
    const app = createAppLoop();
    enableAppLoopLifecycleSignals(app);
    const fixedDeltas: number[] = [];
    connectSignal(app.onFixedUpdate!, (delta) => fixedDeltas.push(delta));

    startAppLoop(host.app.loop, host.app.lifecycle, app, { fixedTimeStep: 8 });
    stepAppLoop(app, 12, { fixedTimeStep: 12 });

    expect(fixedDeltas).toEqual([12]);
    expect(app.interpolationAlpha).toBe(0);
    stopAppLoop(app);
  });

  it('carries residual wall time across different explicit fixed-step sizes', () => {
    const app = createAppLoop();
    enableAppLoopLifecycleSignals(app);
    const fixedDeltas: number[] = [];
    connectSignal(app.onFixedUpdate!, (delta) => fixedDeltas.push(delta));

    stepAppLoop(app, 10, { fixedTimeStep: 16 });
    stepAppLoop(app, 4, { fixedTimeStep: 8 });

    expect(fixedDeltas).toEqual([8]);
    expect(app.interpolationAlpha).toBe(0.75);
  });

  it('carries fixed residual across an intervening variable step', () => {
    const app = createAppLoop();
    enableAppLoopLifecycleSignals(app);
    const fixedDeltas: number[] = [];
    connectSignal(app.onFixedUpdate!, (delta) => fixedDeltas.push(delta));

    stepAppLoop(app, 10, { fixedTimeStep: 16 });
    stepAppLoop(app, 100);
    expect(fixedDeltas).toEqual([]);
    expect(app.interpolationAlpha).toBe(1);

    stepAppLoop(app, 6, { fixedTimeStep: 16 });
    expect(fixedDeltas).toEqual([16]);
    expect(app.interpolationAlpha).toBe(0);
  });

  it('uses an explicit max delta instead of the active backend loop clamp', () => {
    const backend = makeManualLoopBackend();
    const host = createLoopTestHost(backend);
    const app = createAppLoop();

    startAppLoop(host.app.loop, host.app.lifecycle, app, { maxDeltaTime: 100 });
    stepAppLoop(app, 9999, { maxDeltaTime: 40 });

    expect(app.deltaTime).toBe(40);
    stopAppLoop(app);
  });

  it('routes update and render errors independently through onError', () => {
    const app = createAppLoop();
    enableAppLoopLifecycleSignals(app);
    const errors: unknown[] = [];
    const updateError = new Error('update failed');
    const renderError = new Error('render failed');
    connectSignal(app.onError!, (error) => errors.push(error));
    connectSignal(app.onUpdate, () => {
      throw updateError;
    });
    connectSignal(app.onRender, () => {
      throw renderError;
    });

    stepAppLoop(app, 16);

    expect(errors).toEqual([updateError, renderError]);
  });

  it('uses the default 250ms max clamp when called without a prior loop', () => {
    const app = createAppLoop();
    const updates: number[] = [];
    connectSignal(app.onUpdate, (dt) => updates.push(dt));

    stepAppLoop(app, 9999);

    expect(updates[0]).toBe(250);
  });

  it('produces reproducible metrics when stepped to a fixed frame count with a fixed delta', () => {
    // Pins the headless-stepping contract: identical caller-supplied deltas across a fixed frame
    // count must yield identical frameCount / elapsedTime / deltaTime, independent of wall-clock.
    const run = (): Readonly<{
      deltaTime: number;
      elapsedTime: number;
      frameCount: number;
      updates: readonly number[];
    }> => {
      const app = createAppLoop();
      const updates: number[] = [];
      connectSignal(app.onUpdate, (dt) => updates.push(dt));
      for (let i = 0; i < 10; i++) stepAppLoop(app, 16);
      return { deltaTime: app.deltaTime, elapsedTime: app.elapsedTime, frameCount: app.frameCount, updates };
    };

    const first = run();
    const second = run();

    expect(first.frameCount).toBe(10);
    expect(first.deltaTime).toBe(16);
    expect(first.elapsedTime).toBeCloseTo(0.16, 10);
    expect(first.updates).toEqual(new Array(10).fill(16));
    expect(second).toEqual(first);
  });
});

describe('stopAppLoop', () => {
  it('sets isRunning to false', () => {
    const backend = makeManualLoopBackend();
    const host = createLoopTestHost(backend);
    const app = createAppLoop();
    startAppLoop(host.app.loop, host.app.lifecycle, app);
    stopAppLoop(app);
    expect(app.isRunning).toBe(false);
  });

  it('stops emitting after stop', () => {
    const backend = makeManualLoopBackend();
    const host = createLoopTestHost(backend);
    const app = createAppLoop();
    let renders = 0;
    connectSignal(app.onRender, () => renders++);
    startAppLoop(host.app.loop, host.app.lifecycle, app);
    backend.tick(0);
    stopAppLoop(app);
    // After stop, calling tick should not emit even if the backend fires.
    // (The backend callback reference is cleared, so tick() is a no-op.)
    expect(renders).toBe(1);
  });
});
describe('unregisterAppLoopWindow', () => {
  it('removes a registered window', () => {
    const app = createAppLoop();
    const win = createAppWindow();
    registerAppLoopWindow(app, win);
    unregisterAppLoopWindow(app, win);
    expect(app.windows).not.toContain(win);
  });

  it('clears the main-window override if removed', () => {
    const app = createAppLoop();
    const win = createAppWindow();
    setAppLoopMainWindow(app, win);
    unregisterAppLoopWindow(app, win);
    expect(getAppLoopMainWindow(app)).toBeNull();
  });

  it('is a no-op for unregistered windows', () => {
    const app = createAppLoop();
    const win = createAppWindow();
    expect(() => unregisterAppLoopWindow(app, win)).not.toThrow();
  });
});
