import type { Signal } from './Signal';

export type AppLifecycleState = 'active' | 'inactive' | 'background';

// How the application was launched: 'cold' is a fresh process start; 'warm' is a resume from a
// frozen/backgrounded state (mobile warm-resume, web bfcache restore).
export type AppLaunchKind = 'cold' | 'warm';

// OS memory-pressure level reported to onMemoryWarning. 'normal' signals pressure relieved,
// 'moderate' a warning, 'critical' an imminent termination risk.
export type AppMemoryPressure = 'normal' | 'moderate' | 'critical';

// Event seam for application lifecycle: a state reader plus a change subscription. The web backend
// wraps document visibility and window pagehide/pageshow events; a native host reports its own
// foreground/background transitions through the same subscribe callback.
export interface LifecycleBackend {
  getState(): AppLifecycleState;
  // Registers a listener invoked on any lifecycle change; returns an unsubscribe function.
  subscribe(listener: () => void): () => void;
  // Returns whether the launch was cold or warm. Optional: minimal/legacy backends may omit it, in
  // which case getAppLaunchKind falls back to 'warm'.
  getLaunchKind?(): AppLaunchKind;
  // Registers a listener invoked on OS memory-pressure changes; returns an unsubscribe function.
  // Optional: backends without a memory-pressure source omit it.
  subscribeMemoryWarning?(listener: (level: AppMemoryPressure) => void): () => void;
}

// Application lifecycle event entity. Enable delivery with attachAppLifecycle; the signals stay
// inert until then.
export interface AppLifecycle {
  onStateChange: Signal<(state: AppLifecycleState) => void>;
  onResume: Signal<() => void>;
  onPause: Signal<() => void>;
  onBackButton: Signal<() => void>;
  // Emitted on an OS memory-pressure change with the current pressure level.
  onMemoryWarning: Signal<(level: AppMemoryPressure) => void>;
  // Emitted when leaving 'active' so listeners can stash transient UI state into the bag for restore.
  onSaveState: Signal<(state: Record<string, unknown>) => void>;
  // Emitted on warm resume with the previously saved state bag.
  onRestoreState: Signal<(state: Readonly<Record<string, unknown>>) => void>;
}
