import { connectSignal, createSignal, disconnectSignal, emitSignal } from '@flighthq/signals/contract';
import type {
  Application,
  ApplicationLoopOptions,
  ApplicationStepOptions,
  ApplicationWindow,
  BackendExplanation,
  LoopBackend,
} from '@flighthq/types/contract';

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

export function explainLoopBackend(): BackendExplanation {
  if (_loopCustom !== null) {
    return {
      conflict: _loopHostConflict,
      layer: 'custom',
      operation: null,
      viability: 'unobserved',
    };
  }
  if (_loopHost !== null) {
    return {
      conflict: _loopHostConflict,
      layer: 'host',
      operation: _loopHostObservation !== null ? _loopHostObservation.operation : null,
      viability: _loopHostObservation !== null ? _loopHostObservation.viability : 'unobserved',
    };
  }
  return {
    conflict: false,
    layer: 'host-not-enabled',
    operation: null,
    viability: 'unobserved',
  };
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

export function getLoopBackend(): LoopBackend | null {
  return _loopCustom ?? _loopHost ?? null;
}

export function installLoopHostBackend(backend: LoopBackend): void {
  if (_loopHost !== null) {
    if (_loopHost !== backend) _loopHostConflict = true;
    return;
  }
  _loopHost = backend;
}

export function isApplicationRunning(app: Readonly<Application>): boolean {
  return app.isRunning;
}

export function observeLoopHostResult(operation: 'cancelFrame' | 'requestFrame', succeeded: boolean): void {
  _loopHostObservation = {
    operation,
    viability: succeeded ? 'available' : 'runtime-api-unavailable',
  };
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

export function resetLoopBackendForTest(): void {
  _loopCustom = null;
  _loopHost = null;
  _loopHostConflict = false;
  _loopHostObservation = null;
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

export function setLoopBackend(backend: LoopBackend | null): void {
  _loopCustom = backend;
}

export function startApplicationLoop(app: Application, options: Readonly<ApplicationLoopOptions> = {}): void {
  const observers = getApplicationObservers(app);
  // Stop any existing loop first (idempotent restart).
  observers.get(kLoop)?.();
  observers.delete(kPaused);

  const resolved = getLoopBackend();
  if (resolved === null) return;
  const backend: LoopBackend = resolved;
  const maxDeltaTime = options.maxDeltaTime ?? DEFAULT_MAX_DELTA_TIME;
  const targetFrameRate = options.targetFrameRate ?? 0;
  const backgroundFrameRate = options.backgroundFrameRate ?? DEFAULT_BACKGROUND_FRAME_RATE;
  const fixedTimeStep = options.fixedTimeStep ?? DEFAULT_FIXED_TIMESTEP;
  const maxUpdatesPerFrame = options.maxUpdatesPerFrame ?? DEFAULT_MAX_UPDATES_PER_FRAME;
  const frameInterval = targetFrameRate > 0 ? 1000 / targetFrameRate : 0;
  const bgInterval = backgroundFrameRate > 0 ? 1000 / backgroundFrameRate : 0;

  // Persist loop state so pauseApplicationLoop/resumeApplicationLoop can mutate lastTime.
  const loopState = createLoopState(fixedTimeStep, maxDeltaTime, maxUpdatesPerFrame);
  const stepPolicy: Readonly<ApplicationStepPolicy> = { fixedStepState: loopState, maxDeltaTime };
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

    applyApplicationStep(app, delta, loopState, stepPolicy);

    loopState.frameHandle = backend.requestFrame(tick);
    observers.set(kLoop, () => backend.cancelFrame(loopState.frameHandle));
  }

  loopState.frameHandle = backend.requestFrame(tick);
  observers.set(kLoop, () => backend.cancelFrame(loopState.frameHandle));
}

// Drives one update+render tick with an explicit delta (ms). Fixed-step options are self-contained,
// so deterministic headless callers do not need to start a backend loop first.
export function stepApplicationLoop(
  app: Application,
  deltaTime: number,
  options: Readonly<ApplicationStepOptions> = {},
): void {
  const existingLoopState = _applicationLoopState.get(app);
  const fixedTimeStep = options.fixedTimeStep ?? DEFAULT_FIXED_TIMESTEP;
  const maxDeltaTime = options.maxDeltaTime ?? existingLoopState?.maxDeltaTime ?? DEFAULT_MAX_DELTA_TIME;
  const maxUpdatesPerFrame = options.maxUpdatesPerFrame ?? DEFAULT_MAX_UPDATES_PER_FRAME;
  const loopState =
    fixedTimeStep > 0 ? getOrCreateLoopState(app, fixedTimeStep, maxDeltaTime, maxUpdatesPerFrame) : existingLoopState;
  if (fixedTimeStep > 0 && loopState !== undefined) {
    configureFixedStep(loopState, fixedTimeStep, maxUpdatesPerFrame);
    if (options.maxDeltaTime !== undefined) loopState.maxDeltaTime = maxDeltaTime;
  }
  const stepPolicy: Readonly<ApplicationStepPolicy> = {
    fixedStepState: fixedTimeStep > 0 ? loopState : undefined,
    maxDeltaTime,
  };
  applyApplicationStep(app, deltaTime, loopState, stepPolicy);
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

let _loopCustom: LoopBackend | null = null;
let _loopHost: LoopBackend | null = null;
let _loopHostConflict = false;
let _loopHostObservation: {
  operation: 'cancelFrame' | 'requestFrame';
  viability: 'available' | 'runtime-api-unavailable';
} | null = null;

interface LoopState {
  fixedAccumulator: number;
  fixedTimeStep: number;
  fpsBuffer: number[];
  fpsHead: number;
  frameHandle: unknown;
  frameRateAccumulated: number;
  lastTime: number;
  maxDeltaTime: number;
  maxUpdatesPerFrame: number;
}

interface ApplicationStepPolicy {
  fixedStepState: LoopState | undefined;
  maxDeltaTime: number;
}

function applyApplicationStep(
  app: Application,
  deltaTime: number,
  loopState: LoopState | undefined,
  policy: Readonly<ApplicationStepPolicy>,
): void {
  const clamped = Math.min(deltaTime, policy.maxDeltaTime);
  app.deltaTime = clamped;
  app.elapsedTime += clamped / 1000;
  app.frameCount += 1;

  if (loopState !== undefined) recordFpsSample(loopState, clamped);

  const fixedUpdate = app.onFixedUpdate;
  const fixedStepState = policy.fixedStepState;
  if (fixedStepState !== undefined && fixedStepState.fixedTimeStep > 0 && fixedUpdate !== null) {
    fixedStepState.fixedAccumulator += clamped;
    let iterations = 0;
    while (
      fixedStepState.fixedAccumulator >= fixedStepState.fixedTimeStep &&
      iterations < fixedStepState.maxUpdatesPerFrame
    ) {
      fixedStepState.fixedAccumulator -= fixedStepState.fixedTimeStep;
      iterations++;
      invokeWithApplicationErrorHandling(app, () => emitSignal(fixedUpdate, fixedStepState.fixedTimeStep));
    }
    // If we hit the maxUpdatesPerFrame cap, drain the leftover to avoid spiral-of-death.
    if (iterations >= fixedStepState.maxUpdatesPerFrame) fixedStepState.fixedAccumulator = 0;
    // interpolationAlpha: position within the current step at render time.
    app.interpolationAlpha = fixedStepState.fixedAccumulator / fixedStepState.fixedTimeStep;
  } else {
    app.interpolationAlpha = 1;
  }

  invokeWithApplicationErrorHandling(app, () => emitSignal(app.onUpdate, clamped));
  invokeWithApplicationErrorHandling(app, () => emitSignal(app.onRender));
}

function configureFixedStep(loopState: LoopState, fixedTimeStep: number, maxUpdatesPerFrame: number): void {
  loopState.fixedTimeStep = fixedTimeStep;
  loopState.maxUpdatesPerFrame = maxUpdatesPerFrame;
}

function createLoopState(fixedTimeStep: number, maxDeltaTime: number, maxUpdatesPerFrame: number): LoopState {
  return {
    fixedAccumulator: 0,
    fixedTimeStep,
    fpsBuffer: [],
    fpsHead: 0,
    frameHandle: null as unknown,
    frameRateAccumulated: 0,
    lastTime: -1,
    maxDeltaTime,
    maxUpdatesPerFrame,
  };
}

function getOrCreateLoopState(
  app: Application,
  fixedTimeStep: number,
  maxDeltaTime: number,
  maxUpdatesPerFrame: number,
): LoopState {
  let loopState = _applicationLoopState.get(app);
  if (loopState === undefined) {
    loopState = createLoopState(fixedTimeStep, maxDeltaTime, maxUpdatesPerFrame);
    _applicationLoopState.set(app, loopState);
  }
  return loopState;
}

function invokeWithApplicationErrorHandling(app: Readonly<Application>, callback: () => void): void {
  const onError = app.onError;
  if (onError === null) {
    callback();
    return;
  }
  try {
    callback();
  } catch (error: unknown) {
    emitSignal(onError, error);
  }
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
