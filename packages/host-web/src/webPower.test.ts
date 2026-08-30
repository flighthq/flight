import {
  webPowerChangeBackend,
  webPowerKeepAwakeBackend,
  webPowerStatusBackend,
  webPowerSuspensionBackend,
} from './webPower';

interface FakeSentinel {
  addEventListener?: (type: 'release', listener: () => void) => void;
  removeEventListener?: (type: 'release', listener: () => void) => void;
  release?: () => Promise<void>;
}

function setNavigator(wakeLock: unknown): void {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: wakeLock === undefined ? {} : { wakeLock },
  });
}

function sentinel(overrides: Partial<FakeSentinel> = {}): FakeSentinel {
  return { addEventListener: () => {}, removeEventListener: () => {}, release: async () => {}, ...overrides };
}

afterEach(async () => {
  setNavigator({ request: async () => sentinel() });
  await webPowerKeepAwakeBackend.release();
  setNavigator(undefined);
});

describe('webPowerChangeBackend', () => {
  it('returns an inert unsubscribe when the Battery API is absent, without pretending to observe', () => {
    setNavigator(undefined);
    expect(() => webPowerChangeBackend.subscribe(() => {})()).not.toThrow();
  });
});

describe('webPowerKeepAwakeBackend', () => {
  it('reports unavailable when the Wake Lock API is absent', async () => {
    setNavigator(undefined);
    await expect(webPowerKeepAwakeBackend.acquire('PreventDisplaySleep')).resolves.toEqual({ reason: 'unavailable' });
  });

  it('reports unavailable for a mode the web cannot honour', async () => {
    setNavigator({ request: async () => sentinel() });
    await expect(webPowerKeepAwakeBackend.acquire('PreventAppSuspension')).resolves.toEqual({ reason: 'unavailable' });
  });

  it('reports ok and becomes active only after the request resolves', async () => {
    setNavigator({ request: async () => sentinel() });
    await expect(webPowerKeepAwakeBackend.acquire('PreventDisplaySleep')).resolves.toEqual({ reason: 'ok' });
    expect(webPowerKeepAwakeBackend.isActive()).toBe(true);
  });

  // ★ RED-BEFORE SPECIMEN. The previous backend fired request() fire-and-forget, swallowed the
  // rejection with .catch(() => {}) and returned `true` synchronously — so a denied lock was reported
  // as success while isKeepAwakeActive() said false. Both halves are asserted here.
  it('reports a platform refusal as denied and does not become active', async () => {
    setNavigator({
      request: async () => {
        throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
      },
    });
    await expect(webPowerKeepAwakeBackend.acquire('PreventDisplaySleep')).resolves.toEqual({ reason: 'denied' });
    expect(webPowerKeepAwakeBackend.isActive()).toBe(false);
  });

  it('separates an operation failure from a policy denial', async () => {
    setNavigator({
      request: async () => {
        throw new Error('boom');
      },
    });
    await expect(webPowerKeepAwakeBackend.acquire('PreventDisplaySleep')).resolves.toEqual({ reason: 'failed' });
  });

  // ★ RED-BEFORE SPECIMEN, the inverse lie: an OS-initiated release used to leave the released sentinel
  // reported as active because the failed re-acquire was swallowed.
  it('clears state immediately when the OS releases the lock', async () => {
    let onRelease: (() => void) | null = null;
    setNavigator({ request: async () => sentinel({ addEventListener: (_t, l) => (onRelease = l) }) });
    await webPowerKeepAwakeBackend.acquire('PreventDisplaySleep');
    expect(webPowerKeepAwakeBackend.isActive()).toBe(true);
    onRelease!();
    expect(webPowerKeepAwakeBackend.isActive()).toBe(false);
  });

  it('reports inactive rather than ok when nothing is held', async () => {
    setNavigator({ request: async () => sentinel() });
    await expect(webPowerKeepAwakeBackend.release()).resolves.toEqual({ reason: 'inactive' });
  });

  // ★ Never publish released state before the awaited release succeeds.
  it('reports a failed release and keeps reporting the lock as held', async () => {
    setNavigator({
      request: async () =>
        sentinel({
          release: async () => {
            throw new Error('release failed');
          },
        }),
    });
    await webPowerKeepAwakeBackend.acquire('PreventDisplaySleep');
    await expect(webPowerKeepAwakeBackend.release()).resolves.toEqual({ reason: 'failed' });
    expect(webPowerKeepAwakeBackend.isActive()).toBe(true);
  });

  it('reports ok and becomes inactive after a successful release', async () => {
    setNavigator({ request: async () => sentinel() });
    await webPowerKeepAwakeBackend.acquire('PreventDisplaySleep');
    await expect(webPowerKeepAwakeBackend.release()).resolves.toEqual({ reason: 'ok' });
    expect(webPowerKeepAwakeBackend.isActive()).toBe(false);
  });
});

describe('webPowerStatusBackend', () => {
  it('reports the domain unknown encoding before any battery reading arrives', () => {
    const out = webPowerStatusBackend.getStatus({
      batteryLevel: 0,
      chargingTime: 0,
      dischargingTime: 0,
      isBatteryLow: true,
      isCharging: true,
      isLowPower: true,
      isOnBattery: true,
      thermalState: 'Critical',
    });
    expect(out.batteryLevel).toBe(-1);
    // Web cannot read thermal pressure at all, which is why it exposes no thermal slot.
    expect(out.thermalState).toBe('Unknown');
  });
});

describe('webPowerSuspensionBackend', () => {
  it('registers the Page Lifecycle pair and removes both on unsubscribe', () => {
    const names: string[] = [];
    const removed: string[] = [];
    const doc = {
      addEventListener: (n: string) => names.push(n),
      removeEventListener: (n: string) => removed.push(n),
    };
    Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
    const stopSuspend = webPowerSuspensionBackend.subscribeSuspend(() => {});
    const stopResume = webPowerSuspensionBackend.subscribeResume(() => {});
    expect(names).toEqual(['freeze', 'resume']);
    stopSuspend();
    stopResume();
    expect(removed).toEqual(['freeze', 'resume']);
  });
});
