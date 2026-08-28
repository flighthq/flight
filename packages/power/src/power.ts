import { createSignal, emitSignal, hasSignalSlots } from '@flighthq/signals/contract';
import type { BackendExplanation } from '@flighthq/types/contract';
import type {
  Power,
  PowerBackend,
  PowerBatteryHealth,
  PowerIdleState,
  PowerKeepAwakeMode,
  PowerStatus,
  PowerThermalState,
} from '@flighthq/types/contract';

// Begins delivering power changes to `power`'s signals by subscribing to the active backend. On each
// change it reads a fresh status and emits onChange plus onCharging/onDischarging on charging
// transitions. For onIdleStateChange, a polling interval is started at the rate set by
// setPowerIdlePollingIntervalMs (default 5000ms); the poll is guarded so it only emits when at least
// one listener is connected to onIdleStateChange. idleThresholdSeconds (default 60) controls what
// idle state the backend reports as 'Idle' vs 'Active'. Idempotent: a prior subscription is torn
// down first. Pair with detachPower/disposePower.
export function attachPower(power: Power, idleThresholdSeconds = 60): void {
  detachPower(power);
  const backend = getPowerBackend();
  let wasCharging = backend.getStatus(_scratch).isCharging;
  const unsubscribeChange = backend.subscribe(() => {
    const status = backend.getStatus(_scratch);
    if (power.onChange !== null) emitSignal(power.onChange, status);
    if (status.isCharging !== wasCharging) {
      wasCharging = status.isCharging;
      const transition = status.isCharging ? power.onCharging : power.onDischarging;
      if (transition !== null) emitSignal(transition);
    }
  });
  const unsubscribeLockScreen = backend.subscribeLockScreen(() => {
    if (power.onLockScreen !== null) emitSignal(power.onLockScreen);
  });
  const unsubscribeLowPowerModeChange = backend.subscribeLowPowerModeChange(() => {
    if (power.onLowPowerModeChange !== null) emitSignal(power.onLowPowerModeChange);
  });
  const unsubscribeResume = backend.subscribeResume(() => {
    if (power.onResume !== null) emitSignal(power.onResume);
  });
  const unsubscribeSuspend = backend.subscribeSuspend(() => {
    if (power.onSuspend !== null) emitSignal(power.onSuspend);
  });
  const unsubscribeThermalStateChange = backend.subscribeThermalStateChange(() => {
    if (power.onThermalStateChange !== null) emitSignal(power.onThermalStateChange);
  });
  const unsubscribeUnlockScreen = backend.subscribeUnlockScreen(() => {
    if (power.onUnlockScreen !== null) emitSignal(power.onUnlockScreen);
  });

  // Idle state polling: poll at the configured interval and emit onIdleStateChange on transitions.
  // The poll emits only when at least one slot is connected, avoiding spurious allocations when
  // nobody is listening. The interval still runs (cheaply) so state transitions are never missed
  // when a listener connects after attach.
  let lastIdleState: PowerIdleState = backend.getSystemIdleState(idleThresholdSeconds);
  const idleIntervalId = setInterval(() => {
    const idleSignal = power.onIdleStateChange;
    if (idleSignal === null || !hasSignalSlots(idleSignal)) return;
    const current = backend.getSystemIdleState(idleThresholdSeconds);
    if (current !== lastIdleState) {
      lastIdleState = current;
      emitSignal(idleSignal);
    }
  }, _idlePollingIntervalMs);

  _subscriptions.set(power, () => {
    unsubscribeChange();
    unsubscribeLockScreen();
    unsubscribeLowPowerModeChange();
    unsubscribeResume();
    unsubscribeSuspend();
    unsubscribeThermalStateChange();
    unsubscribeUnlockScreen();
    clearInterval(idleIntervalId);
  });
}

// Allocates a Power event entity with its signals left null. Call enablePowerSignals to allocate the
// signals to connect to, and attachPower to start delivering backend changes into them.
export function createPower(): Power {
  return {
    onChange: null,
    onCharging: null,
    onDischarging: null,
    onIdleStateChange: null,
    onLockScreen: null,
    onLowPowerModeChange: null,
    onResume: null,
    onSuspend: null,
    onThermalStateChange: null,
    onUnlockScreen: null,
  };
}

// Allocates a zeroed PowerBatteryHealth, suitable as the `out` for getPowerBatteryHealth.
export function createPowerBatteryHealth(): PowerBatteryHealth {
  return {
    capacityWearLevel: -1,
    cycleCount: -1,
    healthState: 'Unknown',
    temperatureCelsius: -1,
    voltage: -1,
  };
}

// Allocates a zeroed PowerStatus, suitable as the `out` for getPowerStatus.
export function createPowerStatus(): PowerStatus {
  return {
    batteryLevel: -1,
    chargingTime: -1,
    dischargingTime: -1,
    isBatteryLow: false,
    isCharging: false,
    isLowPower: false,
    isOnBattery: false,
    thermalState: 'Unknown',
  };
}

// Tears down every installed Power backend and empties both slots.
//
// ★ THE HOST SLOT WAS PREVIOUSLY UNREACHABLE. `setPowerBackend` releases only the custom slot, and
// `installPowerHostBackend` installs once, so a backend installed by `enableHostWebPower` — the one an
// application actually gets — had no path that could ever call its `destroy()`. The structural lifecycle
// gate counted `Power` as wired throughout, because it reads declarations and setter wiring rather than
// reachability. This is the missing path.
//
// ★ SLOTS ARE CLEARED BEFORE RELEASE, and that is the opposite of what replacement does. The two
// orderings are both deliberate:
//   - REPLACEMENT (`setPowerBackend`) destroys while the outgoing backend is STILL selected, so teardown
//     code that queries the active backend sees itself, and a teardown that throws aborts the install and
//     leaves the outgoing backend owned for retry.
//   - FULL TEARDOWN (here) empties the slots FIRST, so teardown is re-entrant: a `destroy()` that calls
//     back into this function, or reads `getPowerBackend()`, finds the sentinel rather than a backend
//     that is already being freed. Clearing afterwards would let a re-entrant call free the same object
//     a second time.
export function destroyPowerBackend(): void {
  const previous = [_custom, _host] as const;
  _custom = null;
  _host = null;
  releasePowerBackends(previous, []);
}

// Stops delivery to `power` and forgets its subscription. Safe to call when not attached.
export function detachPower(power: Power): void {
  const unsubscribe = _subscriptions.get(power);
  if (unsubscribe !== undefined) {
    unsubscribe();
    _subscriptions.delete(power);
  }
}

// Releases `power` for garbage collection by detaching its backend subscription. The signals remain
// plain GC-managed memory afterward.
export function disposePower(power: Power): void {
  detachPower(power);
}

// Allocates any not-yet-allocated Power signals so callers can connect to them. Idempotent: signals
// already allocated are left untouched. Pair with attachPower to begin delivery.
export function enablePowerSignals(power: Power): void {
  if (power.onChange === null) power.onChange = createSignal();
  if (power.onCharging === null) power.onCharging = createSignal();
  if (power.onDischarging === null) power.onDischarging = createSignal();
  if (power.onIdleStateChange === null) power.onIdleStateChange = createSignal();
  if (power.onLockScreen === null) power.onLockScreen = createSignal();
  if (power.onLowPowerModeChange === null) power.onLowPowerModeChange = createSignal();
  if (power.onResume === null) power.onResume = createSignal();
  if (power.onSuspend === null) power.onSuspend = createSignal();
  if (power.onThermalStateChange === null) power.onThermalStateChange = createSignal();
  if (power.onUnlockScreen === null) power.onUnlockScreen = createSignal();
}

export function explainPowerBackend(): BackendExplanation {
  if (_custom !== null) {
    return { conflict: _hostConflict, layer: 'custom', operation: null, viability: 'unobserved' };
  }
  if (_host !== null) {
    return {
      conflict: _hostConflict,
      layer: 'host',
      operation: _hostObservation !== null ? _hostObservation.operation : null,
      viability: _hostObservation !== null ? _hostObservation.viability : 'unobserved',
    };
  }
  return { conflict: false, layer: 'host-not-enabled', operation: null, viability: 'unobserved' };
}

export function getPowerBackend(): PowerBackend {
  return _custom ?? _host ?? _sentinel;
}

// Returns the battery health detail from the active backend, writing into `out` and returning it,
// or returns null when the active backend does not support battery health reporting.
export function getPowerBatteryHealth(out: PowerBatteryHealth): PowerBatteryHealth | null {
  return getPowerBackend().getBatteryHealth(out);
}

// Returns the current idle-state polling interval in milliseconds (default 5000).
export function getPowerIdlePollingIntervalMs(): number {
  return _idlePollingIntervalMs;
}

// Fills `out` with the current power snapshot and returns it.
export function getPowerStatus(out: PowerStatus): PowerStatus {
  return getPowerBackend().getStatus(out);
}

// Returns the current system idle state at the given threshold in seconds.
export function getPowerSystemIdleState(thresholdSeconds: number): PowerIdleState {
  return getPowerBackend().getSystemIdleState(thresholdSeconds);
}

// Returns the elapsed seconds since the last user input event, or -1 when unsupported.
export function getPowerSystemIdleTime(): number {
  return getPowerBackend().getSystemIdleTime();
}

// Returns the current thermal state from the active backend.
export function getPowerThermalState(): PowerThermalState {
  return getPowerBackend().getStatus(_scratch).thermalState;
}

// True when a host backend occupies the host slot.
//
// ★ THIS EXISTS SO A HOST PACKAGE NEED NOT REMEMBER WHETHER IT INSTALLED. `enableHostWeb*` guarded
// itself with a module-local `_enabled` boolean, which is a second copy of a fact this package owns —
// and the two desynchronise the moment the slot is cleared, leaving the capability pinned to the
// sentinel with the host convinced it is still installed. Asking is always current; remembering is not.
//
// It reports the SLOT, not the effective backend: a custom backend set through `setPowerBackend` takes
// precedence for callers but does not occupy this slot, so it must not suppress host installation.
export function hasPowerHostBackend(): boolean {
  return _host !== null;
}

// Returns true when a keep-awake lock is currently held by the active backend.
export function hasPowerKeepAwake(): boolean {
  return getPowerBackend().isKeepAwakeActive();
}

export function installPowerHostBackend(backend: PowerBackend): void {
  if (_host !== null) {
    if (_host !== backend) _hostConflict = true;
    return;
  }
  _host = backend;
}

export function observePowerHostResult(operation: string, succeeded: boolean): void {
  _hostObservation = {
    operation,
    viability: succeeded ? 'available' : 'runtime-api-unavailable',
  };
}

export function resetPowerBackendForTest(): void {
  _custom = null;
  _host = null;
  _hostConflict = false;
  _hostObservation = null;
}

// Sets a custom power backend; pass null to clear and fall back to the host or sentinel.
// Destroys the outgoing backend before installing the replacement, so getPowerBackend still returns
// the outgoing backend during its destroy call. If destroy throws, the replacement is not installed
// and the outgoing backend remains selected/owned for retry. Skips destroy when the outgoing backend
// is retained in the host slot (shared identity).
export function setPowerBackend(backend: PowerBackend | null): void {
  if (_custom === backend) return;
  // Released BEFORE the assignment, deliberately: the outgoing backend must still be the selected one
  // during its own `destroy()`, and a teardown that throws must abort the install. `_host` is passed as
  // retained so a backend occupying both slots is not freed while the host slot still owns it.
  releasePowerBackends([_custom], [_host]);
  _custom = backend;
}

// Sets the interval at which attachPower polls the backend for idle state changes. The default is
// 5000ms (5 seconds); set lower for more responsive idle detection at the cost of more frequent
// backend calls. Only affects Power entities attached after this call.
export function setPowerIdlePollingIntervalMs(intervalMs: number): void {
  _idlePollingIntervalMs = intervalMs;
}

// Requests or releases a keep-awake lock for the given mode; returns whether honored.
// mode defaults to 'PreventDisplaySleep'.
export function setPowerKeepAwake(enabled: boolean, mode?: PowerKeepAwakeMode): boolean {
  return getPowerBackend().setKeepAwake(enabled, mode);
}

// Frees each distinct backend in `previous` that is not still owned by a surviving slot.
//
// `retainedSlots` is passed in rather than read from the live slots, because the two callers update the
// slots at opposite points relative to this call: replacement releases before assigning, full teardown
// clears before releasing. Reading `_custom`/`_host` here would therefore mean different things to each
// caller, and would silently retain the very backend replacement is trying to free.
//
// Two guards, one per failure mode:
//   - RETAINED: an object occupying more than one slot is not freed while another slot still owns it.
//   - RELEASED: a backend aliased into both slots is freed exactly once, not once per slot it appeared in.
function releasePowerBackends(
  previous: readonly (Readonly<PowerBackend> | null)[],
  retainedSlots: readonly (Readonly<PowerBackend> | null)[],
): void {
  const retained = new Set<unknown>(retainedSlots.filter((slot) => slot !== null));
  const released = new Set<unknown>();
  for (const backend of previous) {
    if (backend === null || retained.has(backend) || released.has(backend)) continue;
    released.add(backend);
    backend.destroy?.();
  }
}

let _custom: PowerBackend | null = null;
let _host: PowerBackend | null = null;
let _hostConflict = false;
let _hostObservation: { operation: string; viability: 'available' | 'runtime-api-unavailable' } | null = null;
let _idlePollingIntervalMs = 5000;
const _scratch: PowerStatus = createPowerStatus();
const _sentinel: PowerBackend = {
  getBatteryHealth() {
    return null;
  },
  getStatus(out) {
    out.batteryLevel = -1;
    out.chargingTime = -1;
    out.dischargingTime = -1;
    out.isBatteryLow = false;
    out.isCharging = false;
    out.isLowPower = false;
    out.isOnBattery = false;
    out.thermalState = 'Unknown';
    return out;
  },
  getSystemIdleState() {
    return 'Unknown';
  },
  getSystemIdleTime() {
    return -1;
  },
  isKeepAwakeActive() {
    return false;
  },
  setKeepAwake() {
    return false;
  },
  subscribe() {
    return () => {};
  },
  subscribeLockScreen() {
    return () => {};
  },
  subscribeLowPowerModeChange() {
    return () => {};
  },
  subscribeResume() {
    return () => {};
  },
  subscribeSuspend() {
    return () => {};
  },
  subscribeThermalStateChange() {
    return () => {};
  },
  subscribeUnlockScreen() {
    return () => {};
  },
};
const _subscriptions = new WeakMap<Power, () => void>();
