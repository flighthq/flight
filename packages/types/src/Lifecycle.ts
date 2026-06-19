import type { Signal } from './Signal';

export type AppLifecycleState = 'active' | 'inactive' | 'background';

// Event seam for application lifecycle: a state reader plus a change subscription. The web backend
// wraps document visibility and window pagehide/pageshow events; a native host reports its own
// foreground/background transitions through the same subscribe callback.
export interface LifecycleBackend {
  getState(): AppLifecycleState;
  // Registers a listener invoked on any lifecycle change; returns an unsubscribe function.
  subscribe(listener: () => void): () => void;
}

// Application lifecycle event entity. Enable delivery with attachAppLifecycle; the signals stay
// inert until then.
export interface AppLifecycle {
  onStateChange: Signal<(state: AppLifecycleState) => void>;
  onResume: Signal<() => void>;
  onPause: Signal<() => void>;
  onBackButton: Signal<() => void>;
}
