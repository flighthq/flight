import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityWithoutRuntime,
  PowerChangeBackend,
  PowerKeepAwakeAcquireResult,
  PowerKeepAwakeBackend,
  PowerKeepAwakeMode,
  PowerKeepAwakeReleaseResult,
  PowerStatus,
  PowerStatusBackend,
  PowerSuspensionBackend,
  WebPowerCapabilities,
  WebPowerReadingCapabilities,
} from '@flighthq/types/contract';

// The web power providers. Web offers status, change, keepAwake and suspension. It omits idle,
// sessionLock, batteryHealth and thermal because it cannot observe them: an omitted slot is the honest
// report, where the previous backend's constant 'Unknown'/-1 answers and inert `() => {}` subscriptions
// were indistinguishable from a real implementation.
//
// Only keepAwake declares `destroy`. It is the one provider here that acquires a WHOLE-PROVIDER
// resource — an OS wake lock plus the release listener attached to its sentinel — which outlives any
// single call. change/status own only cached readings, held in their own closure below so dropping the
// provider releases them; a `destroy` there would be a teardown obligation with nothing behind it.

// Keep-awake over the Wake Lock API. Both operations AWAIT the platform, so the reported outcome is the
// real one: the previous backend called request() fire-and-forget, swallowed the rejection and returned
// `true` synchronously, so a denied lock read as success and a lost lock still read as active.
  export const webPowerKeepAwakeBackend = (() => {
    const out = allocateEntity<PowerKeepAwakeBackend>();
    out.acquire = async (mode: PowerKeepAwakeMode): Promise<PowerKeepAwakeAcquireResult> => {
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
  };
    out.destroy = (): void => {
    void _releaseSentinel();
    for (const [sentinel, onRelease] of _wakeLockReleaseListeners) {
      sentinel.removeEventListener?.('release', onRelease);
    }
    _wakeLockReleaseListeners.clear();
  };
    out.isActive = (): boolean => {
    return _wakeLockSentinel !== null;
  };
    out.release = async (): Promise<PowerKeepAwakeReleaseResult> => {
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
    const onRelease = _wakeLockReleaseListeners.get(sentinel);
    if (onRelease !== undefined) sentinel.removeEventListener?.('release', onRelease);
    _wakeLockReleaseListeners.delete(sentinel);
    return { reason: 'ok' };
  };
    return finishEntity(out);
  })();

// Suspend/resume over the Page Lifecycle API. freeze/resume are the spec'd pair and both really fire.
  export const webPowerSuspensionBackend = (() => {
    const out = allocateEntity<PowerSuspensionBackend>();
    out.subscribeResume = (listener: () => void): () => void => {
    if (typeof document === 'undefined') return () => {};
    document.addEventListener('resume', listener);
    return () => document.removeEventListener('resume', listener);
  };
    out.subscribeSuspend = (listener: () => void): () => void => {
    if (typeof document === 'undefined') return () => {};
    document.addEventListener('freeze', listener);
    return () => document.removeEventListener('freeze', listener);
  };
    return finishEntity(out);
  })();

// change and status SHARE one closure-owned battery cache. The readings used to be module-scoped with a
// `destroy` to reset them — but cached readings are not an externally freeable resource, they are just
// state, and state belongs to the provider that owns it. Held in this closure, dropping the provider
// releases them naturally and neither slot carries a teardown obligation.
export function createWebPowerReadings(): WebPowerReadingCapabilities {
  let cachedCharging = false;
  let cachedChargingTime = -1;
  let cachedDischargingTime = -1;
  let cachedLevel = -1;

    const out = allocateEntity<WebPowerReadingCapabilities>();
  const changeEntity = allocateEntity<PowerChangeBackend>();
  changeEntity.subscribe = (listener: () => void) => {
    const battery = _getWebBatteryManagerPromise();
    if (battery === null) return () => {};
    let manager: WebBatteryManager | null = null;
    const onLevelChange = (): void => {
      if (manager !== null) cachedLevel = manager.level;
      listener();
    };
    const onChargingChange = (): void => {
      if (manager !== null) cachedCharging = manager.charging;
      listener();
    };
    const onChargingTimeChange = (): void => {
      if (manager !== null) {
        const t = manager.chargingTime;
        cachedChargingTime = t === Infinity ? -1 : t;
      }
      listener();
    };
    const onDischargingTimeChange = (): void => {
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
    // The per-subscription cleanup owns everything this call acquired — which is why the slot needs
    // no provider-level destroy.
    return () => {
      cancelled = true;
      manager?.removeEventListener?.('levelchange', onLevelChange);
      manager?.removeEventListener?.('chargingchange', onChargingChange);
      manager?.removeEventListener?.('chargingtimechange', onChargingTimeChange);
      manager?.removeEventListener?.('dischargingtimechange', onDischargingTimeChange);
      manager = null;
    };
  };
  out.change = finishEntity(changeEntity);
  const statusEntity = allocateEntity<PowerStatusBackend>();
  statusEntity.getStatus = (statusOut: PowerStatus): PowerStatus => {
    statusOut.batteryLevel = cachedLevel;
    statusOut.chargingTime = cachedChargingTime;
    statusOut.dischargingTime = cachedDischargingTime;
    statusOut.isBatteryLow = cachedLevel >= 0 && cachedLevel <= 0.2 && !cachedCharging;
    statusOut.isCharging = cachedCharging;
    statusOut.isLowPower = false;
    statusOut.isOnBattery = cachedLevel >= 0 && !cachedCharging;
    // Web cannot read thermal pressure at all, which is why there is no web thermal slot. The field
    // stays at the domain's unknown encoding rather than implying a reading.
    statusOut.thermalState = 'Unknown';
    return statusOut;
  };
  out.status = finishEntity(statusEntity);
  return finishEntity(out);
}

// The web power capability group, for composing into a Host.
export const webPowerCapabilities: WebPowerCapabilities = (() => {
  const readings = createWebPowerReadings();
  const out = allocateEntity<WebPowerCapabilities>();
  out.change = readings.change;
  out.status = readings.status;
  out.keepAwake = webPowerKeepAwakeBackend;
  out.suspension = webPowerSuspensionBackend;
  return finishEntity(out);
})();

function _getWebBatteryManagerPromise(): Promise<WebBatteryManager> | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as WebBatteryNavigator;
  if (typeof nav.getBattery !== 'function') return null;
  try {
    return nav.getBattery();
  } catch {
    return null;
  }
}

function _getWebWakeLock(): WebWakeLock | null {
  if (typeof navigator === 'undefined') return null;
  return navigator.wakeLock ?? null;
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

interface WebBatteryNavigator extends Navigator {
  getBattery?: () => Promise<WebBatteryManager>;
}

interface WebWakeLock {
  request: (type: 'screen') => Promise<WebWakeLockSentinel>;
}

interface WebWakeLockSentinel {
  addEventListener?: (type: 'release', listener: () => void) => void;
  removeEventListener?: (type: 'release', listener: () => void) => void;
  release?: () => Promise<void>;
}
