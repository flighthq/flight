import type { Signal } from './Signal';

export interface PowerStatus {
  // Battery charge in the 0..1 range, or -1 when the host does not report it.
  batteryLevel: number;
  isCharging: boolean;
  isLowPower: boolean;
}

// Event seam for power: a snapshot reader, a change subscription, and a keep-awake toggle. The web
// backend wraps the Battery Status API and the Screen Wake Lock API; a native host reports its own
// battery changes through the same subscribe callback.
export interface PowerBackend {
  getStatus(out: PowerStatus): PowerStatus;
  // Registers a listener invoked on any power change; returns an unsubscribe function.
  subscribe(listener: () => void): () => void;
  // Registers a listener invoked when the host suspends (freeze/sleep); returns an unsubscribe.
  subscribeSuspend(listener: () => void): () => void;
  // Registers a listener invoked when the host resumes from suspend; returns an unsubscribe.
  subscribeResume(listener: () => void): () => void;
  // Requests or releases a screen keep-awake lock; returns whether the request was honored.
  setKeepAwake(enabled: boolean): boolean;
}

// Power event entity. Enable delivery with attachPower; the signals stay inert until then.
export interface Power {
  onChange: Signal<(status: Readonly<PowerStatus>) => void>;
  onCharging: Signal<() => void>;
  onDischarging: Signal<() => void>;
  onSuspend: Signal<() => void>;
  onResume: Signal<() => void>;
}
