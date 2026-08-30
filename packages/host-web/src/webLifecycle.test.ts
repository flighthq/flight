import type { AppLifecycleState } from '@flighthq/types/contract';

import { webLifecycleBackend } from './webLifecycle';

describe('webLifecycleBackend', () => {
  it('is a stable provider value rather than an installed singleton', async () => {
    const again = (await import('./webLifecycle')).webLifecycleBackend;
    expect(again).toBe(webLifecycleBackend);
  });

  it('answers a lifecycle state and a launch kind', () => {
    const state: AppLifecycleState = webLifecycleBackend.getState();
    expect(['active', 'inactive', 'background']).toContain(state);
    expect(['cold', 'warm']).toContain(webLifecycleBackend.getLaunchKind?.() ?? 'warm');
  });

  it('returns a working unsubscribe from subscribe', () => {
    const unsubscribe = webLifecycleBackend.subscribe(() => {});
    expect(typeof unsubscribe).toBe('function');
    expect(() => unsubscribe()).not.toThrow();
  });
});
