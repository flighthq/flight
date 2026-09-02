import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  createWebPowerReadings,
  webPowerCapabilities,
  webPowerKeepAwakeBackend,
  webPowerSuspensionBackend,
} from './webPower';

interface FakeSentinel {
  addEventListener?: (type: 'release', listener: () => void) => void;
  removeEventListener?: (type: 'release', listener: () => void) => void;
  release?: () => Promise<void>;
}

const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

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
  vi.unstubAllGlobals();
  if (originalNavigatorDescriptor === undefined) {
    delete (globalThis as { navigator?: Navigator }).navigator;
  } else {
    Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor);
  }
});

describe('createWebPowerReadings', () => {
  it('returns an inert unsubscribe when the Battery API is absent, without pretending to observe', () => {
    setNavigator(undefined);
    expect(() => createWebPowerReadings().change.subscribe(() => {})()).not.toThrow();
  });

  // ★ The cache is closure-owned, so two provider pairs never share readings and dropping one releases
  // its state naturally — which is why neither slot declares a teardown obligation.
  it('gives each provider pair its own readings and no destroy obligation', () => {
    const first = createWebPowerReadings();
    const second = createWebPowerReadings();
    expect(EntityRuntimeKey in first).toBe(true);
    for (const provider of Object.values(first)) expect(EntityRuntimeKey in provider).toBe(true);
    expect(first.status).not.toBe(second.status);
    // Neither declares nor implements a teardown: the interfaces no longer carry `destroy` at all, so
    // this asserts the runtime shape the type now forbids naming.
    expect('destroy' in first.change).toBe(false);
    expect('destroy' in first.status).toBe(false);
  });
});

describe('createWebPowerReadings status', () => {
  it('reports the domain unknown encoding before any battery reading arrives', () => {
    const out = createWebPowerReadings().status.getStatus({
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

describe('webPowerCapabilities', () => {
  // ★ EXACT SLOT COVERAGE for W. The four absent slots are the point: web previously implemented all of
  // them with inert subscriptions and constant sentinels, which no structural probe could tell from a
  // real provider. Asserting the exact key set is what stops one being quietly re-added as a stub.
  it('offers exactly status, change, keepAwake and suspension', () => {
    expect(EntityRuntimeKey in webPowerCapabilities).toBe(true);
    for (const provider of Object.values(webPowerCapabilities)) expect(EntityRuntimeKey in provider).toBe(true);
    expect(
      Object.keys(webPowerCapabilities)
        .filter((k) => k !== 'constructor')
        .sort(),
    ).toEqual(['change', 'keepAwake', 'status', 'suspension']);
    expect('idle' in webPowerCapabilities).toBe(false);
    expect('sessionLock' in webPowerCapabilities).toBe(false);
    expect('batteryHealth' in webPowerCapabilities).toBe(false);
    expect('thermal' in webPowerCapabilities).toBe(false);
  });

  it('declares a teardown obligation on keepAwake alone', () => {
    expect(typeof webPowerCapabilities.keepAwake.destroy).toBe('function');
    expect('destroy' in webPowerCapabilities.suspension).toBe(false);
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

describe('webPowerSuspensionBackend', () => {
  it('registers the Page Lifecycle pair and removes both on unsubscribe', () => {
    const names: string[] = [];
    const removed: string[] = [];
    const doc = {
      addEventListener: (n: string) => names.push(n),
      removeEventListener: (n: string) => removed.push(n),
    };
    vi.stubGlobal('document', doc);
    const stopSuspend = webPowerSuspensionBackend.subscribeSuspend(() => {});
    const stopResume = webPowerSuspensionBackend.subscribeResume(() => {});
    expect(names).toEqual(['freeze', 'resume']);
    stopSuspend();
    stopResume();
    expect(removed).toEqual(['freeze', 'resume']);
  });
});
