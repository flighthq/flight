import type { AppLifecycleState, HasSystemLifecycle, LifecycleBackend } from '@flighthq/types/contract';

import { getAppLaunchKind, getAppLifecycleState, isAppActive, isAppBackground, isAppInactive } from './lifecycle';

function hostWith(backend: Partial<LifecycleBackend>): HasSystemLifecycle {
  return { system: { lifecycle: backend as LifecycleBackend } } as HasSystemLifecycle;
}

function stateHost(state: AppLifecycleState): HasSystemLifecycle {
  return hostWith({ getState: () => state, subscribe: () => () => {} });
}

describe('getAppLaunchKind', () => {
  it('reads the launch kind from the host it is given', () => {
    expect(getAppLaunchKind(hostWith({ getState: () => 'active', getLaunchKind: () => 'warm' }))).toBe('warm');
  });

  // getLaunchKind is optional on the backend; a provider without it must not throw.
  it('falls back to warm when the provider does not implement it', () => {
    expect(getAppLaunchKind(stateHost('active'))).toBe('warm');
  });
});

describe('getAppLifecycleState', () => {
  it('reads the state from the host it is given', () => {
    expect(getAppLifecycleState(stateHost('background'))).toBe('background');
  });

  // Two hosts, two answers, no ambient selection in between. This is the property the migration is
  // for: before it, both calls resolved one process-wide backend and the second host was unreachable.
  it('keeps two hosts independent', () => {
    expect(getAppLifecycleState(stateHost('active'))).toBe('active');
    expect(getAppLifecycleState(stateHost('inactive'))).toBe('inactive');
  });
});

describe('isAppActive', () => {
  it('reports active only for the active state', () => {
    expect(isAppActive(stateHost('active'))).toBe(true);
    expect(isAppActive(stateHost('inactive'))).toBe(false);
    expect(isAppActive(stateHost('background'))).toBe(false);
  });
});

describe('isAppBackground', () => {
  it('reports background only for the background state', () => {
    expect(isAppBackground(stateHost('background'))).toBe(true);
    expect(isAppBackground(stateHost('active'))).toBe(false);
  });
});

describe('isAppInactive', () => {
  it('reports inactive only for the inactive state', () => {
    expect(isAppInactive(stateHost('inactive'))).toBe(true);
    expect(isAppInactive(stateHost('active'))).toBe(false);
  });
});
