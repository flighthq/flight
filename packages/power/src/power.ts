import { createSignal, emitSignal, hasSignalSlots } from '@flighthq/signals';
import type {
  Power,
  PowerBackend,
  PowerBatteryHealth,
  PowerIdleState,
  PowerKeepAwakeMode,
  PowerStatus,
  PowerThermalState,
} from '@flighthq/types';

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

// Builds the default web backend over the Battery Status API and the Screen Wake Lock API. Degrades
// to batteryLevel=-1 / not charging and a no-op subscription where the APIs are absent.
export function createWebPowerBackend(): PowerBackend {
  let cachedLevel = -1;
  let cachedCharging = false;
  let cachedChargingTime = -1;
  let cachedDischargingTime = -1;
  return {
    getBatteryHealth(_out) {
      // Browser Battery Status API does not expose health information.
      return null;
    },
    isKeepAwakeActive() {
      return _wakeLockSentinel !== null;
    },
    getStatus(out) {
      // Read all input values first (alias-safe: out may be the same object as an input).
      const level = cachedLevel;
      const charging = cachedCharging;
      const chargingTime = cachedChargingTime;
      const dischargingTime = cachedDischargingTime;
      out.batteryLevel = level;
      out.chargingTime = chargingTime;
      out.dischargingTime = dischargingTime;
      out.isBatteryLow = level >= 0 && level <= 0.2 && !charging;
      out.isCharging = charging;
      // Web Battery Status API: isOnBattery = device has a battery and is not charging/AC.
      // If level is -1 (API absent), we cannot determine the power source; use false as sentinel.
      out.isOnBattery = level >= 0 && !charging;
      // No real OS low-power-mode read available on web; use false as sentinel.
      out.isLowPower = false;
      out.thermalState = 'Unknown';
      return out;
    },
    getSystemIdleState(_thresholdSeconds) {
      // The Idle Detection API is permission-gated and not widely available; return sentinel.
      return 'Unknown';
    },
    getSystemIdleTime() {
      // No idle-time API available on web; return sentinel.
      return -1;
    },
    setKeepAwake(enabled, mode) {
      const resolvedMode = mode ?? 'PreventDisplaySleep';
      // Web only supports display-sleep prevention via the Screen Wake Lock API.
      if (resolvedMode === 'PreventAppSuspension') return false;
      if (typeof navigator === 'undefined') return false;
      const wakeLock = (navigator as Navigator & { wakeLock?: WebWakeLock }).wakeLock;
      if (wakeLock === undefined) return false;
      try {
        if (!enabled) {
          _wakeLockSentinel?.release?.().catch(() => {});
          _wakeLockSentinel = null;
          return true;
        }
        wakeLock
          .request('screen')
          .then((sentinel) => {
            _wakeLockSentinel = sentinel;
            // Re-acquire the lock after visibility is restored; browsers auto-release it when the
            // tab goes hidden.
            sentinel.addEventListener?.('release', () => {
              if (_wakeLockSentinel === sentinel && !document.hidden) {
                wakeLock
                  .request('screen')
                  .then((newSentinel) => {
                    if (_wakeLockSentinel === sentinel) _wakeLockSentinel = newSentinel;
                  })
                  .catch(() => {});
              }
            });
          })
          .catch(() => {});
        return true;
      } catch {
        return false;
      }
    },
    subscribe(listener) {
      const battery = getWebBatteryManagerPromise();
      if (battery === null) return () => {};
      let manager: WebBatteryManager | null = null;
      const onLevelChange = () => {
        if (manager !== null) cachedLevel = manager.level;
        listener();
      };
      const onChargingChange = () => {
        if (manager !== null) cachedCharging = manager.charging;
        listener();
      };
      const onChargingTimeChange = () => {
        if (manager !== null) {
          const t = manager.chargingTime;
          cachedChargingTime = t === Infinity ? -1 : t;
        }
        listener();
      };
      const onDischargingTimeChange = () => {
        if (manager !== null) {
          const t = manager.dischargingTime;
          cachedDischargingTime = t === Infinity ? -1 : t;
        }
        listener();
      };
      let cancelled = false;
      battery
        .then((m) => {
          if (cancelled) return;
          manager = m;
          cachedLevel = m.level;
          cachedCharging = m.charging;
          cachedChargingTime = m.chargingTime === Infinity ? -1 : m.chargingTime;
          cachedDischargingTime = m.dischargingTime === Infinity ? -1 : m.dischargingTime;
          m.addEventListener?.('levelchange', onLevelChange);
          m.addEventListener?.('chargingchange', onChargingChange);
          m.addEventListener?.('chargingtimechange', onChargingTimeChange);
          m.addEventListener?.('dischargingtimechange', onDischargingTimeChange);
          listener();
        })
        .catch(() => {});
      return () => {
        cancelled = true;
        manager?.removeEventListener?.('levelchange', onLevelChange);
        manager?.removeEventListener?.('chargingchange', onChargingChange);
        manager?.removeEventListener?.('chargingtimechange', onChargingTimeChange);
        manager?.removeEventListener?.('dischargingtimechange', onDischargingTimeChange);
        manager = null;
      };
    },
    subscribeLockScreen() {
      // The Web Platform has no lock-screen API; only native hosts can detect screen lock.
      return () => {};
    },
    subscribeLowPowerModeChange() {
      // No OS low-power-mode API available on web; return a no-op unsubscriber.
      return () => {};
    },
    subscribeResume(listener) {
      if (typeof document === 'undefined') return () => {};
      document.addEventListener('resume', listener);
      return () => document.removeEventListener('resume', listener);
    },
    subscribeSuspend(listener) {
      if (typeof document === 'undefined') return () => {};
      document.addEventListener('freeze', listener);
      return () => document.removeEventListener('freeze', listener);
    },
    subscribeThermalStateChange() {
      // No thermal state API available on web; return a no-op unsubscriber.
      return () => {};
    },
    subscribeUnlockScreen() {
      // The Web Platform has no unlock-screen API; only native hosts can detect screen unlock.
      return () => {};
    },
  };
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

export function getPowerBackend(): PowerBackend {
  if (_backend === null) _backend = createWebPowerBackend();
  return _backend;
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

// Returns true when a keep-awake lock is currently held by the active backend.
export function hasPowerKeepAwake(): boolean {
  return getPowerBackend().isKeepAwakeActive();
}

// Installs a native host power backend; pass null to fall back to the web default.
export function setPowerBackend(backend: PowerBackend | null): void {
  _backend = backend;
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

let _backend: PowerBackend | null = null;
let _idlePollingIntervalMs = 5000;
let _wakeLockSentinel: WebWakeLockSentinel | null = null;
const _scratch: PowerStatus = createPowerStatus();
const _subscriptions = new WeakMap<Power, () => void>();

interface WebBatteryManager {
  chargingTime: number;
  dischargingTime: number;
  level: number;
  charging: boolean;
  addEventListener?: (
    type: 'chargingtimechange' | 'chargingchange' | 'dischargingtimechange' | 'levelchange',
    listener: () => void,
  ) => void;
  removeEventListener?: (
    type: 'chargingtimechange' | 'chargingchange' | 'dischargingtimechange' | 'levelchange',
    listener: () => void,
  ) => void;
}

interface WebWakeLockSentinel {
  addEventListener?: (type: 'release', listener: () => void) => void;
  release?: () => Promise<void>;
}

interface WebWakeLock {
  request: (type: 'screen') => Promise<WebWakeLockSentinel>;
}

function getWebBatteryManagerPromise(): Promise<WebBatteryManager> | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & { getBattery?: () => Promise<WebBatteryManager> };
  if (typeof nav.getBattery !== 'function') return null;
  try {
    return nav.getBattery();
  } catch {
    return null;
  }
}
