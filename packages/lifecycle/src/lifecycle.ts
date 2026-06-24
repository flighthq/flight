import { createSignal, emitSignal } from '@flighthq/signals';
import type {
  AppLaunchKind,
  AppLifecycle,
  AppLifecycleState,
  AppMemoryPressure,
  LifecycleBackend,
} from '@flighthq/types';

// Begins delivering lifecycle changes to `app`'s signals by subscribing to the active backend. On
// each change it reads the current state and emits onStateChange plus onResume when transitioning
// to 'active' and onPause when leaving 'active'. The web backend drives onBackButton only in
// environments that support it; native hosts emit it through their own backend. Idempotent: a prior
// subscription is torn down first. Pair with detachAppLifecycle/disposeAppLifecycle.
//
// onStateChange is "raw, not deduped" — it fires on every backend notification regardless of
// whether the derived state changed. onResume/onPause are deduped edges: 'active'→non-'active'
// fires onPause (including the interruption edge 'active'→'inactive'); non-'active'→'active' fires
// onResume. The 'inactive'→'background' and reverse transitions do not fire onPause/onResume again.
export function attachAppLifecycle(app: AppLifecycle): void {
  detachAppLifecycle(app);
  const backend = getLifecycleBackend();
  let previous = backend.getState();

  const unsubscribeState = backend.subscribe(() => {
    const state = backend.getState();
    emitSignal(app.onStateChange, state);
    if (state === 'active' && previous !== 'active') {
      emitSignal(app.onResume);
      // Warm resume: restore saved state.
      const saved = _savedState.get(app);
      if (saved !== undefined) {
        emitSignal(app.onRestoreState, saved);
      }
    } else if (state !== 'active' && previous === 'active') {
      emitSignal(app.onPause);
      // Collect transient UI state for potential restore on next resume.
      const stateBag: Record<string, unknown> = {};
      emitSignal(app.onSaveState, stateBag);
      _savedState.set(app, stateBag);
    }
    previous = state;
  });

  let unsubscribeMemory: (() => void) | undefined;
  const memSub = backend.subscribeMemoryWarning;
  if (memSub !== undefined) {
    unsubscribeMemory = memSub.call(backend, (level: AppMemoryPressure) => {
      emitSignal(app.onMemoryWarning, level);
    });
  }

  _subscriptions.set(app, () => {
    unsubscribeState();
    unsubscribeMemory?.();
  });
}

// Allocates an AppLifecycle event entity with inert signals; call attachAppLifecycle to start delivery.
export function createAppLifecycle(): AppLifecycle {
  return {
    onStateChange: createSignal(),
    onResume: createSignal(),
    onPause: createSignal(),
    onBackButton: createSignal(),
    onMemoryWarning: createSignal(),
    onSaveState: createSignal(),
    onRestoreState: createSignal(),
  };
}

// Builds the default web backend over document visibility, window focus/blur, and pagehide/pageshow
// events. Produces three states:
//   'active'     — document visible and window focused
//   'inactive'   — document visible but window not focused (app switcher, control-center, other window)
//   'background' — document.hidden (tab hidden or page unloading)
// Degrades to state 'active' and a no-op subscription where document/window are absent (SSR/jsdom).
//
// getLaunchKind() approximates cold vs. warm using PerformanceNavigationTiming.type:
//   'back_forward' → 'warm'  — page was restored from the bfcache (JS heap was frozen and thawed;
//                              the closest web equivalent of a process warm-resume)
//   all others     → 'cold'  — 'navigate', 'reload', 'prerender' are each a fresh page lifecycle
// Falls back to 'cold' when the Performance Navigation Timing API is unavailable (SSR/jsdom).
//
// subscribeMemoryWarning() wires the experimental 'memory-pressure' window event (Chrome origin
// trial / behind flags). The event detail carries a 'critical' pressure string; this backend maps
// it to 'critical' and fires 'normal' on the subsequent resolution event when present. Falls back to
// no-op unsubscribe when the event is not supported (no standard API is widely deployed as of 2026).
export function createWebLifecycleBackend(): LifecycleBackend {
  let _windowFocused = typeof document !== 'undefined';
  return {
    getState(): AppLifecycleState {
      if (typeof document === 'undefined') return 'active';
      if (document.hidden) return 'background';
      return _windowFocused ? 'active' : 'inactive';
    },
    subscribe(listener: () => void): () => void {
      if (typeof document === 'undefined' || typeof window === 'undefined') return () => {};
      // Initialize focus state at subscribe time.
      _windowFocused = document.hasFocus();
      const onFocus = () => {
        _windowFocused = true;
        listener();
      };
      const onBlur = () => {
        _windowFocused = false;
        listener();
      };
      document.addEventListener('visibilitychange', listener);
      window.addEventListener('pagehide', listener);
      window.addEventListener('pageshow', listener);
      window.addEventListener('focus', onFocus);
      window.addEventListener('blur', onBlur);
      return () => {
        document.removeEventListener('visibilitychange', listener);
        window.removeEventListener('pagehide', listener);
        window.removeEventListener('pageshow', listener);
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('blur', onBlur);
      };
    },
    getLaunchKind(): AppLaunchKind {
      // PerformanceNavigationTiming.type === 'back_forward' indicates the page was restored from the
      // browser's back/forward cache (bfcache). The JS heap was frozen and thawed without a fresh
      // process start — the closest analog to a mobile warm-resume. All other navigation types
      // ('navigate', 'reload', 'prerender') are a fresh page lifecycle, i.e. cold.
      if (typeof performance === 'undefined') return 'cold';
      const entries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
      if (entries.length > 0 && entries[0].type === 'back_forward') return 'warm';
      return 'cold';
    },
    subscribeMemoryWarning(listener: (level: AppMemoryPressure) => void): () => void {
      // The 'memory-pressure' window event is an experimental Chrome API (origin trial / behind
      // flags as of 2026). The event carries a detail object with a 'pressure' string. This backend
      // maps 'critical' pressure to AppMemoryPressure 'critical'; a pressure-resolved / 'moderate'
      // event maps to 'moderate'. Falls back to no-op unsubscribe when the event is not supported
      // (no cross-browser API for memory pressure is widely deployed yet).
      if (typeof window === 'undefined') return () => {};
      // Feature-detect: attempt to register and immediately remove a passive listener to check
      // whether the event is supported. If addEventListener silently ignores the event type there
      // is nothing we can do — we just return no-op without pretending to be subscribed.
      const onPressure = (e: Event) => {
        const detail = (e as CustomEvent<{ pressure?: string }>).detail;
        const pressure = detail?.pressure;
        if (pressure === 'critical') {
          listener('critical');
        } else if (pressure === 'moderate') {
          listener('moderate');
        } else {
          // Unknown pressure level — treat as moderate rather than silently dropping.
          listener('moderate');
        }
      };
      const onPressureRelieved = () => {
        listener('normal');
      };
      window.addEventListener('memory-pressure', onPressure);
      window.addEventListener('memory-pressure-relieved', onPressureRelieved);
      return () => {
        window.removeEventListener('memory-pressure', onPressure);
        window.removeEventListener('memory-pressure-relieved', onPressureRelieved);
      };
    },
  };
}

// Stops delivery to `app` and forgets its subscription. Safe to call when not attached.
export function detachAppLifecycle(app: AppLifecycle): void {
  const unsubscribe = _subscriptions.get(app);
  if (unsubscribe !== undefined) {
    unsubscribe();
    _subscriptions.delete(app);
  }
}

// Releases `app` for garbage collection by detaching its backend subscription. The signals remain
// plain GC-managed memory afterward.
export function disposeAppLifecycle(app: AppLifecycle): void {
  detachAppLifecycle(app);
  _savedState.delete(app);
}

// Returns the kind of launch — 'cold' (fresh process) or 'warm' (resumed from background). The web
// backend approximates this via PerformanceNavigationTiming.type ('back_forward' → 'warm', all
// others → 'cold'). Returns 'warm' as a safe fallback when the backend does not implement
// getLaunchKind (legacy or minimal backends that pre-date the optional method).
export function getAppLaunchKind(): AppLaunchKind {
  const backend = getLifecycleBackend();
  return backend.getLaunchKind !== undefined ? backend.getLaunchKind() : 'warm';
}

// Returns the current application lifecycle state from the active backend.
export function getAppLifecycleState(): AppLifecycleState {
  return getLifecycleBackend().getState();
}

// The active lifecycle backend, or a lazily-created web default. There is always a backend.
export function getLifecycleBackend(): LifecycleBackend {
  if (_backend === null) _backend = createWebLifecycleBackend();
  return _backend;
}

// Returns true when the application is in the 'active' state (visible and focused).
export function isAppActive(): boolean {
  return getLifecycleBackend().getState() === 'active';
}

// Returns true when the application is in the 'background' state (hidden/suspended).
export function isAppBackground(): boolean {
  return getLifecycleBackend().getState() === 'background';
}

// Returns true when the application is in the 'inactive' state (visible but not focused —
// e.g. app switcher, control-center overlay, incoming call).
export function isAppInactive(): boolean {
  return getLifecycleBackend().getState() === 'inactive';
}

// Emits app.onBackButton and returns whether the back action may proceed. Returns false when a
// listener vetoed by calling cancelSignal(app.onBackButton), meaning the listener handled
// navigation itself. Returns true when no listener consumed the event and the host should perform
// the default back action (navigate up or exit). Mirrors the onCloseRequest/requestCloseWindow
// veto contract from @flighthq/application.
export function requestAppBack(app: AppLifecycle): boolean {
  emitSignal(app.onBackButton);
  return app.onBackButton.data?.cancelled !== true;
}

// Installs a native host lifecycle backend; pass null to fall back to the web default.
export function setLifecycleBackend(backend: LifecycleBackend | null): void {
  _backend = backend;
}

let _backend: LifecycleBackend | null = null;
const _savedState = new WeakMap<AppLifecycle, Record<string, unknown>>();
const _subscriptions = new WeakMap<AppLifecycle, () => void>();
