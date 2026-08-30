import type { Entity } from './Entity';
import type { HostPowerCapabilities } from './Host';
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
// Keep-awake outcomes. `ok` means the provider ACQUIRED or RELEASED its keep-awake mechanism — never
// that the hardware can no longer sleep for other policy reasons, which no host can promise.
//
// Acquire distinguishes three failures a caller acts on differently: the mechanism is not offered here
// at all ('unavailable'), the platform refused this request ('denied' — on web, a Wake Lock rejection
// such as a hidden page or missing user gesture), and the request reached the platform and broke
// ('failed'). Release separates an ordinary no-op from a real fault: 'inactive' means nothing was held,
// which is a SUCCESS for an idempotent caller and is reported distinctly rather than as 'ok' so a
// caller that believed it held a lock can tell that it did not.
export type PowerKeepAwakeAcquireReason = 'ok' | 'unavailable' | 'denied' | 'failed';

export type PowerKeepAwakeReleaseReason = 'ok' | 'inactive' | 'failed';

export interface PowerKeepAwakeAcquireResult {
  readonly reason: PowerKeepAwakeAcquireReason;
}

export interface PowerKeepAwakeReleaseResult {
  readonly reason: PowerKeepAwakeReleaseReason;
}

// Power is split by what provider coverage actually varies by, not by a hand-picked noun. Every slot is
// optional and a host omits what it cannot do: an absent slot is the honest report, where a stub that
// answers `false` or returns an inert unsubscribe is indistinguishable from a real implementation.
//
// `destroy` appears on ONE slot only. A teardown member is declared where a provider acquires a
// WHOLE-PROVIDER resource that outlives individual operation/subscription cleanup — keepAwake holds an
// OS lock (a WakeLock sentinel and its release listener on web, a powerSaveBlocker id on electron).
// Every other slot's subscriptions already return their own unsubscribe and its cached readings live in
// the provider's own closure, so dropping the provider releases them: declaring `destroy` there would be
// a teardown obligation with nothing behind it.

// Reads the current power status into `out`. Query only; the matching notification is `change`.
export interface PowerStatusBackend {
  getStatus(out: PowerStatus): PowerStatus;
}

// Raw "something about power changed" notification. Carries no payload by design — the caller re-reads
// through the status slot, because no host emits a complete status with its change event.
export interface PowerChangeBackend {
  subscribe(listener: () => void): () => void;
}

// Stateful keep-awake. Both operations are async because the only real web mechanism (Wake Lock) is
// async, and a synchronous answer could only be a guess about a request that had not resolved.
// A synchronous native blocker lifts into the same shape by resolving immediately.
export interface PowerKeepAwakeBackend {
  acquire(mode: PowerKeepAwakeMode): Promise<PowerKeepAwakeAcquireResult>;
  destroy?(): void;
  isActive(): boolean;
  release(): Promise<PowerKeepAwakeReleaseResult>;
}

// System idle queries. Offered only by a host that can really observe idleness; a host that would
// answer a constant 'Unknown'/-1 omits the slot instead, so nothing polls a value that cannot change.
export interface PowerIdleBackend {
  getIdleState(thresholdSeconds: number): PowerIdleState;
  getIdleTimeSeconds(): number;
}

// Session lock as ONE bracket: lock and unlock are the two edges of a single OS session-state boolean,
// from one mechanism, and every host offers both or neither. A provider that emitted only one edge would
// leave a consumer permanently wrong about the state the signal exists to track.
export interface PowerSessionLockBackend {
  subscribeLock(listener: () => void): () => void;
  subscribeUnlock(listener: () => void): () => void;
}

// Suspend/resume as ONE bracket, for the same reason: they are the two edges of one transition. Web
// realizes them with the Page Lifecycle 'freeze'/'resume' events; a native host with its OS equivalents.
export interface PowerSuspensionBackend {
  subscribeResume(listener: () => void): () => void;
  subscribeSuspend(listener: () => void): () => void;
}

// Battery health detail, offered only where the host really reports it.
export interface PowerBatteryHealthBackend {
  getBatteryHealth(out: PowerBatteryHealth): PowerBatteryHealth;
}

// Thermal pressure. The subscription DELIVERS THE STATE rather than announcing that something opaque
// changed: an event whose state the caller cannot then read is not an actionable capability. A host that
// can signal a change but not report the level omits this slot.
export interface PowerThermalBackend {
  getThermalState(): PowerThermalState;
  subscribeThermalStateChange(listener: (state: PowerThermalState) => void): () => void;
}

// The host whose slots attachPower subscribes through. Every slot in the group is optional, so a caller
// passes whichever it has: a host without `sessionLock` simply never delivers lock/unlock edges. A real
// Host satisfies this directly.
export interface PowerAttachHost {
  readonly power: Partial<HostPowerCapabilities>;
}

// The consumer-held power event entity. Signals are null until enablePowerSignals allocates them, so an
// unused group tree-shakes out. Entity-composed: this is a user-held identity-bearing object, unlike the
// PowerStatus / PowerBatteryHealth value structs the queries fill.
//
// `onChange` receives a FRESH status per event. It is deliberately not a shared reusable buffer: a
// listener that retains the payload must not have it mutate underneath on the next power event.
//
// onCharging / onDischarging / onIdleStateChange are CORE-derived — no backend emits them; core computes
// them from status transitions and idle polling. They are therefore signals rather than host slots.
export interface Power extends Entity {
  onChange: Signal<(status: Readonly<PowerStatus>) => void> | null;
  onCharging: Signal<() => void> | null;
  onDischarging: Signal<() => void> | null;
  onIdleStateChange: Signal<() => void> | null;
  onLockScreen: Signal<() => void> | null;
  onResume: Signal<() => void> | null;
  onSuspend: Signal<() => void> | null;
  onThermalStateChange: Signal<(state: PowerThermalState) => void> | null;
  onUnlockScreen: Signal<() => void> | null;
}
