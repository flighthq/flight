import { explainLoopBackend, getLoopBackend, resetLoopBackendForTest } from '@flighthq/application/contract';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { enableHostWebLoop, resetHostWebLoopForTest } from './webLoop';

describe('enableHostWebLoop', () => {
  afterEach(() => {
    resetLoopBackendForTest();
    resetHostWebLoopForTest();
    vi.restoreAllMocks();
  });

  it('installs a host backend so get returns non-null', () => {
    enableHostWebLoop();
    const backend = getLoopBackend();
    expect(backend).not.toBeNull();
    expect(backend!.now()).toBeTypeOf('number');
    expect(explainLoopBackend().layer).toBe('host');
  });

  it('is idempotent — second call preserves provider identity', () => {
    enableHostWebLoop();
    const first = getLoopBackend();
    enableHostWebLoop();
    const second = getLoopBackend();
    expect(first).toBe(second);
  });

  it('starts unobserved — no viability claimed until a real call', () => {
    enableHostWebLoop();
    expect(explainLoopBackend()).toEqual({
      conflict: false,
      layer: 'host',
      operation: null,
      viability: 'unobserved',
    });
  });

  it('observes available after requestFrame call', () => {
    enableHostWebLoop();
    const backend = getLoopBackend()!;
    const handle = backend.requestFrame(() => {});
    expect(handle).toBeTypeOf('number');
    expect(explainLoopBackend()).toEqual({
      conflict: false,
      layer: 'host',
      operation: 'requestFrame',
      viability: 'available',
    });
  });

  it('every requestFrame re-observes — not one-shot', () => {
    enableHostWebLoop();
    const backend = getLoopBackend()!;
    backend.requestFrame(() => {});
    backend.requestFrame(() => {});
    expect(explainLoopBackend().operation).toBe('requestFrame');
    expect(explainLoopBackend().viability).toBe('available');
  });

  it('cancelFrame observes independently from requestFrame', () => {
    enableHostWebLoop();
    const backend = getLoopBackend()!;
    const handle = backend.requestFrame(() => {});
    expect(explainLoopBackend().operation).toBe('requestFrame');
    backend.cancelFrame(handle);
    expect(explainLoopBackend().operation).toBe('cancelFrame');
    expect(explainLoopBackend().viability).toBe('available');
  });

  it('loss then recovery — requestFrame failure reverts to available on success', () => {
    enableHostWebLoop();
    const backend = getLoopBackend()!;
    backend.requestFrame(() => {});
    expect(explainLoopBackend().viability).toBe('available');

    const raf = vi.fn().mockImplementation(() => {
      throw new Error('rAF unavailable');
    });
    vi.stubGlobal('requestAnimationFrame', raf);
    backend.requestFrame(() => {});
    expect(explainLoopBackend().viability).toBe('runtime-api-unavailable');
    expect(explainLoopBackend().operation).toBe('requestFrame');

    vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(99));
    backend.requestFrame(() => {});
    expect(explainLoopBackend().viability).toBe('available');
  });

  it('cancelFrame failure observes unavailable', () => {
    enableHostWebLoop();
    const backend = getLoopBackend()!;
    backend.requestFrame(() => {});

    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn().mockImplementation(() => {
        throw new Error('cAF unavailable');
      }),
    );
    backend.cancelFrame(1);
    expect(explainLoopBackend().operation).toBe('cancelFrame');
    expect(explainLoopBackend().viability).toBe('runtime-api-unavailable');
  });

  it('now returns a positive number', () => {
    enableHostWebLoop();
    const backend = getLoopBackend()!;
    expect(backend.now()).toBeGreaterThanOrEqual(0);
  });
});

describe('resetHostWebLoopForTest', () => {
  afterEach(resetLoopBackendForTest);

  it('clears the enabler flag so a subsequent enable re-installs', () => {
    enableHostWebLoop();
    resetHostWebLoopForTest();
    resetLoopBackendForTest();
    enableHostWebLoop();
    expect(explainLoopBackend().layer).toBe('host');
  });
});
