import {
  hasPowerHostBackend,
  installPowerHostBackend,
  observePowerHostResult,
  resetPowerBackendForTest,
} from '@flighthq/power/contract';
import type { PowerBackend } from '@flighthq/types/contract';

// ★ THE GUARD ASKS RATHER THAN REMEMBERS. This was `if (_enabled) return; _enabled = true;` — a host-local
// copy of a fact `@flighthq/power` owns. Nothing reset it, so once the capability cleared its host slot
// the two disagreed permanently: the slot was empty, this function believed it had already installed, and
// the capability stayed on its sentinel for the life of the process with no error anywhere.
export function enableHostWebPower(): void {
  if (hasPowerHostBackend()) return;
  const backend: PowerBackend = {
    // Frees everything this backend owns, not merely the wake lock.
    //
    // ★ THE TWO OMISSIONS THIS CLOSES were latent until `destroyPowerBackend` landed: before that, no
    // path could reach this function at all, so an incomplete teardown was invisible. Now it runs, and
    // both of these would be observable — stale readings served to the next backend as if fresh, and a
    // listener still attached to a sentinel this backend already released.
    //
    // Idempotent: the map is emptied and the cache is already at its unknown values, so a second call
    // detaches nothing and clears nothing.
    destroy() {
      _wakeLockSentinel?.release?.().catch(() => {});
      _wakeLockSentinel = null;
      detachWakeLockReleaseListeners();
      resetCachedBatteryReadings();
    },
    getBatteryHealth() {
      return null;
    },
    getStatus(out) {
      try {
        const level = _cachedLevel;
        const charging = _cachedCharging;
        const chargingTime = _cachedChargingTime;
        const dischargingTime = _cachedDischargingTime;
        out.batteryLevel = level;
        out.chargingTime = chargingTime;
        out.dischargingTime = dischargingTime;
        out.isBatteryLow = level >= 0 && level <= 0.2 && !charging;
        out.isCharging = charging;
        out.isOnBattery = level >= 0 && !charging;
        out.isLowPower = false;
        out.thermalState = 'Unknown';
        observePowerHostResult('getStatus', true);
        return out;
      } catch {
        observePowerHostResult('getStatus', false);
        out.batteryLevel = -1;
        out.chargingTime = -1;
        out.dischargingTime = -1;
        out.isBatteryLow = false;
        out.isCharging = false;
        out.isLowPower = false;
        out.isOnBattery = false;
        out.thermalState = 'Unknown';
        return out;
      }
    },
    getSystemIdleState() {
      return 'Unknown';
    },
    getSystemIdleTime() {
      return -1;
    },
    isKeepAwakeActive() {
      return _wakeLockSentinel !== null;
    },
    setKeepAwake(enabled, mode) {
      const resolvedMode = mode ?? 'PreventDisplaySleep';
      if (resolvedMode === 'PreventAppSuspension') return false;
      if (typeof navigator === 'undefined') return false;
      const wakeLock = (navigator as Navigator & { wakeLock?: WebWakeLock }).wakeLock;
      if (wakeLock === undefined) return false;
      try {
        if (!enabled) {
          _wakeLockSentinel?.release?.().catch(() => {});
          _wakeLockSentinel = null;
          observePowerHostResult('setKeepAwake', true);
          return true;
        }
        wakeLock
          .request('screen')
          .then((sentinel) => {
            _wakeLockSentinel = sentinel;
            // Named and retained rather than inline: this is the reference `removeEventListener` needs.
            const onRelease = (): void => {
              if (_wakeLockSentinel === sentinel && !document.hidden) {
                wakeLock
                  .request('screen')
                  .then((newSentinel) => {
                    if (_wakeLockSentinel === sentinel) _wakeLockSentinel = newSentinel;
                  })
                  .catch(() => {});
              }
            };
            _wakeLockReleaseListeners.set(sentinel, onRelease);
            sentinel.addEventListener?.('release', onRelease);
          })
          .catch(() => {});
        observePowerHostResult('setKeepAwake', true);
        return true;
      } catch {
        observePowerHostResult('setKeepAwake', false);
        return false;
      }
    },
    subscribe(listener) {
      try {
        const battery = _getWebBatteryManagerPromise();
        if (battery === null) {
          observePowerHostResult('subscribe', false);
          return () => {};
        }
        let manager: WebBatteryManager | null = null;
        const onLevelChange = () => {
          if (manager !== null) _cachedLevel = manager.level;
          listener();
        };
        const onChargingChange = () => {
          if (manager !== null) _cachedCharging = manager.charging;
          listener();
        };
        const onChargingTimeChange = () => {
          if (manager !== null) {
            const t = manager.chargingTime;
            _cachedChargingTime = t === Infinity ? -1 : t;
          }
          listener();
        };
        const onDischargingTimeChange = () => {
          if (manager !== null) {
            const t = manager.dischargingTime;
            _cachedDischargingTime = t === Infinity ? -1 : t;
          }
          listener();
        };
        let cancelled = false;
        battery
          .then((m) => {
            if (cancelled) return;
            manager = m;
            _cachedLevel = m.level;
            _cachedCharging = m.charging;
            _cachedChargingTime = m.chargingTime === Infinity ? -1 : m.chargingTime;
            _cachedDischargingTime = m.dischargingTime === Infinity ? -1 : m.dischargingTime;
            m.addEventListener?.('levelchange', onLevelChange);
            m.addEventListener?.('chargingchange', onChargingChange);
            m.addEventListener?.('chargingtimechange', onChargingTimeChange);
            m.addEventListener?.('dischargingtimechange', onDischargingTimeChange);
            listener();
          })
          .catch(() => {});
        observePowerHostResult('subscribe', true);
        return () => {
          cancelled = true;
          manager?.removeEventListener?.('levelchange', onLevelChange);
          manager?.removeEventListener?.('chargingchange', onChargingChange);
          manager?.removeEventListener?.('chargingtimechange', onChargingTimeChange);
          manager?.removeEventListener?.('dischargingtimechange', onDischargingTimeChange);
          manager = null;
        };
      } catch {
        observePowerHostResult('subscribe', false);
        return () => {};
      }
    },
    subscribeLockScreen() {
      return () => {};
    },
    subscribeLowPowerModeChange() {
      return () => {};
    },
    subscribeResume(listener) {
      if (typeof document === 'undefined') return () => {};
      try {
        document.addEventListener('resume', listener);
        observePowerHostResult('subscribeResume', true);
        return () => document.removeEventListener('resume', listener);
      } catch {
        observePowerHostResult('subscribeResume', false);
        return () => {};
      }
    },
    subscribeSuspend(listener) {
      if (typeof document === 'undefined') return () => {};
      try {
        document.addEventListener('freeze', listener);
        observePowerHostResult('subscribeSuspend', true);
        return () => document.removeEventListener('freeze', listener);
      } catch {
        observePowerHostResult('subscribeSuspend', false);
        return () => {};
      }
    },
    subscribeThermalStateChange() {
      return () => {};
    },
    subscribeUnlockScreen() {
      return () => {};
    },
  };
  installPowerHostBackend(backend);
}

// The host holds no enable state of its own any more, so "un-enable" means clearing the capability slot
// this installed into. Delegates rather than reaching past the owner: the slot belongs to
// `@flighthq/power`, and this is its own published test seam.
export function resetHostWebPowerForTest(): void {
  resetPowerBackendForTest();
}

// Detaches every retained release listener from the exact sentinel it was added to, then forgets the
// pairs. Detaching by identity is the whole point: `removeEventListener` is a no-op unless handed the
// same function reference that was added.
function detachWakeLockReleaseListeners(): void {
  for (const [sentinel, onRelease] of _wakeLockReleaseListeners) {
    sentinel.removeEventListener?.('release', onRelease);
  }
  _wakeLockReleaseListeners.clear();
}

// Returns the cached battery readings to their unknown values. These are module-scoped and outlive any
// one backend, so a destroyed backend's last readings would otherwise be served by its successor as if
// freshly measured — `-1`/`false` is what "not measured" means everywhere else in this file.
function resetCachedBatteryReadings(): void {
  _cachedCharging = false;
  _cachedChargingTime = -1;
  _cachedDischargingTime = -1;
  _cachedLevel = -1;
}

let _cachedCharging = false;
let _cachedChargingTime = -1;
let _cachedDischargingTime = -1;
let _cachedLevel = -1;
let _wakeLockSentinel: WebWakeLockSentinel | null = null;

// ★ THE EXACT PAIR, retained so it can be detached by identity. `removeEventListener` matches on the
// SAME function reference that was added, so an anonymous listener can never be removed — it simply
// outlives the sentinel. Keying by the sentinel it was attached to keeps each pair distinct across the
// repeated `setKeepAwake(true)` calls that each acquire their own sentinel.
const _wakeLockReleaseListeners = new Map<WebWakeLockSentinel, () => void>();

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

interface WebWakeLock {
  request: (type: 'screen') => Promise<WebWakeLockSentinel>;
}

interface WebWakeLockSentinel {
  addEventListener?: (type: 'release', listener: () => void) => void;
  // Required to detach by identity. Without it the listener added above outlives the sentinel's release.
  removeEventListener?: (type: 'release', listener: () => void) => void;
  release?: () => Promise<void>;
}

function _getWebBatteryManagerPromise(): Promise<WebBatteryManager> | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & { getBattery?: () => Promise<WebBatteryManager> };
  if (typeof nav.getBattery !== 'function') return null;
  try {
    return nav.getBattery();
  } catch {
    return null;
  }
}
