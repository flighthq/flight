import { connectSignal, createSignal, disconnectSignal, emitSignal } from '@flighthq/signals';
import type { Application, ApplicationLoopOptions, ApplicationWindow, LoopBackend } from '@flighthq/types';

const DEFAULT_BACKGROUND_FRAME_RATE = 0; // 0 = disabled; use same rate when in background
const DEFAULT_FIXED_TIMESTEP = 0; // 0 = disabled; pure variable mode
const DEFAULT_MAX_DELTA_TIME = 250; // ms — clamps huge gaps after tab restore
const DEFAULT_MAX_UPDATES_PER_FRAME = 5; // spiral-of-death guard for fixed-timestep mode

const kExit = Symbol();
const kLoop = Symbol();
const kPaused = Symbol();

// -- Application entity --

export function attachApplicationExit(app: Application): void {
  const observers = getApplicationObservers(app);
  observers.get(kExit)?.();
  const handler = () => emitSignal(app.onExit);
  window.addEventListener('beforeunload', handler);
  observers.set(kExit, () => window.removeEventListener('beforeunload', handler));
}

// Wires window onDeactivate → pauseApplicationLoop and onActivate → resumeApplicationLoop so the
// loop automatically throttles/pauses when the user backgrounds the tab or hides the window.
// Opt-in — not wired by default. Pair with detachApplicationLifecycle to undo.
export function attachApplicationLifecycle(app: Application, win: ApplicationWindow): void {
  // Use a per-win symbol keyed in a side WeakMap to allow multiple windows.
  let kLifecycle = _lifecycleKeys.get(win);
  if (kLifecycle === undefined) {
    kLifecycle = Symbol();
    _lifecycleKeys.set(win, kLifecycle);
  }
  const observers = getApplicationObservers(app);
  observers.get(kLifecycle)?.();

  const onDeactivate = () => {
    pauseApplicationLoop(app);
    if (app.onDeactivate !== null) emitSignal(app.onDeactivate);
  };
  const onActivate = () => {
    resumeApplicationLoop(app);
    if (app.onActivate !== null) emitSignal(app.onActivate);
  };

  connectSignal(win.onDeactivate, onDeactivate);
  connectSignal(win.onActivate, onActivate);
  observers.set(kLifecycle, () => {
    disconnectSignal(win.onDeactivate, onDeactivate);
    disconnectSignal(win.onActivate, onActivate);
  });
}

export function createApplication(): Application {
  return {
    deltaTime: 0,
    elapsedTime: 0,
    frameCount: 0,
    interpolationAlpha: 1,
    isRunning: false,
    onActivate: null,
    onDeactivate: null,
    onError: null,
    onExit: createSignal(),
    onFixedUpdate: null,
    onRender: createSignal(),
    onUpdate: createSignal(),
    windows: [],
  };
}

export function createWebLoopBackend(): LoopBackend {
  return {
    requestFrame(callback: (time: number) => void): unknown {
      return requestAnimationFrame(callback);
    },
    cancelFrame(handle: unknown): void {
      cancelAnimationFrame(handle as number);
    },
    now(): number {
      return performance.now();
    },
  };
}

export function detachApplicationExit(app: Application): void {
  const observers = getApplicationObservers(app);
  observers.get(kExit)?.();
  observers.delete(kExit);
}

export function disposeApplication(app: Application): void {
  const observers = getApplicationObservers(app);
  for (const cleanup of observers.values()) cleanup();
  observers.clear();
  app.isRunning = false;
}

// Allocates and attaches the opt-in lifecycle signals (onActivate, onDeactivate, onError,
// onFixedUpdate) to an application that was created before these were needed. Idempotent —
// calling twice does not create duplicate signals.
export function enableApplicationLifecycleSignals(app: Application): void {
  if (app.onActivate === null) app.onActivate = createSignal();
  if (app.onDeactivate === null) app.onDeactivate = createSignal();
  if (app.onError === null) app.onError = createSignal();
  if (app.onFixedUpdate === null) app.onFixedUpdate = createSignal();
}

// Iterates over all registered application windows, calling fn for each. Does not allocate.
export function forEachApplicationWindow(app: Readonly<Application>, fn: (win: ApplicationWindow) => void): void {
  for (const win of app.windows) fn(win);
}

// Returns the measured rolling-average frames per second for the last ROLLING_FPS_WINDOW frames.
// Returns 0 before enough samples have been collected.
export function getApplicationFrameRate(app: Readonly<Application>): number {
  const state = _applicationLoopState.get(app as Application);
  if (state === undefined || state.fpsBuffer.length < 2) return 0;
  const buf = state.fpsBuffer;
  const len = buf.length;
  // Sum valid deltas (all positive).
  let total = 0;
  let count = 0;
  for (let i = 0; i < len; i++) {
    if (buf[i] > 0) {
      total += buf[i];
      count++;
    }
  }
  if (count === 0) return 0;
  const avgDelta = total / count;
  return avgDelta > 0 ? 1000 / avgDelta : 0;
}

// Returns the main window (first registered window, or the one set via setApplicationMainWindow).
// Returns null if no windows have been registered.
export function getApplicationMainWindow(app: Readonly<Application>): ApplicationWindow | null {
  return _mainWindows.get(app as Application) ?? app.windows[0] ?? null;
}

// Returns a snapshot array of all registered windows. Creates a new array; prefer forEachApplicationWindow
// in hot paths.
export function getApplicationWindows(app: Readonly<Application>): readonly ApplicationWindow[] {
  return app.windows.slice();
}

export function getLoopBackend(): LoopBackend {
  if (_loopBackend === null) _loopBackend = createWebLoopBackend();
  return _loopBackend;
}

export function isApplicationRunning(app: Readonly<Application>): boolean {
  return app.isRunning;
}

export function pauseApplicationLoop(app: Application): void {
  const observers = getApplicationObservers(app);
  if (!app.isRunning || observers.has(kPaused)) return;
  app.isRunning = false;
  // Mark as paused so resumeApplicationLoop knows to re-seed lastTime.
  observers.set(kPaused, () => {});
}

// Registers win as a managed window on app. Adds it to app.windows; no-op if already present.
export function registerApplicationWindow(app: Application, win: ApplicationWindow): void {
  if (app.windows.includes(win)) return;
  app.windows.push(win);
}

export function resumeApplicationLoop(app: Application): void {
  const observers = getApplicationObservers(app);
  if (!observers.has(kPaused)) return;
  observers.delete(kPaused);
  // Re-seed lastTime to -1 so the first resumed tick computes delta from now, not from the pause
  // moment — avoids dumping the full pause gap into onUpdate.
  const loopState = _applicationLoopState.get(app);
  if (loopState !== undefined) {
    loopState.lastTime = -1;
    loopState.fixedAccumulator = 0;
    loopState.frameRateAccumulated = 0;
  }
  app.isRunning = true;
}

// Sets the explicit main window. win need not be registered first (the call registers it if not).
export function setApplicationMainWindow(app: Application, win: ApplicationWindow): void {
  registerApplicationWindow(app, win);
  _mainWindows.set(app, win);
}

// Installs a host loop backend. Pass null to fall back to the web default (requestAnimationFrame).
export function setLoopBackend(backend: LoopBackend | null): void {
  _loopBackend = backend;
}

export function startApplicationLoop(app: Application, options: Readonly<ApplicationLoopOptions> = {}): void {
  const observers = getApplicationObservers(app);
  // Stop any existing loop first (idempotent restart).
  observers.get(kLoop)?.();
  observers.delete(kPaused);

  const backend = getLoopBackend();
  const maxDeltaTime = options.maxDeltaTime ?? DEFAULT_MAX_DELTA_TIME;
  const targetFrameRate = options.targetFrameRate ?? 0;
  const backgroundFrameRate = options.backgroundFrameRate ?? DEFAULT_BACKGROUND_FRAME_RATE;
  const fixedTimeStep = options.fixedTimeStep ?? DEFAULT_FIXED_TIMESTEP;
  const maxUpdatesPerFrame = options.maxUpdatesPerFrame ?? DEFAULT_MAX_UPDATES_PER_FRAME;
  const frameInterval = targetFrameRate > 0 ? 1000 / targetFrameRate : 0;
  const bgInterval = backgroundFrameRate > 0 ? 1000 / backgroundFrameRate : 0;

  // Persist loop state so pauseApplicationLoop/resumeApplicationLoop can mutate lastTime.
  const loopState: LoopState = {
    fixedAccumulator: 0,
    fpsBuffer: [],
    fpsHead: 0,
    frameHandle: null as unknown,
    frameRateAccumulated: 0,
    lastTime: -1,
    maxDeltaTime,
  };
  _applicationLoopState.set(app, loopState);

  app.isRunning = true;

  function tick(time: number): void {
    if (!app.isRunning) {
      // Paused: reschedule but do not emit.
      loopState.frameHandle = backend.requestFrame(tick);
      observers.set(kLoop, () => backend.cancelFrame(loopState.frameHandle));
      return;
    }

    const isFirstTick = loopState.lastTime < 0;
    const raw = isFirstTick ? 0 : time - loopState.lastTime;
    loopState.lastTime = time;

    // Determine the effective frame interval for this tick (background throttle or normal cap).
    const activeInterval = app.isRunning && bgInterval > 0 && !_isApplicationVisible() ? bgInterval : frameInterval;

    // Frame-rate cap: skip this tick if we haven't reached the target interval. The first tick
    // always emits so the app receives an immediate first frame regardless of targetFrameRate.
    if (!isFirstTick) {
      loopState.frameRateAccumulated += raw;
      if (activeInterval > 0 && loopState.frameRateAccumulated < activeInterval) {
        loopState.frameHandle = backend.requestFrame(tick);
        observers.set(kLoop, () => backend.cancelFrame(loopState.frameHandle));
        return;
      }
    }

    const delta = activeInterval > 0 && !isFirstTick ? loopState.frameRateAccumulated : raw;
    loopState.frameRateAccumulated = 0;

    const clamped = Math.min(delta, maxDeltaTime);
    app.deltaTime = clamped;
    app.elapsedTime += clamped / 1000;
    app.frameCount += 1;

    // Rolling FPS sample.
    recordFpsSample(loopState, clamped);

    // Fixed-timestep accumulator.
    if (fixedTimeStep > 0 && app.onFixedUpdate !== null) {
      loopState.fixedAccumulator += clamped;
      let iters = 0;
      while (loopState.fixedAccumulator >= fixedTimeStep && iters < maxUpdatesPerFrame) {
        loopState.fixedAccumulator -= fixedTimeStep;
        iters++;
        if (app.onError !== null) {
          try {
            emitSignal(app.onFixedUpdate, fixedTimeStep);
          } catch (err: unknown) {
            emitSignal(app.onError, err);
          }
        } else {
          emitSignal(app.onFixedUpdate, fixedTimeStep);
        }
      }
      // If we hit the maxUpdatesPerFrame cap, drain the leftover to avoid spiral-of-death.
      if (iters >= maxUpdatesPerFrame) loopState.fixedAccumulator = 0;
      // interpolationAlpha: position within the current step at render time.
      app.interpolationAlpha = fixedTimeStep > 0 ? loopState.fixedAccumulator / fixedTimeStep : 1;
    } else {
      app.interpolationAlpha = 1;
    }

    if (app.onError !== null) {
      try {
        emitSignal(app.onUpdate, clamped);
      } catch (err: unknown) {
        emitSignal(app.onError, err);
      }
      try {
        emitSignal(app.onRender);
      } catch (err: unknown) {
        emitSignal(app.onError, err);
      }
    } else {
      emitSignal(app.onUpdate, clamped);
      emitSignal(app.onRender);
    }

    loopState.frameHandle = backend.requestFrame(tick);
    observers.set(kLoop, () => backend.cancelFrame(loopState.frameHandle));
  }

  loopState.frameHandle = backend.requestFrame(tick);
  observers.set(kLoop, () => backend.cancelFrame(loopState.frameHandle));
}

// Drives one update+render tick with an explicit delta (ms). Useful for headless testing,
// fixed-step simulation, and non-rAF hosts. Safe to call while the rAF loop is stopped.
export function stepApplicationLoop(app: Application, deltaTime: number): void {
  const loopState = _applicationLoopState.get(app);
  const maxDelta = loopState?.maxDeltaTime ?? DEFAULT_MAX_DELTA_TIME;
  const clamped = Math.min(deltaTime, maxDelta);
  app.deltaTime = clamped;
  app.elapsedTime += clamped / 1000;
  app.frameCount += 1;
  app.interpolationAlpha = 1;
  if (loopState !== undefined) recordFpsSample(loopState, clamped);
  if (app.onError !== null) {
    try {
      emitSignal(app.onUpdate, clamped);
    } catch (err: unknown) {
      emitSignal(app.onError, err);
    }
    try {
      emitSignal(app.onRender);
    } catch (err: unknown) {
      emitSignal(app.onError, err);
    }
  } else {
    emitSignal(app.onUpdate, clamped);
    emitSignal(app.onRender);
  }
}

export function stopApplicationLoop(app: Application): void {
  const observers = getApplicationObservers(app);
  observers.get(kLoop)?.();
  observers.delete(kLoop);
  observers.delete(kPaused);
  _applicationLoopState.delete(app);
  app.isRunning = false;
}

// Removes win from app.windows. Also clears any main-window override that pointed at win.
export function unregisterApplicationWindow(app: Application, win: ApplicationWindow): void {
  const idx = app.windows.indexOf(win);
  if (idx !== -1) app.windows.splice(idx, 1);
  if (_mainWindows.get(app) === win) _mainWindows.delete(app);
}

// Internal teardown registry, kept off the public Application entity (a side table like input's
// binding map). attach/detach/dispose track cleanup closures internally so callers hold nothing.
const _applicationObservers = new WeakMap<Application, Map<symbol, () => void>>();

// Per-app loop state for pause/resume continuity.
const _applicationLoopState = new WeakMap<Application, LoopState>();

// Per-win lifecycle observer key so each window gets its own observer slot.
const _lifecycleKeys = new WeakMap<ApplicationWindow, symbol>();

// Explicit main-window overrides (set via setApplicationMainWindow).
const _mainWindows = new WeakMap<Application, ApplicationWindow>();

const ROLLING_FPS_WINDOW = 60;

let _loopBackend: LoopBackend | null = null;

interface LoopState {
  fixedAccumulator: number;
  fpsBuffer: number[];
  fpsHead: number;
  frameHandle: unknown;
  frameRateAccumulated: number;
  lastTime: number;
  maxDeltaTime: number;
}

function getApplicationObservers(app: Application): Map<symbol, () => void> {
  let observers = _applicationObservers.get(app);
  if (observers === undefined) {
    observers = new Map();
    _applicationObservers.set(app, observers);
  }
  return observers;
}

// Returns true when the page is currently visible (document.hidden === false). Guarded for
// non-browser (jsdom / headless) environments where document may not have hidden.
function _isApplicationVisible(): boolean {
  return typeof document === 'undefined' || !document.hidden;
}

function recordFpsSample(state: LoopState, delta: number): void {
  if (state.fpsBuffer.length < ROLLING_FPS_WINDOW) {
    state.fpsBuffer.push(delta);
  } else {
    state.fpsBuffer[state.fpsHead] = delta;
    state.fpsHead = (state.fpsHead + 1) % ROLLING_FPS_WINDOW;
  }
}
