import { createEntity } from '@flighthq/entity/contract';
import type {
  PowerChangeBackend,
  PowerKeepAwakeAcquireResult,
  PowerKeepAwakeBackend,
  PowerKeepAwakeMode,
  PowerKeepAwakeReleaseResult,
  PowerStatus,
  PowerStatusBackend,
  PowerSuspensionBackend,
} from '@flighthq/types/contract';

// The web power providers. Web offers exactly three slots — status, change and suspension — plus
// keepAwake. It omits idle, sessionLock, batteryHealth and thermal because it cannot observe them: an
// omitted slot is the honest report, where the previous backend's constant 'Unknown'/-1 answers and
// inert `() => {}` subscriptions were indistinguishable from a real implementation.

export const webPowerChangeBackend: PowerChangeBackend = {
  destroy(): void {
    resetCachedBatteryReadings();
  },
  subscribe(listener: () => void): () => void {
    const battery = _getWebBatteryManagerPromise();
    if (battery === null) return () => {};
    let manager: WebBatteryManager | null = null;
    const onLevelChange = (): void => {
      if (manager !== null) _cachedLevel = manager.level;
      listener();
    };
    const onChargingChange = (): void => {
      if (manager !== null) _cachedCharging = manager.charging;
      listener();
    };
    const onChargingTimeChange = (): void => {
      if (manager !== null) {
        const t = manager.chargingTime;
        _cachedChargingTime = t === Infinity ? -1 : t;
      }
      listener();
    };
    const onDischargingTimeChange = (): void => {
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
    return () => {
      cancelled = true;
      manager?.removeEventListener?.('levelchange', onLevelChange);
      manager?.removeEventListener?.('chargingchange', onChargingChange);
      manager?.removeEventListener?.('chargingtimechange', onChargingTimeChange);
      manager?.removeEventListener?.('dischargingtimechange', onDischargingTimeChange);
      manager = null;
    };
  },
};

// Keep-awake over the Wake Lock API. Both operations AWAIT the platform, so the reported outcome is the
// real one: the previous backend called request() fire-and-forget, swallowed the rejection and returned
// `true` synchronously, so a denied lock was reported as success and a lost lock still read as active.
export const webPowerKeepAwakeBackend: PowerKeepAwakeBackend = {
  async acquire(mode: PowerKeepAwakeMode): Promise<PowerKeepAwakeAcquireResult> {
    // Web can only keep the DISPLAY awake; it has no way to prevent process suspension.
    if (mode === 'PreventAppSuspension') return { reason: 'unavailable' };
    const wakeLock = _getWebWakeLock();
    if (wakeLock === null) return { reason: 'unavailable' };
    let sentinel: WebWakeLockSentinel;
    try {
      sentinel = await wakeLock.request('screen');
    } catch (error) {
      // A refusal by policy (hidden page, no user gesture) is a DENIAL the caller can act on; anything
      // else is an operation failure. Both are reported; neither is swallowed.
      return { reason: _isDenial(error) ? 'denied' : 'failed' };
    }
    _wakeLockSentinel = sentinel;
    // ★ THE EXACT PAIR, retained so it can be detached by identity: removeEventListener matches on the
    // SAME reference that was added. On an OS-initiated release the sentinel is cleared IMMEDIATELY —
    // a re-acquire is a new tracked operation, never an assumption that the lock came back.
    const onRelease = (): void => {
      if (_wakeLockSentinel === sentinel) _wakeLockSentinel = null;
      _wakeLockReleaseListeners.delete(sentinel);
    };
    _wakeLockReleaseListeners.set(sentinel, onRelease);
    sentinel.addEventListener?.('release', onRelease);
    return { reason: 'ok' };
  },
  destroy(): void {
    void _releaseSentinel();
    detachWakeLockReleaseListeners();
    resetCachedBatteryReadings();
  },
  isActive(): boolean {
    return _wakeLockSentinel !== null;
  },
  async release(): Promise<PowerKeepAwakeReleaseResult> {
    const sentinel = _wakeLockSentinel;
    // Nothing held is an ordinary outcome, not a fault — reported distinctly from 'ok' so a caller that
    // believed it held a lock can tell that it did not.
    if (sentinel === null) return { reason: 'inactive' };
    try {
      await sentinel.release?.();
    } catch {
      // State is NOT cleared: the lock may still be held, and publishing "released" here would be the
      // same lie in the opposite direction.
      return { reason: 'failed' };
    }
    if (_wakeLockSentinel === sentinel) _wakeLockSentinel = null;
    sentinel.removeEventListener?.('release', _wakeLockReleaseListeners.get(sentinel) ?? (() => {}));
    _wakeLockReleaseListeners.delete(sentinel);
    return { reason: 'ok' };
  },
};

export const webPowerStatusBackend: PowerStatusBackend = {
  destroy(): void {
    resetCachedBatteryReadings();
  },
  getStatus(out: PowerStatus): PowerStatus {
    const level = _cachedLevel;
    const charging = _cachedCharging;
    out.batteryLevel = level;
    out.chargingTime = _cachedChargingTime;
    out.dischargingTime = _cachedDischargingTime;
    out.isBatteryLow = level >= 0 && level <= 0.2 && !charging;
    out.isCharging = charging;
    out.isLowPower = false;
    out.isOnBattery = level >= 0 && !charging;
    // Web cannot read thermal pressure at all, which is why there is no web thermal slot. The field
    // stays at the domain's unknown encoding rather than implying a reading.
    out.thermalState = 'Unknown';
    return out;
  },
};

// Suspend/resume over the Page Lifecycle API. freeze/resume are the spec'd pair and both really fire.
export const webPowerSuspensionBackend: PowerSuspensionBackend = {
  subscribeResume(listener: () => void): () => void {
    if (typeof document === 'undefined') return () => {};
    document.addEventListener('resume', listener);
    return () => document.removeEventListener('resume', listener);
  },
  subscribeSuspend(listener: () => void): () => void {
    if (typeof document === 'undefined') return () => {};
    document.addEventListener('freeze', listener);
    return () => document.removeEventListener('freeze', listener);
  },
};

// The web power capability group, for composing into a Host.
export const webPowerCapabilities = createEntity({
  change: webPowerChangeBackend,
  keepAwake: webPowerKeepAwakeBackend,
  status: webPowerStatusBackend,
  suspension: webPowerSuspensionBackend,
});

function detachWakeLockReleaseListeners(): void {
  for (const [sentinel, onRelease] of _wakeLockReleaseListeners) {
    sentinel.removeEventListener?.('release', onRelease);
  }
  _wakeLockReleaseListeners.clear();
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

function _getWebWakeLock(): WebWakeLock | null {
  if (typeof navigator === 'undefined') return null;
  return (navigator as Navigator & { wakeLock?: WebWakeLock }).wakeLock ?? null;
}

// A platform refusal names itself; anything else is treated as an operation failure rather than
// silently reclassified as a policy denial.
function _isDenial(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  return name === 'NotAllowedError' || name === 'SecurityError';
}

async function _releaseSentinel(): Promise<void> {
  const sentinel = _wakeLockSentinel;
  if (sentinel === null) return;
  _wakeLockSentinel = null;
  try {
    await sentinel.release?.();
  } catch {
    // Teardown attempts the release and does not resurrect state on failure.
  }
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
  removeEventListener?: (type: 'release', listener: () => void) => void;
  release?: () => Promise<void>;
}
