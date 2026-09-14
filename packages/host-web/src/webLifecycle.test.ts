import type { AppLifecycleState, AppMemoryPressure } from '@flighthq/types/contract';

import { createWebLifecycleBackend, initializeWebLifecycleBackend, webHostLifecycle } from './webLifecycle';

describe('createWebLifecycleBackend', () => {
  it("getLaunchKind returns 'cold' when no performance navigation entries", () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);
    const backend = createWebLifecycleBackend();
    expect(backend.getLaunchKind?.()).toBe('cold');
    vi.restoreAllMocks();
  });

  it("getLaunchKind returns 'warm' for back_forward navigation type", () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
      { type: 'back_forward' } as PerformanceNavigationTiming,
    ]);
    const backend = createWebLifecycleBackend();
    expect(backend.getLaunchKind?.()).toBe('warm');
    vi.restoreAllMocks();
  });

  it("getLaunchKind returns 'cold' for reload navigation type", () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ type: 'reload' } as PerformanceNavigationTiming]);
    const backend = createWebLifecycleBackend();
    expect(backend.getLaunchKind?.()).toBe('cold');
    vi.restoreAllMocks();
  });

  it("getLaunchKind returns 'cold' for navigate navigation type", () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ type: 'navigate' } as PerformanceNavigationTiming]);
    const backend = createWebLifecycleBackend();
    expect(backend.getLaunchKind?.()).toBe('cold');
    vi.restoreAllMocks();
  });

  it('reads a state without throwing', () => {
    expect(typeof createWebLifecycleBackend().getState()).toBe('string');
  });

  it('subscribeMemoryWarning fires critical when memory-pressure event fires', () => {
    const backend = createWebLifecycleBackend();
    const levels: AppMemoryPressure[] = [];
    const unsubscribe = backend.subscribeMemoryWarning?.((level) => levels.push(level));
    const event = new CustomEvent('memory-pressure', { detail: { pressure: 'critical' } });
    window.dispatchEvent(event);
    expect(levels).toEqual(['critical']);
    unsubscribe?.();
  });

  it('subscribeMemoryWarning fires moderate when memory-pressure event fires with moderate pressure', () => {
    const backend = createWebLifecycleBackend();
    const levels: AppMemoryPressure[] = [];
    const unsubscribe = backend.subscribeMemoryWarning?.((level) => levels.push(level));
    const event = new CustomEvent('memory-pressure', { detail: { pressure: 'moderate' } });
    window.dispatchEvent(event);
    expect(levels).toEqual(['moderate']);
    unsubscribe?.();
  });

  it('subscribeMemoryWarning fires normal when memory-pressure-relieved event fires', () => {
    const backend = createWebLifecycleBackend();
    const levels: AppMemoryPressure[] = [];
    const unsubscribe = backend.subscribeMemoryWarning?.((level) => levels.push(level));
    const event = new CustomEvent('memory-pressure-relieved');
    window.dispatchEvent(event);
    expect(levels).toEqual(['normal']);
    unsubscribe?.();
  });

  it('subscribeMemoryWarning stops delivering after unsubscribe', () => {
    const backend = createWebLifecycleBackend();
    const levels: AppMemoryPressure[] = [];
    const unsubscribe = backend.subscribeMemoryWarning?.((level) => levels.push(level));
    unsubscribe?.();
    const event = new CustomEvent('memory-pressure', { detail: { pressure: 'critical' } });
    window.dispatchEvent(event);
    expect(levels).toHaveLength(0);
  });

  it('subscribes and unsubscribes without throwing', () => {
    const unsubscribe = createWebLifecycleBackend().subscribe(() => {});
    expect(() => unsubscribe()).not.toThrow();
  });
});

describe('initializeWebLifecycleBackend', () => {
  it('is the construction initializer of createWebLifecycleBackend', () => {
    expect(typeof initializeWebLifecycleBackend).toBe('function');
  });
});

describe('webHostLifecycle', () => {
  it('is a stable provider value rather than an installed singleton', async () => {
    const again = (await import('./webLifecycle')).webHostLifecycle;
    expect(again).toBe(webHostLifecycle);
  });

  it('answers a lifecycle state and a launch kind', () => {
    const state: AppLifecycleState = webHostLifecycle.getState();
    expect(['active', 'inactive', 'background']).toContain(state);
    expect(['cold', 'warm']).toContain(webHostLifecycle.getLaunchKind?.() ?? 'warm');
  });

  it('returns a working unsubscribe from subscribe', () => {
    const unsubscribe = webHostLifecycle.subscribe(() => {});
    expect(typeof unsubscribe).toBe('function');
    expect(() => unsubscribe()).not.toThrow();
  });
});
