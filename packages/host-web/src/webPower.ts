import { installPowerHostBackend, observePowerHostResult } from '@flighthq/power/contract';
import type { PowerBackend } from '@flighthq/types/contract';

export function enableHostWebPower(): void {
  if (_enabled) return;
  _enabled = true;
  const backend: PowerBackend = {
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

export function resetHostWebPowerForTest(): void {
  _enabled = false;
}

let _cachedCharging = false;
let _cachedChargingTime = -1;
let _cachedDischargingTime = -1;
let _cachedLevel = -1;
let _enabled = false;
let _wakeLockSentinel: WebWakeLockSentinel | null = null;

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
