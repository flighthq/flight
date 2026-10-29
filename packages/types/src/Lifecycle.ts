import type { Entity } from './Entity.ts';
import type { Signal } from './Signal.ts';

export type AppLifecycleState = 'active' | 'inactive' | 'background';

// How the application was launched: 'cold' is a fresh process start; 'warm' is a resume from a
// frozen/backgrounded state (mobile warm-resume, web bfcache restore).
export type AppLaunchKind = 'cold' | 'warm';

// OS memory-pressure level reported to onMemoryWarning. 'normal' signals pressure relieved,
// 'moderate' a warning, 'critical' an imminent termination risk.
export type AppMemoryPressure = 'normal' | 'moderate' | 'critical';

// Event seam for application lifecycle: a state reader plus a change subscription. The Web provider
// wraps document visibility and window pagehide/pageshow events; a native host reports its own
// foreground/background transitions through the same subscribe callback.
export interface HostLifecycleCapability {
  getState(): AppLifecycleState;
  // Registers a listener invoked on any lifecycle change; returns an unsubscribe function.
  subscribe(listener: () => void): () => void;
  // Returns whether the launch was cold or warm. Optional: minimal/legacy providers may omit it, in
  // which case getAppLaunchKind falls back to 'warm'.
  getLaunchKind?(): AppLaunchKind;
  // Registers a listener invoked on OS memory-pressure changes; returns an unsubscribe function.
  // Optional: providers without a memory-pressure source omit it.
  subscribeMemoryWarning?(listener: (level: AppMemoryPressure) => void): () => void;
}

// AppLoop lifecycle event entity. Enable delivery with attachAppLifecycle; the signals stay
// inert until then.
export interface AppLifecycle extends Entity {
  onStateChange: Signal<AppLifecycleState>;
  onResume: Signal<void>;
  onPause: Signal<void>;
  onBackButton: Signal<void>;
  // Emitted on an OS memory-pressure change with the current pressure level.
  onMemoryWarning: Signal<AppMemoryPressure>;
  // Emitted when leaving 'active' so listeners can stash transient UI state into the bag for restore.
  onSaveState: Signal<Record<string, unknown>>;
  // Emitted on warm resume with the previously saved state bag.
  onRestoreState: Signal<Readonly<Record<string, unknown>>>;
}

// Every operation name on the provider, DERIVED from the interface rather than listed. A hand-written
// roster would be a second source of truth that drifts the moment an operation is added or renamed;
// `keyof` cannot. Entity runtime identity is infrastructure rather than a provider operation.
export type LifecycleOperation = Exclude<keyof HostLifecycleCapability, keyof Entity>;
