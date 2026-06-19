import { createSignal, emitSignal } from '@flighthq/signals';
import type { AppLifecycle, AppLifecycleState, LifecycleBackend } from '@flighthq/types';

// Begins delivering lifecycle changes to `app`'s signals by subscribing to the active backend. On
// each change it reads the current state and emits onStateChange plus onResume when transitioning to
// 'active' and onPause when leaving 'active'. The web backend never drives onBackButton; native hosts
// emit it through their own backend. Idempotent: a prior subscription is torn down first. Pair with
// detachAppLifecycle/disposeAppLifecycle.
export function attachAppLifecycle(app: AppLifecycle): void {
  detachAppLifecycle(app);
  const backend = getLifecycleBackend();
  let previous = backend.getState();
  const unsubscribe = backend.subscribe(() => {
    const state = backend.getState();
    emitSignal(app.onStateChange, state);
    if (state === 'active' && previous !== 'active') {
      emitSignal(app.onResume);
    } else if (state !== 'active' && previous === 'active') {
      emitSignal(app.onPause);
    }
    previous = state;
  });
  _subscriptions.set(app, unsubscribe);
}

// Allocates an AppLifecycle event entity with inert signals; call attachAppLifecycle to start delivery.
export function createAppLifecycle(): AppLifecycle {
  return {
    onStateChange: createSignal(),
    onResume: createSignal(),
    onPause: createSignal(),
    onBackButton: createSignal(),
  };
}

// Builds the default web backend over document visibility and window pagehide/pageshow events.
// Degrades to state 'active' and a no-op subscription where document/window are absent.
export function createWebLifecycleBackend(): LifecycleBackend {
  return {
    getState() {
      if (typeof document === 'undefined') return 'active';
      return document.hidden ? 'background' : 'active';
    },
    subscribe(listener) {
      if (typeof document === 'undefined' || typeof window === 'undefined') return () => {};
      document.addEventListener('visibilitychange', listener);
      window.addEventListener('pagehide', listener);
      window.addEventListener('pageshow', listener);
      return () => {
        document.removeEventListener('visibilitychange', listener);
        window.removeEventListener('pagehide', listener);
        window.removeEventListener('pageshow', listener);
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

// Installs a native host lifecycle backend; pass null to fall back to the web default.
export function setLifecycleBackend(backend: LifecycleBackend | null): void {
  _backend = backend;
}

let _backend: LifecycleBackend | null = null;
const _subscriptions = new WeakMap<AppLifecycle, () => void>();
