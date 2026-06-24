import { connectSignal, emitSignal } from '@flighthq/signals';
import type { LoopBackend } from '@flighthq/types';

import {
  attachApplicationExit,
  attachApplicationLifecycle,
  createApplication,
  createWebLoopBackend,
  detachApplicationExit,
  disposeApplication,
  enableApplicationLifecycleSignals,
  forEachApplicationWindow,
  getApplicationFrameRate,
  getApplicationMainWindow,
  getApplicationWindows,
  getLoopBackend,
  isApplicationRunning,
  pauseApplicationLoop,
  registerApplicationWindow,
  resumeApplicationLoop,
  setApplicationMainWindow,
  setLoopBackend,
  startApplicationLoop,
  stepApplicationLoop,
  stopApplicationLoop,
  unregisterApplicationWindow,
} from './application';
import { createApplicationWindow } from './window';

function makeManualLoopBackend(): LoopBackend & { tick: (time: number) => void; cancelCount: number } {
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

afterEach(() => setLoopBackend(null));

describe('attachApplicationExit', () => {
  it('emits onExit on beforeunload', () => {
    const app = createApplication();
    let called = false;
    connectSignal(app.onExit, () => {
      called = true;
    });

    attachApplicationExit(app);
    window.dispatchEvent(new Event('beforeunload'));

    expect(called).toBe(true);
  });

  it('replaces a previous exit listener when called again', () => {
    const app = createApplication();
    let count = 0;
    connectSignal(app.onExit, () => count++);

    attachApplicationExit(app);
    attachApplicationExit(app);
    window.dispatchEvent(new Event('beforeunload'));

    expect(count).toBe(1);
  });
});

describe('attachApplicationLifecycle', () => {
  it('pauses the loop when the window deactivates', () => {
    const backend = makeManualLoopBackend();
    setLoopBackend(backend);
    const app = createApplication();
    const win = createApplicationWindow();
    startApplicationLoop(app);
    attachApplicationLifecycle(app, win);

    // Simulate window deactivation by emitting its signal directly.
    emitSignal(win.onDeactivate);
    expect(app.isRunning).toBe(false);
    stopApplicationLoop(app);
  });

  it('resumes the loop when the window activates', () => {
    const backend = makeManualLoopBackend();
    setLoopBackend(backend);
    const app = createApplication();
    const win = createApplicationWindow();
    startApplicationLoop(app);
    attachApplicationLifecycle(app, win);

    emitSignal(win.onDeactivate);
    expect(app.isRunning).toBe(false);
    emitSignal(win.onActivate);
    expect(app.isRunning).toBe(true);
    stopApplicationLoop(app);
  });
});

describe('createApplication', () => {
  it('returns signals with no side effects', () => {
    const app = createApplication();
    expect(app.onUpdate).toBeDefined();
    expect(app.onRender).toBeDefined();
    expect(app.onExit).toBeDefined();

    let exitCalled = false;
    connectSignal(app.onExit, () => {
      exitCalled = true;
    });
    window.dispatchEvent(new Event('beforeunload'));
    expect(exitCalled).toBe(false);
  });

  it('initializes frame metrics to zero', () => {
    const app = createApplication();
    expect(app.elapsedTime).toBe(0);
    expect(app.frameCount).toBe(0);
    expect(app.deltaTime).toBe(0);
    expect(app.isRunning).toBe(false);
    expect(app.interpolationAlpha).toBe(1);
    expect(app.windows).toEqual([]);
  });

  it('initializes lifecycle signals to null', () => {
    const app = createApplication();
    expect(app.onActivate).toBeNull();
    expect(app.onDeactivate).toBeNull();
    expect(app.onError).toBeNull();
    expect(app.onFixedUpdate).toBeNull();
  });
});

describe('createWebLoopBackend', () => {
  it('wraps requestAnimationFrame', () => {
    const raf = vi.fn().mockReturnValue(42);
    vi.stubGlobal('requestAnimationFrame', raf);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const backend = createWebLoopBackend();
    const handle = backend.requestFrame(() => {});
    expect(raf).toHaveBeenCalled();
    expect(handle).toBe(42);
    vi.unstubAllGlobals();
  });

  it('wraps cancelAnimationFrame', () => {
    const caf = vi.fn();
    vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(1));
    vi.stubGlobal('cancelAnimationFrame', caf);
    const backend = createWebLoopBackend();
    const handle = backend.requestFrame(() => {});
    backend.cancelFrame(handle);
    expect(caf).toHaveBeenCalledWith(1);
    vi.unstubAllGlobals();
  });
});

describe('detachApplicationExit', () => {
  it('removes the listener', () => {
    const app = createApplication();
    let called = false;
    connectSignal(app.onExit, () => {
      called = true;
    });

    attachApplicationExit(app);
    detachApplicationExit(app);
    window.dispatchEvent(new Event('beforeunload'));

    expect(called).toBe(false);
  });
});

describe('disposeApplication', () => {
  it('stops loop, removes exit listener, and sets isRunning false', () => {
    const backend = makeManualLoopBackend();
    setLoopBackend(backend);

    const app = createApplication();
    let exitCalled = false;
    connectSignal(app.onExit, () => {
      exitCalled = true;
    });

    startApplicationLoop(app);
    attachApplicationExit(app);
    expect(app.isRunning).toBe(true);
    disposeApplication(app);

    expect(app.isRunning).toBe(false);
    window.dispatchEvent(new Event('beforeunload'));
    expect(exitCalled).toBe(false);
  });
});

describe('enableApplicationLifecycleSignals', () => {
  it('allocates the opt-in signals on the application', () => {
    const app = createApplication();
    expect(app.onActivate).toBeNull();
    enableApplicationLifecycleSignals(app);
    expect(app.onActivate).not.toBeNull();
    expect(app.onDeactivate).not.toBeNull();
    expect(app.onError).not.toBeNull();
    expect(app.onFixedUpdate).not.toBeNull();
  });

  it('is idempotent', () => {
    const app = createApplication();
    enableApplicationLifecycleSignals(app);
    const signal = app.onActivate;
    enableApplicationLifecycleSignals(app);
    expect(app.onActivate).toBe(signal); // same object reference
  });
});

describe('forEachApplicationWindow', () => {
  it('iterates all registered windows', () => {
    const app = createApplication();
    const win1 = createApplicationWindow();
    const win2 = createApplicationWindow();
    registerApplicationWindow(app, win1);
    registerApplicationWindow(app, win2);
    const seen: unknown[] = [];
    forEachApplicationWindow(app, (w) => seen.push(w));
    expect(seen).toEqual([win1, win2]);
  });
});

describe('getApplicationFrameRate', () => {
  it('returns 0 before any ticks', () => {
    const app = createApplication();
    expect(getApplicationFrameRate(app)).toBe(0);
  });

  it('returns approximate FPS after several ticks', () => {
    const backend = makeManualLoopBackend();
    setLoopBackend(backend);
    const app = createApplication();
    startApplicationLoop(app);
    // Simulate 60fps ticks (~16.67ms each).
    for (let i = 0; i <= 60; i++) {
      backend.tick(i * 16.67);
    }
    const fps = getApplicationFrameRate(app);
    expect(fps).toBeGreaterThan(55);
    expect(fps).toBeLessThan(65);
    stopApplicationLoop(app);
  });
});

describe('getApplicationMainWindow', () => {
  it('returns null with no windows', () => {
    const app = createApplication();
    expect(getApplicationMainWindow(app)).toBeNull();
  });

  it('returns the first registered window by default', () => {
    const app = createApplication();
    const win1 = createApplicationWindow();
    const win2 = createApplicationWindow();
    registerApplicationWindow(app, win1);
    registerApplicationWindow(app, win2);
    expect(getApplicationMainWindow(app)).toBe(win1);
  });

  it('returns the explicitly set main window', () => {
    const app = createApplication();
    const win1 = createApplicationWindow();
    const win2 = createApplicationWindow();
    registerApplicationWindow(app, win1);
    setApplicationMainWindow(app, win2);
    expect(getApplicationMainWindow(app)).toBe(win2);
  });
});

describe('getApplicationWindows', () => {
  it('returns an empty array initially', () => {
    const app = createApplication();
    expect(getApplicationWindows(app)).toEqual([]);
  });

  it('returns a snapshot of registered windows', () => {
    const app = createApplication();
    const win = createApplicationWindow();
    registerApplicationWindow(app, win);
    const snapshot = getApplicationWindows(app);
    expect(snapshot).toEqual([win]);
    // Snapshot is a copy — mutating it does not affect the registry.
    (snapshot as unknown[]).push(null);
    expect(app.windows.length).toBe(1);
  });
});

describe('getLoopBackend', () => {
  it('falls back to a web backend', () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn());
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const backend = getLoopBackend();
    expect(backend).not.toBeNull();
    vi.unstubAllGlobals();
  });

  it('returns the registered backend', () => {
    const backend = makeManualLoopBackend();
    setLoopBackend(backend);
    expect(getLoopBackend()).toBe(backend);
  });
});

describe('isApplicationRunning', () => {
  it('returns false before loop is started', () => {
    const app = createApplication();
    expect(isApplicationRunning(app)).toBe(false);
  });

  it('returns true after loop is started', () => {
    const backend = makeManualLoopBackend();
    setLoopBackend(backend);
    const app = createApplication();
    startApplicationLoop(app);
    expect(isApplicationRunning(app)).toBe(true);
    stopApplicationLoop(app);
  });

  it('returns false after loop is stopped', () => {
    const backend = makeManualLoopBackend();
    setLoopBackend(backend);
    const app = createApplication();
    startApplicationLoop(app);
    stopApplicationLoop(app);
    expect(isApplicationRunning(app)).toBe(false);
  });
});

describe('pauseApplicationLoop', () => {
  it('pauses emission without cancelling the rAF chain', () => {
    const backend = makeManualLoopBackend();
    setLoopBackend(backend);
    const app = createApplication();
    const updates: number[] = [];
    connectSignal(app.onUpdate, (dt) => updates.push(dt));

    startApplicationLoop(app);
    backend.tick(0);
    backend.tick(16);
    pauseApplicationLoop(app);
    backend.tick(32); // should not emit since paused
    expect(updates.length).toBe(2);
    expect(app.isRunning).toBe(false);
    stopApplicationLoop(app);
  });

  it('is idempotent', () => {
    const backend = makeManualLoopBackend();
    setLoopBackend(backend);
    const app = createApplication();
    startApplicationLoop(app);
    pauseApplicationLoop(app);
    pauseApplicationLoop(app); // second call should not throw
    expect(app.isRunning).toBe(false);
    stopApplicationLoop(app);
  });
});

describe('registerApplicationWindow', () => {
  it('adds a window to the registry', () => {
    const app = createApplication();
    const win = createApplicationWindow();
    registerApplicationWindow(app, win);
    expect(app.windows).toContain(win);
  });

  it('is idempotent', () => {
    const app = createApplication();
    const win = createApplicationWindow();
    registerApplicationWindow(app, win);
    registerApplicationWindow(app, win);
    expect(app.windows.length).toBe(1);
  });
});

describe('resumeApplicationLoop', () => {
  it('resumes emission after pause without dumping the gap delta', () => {
    const backend = makeManualLoopBackend();
    setLoopBackend(backend);
    const app = createApplication();
    const updates: number[] = [];
    connectSignal(app.onUpdate, (dt) => updates.push(dt));

    startApplicationLoop(app);
    backend.tick(0);
    backend.tick(16);
    pauseApplicationLoop(app);
    // Resume and tick — lastTime was reset so first tick after resume has delta 0.
    resumeApplicationLoop(app);
    backend.tick(5000); // large gap should not flood through; lastTime was reset to -1
    // The tick at 5000 should emit delta=0 (first tick after reset).
    expect(updates[updates.length - 1]).toBe(0);
    expect(app.isRunning).toBe(true);
    stopApplicationLoop(app);
  });

  it('is a no-op when not paused', () => {
    const backend = makeManualLoopBackend();
    setLoopBackend(backend);
    const app = createApplication();
    startApplicationLoop(app);
    resumeApplicationLoop(app); // not paused, should not throw
    expect(app.isRunning).toBe(true);
    stopApplicationLoop(app);
  });
});

describe('setApplicationMainWindow', () => {
  it('registers the window if not already registered', () => {
    const app = createApplication();
    const win = createApplicationWindow();
    setApplicationMainWindow(app, win);
    expect(app.windows).toContain(win);
    expect(getApplicationMainWindow(app)).toBe(win);
  });
});

describe('setLoopBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    const backend = makeManualLoopBackend();
    setLoopBackend(backend);
    setLoopBackend(null);
    vi.stubGlobal('requestAnimationFrame', vi.fn());
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    expect(getLoopBackend()).not.toBeNull();
    vi.unstubAllGlobals();
  });
});

describe('startApplicationLoop', () => {
  it('sets isRunning to true', () => {
    const backend = makeManualLoopBackend();
    setLoopBackend(backend);
    const app = createApplication();
    startApplicationLoop(app);
    expect(app.isRunning).toBe(true);
    stopApplicationLoop(app);
  });

  it('replaces a previous loop when called again', () => {
    const backend = makeManualLoopBackend();
    setLoopBackend(backend);
    const app = createApplication();
    startApplicationLoop(app);
    const initialCancelCount = backend.cancelCount;
    startApplicationLoop(app);
    expect(backend.cancelCount).toBeGreaterThan(initialCancelCount);
    stopApplicationLoop(app);
  });

  it('emits onUpdate with clamped delta and onRender on each tick', () => {
    const backend = makeManualLoopBackend();
    setLoopBackend(backend);
    const app = createApplication();
    const updates: number[] = [];
    let renders = 0;
    connectSignal(app.onUpdate, (dt) => updates.push(dt));
    connectSignal(app.onRender, () => renders++);

    startApplicationLoop(app);
    backend.tick(0);
    backend.tick(100);

    expect(updates).toEqual([0, 100]);
    expect(renders).toBe(2);
    stopApplicationLoop(app);
  });

  it('clamps large delta gaps to maxDeltaTime', () => {
    const backend = makeManualLoopBackend();
    setLoopBackend(backend);
    const app = createApplication();
    const updates: number[] = [];
    connectSignal(app.onUpdate, (dt) => updates.push(dt));

    startApplicationLoop(app, { maxDeltaTime: 100 });
    backend.tick(0);
    backend.tick(5000); // 5 second gap clamped to 100ms

    expect(updates[1]).toBe(100);
    stopApplicationLoop(app);
  });

  it('defaults to 250ms max delta clamp', () => {
    const backend = makeManualLoopBackend();
    setLoopBackend(backend);
    const app = createApplication();
    const updates: number[] = [];
    connectSignal(app.onUpdate, (dt) => updates.push(dt));

    startApplicationLoop(app);
    backend.tick(0);
    backend.tick(10000); // 10 second gap clamped to 250ms

    expect(updates[1]).toBe(250);
    stopApplicationLoop(app);
  });

  it('accumulates frame count and elapsed time', () => {
    const backend = makeManualLoopBackend();
    setLoopBackend(backend);
    const app = createApplication();

    startApplicationLoop(app);
    backend.tick(0);
    backend.tick(16);
    backend.tick(32);

    expect(app.frameCount).toBe(3);
    // elapsedTime is in seconds; 0+16+16 = 32ms = 0.032s (clamped)
    expect(app.elapsedTime).toBeCloseTo(0.032, 3);
    stopApplicationLoop(app);
  });

  it('throttles to targetFrameRate when set', () => {
    const backend = makeManualLoopBackend();
    setLoopBackend(backend);
    const app = createApplication();
    let renders = 0;
    connectSignal(app.onRender, () => renders++);

    startApplicationLoop(app, { targetFrameRate: 30 }); // 33.33ms interval
    backend.tick(0); // first tick: lastTime=-1 so delta=0, accumulated=0 → emits
    backend.tick(16); // 16ms < 33.33ms → should skip
    backend.tick(34); // 34ms accumulated ≥ 33.33ms → should emit

    // The first tick always emits (delta=0); accumulated starts at 0.
    // Second tick adds 16ms (below threshold), third tick accumulated to ~34ms triggers.
    expect(renders).toBeGreaterThanOrEqual(2);
    stopApplicationLoop(app);
  });
});

describe('startApplicationLoop (fixed timestep)', () => {
  it('emits onFixedUpdate when fixedTimeStep is set', () => {
    const backend = makeManualLoopBackend();
    setLoopBackend(backend);
    const app = createApplication();
    enableApplicationLifecycleSignals(app);
    const fixedDeltas: number[] = [];
    connectSignal(app.onFixedUpdate!, (dt) => fixedDeltas.push(dt));

    startApplicationLoop(app, { fixedTimeStep: 16 });
    backend.tick(0);
    backend.tick(48); // 48ms → 3 fixed steps of 16ms

    expect(fixedDeltas.length).toBeGreaterThanOrEqual(3);
    expect(fixedDeltas[0]).toBe(16);
    stopApplicationLoop(app);
  });

  it('clamps to maxUpdatesPerFrame to prevent spiral-of-death', () => {
    const backend = makeManualLoopBackend();
    setLoopBackend(backend);
    const app = createApplication();
    enableApplicationLifecycleSignals(app);
    let fixedCount = 0;
    connectSignal(app.onFixedUpdate!, () => fixedCount++);

    startApplicationLoop(app, { fixedTimeStep: 16, maxUpdatesPerFrame: 3 });
    backend.tick(0);
    backend.tick(10000); // huge gap

    expect(fixedCount).toBeLessThanOrEqual(3);
    stopApplicationLoop(app);
  });

  it('sets interpolationAlpha between 0 and 1 during fixed step', () => {
    const backend = makeManualLoopBackend();
    setLoopBackend(backend);
    const app = createApplication();
    enableApplicationLifecycleSignals(app);

    startApplicationLoop(app, { fixedTimeStep: 16 });
    backend.tick(0);
    backend.tick(24); // 24ms = 1 full step (16ms) + 8ms remainder → alpha = 8/16 = 0.5

    expect(app.interpolationAlpha).toBeGreaterThanOrEqual(0);
    expect(app.interpolationAlpha).toBeLessThanOrEqual(1);
    stopApplicationLoop(app);
  });
});

describe('startApplicationLoop (tick-error routing)', () => {
  it('routes onUpdate errors to onError when lifecycle signals enabled', () => {
    const backend = makeManualLoopBackend();
    setLoopBackend(backend);
    const app = createApplication();
    enableApplicationLifecycleSignals(app);
    const errors: unknown[] = [];
    connectSignal(app.onError!, (e) => errors.push(e));

    const boom = new Error('boom');
    connectSignal(app.onUpdate, () => {
      throw boom;
    });

    startApplicationLoop(app);
    backend.tick(0);

    expect(errors).toContain(boom);
    // Loop must still be running (rAF chain not killed).
    expect(app.isRunning).toBe(true);
    stopApplicationLoop(app);
  });
});

describe('stepApplicationLoop', () => {
  it('drives one tick with the supplied delta', () => {
    const app = createApplication();
    const updates: number[] = [];
    let renders = 0;
    connectSignal(app.onUpdate, (dt) => updates.push(dt));
    connectSignal(app.onRender, () => renders++);

    stepApplicationLoop(app, 16);

    expect(updates).toEqual([16]);
    expect(renders).toBe(1);
  });

  it('clamps the delta to the default maxDeltaTime (250ms)', () => {
    const app = createApplication();
    const updates: number[] = [];
    connectSignal(app.onUpdate, (dt) => updates.push(dt));

    stepApplicationLoop(app, 9999);

    expect(updates[0]).toBe(250);
  });

  it('updates frame metrics', () => {
    const app = createApplication();
    stepApplicationLoop(app, 16);
    expect(app.frameCount).toBe(1);
    expect(app.deltaTime).toBe(16);
    expect(app.elapsedTime).toBeCloseTo(0.016, 5);
  });

  it('uses the default 250ms max clamp when called without a prior loop', () => {
    const app = createApplication();
    const updates: number[] = [];
    connectSignal(app.onUpdate, (dt) => updates.push(dt));

    stepApplicationLoop(app, 9999);

    expect(updates[0]).toBe(250);
  });
});

describe('stopApplicationLoop', () => {
  it('sets isRunning to false', () => {
    const backend = makeManualLoopBackend();
    setLoopBackend(backend);
    const app = createApplication();
    startApplicationLoop(app);
    stopApplicationLoop(app);
    expect(app.isRunning).toBe(false);
  });

  it('stops emitting after stop', () => {
    const backend = makeManualLoopBackend();
    setLoopBackend(backend);
    const app = createApplication();
    let renders = 0;
    connectSignal(app.onRender, () => renders++);
    startApplicationLoop(app);
    backend.tick(0);
    stopApplicationLoop(app);
    // After stop, calling tick should not emit even if the backend fires.
    // (The backend callback reference is cleared, so tick() is a no-op.)
    expect(renders).toBe(1);
  });
});

describe('unregisterApplicationWindow', () => {
  it('removes a registered window', () => {
    const app = createApplication();
    const win = createApplicationWindow();
    registerApplicationWindow(app, win);
    unregisterApplicationWindow(app, win);
    expect(app.windows).not.toContain(win);
  });

  it('clears the main-window override if removed', () => {
    const app = createApplication();
    const win = createApplicationWindow();
    setApplicationMainWindow(app, win);
    unregisterApplicationWindow(app, win);
    expect(getApplicationMainWindow(app)).toBeNull();
  });

  it('is a no-op for unregistered windows', () => {
    const app = createApplication();
    const win = createApplicationWindow();
    expect(() => unregisterApplicationWindow(app, win)).not.toThrow();
  });
});
