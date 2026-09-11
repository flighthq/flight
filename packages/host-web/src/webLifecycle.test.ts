import type { AppLifecycleState } from '@flighthq/types/contract';

import { webHostLifecycle } from './webLifecycle';

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
