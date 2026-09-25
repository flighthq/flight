import type { AppLifecycleState, AppMemoryPressure } from '@flighthq/types/contract';

import { webHostLifecycle } from './webLifecycle.ts';

describe('webHostLifecycle', () => {
  it("getLaunchKind returns 'cold' when no performance navigation entries", () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);
    expect(webHostLifecycle.getLaunchKind?.()).toBe('cold');
    vi.restoreAllMocks();
  });

  it("getLaunchKind returns 'warm' for back_forward navigation type", () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
      { type: 'back_forward' } as PerformanceNavigationTiming,
    ]);
    expect(webHostLifecycle.getLaunchKind?.()).toBe('warm');
    vi.restoreAllMocks();
  });

  it("getLaunchKind returns 'cold' for reload navigation type", () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ type: 'reload' } as PerformanceNavigationTiming]);
    expect(webHostLifecycle.getLaunchKind?.()).toBe('cold');
    vi.restoreAllMocks();
  });

  it("getLaunchKind returns 'cold' for navigate navigation type", () => {
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ type: 'navigate' } as PerformanceNavigationTiming]);
    expect(webHostLifecycle.getLaunchKind?.()).toBe('cold');
    vi.restoreAllMocks();
  });

  it('reads a state without throwing', () => {
    expect(typeof webHostLifecycle.getState()).toBe('string');
  });

  it('subscribeMemoryWarning fires critical when memory-pressure event fires', () => {
    const levels: AppMemoryPressure[] = [];
    const unsubscribe = webHostLifecycle.subscribeMemoryWarning?.((level: AppMemoryPressure) => levels.push(level));
    const event = new CustomEvent('memory-pressure', { detail: { pressure: 'critical' } });
    window.dispatchEvent(event);
    expect(levels).toEqual(['critical']);
    unsubscribe?.();
  });

  it('subscribeMemoryWarning fires moderate when memory-pressure event fires with moderate pressure', () => {
    const levels: AppMemoryPressure[] = [];
    const unsubscribe = webHostLifecycle.subscribeMemoryWarning?.((level: AppMemoryPressure) => levels.push(level));
    const event = new CustomEvent('memory-pressure', { detail: { pressure: 'moderate' } });
    window.dispatchEvent(event);
    expect(levels).toEqual(['moderate']);
    unsubscribe?.();
  });

  it('subscribeMemoryWarning fires normal when memory-pressure-relieved event fires', () => {
    const levels: AppMemoryPressure[] = [];
    const unsubscribe = webHostLifecycle.subscribeMemoryWarning?.((level: AppMemoryPressure) => levels.push(level));
    const event = new CustomEvent('memory-pressure-relieved');
    window.dispatchEvent(event);
    expect(levels).toEqual(['normal']);
    unsubscribe?.();
  });

  it('subscribeMemoryWarning stops delivering after unsubscribe', () => {
    const levels: AppMemoryPressure[] = [];
    const unsubscribe = webHostLifecycle.subscribeMemoryWarning?.((level: AppMemoryPressure) => levels.push(level));
    unsubscribe?.();
    const event = new CustomEvent('memory-pressure', { detail: { pressure: 'critical' } });
    window.dispatchEvent(event);
    expect(levels).toHaveLength(0);
  });

  it('subscribes and unsubscribes without throwing', () => {
    const unsubscribe = webHostLifecycle.subscribe(() => {});
    expect(() => unsubscribe()).not.toThrow();
  });

  it('is a stable provider value rather than an installed singleton', async () => {
    const again = (await import('./webLifecycle.ts')).webHostLifecycle;
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
