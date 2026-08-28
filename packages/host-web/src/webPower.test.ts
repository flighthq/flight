import { createPowerStatus, getPowerBackend, resetPowerBackendForTest } from '@flighthq/power/contract';

import { enableHostWebPower, resetHostWebPowerForTest } from './webPower';

describe('enableHostWebPower', () => {
  afterEach(() => resetHostWebPowerForTest());

  it('does not throw on first call', () => {
    expect(() => enableHostWebPower()).not.toThrow();
  });

  it('is idempotent', () => {
    enableHostWebPower();
    expect(() => enableHostWebPower()).not.toThrow();
  });
});

// ★ RE-ENABLE AFTER THE HOST SLOT IS CLEARED, asserted by OBJECT IDENTITY because `Power` has no
// `explain*Operation` seam to report a layer. Before the latch was derived, the second
// `enableHostWebPower()` returned without installing — the host-local `_enabled` still said "installed"
// while the slot was empty — and the capability served its sentinel for the life of the process.
//
// The slot is cleared here through the capability's own test seam rather than a destroy path, because
// `destroyPowerBackend` is deliberately not part of this slice.
describe('enableHostWebPower after the host slot is cleared', () => {
  afterEach(() => resetPowerBackendForTest());

  it('installs a fresh host backend instead of silently leaving the sentinel', () => {
    resetPowerBackendForTest();
    const sentinel = getPowerBackend();

    enableHostWebPower();
    const firstHost = getPowerBackend();
    expect(firstHost).not.toBe(sentinel);

    resetPowerBackendForTest();
    expect(getPowerBackend()).toBe(sentinel);

    enableHostWebPower();
    const secondHost = getPowerBackend();
    // Both halves matter: not the sentinel proves it installed at all, and not the first instance proves
    // it built a new backend rather than resurrecting a stale reference.
    expect(secondHost).not.toBe(sentinel);
    expect(secondHost).not.toBe(firstHost);
  });

  it('stays idempotent while the host slot is occupied', () => {
    resetPowerBackendForTest();
    enableHostWebPower();
    const installed = getPowerBackend();
    enableHostWebPower();
    expect(getPowerBackend()).toBe(installed);
  });
});

describe('resetHostWebPowerForTest', () => {
  it('allows re-enabling after reset', () => {
    enableHostWebPower();
    resetHostWebPowerForTest();
    expect(() => enableHostWebPower()).not.toThrow();
  });
});

// ★ BEHAVIORAL COMPLETENESS OF TEARDOWN. The structural lifecycle gate counts `PowerBackend` as wired
// because a hook is declared and its setter names it; it cannot see whether that hook releases what the
// backend owns. These are the assertions that carry that claim instead, and each one fails against the
// implementation as it stood before this slice.
describe('webPower destroy releases everything the backend owns', () => {
  afterEach(() => {
    resetPowerBackendForTest();
    Reflect.deleteProperty(navigator, 'wakeLock');
    Reflect.deleteProperty(navigator, 'getBattery');
  });

  function installBattery(readings: {
    charging: boolean;
    chargingTime: number;
    dischargingTime: number;
    level: number;
  }) {
    Object.defineProperty(navigator, 'getBattery', {
      configurable: true,
      value: () => Promise.resolve({ ...readings, addEventListener: () => {}, removeEventListener: () => {} }),
    });
  }

  // ★ STALE READINGS. The four cached values are module-scoped and outlive any single backend, so a
  // destroyed backend's last measurements were served by its successor as if freshly taken. `-1`/`false`
  // is what "not measured" means everywhere else in this file.
  it('does not serve battery readings captured by a destroyed backend', async () => {
    installBattery({ charging: true, chargingTime: 1200, dischargingTime: -1, level: 0.77 });
    resetPowerBackendForTest();
    enableHostWebPower();
    const backend = getPowerBackend();

    backend.subscribe(() => {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    const measured = backend.getStatus(createPowerStatus());
    expect(measured.batteryLevel).toBeCloseTo(0.77);
    expect(measured.isCharging).toBe(true);

    backend.destroy?.();

    const after = backend.getStatus(createPowerStatus());
    expect(after.batteryLevel).toBe(-1);
    expect(after.chargingTime).toBe(-1);
    expect(after.dischargingTime).toBe(-1);
    expect(after.isCharging).toBe(false);
  });

  // ★ LISTENER IDENTITY. `removeEventListener` matches on the same function reference that was added, so
  // an anonymous listener cannot be removed at all. This asserts the exact pair — same sentinel, same
  // handler object — not merely that some removal happened.
  it('detaches the release listener from the exact sentinel it was added to', async () => {
    const added: { sentinel: unknown; handler: () => void }[] = [];
    const removed: { sentinel: unknown; handler: () => void }[] = [];
    const sentinel = {
      addEventListener: (_type: 'release', handler: () => void) => added.push({ handler, sentinel }),
      release: () => Promise.resolve(),
      removeEventListener: (_type: 'release', handler: () => void) => removed.push({ handler, sentinel }),
    };
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: () => Promise.resolve(sentinel) },
    });

    resetPowerBackendForTest();
    enableHostWebPower();
    const backend = getPowerBackend();
    backend.setKeepAwake?.(true, 'PreventDisplaySleep');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(added).toHaveLength(1);

    backend.destroy?.();

    expect(removed).toHaveLength(1);
    expect(removed[0]!.sentinel).toBe(added[0]!.sentinel);
    expect(removed[0]!.handler).toBe(added[0]!.handler);
  });

  // ★ RETRY / IDEMPOTENCE. Teardown may be attempted again — invariant 1 is exactly once per ownership
  // loss. A second destroy must detach nothing further and must not throw.
  it('is idempotent: a second destroy detaches nothing more and does not throw', async () => {
    const removed: (() => void)[] = [];
    const sentinel = {
      addEventListener: () => {},
      release: () => Promise.resolve(),
      removeEventListener: (_type: 'release', handler: () => void) => removed.push(handler),
    };
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: () => Promise.resolve(sentinel) },
    });

    resetPowerBackendForTest();
    enableHostWebPower();
    const backend = getPowerBackend();
    backend.setKeepAwake?.(true, 'PreventDisplaySleep');
    await new Promise((resolve) => setTimeout(resolve, 0));

    backend.destroy?.();
    expect(removed).toHaveLength(1);

    expect(() => backend.destroy?.()).not.toThrow();
    expect(removed).toHaveLength(1);
  });
});

// ★ THE REJECTION AXIS. `destroy()` releases the wake lock through `sentinel.release()`, which returns a
// promise. Teardown is synchronous and cannot await it, so the ONLY thing standing between a rejected
// release and an unhandled rejection is the `.catch` attached at the call site. Nothing tested that: the
// whole host suite contained no rejecting-promise fixture on any host, so deleting that `.catch` was a
// silent change. This exercises the failing half of the branch that teardown can never observe.
describe('webPower teardown when the wake lock release rejects', () => {
  afterEach(() => {
    resetHostWebPowerForTest();
    resetPowerBackendForTest();
    Reflect.deleteProperty(navigator, 'wakeLock');
  });

  it('clears keep-awake state and raises no unhandled rejection', async () => {
    const sentinel = {
      addEventListener: () => {},
      release: () => Promise.reject(new Error('release refused by the platform')),
    };
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: () => Promise.resolve(sentinel) },
    });

    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => void unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      resetPowerBackendForTest();
      resetHostWebPowerForTest();
      enableHostWebPower();
      const backend = getPowerBackend();

      expect(backend.setKeepAwake?.(true, 'PreventDisplaySleep')).toBe(true);
      await Promise.resolve();
      await Promise.resolve();
      expect(backend.isKeepAwakeActive?.()).toBe(true);

      backend.destroy?.();
      // State is dropped synchronously, so a rejected release cannot leave keep-awake stuck on.
      expect(backend.isKeepAwakeActive?.()).toBe(false);

      // Let the rejected release settle; an unattached handler would surface here.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
