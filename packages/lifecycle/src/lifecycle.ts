import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createSignal, emitSignal } from '@flighthq/signals/contract';
import type { BackendOperationExplanation, LifecycleOperation, EntityConstruction } from '@flighthq/types/contract';
import type {
  AppLaunchKind,
  HostLifecycleCapability,
  AppLifecycle,
  AppLifecycleState,
  AppMemoryPressure,
} from '@flighthq/types/contract';

// Begins delivering lifecycle changes to `app`'s signals by subscribing to the supplied provider. On
// each change it reads the current state and emits onStateChange plus onResume when transitioning
// to 'active' and onPause when leaving 'active'. The Web provider drives onBackButton only in
// environments that support it; native hosts emit it through their own provider. Idempotent: a prior
// subscription is torn down first. Pair with detachAppLifecycle/disposeAppLifecycle.
//
// onStateChange is "raw, not deduped" — it fires on every provider notification regardless of
// whether the derived state changed. onResume/onPause are deduped edges: 'active'→non-'active'
// fires onPause (including the interruption edge 'active'→'inactive'); non-'active'→'active' fires
// onResume. The 'inactive'→'background' and reverse transitions do not fire onPause/onResume again.
export function attachAppLifecycle(hostLifecycle: Readonly<HostLifecycleCapability>, app: AppLifecycle): void {
  detachAppLifecycle(app);
  const backend = hostLifecycle;
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

export function createAppLifecycle(): AppLifecycle {
  const out = allocateEntity<AppLifecycle>();
  initializeAppLifecycle(out);
  return finishEntity(out);
}

// Stops delivery to `app` and forgets its subscription. Safe to call when not attached.
export function detachAppLifecycle(app: AppLifecycle): void {
  const unsubscribe = _subscriptions.get(app);
  if (unsubscribe !== undefined) {
    unsubscribe();
    _subscriptions.delete(app);
  }
}

// Releases `app` for garbage collection by detaching its provider subscription. The signals remain
// plain GC-managed memory afterward.
export function disposeAppLifecycle(app: AppLifecycle): void {
  detachAppLifecycle(app);
  _savedState.delete(app);
}

// Reports whether the supplied provider implements `operation`. Optional methods that the provider
// omits are reported as the sentinel layer so callers can distinguish absence from a real operation.
export function explainLifecycleOperation(
  hostLifecycle: Readonly<HostLifecycleCapability>,
  operation: LifecycleOperation,
): BackendOperationExplanation {
  const implemented = typeof hostLifecycle[operation] === 'function';
  return { implemented, layer: implemented ? 'host' : 'sentinel', operation };
}

// Returns the kind of launch — 'cold' (fresh process) or 'warm' (resumed from background). The web
// provider approximates this via PerformanceNavigationTiming.type ('back_forward' → 'warm', all
// others → 'cold'). Returns 'warm' as a safe fallback when the provider does not implement
// getLaunchKind (legacy or minimal providers that pre-date the optional method).
export function getAppLaunchKind(hostLifecycle: Readonly<HostLifecycleCapability>): AppLaunchKind {
  const backend = hostLifecycle;
  return backend.getLaunchKind !== undefined ? backend.getLaunchKind() : 'warm';
}

// Returns the current application lifecycle state from the supplied provider.
export function getAppLifecycleState(hostLifecycle: Readonly<HostLifecycleCapability>): AppLifecycleState {
  return hostLifecycle.getState();
}

// Whether the supplied provider implements `operation`.
export function hasLifecycleOperation(
  hostLifecycle: Readonly<HostLifecycleCapability>,
  operation: LifecycleOperation,
): boolean {
  return explainLifecycleOperation(hostLifecycle, operation).implemented;
}

// Allocates an AppLifecycle event entity with inert signals; call attachAppLifecycle to start delivery.
export function initializeAppLifecycle(out: EntityConstruction<AppLifecycle>): void {
  out.onStateChange = createSignal();
  out.onResume = createSignal();
  out.onPause = createSignal();
  out.onBackButton = createSignal();
  out.onMemoryWarning = createSignal();
  out.onSaveState = createSignal();
  out.onRestoreState = createSignal();
}

// Returns true when the application is in the 'active' state (visible and focused).
export function isAppActive(hostLifecycle: Readonly<HostLifecycleCapability>): boolean {
  return hostLifecycle.getState() === 'active';
}

// Returns true when the application is in the 'background' state (hidden/suspended).
export function isAppBackground(hostLifecycle: Readonly<HostLifecycleCapability>): boolean {
  return hostLifecycle.getState() === 'background';
}

// Returns true when the application is in the 'inactive' state (visible but not focused —
// e.g. app switcher, control-center overlay, incoming call).
export function isAppInactive(hostLifecycle: Readonly<HostLifecycleCapability>): boolean {
  return hostLifecycle.getState() === 'inactive';
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

const _savedState = new WeakMap<AppLifecycle, Record<string, unknown>>();
const _subscriptions = new WeakMap<AppLifecycle, () => void>();
