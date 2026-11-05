import type { Entity } from '@flighthq/entity/contract';
import type { Signal } from '@flighthq/signals/contract';

// Detailed battery health report, distinct from the live PowerStatus snapshot. Hosts that cannot
// report a given field use the sentinel -1 (numeric) or 'Unknown' (state). The Web provider cannot
// report any of these and returns null from getBatteryHealth rather than a filled struct.
export interface PowerBatteryHealth {
  // Remaining capacity relative to design capacity in the 0..1 range, or -1 when unreported.
  capacityWearLevel: number;
  // Completed charge cycles, or -1 when unreported.
  cycleCount: number;
  healthState: PowerBatteryHealthState;
  // Battery temperature in degrees Celsius, or -1 when unreported.
  temperatureCelsius: number;
  // Battery voltage in volts, or -1 when unreported.
  voltage: number;
}

export type PowerBatteryHealthState = 'Good' | 'Fair' | 'Poor' | 'Unknown';

// System idle state at a given inactivity threshold, or 'Unknown' when the host cannot report it.
export type PowerIdleState = 'Active' | 'Idle' | 'Unknown';

// What a keep-awake lock prevents. 'PreventDisplaySleep' keeps the screen on; 'PreventAppSuspension'
// additionally keeps the process running. The Web provider only supports 'PreventDisplaySleep'.
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

// Keep-awake outcomes. `ok` means the provider acquired or released its keep-awake mechanism — never
// that the hardware can no longer sleep for other policy reasons, which no host can promise.
export type PowerKeepAwakeAcquireReason = 'ok' | 'unavailable' | 'denied' | 'failed';

export type PowerKeepAwakeReleaseReason = 'ok' | 'inactive' | 'failed';

export interface PowerKeepAwakeAcquireResult {
  readonly reason: PowerKeepAwakeAcquireReason;
}

export interface PowerKeepAwakeReleaseResult {
  readonly reason: PowerKeepAwakeReleaseReason;
}

export interface HostPowerStatusCapability {
  getStatus(out: PowerStatus): PowerStatus;
}

export interface HostPowerChangeCapability {
  subscribe(listener: () => void): () => void;
}

export interface HostPowerKeepAwakeCapability {
  acquire(mode: PowerKeepAwakeMode): Promise<PowerKeepAwakeAcquireResult>;
  destroy?(): void;
  isActive(): boolean;
  release(): Promise<PowerKeepAwakeReleaseResult>;
}

export interface HostPowerIdleCapability {
  getIdleState(thresholdSeconds: number): PowerIdleState;
  getIdleTimeSeconds(): number;
}

export interface HostPowerSessionLockCapability {
  subscribeLock(listener: () => void): () => void;
  subscribeUnlock(listener: () => void): () => void;
}

export interface HostPowerSuspensionCapability {
  subscribeResume(listener: () => void): () => void;
  subscribeSuspend(listener: () => void): () => void;
}

export interface HostPowerBatteryHealthCapability {
  getBatteryHealth(out: PowerBatteryHealth): PowerBatteryHealth;
}

export interface HostPowerThermalCapability {
  getThermalState(): PowerThermalState;
  subscribeThermalStateChange(listener: (state: PowerThermalState) => void): () => void;
}

/** The complete power capability group. An omitted slot is capability absence. */
export interface HostPowerCapabilities {
  readonly batteryHealth?: HostPowerBatteryHealthCapability;
  readonly change?: HostPowerChangeCapability;
  readonly idle?: HostPowerIdleCapability;
  readonly keepAwake?: HostPowerKeepAwakeCapability;
  readonly sessionLock?: HostPowerSessionLockCapability;
  readonly status?: HostPowerStatusCapability;
  readonly suspension?: HostPowerSuspensionCapability;
  readonly thermal?: HostPowerThermalCapability;
}

export type ElectronPowerCapabilities = Required<
  Pick<
    HostPowerCapabilities,
    'batteryHealth' | 'change' | 'idle' | 'keepAwake' | 'sessionLock' | 'status' | 'suspension'
  >
> &
  Pick<HostPowerCapabilities, 'thermal'>;

export type WebPowerReadingCapabilities = Required<Pick<HostPowerCapabilities, 'change' | 'status'>>;

export type WebPowerCapabilities = Required<
  Pick<HostPowerCapabilities, 'change' | 'keepAwake' | 'status' | 'suspension'>
>;

// The consumer-held power event entity. Signals are null until enablePowerSignals allocates them, so an
// unused group tree-shakes out. Entity-composed: this is a user-held identity-bearing object, unlike the
// PowerStatus / PowerBatteryHealth value structs the queries fill.
export interface Power extends Entity {
  onChange: Signal<Readonly<PowerStatus>> | null;
  onCharging: Signal<void> | null;
  onDischarging: Signal<void> | null;
  onIdleStateChange: Signal<void> | null;
  onLockScreen: Signal<void> | null;
  onResume: Signal<void> | null;
  onSuspend: Signal<void> | null;
  onThermalStateChange: Signal<PowerThermalState> | null;
  onUnlockScreen: Signal<void> | null;
}
