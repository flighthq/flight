import type { AppLifecycleState, HostLifecycleProvider } from '@flighthq/types/contract';

import { getAppLaunchKind, getAppLifecycleState, isAppActive, isAppBackground, isAppInactive } from './lifecycle';

function hostWith(backend: Partial<HostLifecycleProvider>): {
  readonly system: { readonly lifecycle: HostLifecycleProvider };
} {
  return { system: { lifecycle: backend as HostLifecycleProvider } } as {
    readonly system: { readonly lifecycle: HostLifecycleProvider };
  };
}

function stateHost(state: AppLifecycleState): { readonly system: { readonly lifecycle: HostLifecycleProvider } } {
  return hostWith({ getState: () => state, subscribe: () => () => {} });
}

describe('getAppLaunchKind', () => {
  it('reads the launch kind from the host it is given', () => {
    expect(getAppLaunchKind(hostWith({ getState: () => 'active', getLaunchKind: () => 'warm' }).system.lifecycle)).toBe(
      'warm',
    );
  });

  // getLaunchKind is optional on the backend; a provider without it must not throw.
  it('falls back to warm when the provider does not implement it', () => {
    expect(getAppLaunchKind(stateHost('active').system.lifecycle)).toBe('warm');
  });
});

describe('getAppLifecycleState', () => {
  it('reads the state from the host it is given', () => {
    expect(getAppLifecycleState(stateHost('background').system.lifecycle)).toBe('background');
  });

  // Two hosts, two answers, no ambient selection in between. This is the property the migration is
  // for: before it, both calls resolved one process-wide backend and the second host was unreachable.
  it('keeps two hosts independent', () => {
    expect(getAppLifecycleState(stateHost('active').system.lifecycle)).toBe('active');
    expect(getAppLifecycleState(stateHost('inactive').system.lifecycle)).toBe('inactive');
  });
});

describe('isAppActive', () => {
  it('reports active only for the active state', () => {
    expect(isAppActive(stateHost('active').system.lifecycle)).toBe(true);
    expect(isAppActive(stateHost('inactive').system.lifecycle)).toBe(false);
    expect(isAppActive(stateHost('background').system.lifecycle)).toBe(false);
  });
});

describe('isAppBackground', () => {
  it('reports background only for the background state', () => {
    expect(isAppBackground(stateHost('background').system.lifecycle)).toBe(true);
    expect(isAppBackground(stateHost('active').system.lifecycle)).toBe(false);
  });
});

describe('isAppInactive', () => {
  it('reports inactive only for the inactive state', () => {
    expect(isAppInactive(stateHost('inactive').system.lifecycle)).toBe(true);
    expect(isAppInactive(stateHost('active').system.lifecycle)).toBe(false);
  });
});
