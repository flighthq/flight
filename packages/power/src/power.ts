import { createEntity } from '@flighthq/entity/contract';
import { clearSignal, createSignal, emitSignal, hasSignalSlots } from '@flighthq/signals/contract';
import type {
  HasPowerIdle,
  HasPowerKeepAwake,
  PowerKeepAwakeBackend,
  HasPowerStatus,
  HasPowerThermal,
  PowerAttachHost,
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
  host: HasPowerKeepAwake,
  mode: PowerKeepAwakeMode = 'PreventDisplaySleep',
): Promise<PowerKeepAwakeAcquireResult> {
  return host.power.keepAwake.acquire(mode);
}

// Starts delivering the host's power events into `power`'s signals. Re-attaching detaches first, so one
// entity never holds two live subscriptions.
//
// Each unsubscribe is ORIGIN-PINNED: it is kept beside the entity that opened it, so detaching one
// entity ends exactly its own subscriptions. Teardown ATTEMPTS ALL of them even if one throws, because
// abandoning the rest would leak every subscription after the first failure.
export function attachPower(host: PowerAttachHost, power: Power, idleThresholdSeconds = 60): void {
  detachPower(power);
  const teardowns: (() => void)[] = [];

  const status = host.power.status;
  const change = host.power.change;
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

  const sessionLock = host.power.sessionLock;
  if (sessionLock !== undefined) {
    teardowns.push(sessionLock.subscribeLock(() => emitSignalWhenPresent(power.onLockScreen)));
    teardowns.push(sessionLock.subscribeUnlock(() => emitSignalWhenPresent(power.onUnlockScreen)));
  }

  const suspension = host.power.suspension;
  if (suspension !== undefined) {
    teardowns.push(suspension.subscribeSuspend(() => emitSignalWhenPresent(power.onSuspend)));
    teardowns.push(suspension.subscribeResume(() => emitSignalWhenPresent(power.onResume)));
  }

  const thermal = host.power.thermal;
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
  const idle = host.power.idle;
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

// Allocates a Power event entity with its signals left null. Call enablePowerSignals to allocate the
// signals to connect to, and attachPower to start delivering host events into them.
export function createPower(): Power {
  return createEntity({
    onChange: null,
    onCharging: null,
    onDischarging: null,
    onIdleStateChange: null,
    onLockScreen: null,
    onResume: null,
    onSuspend: null,
    onThermalStateChange: null,
    onUnlockScreen: null,
  });
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
export function destroyPowerKeepAwake(...hosts: readonly HasPowerKeepAwake[]): void {
  const pending = new Set<PowerKeepAwakeBackend>();
  for (const host of hosts) {
    const provider = host.power.keepAwake;
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
  host: {
    readonly power: { readonly batteryHealth: { getBatteryHealth(out: PowerBatteryHealth): PowerBatteryHealth } };
  },
  out: PowerBatteryHealth,
): PowerBatteryHealth {
  return host.power.batteryHealth.getBatteryHealth(out);
}

export function getPowerIdlePollingIntervalMs(): number {
  return _idlePollingIntervalMs;
}

export function getPowerStatus(host: HasPowerStatus, out: PowerStatus): PowerStatus {
  return host.power.status.getStatus(out);
}

export function getPowerSystemIdleState(host: HasPowerIdle, thresholdSeconds: number): PowerIdleState {
  return host.power.idle.getIdleState(thresholdSeconds);
}

export function getPowerSystemIdleTime(host: HasPowerIdle): number {
  return host.power.idle.getIdleTimeSeconds();
}

export function getPowerThermalState(host: HasPowerThermal): PowerThermalState {
  return host.power.thermal.getThermalState();
}

export function isPowerKeepAwakeActive(host: HasPowerKeepAwake): boolean {
  return host.power.keepAwake.isActive();
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
export function releasePowerKeepAwake(host: HasPowerKeepAwake): Promise<PowerKeepAwakeReleaseResult> {
  return host.power.keepAwake.release();
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
const _destroyedKeepAwake = new WeakSet<PowerKeepAwakeBackend>();

type IsAny<T> = 0 extends 1 & T ? true : false;
function assertSyncVoid<T>(value: T & (IsAny<T> extends true ? never : T extends void ? unknown : never)): void {
  void value;
}
