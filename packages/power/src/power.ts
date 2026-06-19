import { createSignal, emitSignal } from '@flighthq/signals';
import type { Power, PowerBackend, PowerStatus } from '@flighthq/types';

// Begins delivering power changes to `power`'s signals by subscribing to the active backend. On each
// change it reads a fresh status and emits onChange plus onCharging/onDischarging on charging
// transitions. Idempotent: a prior subscription is torn down first. Pair with detachPower/disposePower.
export function attachPower(power: Power): void {
  detachPower(power);
  const backend = getPowerBackend();
  let wasCharging = backend.getStatus(_scratch).isCharging;
  const unsubscribeChange = backend.subscribe(() => {
    const status = backend.getStatus(_scratch);
    emitSignal(power.onChange, status);
    if (status.isCharging !== wasCharging) {
      wasCharging = status.isCharging;
      emitSignal(status.isCharging ? power.onCharging : power.onDischarging);
    }
  });
  const unsubscribeSuspend = backend.subscribeSuspend(() => emitSignal(power.onSuspend));
  const unsubscribeResume = backend.subscribeResume(() => emitSignal(power.onResume));
  _subscriptions.set(power, () => {
    unsubscribeChange();
    unsubscribeSuspend();
    unsubscribeResume();
  });
}

// Allocates a Power event entity with inert signals; call attachPower to start delivery.
export function createPower(): Power {
  return {
    onChange: createSignal(),
    onCharging: createSignal(),
    onDischarging: createSignal(),
    onSuspend: createSignal(),
    onResume: createSignal(),
  };
}

// Allocates a zeroed PowerStatus, suitable as the `out` for getPowerStatus.
export function createPowerStatus(): PowerStatus {
  return { batteryLevel: -1, isCharging: false, isLowPower: false };
}

// Builds the default web backend over the Battery Status API and the Screen Wake Lock API. Degrades
// to batteryLevel=-1 / not charging and a no-op subscription where the APIs are absent.
export function createWebPowerBackend(): PowerBackend {
  let cachedLevel = -1;
  let cachedCharging = false;
  return {
    getStatus(out) {
      out.batteryLevel = cachedLevel;
      out.isCharging = cachedCharging;
      out.isLowPower = cachedLevel >= 0 && cachedLevel <= 0.2 && !cachedCharging;
      return out;
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
      let cancelled = false;
      battery
        .then((m) => {
          if (cancelled) return;
          manager = m;
          cachedLevel = m.level;
          cachedCharging = m.charging;
          m.addEventListener?.('levelchange', onLevelChange);
          m.addEventListener?.('chargingchange', onChargingChange);
          listener();
        })
        .catch(() => {});
      return () => {
        cancelled = true;
        manager?.removeEventListener?.('levelchange', onLevelChange);
        manager?.removeEventListener?.('chargingchange', onChargingChange);
        manager = null;
      };
    },
    subscribeSuspend(listener) {
      if (typeof document === 'undefined') return () => {};
      document.addEventListener('freeze', listener);
      return () => document.removeEventListener('freeze', listener);
    },
    subscribeResume(listener) {
      if (typeof document === 'undefined') return () => {};
      document.addEventListener('resume', listener);
      return () => document.removeEventListener('resume', listener);
    },
    setKeepAwake(enabled) {
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
          })
          .catch(() => {});
        return true;
      } catch {
        return false;
      }
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

// The active power backend, or a lazily-created web default. There is always a backend.
export function getPowerBackend(): PowerBackend {
  if (_backend === null) _backend = createWebPowerBackend();
  return _backend;
}

// Fills `out` with the current power snapshot and returns it.
export function getPowerStatus(out: PowerStatus): PowerStatus {
  return getPowerBackend().getStatus(out);
}

// Installs a native host power backend; pass null to fall back to the web default.
export function setPowerBackend(backend: PowerBackend | null): void {
  _backend = backend;
}

// Requests or releases a screen keep-awake lock; returns whether the request was honored.
export function setPowerKeepAwake(enabled: boolean): boolean {
  return getPowerBackend().setKeepAwake(enabled);
}

let _backend: PowerBackend | null = null;
let _wakeLockSentinel: WebWakeLockSentinel | null = null;
const _scratch: PowerStatus = createPowerStatus();
const _subscriptions = new WeakMap<Power, () => void>();

interface WebBatteryManager {
  level: number;
  charging: boolean;
  addEventListener?: (type: 'levelchange' | 'chargingchange', listener: () => void) => void;
  removeEventListener?: (type: 'levelchange' | 'chargingchange', listener: () => void) => void;
}

interface WebWakeLockSentinel {
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
