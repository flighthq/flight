import type { PowerBatteryHealth } from './PowerBatteryHealth';
import type { Signal } from './Signal';

// System idle state at a given inactivity threshold, or 'Unknown' when the host cannot report it.
export type PowerIdleState = 'Active' | 'Idle' | 'Unknown';

// What a keep-awake lock prevents. 'PreventDisplaySleep' keeps the screen on; 'PreventAppSuspension'
// additionally keeps the process running. The web backend only supports 'PreventDisplaySleep'.
export type PowerKeepAwakeMode = 'PreventDisplaySleep' | 'PreventAppSuspension';

// System thermal pressure level, or 'Unknown' when the host cannot report it.
export type PowerThermalState = 'Nominal' | 'Fair' | 'Serious' | 'Critical' | 'Unknown';

export interface PowerStatus {
  // Battery charge in the 0..1 range, or -1 when the host does not report it.
  batteryLevel: number;
  // Seconds until fully charged, or -1 when unknown or not charging.
  chargingTime: number;
  // Seconds until fully discharged, or -1 when unknown or charging.
  dischargingTime: number;
  // True when the battery is low and not charging.
  isBatteryLow: boolean;
  isCharging: boolean;
  isLowPower: boolean;
  // True when running on battery power (has a battery and not on external/AC power).
  isOnBattery: boolean;
  thermalState: PowerThermalState;
}

// Event seam for power: a snapshot reader, a change subscription, and a keep-awake toggle. The web
// backend wraps the Battery Status API and the Screen Wake Lock API; a native host reports its own
// battery changes through the same subscribe callback.
export interface PowerBackend {
  // Writes the battery health detail into out and returns it, or returns null when the host does not
  // report battery health (the web backend always returns null).
  getBatteryHealth(out: PowerBatteryHealth): PowerBatteryHealth | null;
  getStatus(out: PowerStatus): PowerStatus;
  // Returns the current idle state at the given inactivity threshold in seconds.
  getSystemIdleState(thresholdSeconds: number): PowerIdleState;
  // Returns the elapsed seconds since the last user input, or -1 when unsupported.
  getSystemIdleTime(): number;
  // Returns true when a keep-awake lock is currently held.
  isKeepAwakeActive(): boolean;
  // Requests or releases a keep-awake lock for the given mode (defaults to 'PreventDisplaySleep');
  // returns whether the request was honored.
  setKeepAwake(enabled: boolean, mode?: PowerKeepAwakeMode): boolean;
  // Registers a listener invoked on any power change; returns an unsubscribe function.
  subscribe(listener: () => void): () => void;
  // Registers a listener invoked when the screen is locked; returns an unsubscribe.
  subscribeLockScreen(listener: () => void): () => void;
  // Registers a listener invoked when the OS low-power mode changes; returns an unsubscribe.
  subscribeLowPowerModeChange(listener: () => void): () => void;
  // Registers a listener invoked when the host resumes from suspend; returns an unsubscribe.
  subscribeResume(listener: () => void): () => void;
  // Registers a listener invoked when the host suspends (freeze/sleep); returns an unsubscribe.
  subscribeSuspend(listener: () => void): () => void;
  // Registers a listener invoked when the thermal state changes; returns an unsubscribe.
  subscribeThermalStateChange(listener: () => void): () => void;
  // Registers a listener invoked when the screen is unlocked; returns an unsubscribe.
  subscribeUnlockScreen(listener: () => void): () => void;
}

// Power event entity. Opt-in signals, allocated by enablePowerSignals; null until enabled. Enable
// delivery with attachPower, which stays inert for any signal left null.
export interface Power {
  onChange: Signal<(status: Readonly<PowerStatus>) => void> | null;
  onCharging: Signal<() => void> | null;
  onDischarging: Signal<() => void> | null;
  onIdleStateChange: Signal<() => void> | null;
  onLockScreen: Signal<() => void> | null;
  onLowPowerModeChange: Signal<() => void> | null;
  onResume: Signal<() => void> | null;
  onSuspend: Signal<() => void> | null;
  onThermalStateChange: Signal<() => void> | null;
  onUnlockScreen: Signal<() => void> | null;
}
