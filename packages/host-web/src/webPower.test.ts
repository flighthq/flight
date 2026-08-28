import { getPowerBackend, resetPowerBackendForTest } from '@flighthq/power/contract';

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
