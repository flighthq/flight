import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { clearSignal, createSignal, emitSignal, hasSignalSlots } from '@flighthq/signals/contract';
import type {
  EntityConstruction,
  HostPowerBatteryHealthProvider,
  HostPowerChangeProvider,
  HostPowerIdleProvider,
  HostPowerKeepAwakeProvider,
  HostPowerSessionLockProvider,
  HostPowerStatusProvider,
  HostPowerSuspensionProvider,
  HostPowerThermalProvider,
  Power,
  PowerBatteryHealth,
  PowerIdleState,
  PowerKeepAwakeAcquireResult,
  PowerKeepAwakeMode,
  PowerKeepAwakeReleaseResult,
  PowerStatus,
  PowerThermalState,
} from '@flighthq/types/contract';

// AN ATTEMPT IS NEVER AN OUTCOME. The previous seam recorded that an operation had been STARTED and
// reported that as availability: a denied Wake Lock request was observed as 'available' because the
// observation ran on the synchronous path before the promise settled. Every result here is produced
// after the underlying operation has actually completed.

// Acquires a keep-awake lock, resolving only once the provider has really taken it. `ok` means the
// provider acquired its mechanism — not that the hardware can never sleep for other policy reasons.
export function acquirePowerKeepAwake(
  hostPowerKeepAwake: Readonly<HostPowerKeepAwakeProvider>,
  mode: PowerKeepAwakeMode = 'PreventDisplaySleep',
): Promise<PowerKeepAwakeAcquireResult> {
  return hostPowerKeepAwake.acquire(mode);
}

// Starts delivering the host's power events into `power`'s signals. Re-attaching detaches first, so one
// entity never holds two live subscriptions.
//
// Each unsubscribe is ORIGIN-PINNED: it is kept beside the entity that opened it, so detaching one
// entity ends exactly its own subscriptions. Teardown ATTEMPTS ALL of them even if one throws, because
// abandoning the rest would leak every subscription after the first failure.
export function attachPower(
  hostPowerStatus: Readonly<HostPowerStatusProvider> | undefined,
  hostPowerChange: Readonly<HostPowerChangeProvider> | undefined,
  hostPowerSessionLock: Readonly<HostPowerSessionLockProvider> | undefined,
  hostPowerSuspension: Readonly<HostPowerSuspensionProvider> | undefined,
  hostPowerThermal: Readonly<HostPowerThermalProvider> | undefined,
  hostPowerIdle: Readonly<HostPowerIdleProvider> | undefined,
  power: Power,
  idleThresholdSeconds = 60,
): void {
  detachPower(power);
  const teardowns: (() => void)[] = [];

  const status = hostPowerStatus;
  const change = hostPowerChange;
  if (change !== undefined) {
    let wasCharging = status !== undefined ? status.getStatus(makePowerStatus()).isCharging : false;
    teardowns.push(
      change.subscribe(() => {
        // A FRESH value per event, never a shared reusable buffer: a listener may retain this payload
        // and it must not mutate underneath on the next power event.
        const current = status !== undefined ? status.getStatus(makePowerStatus()) : null;
        if (current !== null && power.onChange !== null) emitSignal(power.onChange, current);
        if (current !== null && current.isCharging !== wasCharging) {
          wasCharging = current.isCharging;
          const transition = current.isCharging ? power.onCharging : power.onDischarging;
          if (transition !== null) emitSignal(transition);
        }
      }),
    );
  }

  const sessionLock = hostPowerSessionLock;
  if (sessionLock !== undefined) {
    teardowns.push(sessionLock.subscribeLock(() => emitSignalWhenPresent(power.onLockScreen)));
    teardowns.push(sessionLock.subscribeUnlock(() => emitSignalWhenPresent(power.onUnlockScreen)));
  }

  const suspension = hostPowerSuspension;
  if (suspension !== undefined) {
    teardowns.push(suspension.subscribeSuspend(() => emitSignalWhenPresent(power.onSuspend)));
    teardowns.push(suspension.subscribeResume(() => emitSignalWhenPresent(power.onResume)));
  }

  const thermal = hostPowerThermal;
  if (thermal !== undefined) {
    teardowns.push(
      thermal.subscribeThermalStateChange((state) => {
        if (power.onThermalStateChange !== null) emitSignal(power.onThermalStateChange, state);
      }),
    );
  }

  // Idle is polled because no host pushes idle transitions. The interval exists only when the host
  // actually offers the idle slot: a host that would answer a constant 'Unknown' omits the slot, so
  // nothing polls a value that provably cannot change.
  const idle = hostPowerIdle;
  if (idle !== undefined) {
    let lastIdleState: PowerIdleState = idle.getIdleState(idleThresholdSeconds);
    const idleIntervalId = setInterval(() => {
      const idleSignal = power.onIdleStateChange;
      if (idleSignal === null || !hasSignalSlots(idleSignal)) return;
      const current = idle.getIdleState(idleThresholdSeconds);
      if (current !== lastIdleState) {
        lastIdleState = current;
        emitSignal(idleSignal);
      }
    }, _idlePollingIntervalMs);
    teardowns.push(() => clearInterval(idleIntervalId));
  }

  _subscriptions.set(power, teardowns);
}

export function createPower(): Power {
  const out = allocateEntity<Power>();
  initializePower(out);
  return finishEntity(out);
}

// Stops delivery without discarding the entity. Runs every teardown this entity opened, ATTEMPTING ALL
// of them: one throwing unsubscribe must not strand the rest. Does not touch the provider — that is
// `destroy` on the host's slot, a separate lifecycle.
// FINAL RELEASE for the one power slot that owns a whole-provider resource. Destroys every DISTINCT
// keep-awake provider exactly once — alias-safe, because two hosts may share one provider object and
// destroying it twice would double-release an OS lock.
//
// Attempt-all: every obligation is tried even after one throws, and the first error is rethrown once the
// siblings have run. A provider whose destroy threw is RETAINED, so a later call retries only the
// failures; the ones that succeeded are forgotten and never destroyed twice.
export function destroyPowerKeepAwake(...hostPowerKeepAwake: readonly Readonly<HostPowerKeepAwakeProvider>[]): void {
  const pending = new Set<HostPowerKeepAwakeProvider>();
  for (const provider of hostPowerKeepAwake) {
    if (!_destroyedKeepAwake.has(provider)) pending.add(provider);
  }
  let failure: unknown = null;
  for (const provider of pending) {
    try {
      if (provider.destroy !== undefined) assertSyncVoid(provider.destroy());
    } catch (error) {
      failure ??= error;
      continue;
    }
    _destroyedKeepAwake.add(provider);
  }
  if (failure !== null) throw failure;
}

export function detachPower(power: Power): void {
  const teardowns = _subscriptions.get(power);
  if (teardowns === undefined) return;
  _subscriptions.delete(power);
  let failure: unknown = null;
  for (const teardown of teardowns) {
    try {
      teardown();
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure !== null) throw failure;
}

// Terminal disposal: detaches and then clears the entity's signals, so it becomes GC-eligible.
export function disposePower(power: Power): void {
  detachPower(power);
  if (power.onChange !== null) clearSignal(power.onChange);
  if (power.onCharging !== null) clearSignal(power.onCharging);
  if (power.onDischarging !== null) clearSignal(power.onDischarging);
  if (power.onIdleStateChange !== null) clearSignal(power.onIdleStateChange);
  if (power.onLockScreen !== null) clearSignal(power.onLockScreen);
  if (power.onResume !== null) clearSignal(power.onResume);
  if (power.onSuspend !== null) clearSignal(power.onSuspend);
  if (power.onThermalStateChange !== null) clearSignal(power.onThermalStateChange);
  if (power.onUnlockScreen !== null) clearSignal(power.onUnlockScreen);
}

// Allocates any not-yet-allocated Power signals so callers can connect to them. Idempotent.
export function enablePowerSignals(power: Power): void {
  power.onChange ??= createSignal();
  power.onCharging ??= createSignal();
  power.onDischarging ??= createSignal();
  power.onIdleStateChange ??= createSignal();
  power.onLockScreen ??= createSignal();
  power.onResume ??= createSignal();
  power.onSuspend ??= createSignal();
  power.onThermalStateChange ??= createSignal();
  power.onUnlockScreen ??= createSignal();
}

export function getPowerBatteryHealth(
  hostPowerBatteryHealth: Readonly<HostPowerBatteryHealthProvider>,
  out: PowerBatteryHealth,
): PowerBatteryHealth {
  return hostPowerBatteryHealth.getBatteryHealth(out);
}

export function getPowerIdlePollingIntervalMs(): number {
  return _idlePollingIntervalMs;
}

export function getPowerStatus(hostPowerStatus: Readonly<HostPowerStatusProvider>, out: PowerStatus): PowerStatus {
  return hostPowerStatus.getStatus(out);
}

export function getPowerSystemIdleState(
  hostPowerIdle: Readonly<HostPowerIdleProvider>,
  thresholdSeconds: number,
): PowerIdleState {
  return hostPowerIdle.getIdleState(thresholdSeconds);
}

export function getPowerSystemIdleTime(hostPowerIdle: Readonly<HostPowerIdleProvider>): number {
  return hostPowerIdle.getIdleTimeSeconds();
}

export function getPowerThermalState(hostPowerThermal: Readonly<HostPowerThermalProvider>): PowerThermalState {
  return hostPowerThermal.getThermalState();
}

// Allocates a Power event entity with its signals left null. Call enablePowerSignals to allocate the
// signals to connect to, and attachPower to start delivering host events into them.
export function initializePower(out: EntityConstruction<Power>): void {
  out.onChange = null;
  out.onCharging = null;
  out.onDischarging = null;
  out.onIdleStateChange = null;
  out.onLockScreen = null;
  out.onResume = null;
  out.onSuspend = null;
  out.onThermalStateChange = null;
  out.onUnlockScreen = null;
}

export function isPowerKeepAwakeActive(hostPowerKeepAwake: Readonly<HostPowerKeepAwakeProvider>): boolean {
  return hostPowerKeepAwake.isActive();
}

// Allocates a PowerBatteryHealth value with the domain's complete unknown encoding. Not a create*: this
// is a plain value the queries fill, with no identity — but it earns a function because the -1/'Unknown'
// defaults are load-bearing and a literal `{}` would read as undefined where the domain expects -1.
export function makePowerBatteryHealth(): PowerBatteryHealth {
  return {
    capacityWearLevel: -1,
    cycleCount: -1,
    healthState: 'Unknown',
    temperatureCelsius: -1,
    voltage: -1,
  };
}

// Allocates a PowerStatus value with the domain's complete unknown encoding. Same reasoning as
// makePowerBatteryHealth: a value, not an entity, but the defaults are load-bearing.
export function makePowerStatus(): PowerStatus {
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

// Releases a keep-awake lock, resolving only once the provider has really let it go. State is never
// published before the awaited release succeeds.
export function releasePowerKeepAwake(
  hostPowerKeepAwake: Readonly<HostPowerKeepAwakeProvider>,
): Promise<PowerKeepAwakeReleaseResult> {
  return hostPowerKeepAwake.release();
}

export function setPowerIdlePollingIntervalMs(intervalMs: number): void {
  _idlePollingIntervalMs = intervalMs > 0 ? intervalMs : 1;
}

function emitSignalWhenPresent(signal: Power['onSuspend']): void {
  if (signal !== null) emitSignal(signal);
}

let _idlePollingIntervalMs = 5000;

// Origin-pinned teardown bookkeeping: each entity's own unsubscribes, held beside the entity rather
// than in a shared slot, so detaching one never ends another's subscriptions.
const _subscriptions = new WeakMap<Power, (() => void)[]>();

// Providers already finally-released. A destroy that THREW is deliberately absent, so the next call
// retries exactly the failed obligations and never re-destroys a successful one.
const _destroyedKeepAwake = new WeakSet<HostPowerKeepAwakeProvider>();

type IsAny<T> = 0 extends 1 & T ? true : false;
function assertSyncVoid<T>(value: T & (IsAny<T> extends true ? never : T extends void ? unknown : never)): void {
  void value;
}
