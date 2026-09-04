import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { connectSignal, hasSignalSlots } from '@flighthq/signals/contract';
import type {
  ConnectivityChangeBackend,
  ConnectivityReachabilityBackend,
  ConnectivityStatus,
  ConnectivityStatusBackend,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  attachConnectivity,
  createConnectivity,
  detachConnectivity,
  detectConnectivityReachability,
  disposeConnectivity,
  destroyConnectivity,
  getConnectivityOnline,
  getConnectivityStatus,
  hasConnectivityStatusChanged,
  isConnectivityMetered,
  isConnectivitySaveDataEnabled,
} from './connectivity';

interface FakeConnectivityProvider extends ConnectivityStatusBackend, ConnectivityChangeBackend {
  readonly activeSubscriptions: () => number;
  readonly destroyCalls: () => number;
  fire(): void;
  readonly status: ConnectivityStatus;
  readonly unsubscribeCalls: () => number;
}

function fakeProvider(
  overrides: Partial<ConnectivityStatus> = {},
  subscriptionAvailable = true,
): FakeConnectivityProvider {
  const listeners = new Set<() => void>();
  const current = status({
    downlink: 10,
    downlinkMax: 100,
    effectiveType: '4g',
    online: true,
    rtt: 50,
    type: 'wifi',
    ...overrides,
  });
  let destroys = 0;
  let unsubscribes = 0;
  let destroyed = false;
  return Object.assign(
    (() => {
      const out = allocateEntity<any>();
      out.destroy = () => {
        if (destroyed) return;
        destroyed = true;
        destroys++;
        listeners.clear();
      };
      out.getStatus = (out: ConnectivityStatus) => {
        Object.assign(out, current);
        return out;
      };
      out.subscribe = (listener: () => void) => {
        if (!subscriptionAvailable || destroyed) return null;
        listeners.add(listener);
        let active = true;
        return () => {
          if (!active) return;
          active = false;
          unsubscribes++;
          listeners.delete(listener);
        };
      };
      return finishEntity(out);
    })(),
    {
      activeSubscriptions: () => listeners.size,
      destroyCalls: () => destroys,
      fire: () => {
        for (const listener of [...listeners]) listener();
      },
      status: current,
      unsubscribeCalls: () => unsubscribes,
    },
  );
}

function hostFor(provider: FakeConnectivityProvider) {
  return { connectivity: { change: provider, status: provider } };
}

function status(overrides: Partial<ConnectivityStatus> = {}): ConnectivityStatus {
  return {
    downlink: -1,
    downlinkMax: -1,
    effectiveType: '',
    metered: false,
    online: null,
    rtt: -1,
    saveData: false,
    type: 'unknown',
    ...overrides,
  };
}

describe('attachConnectivity', () => {
  it('returns true and emits core diffs from a raw provider change', () => {
    const provider = fakeProvider();
    const connectivity = createConnectivity();
    const changes: ConnectivityStatus[] = [];
    const types: string[] = [];
    const metered: boolean[] = [];
    let offline = 0;
    connectSignal(connectivity.onChange, (value) => changes.push(value as ConnectivityStatus));
    connectSignal(connectivity.onConnectionTypeChange, (value) => types.push(value));
    connectSignal(connectivity.onMeteredChange, (value) => metered.push(value));
    connectSignal(connectivity.onOffline, () => offline++);

    expect(attachConnectivity(hostFor(provider), connectivity)).toBe(true);
    Object.assign(provider.status, { metered: true, online: false, type: 'cellular' as const });
    provider.fire();

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ metered: true, online: false, type: 'cellular' });
    expect(types).toEqual(['cellular']);
    expect(metered).toEqual([true]);
    expect(offline).toBe(1);
  });

  it('treats unknown as unmeasured and emits offline only after a measured transition', () => {
    const provider = fakeProvider({ online: null });
    const connectivity = createConnectivity();
    let offline = 0;
    connectSignal(connectivity.onOffline, () => offline++);
    attachConnectivity(hostFor(provider), connectivity);
    provider.fire();
    expect(offline).toBe(0);
    provider.status.online = false;
    provider.fire();
    expect(offline).toBe(1);
  });

  it('returns false instead of retaining a silent no-op subscription', () => {
    const provider = fakeProvider({}, false);
    expect(attachConnectivity(hostFor(provider), createConnectivity())).toBe(false);
    expect(provider.activeSubscriptions()).toBe(0);
  });

  it('detaches A before attaching B and never delivers from the old origin', () => {
    const a = fakeProvider();
    const b = fakeProvider();
    const connectivity = createConnectivity();
    let changes = 0;
    connectSignal(connectivity.onChange, () => changes++);
    attachConnectivity(hostFor(a), connectivity);
    attachConnectivity(hostFor(b), connectivity);
    expect(a.unsubscribeCalls()).toBe(1);
    expect(a.activeSubscriptions()).toBe(0);
    expect(b.activeSubscriptions()).toBe(1);
    a.fire();
    expect(changes).toBe(0);
    b.fire();
    expect(changes).toBe(1);
  });

  it('emits distinct status snapshots rather than mutating a retained prior payload', () => {
    const provider = fakeProvider();
    const connectivity = createConnectivity();
    const changes: Readonly<ConnectivityStatus>[] = [];
    connectSignal(connectivity.onChange, (value) => changes.push(value));
    attachConnectivity(hostFor(provider), connectivity);
    provider.fire();
    provider.status.type = 'cellular';
    provider.fire();
    expect(changes[0]).not.toBe(changes[1]);
    expect(changes[0]?.type).toBe('wifi');
    expect(changes[1]?.type).toBe('cellular');
  });
});

describe('createConnectivity', () => {
  it('returns an Entity carrying all five core-owned signals', () => {
    const connectivity = createConnectivity();
    expect(EntityRuntimeKey in connectivity).toBe(true);
    expect(Object.keys(connectivity).sort()).toEqual([
      'onChange',
      'onConnectionTypeChange',
      'onMeteredChange',
      'onOffline',
      'onOnline',
    ]);
  });
});

describe('destroyConnectivity', () => {
  it('uses the supplied change provider and provider teardown is terminal/idempotent', () => {
    const provider = fakeProvider();
    const host = hostFor(provider);
    destroyConnectivity(host);
    destroyConnectivity(host);
    expect(provider.destroyCalls()).toBe(1);
    expect(provider.subscribe(() => {})).toBeNull();
  });
});

describe('detachConnectivity', () => {
  it('consumes the exact unsubscribe once', () => {
    const provider = fakeProvider();
    const connectivity = createConnectivity();
    attachConnectivity(hostFor(provider), connectivity);
    detachConnectivity(connectivity);
    detachConnectivity(connectivity);
    expect(provider.unsubscribeCalls()).toBe(1);
  });
});

describe('detectConnectivityReachability', () => {
  it('dispatches reachability only to the supplied reachability slot', async () => {
    let calls = 0;
    const reachability = allocateEntity<ConnectivityReachabilityBackend>();
    reachability.detectReachability = async (_options, out) => {
      calls++;
      out.latency = 7;
      out.reachable = true;
      return out;
    };
    const out = { latency: -1, reachable: false };
    const result = await detectConnectivityReachability(
      { connectivity: { reachability } },
      { url: 'https://example.invalid' },
      out,
    );
    expect(result).toBe(out);
    expect(result).toEqual({ latency: 7, reachable: true });
    expect(calls).toBe(1);
  });
});

describe('disposeConnectivity', () => {
  it('unsubscribes once and clears listeners from every signal', () => {
    const provider = fakeProvider();
    const connectivity = createConnectivity();
    attachConnectivity(hostFor(provider), connectivity);
    connectSignal(connectivity.onChange, () => {});
    connectSignal(connectivity.onConnectionTypeChange, () => {});
    connectSignal(connectivity.onMeteredChange, () => {});
    connectSignal(connectivity.onOffline, () => {});
    connectSignal(connectivity.onOnline, () => {});
    disposeConnectivity(connectivity);
    disposeConnectivity(connectivity);
    expect(provider.unsubscribeCalls()).toBe(1);
    expect([
      hasSignalSlots(connectivity.onChange),
      hasSignalSlots(connectivity.onConnectionTypeChange),
      hasSignalSlots(connectivity.onMeteredChange),
      hasSignalSlots(connectivity.onOffline),
      hasSignalSlots(connectivity.onOnline),
    ]).toEqual([false, false, false, false, false]);
  });
});

describe('getConnectivityOnline', () => {
  it('preserves unknown and measured online states', () => {
    expect(getConnectivityOnline(hostFor(fakeProvider({ online: null })))).toBeNull();
    expect(getConnectivityOnline(hostFor(fakeProvider({ online: true })))).toBe(true);
  });
});

describe('getConnectivityStatus', () => {
  it('reads status and level conveniences only from the supplied host', () => {
    const provider = fakeProvider({ metered: true, online: false, saveData: true });
    const host = hostFor(provider);
    const out = status();
    expect(getConnectivityStatus(host, out)).toBe(out);
    expect(out.type).toBe('wifi');
  });
});

describe('hasConnectivityStatusChanged', () => {
  it('returns false for equal or aliased snapshots', () => {
    const a = status();
    expect(hasConnectivityStatusChanged(a, { ...a })).toBe(false);
    expect(hasConnectivityStatusChanged(a, a)).toBe(false);
  });

  it('detects every status axis', () => {
    const base = status();
    const variants: ConnectivityStatus[] = [
      status({ online: true }),
      status({ type: 'wifi' }),
      status({ downlink: 1 }),
      status({ downlinkMax: 1 }),
      status({ effectiveType: '4g' }),
      status({ rtt: 1 }),
      status({ saveData: true }),
      status({ metered: true }),
    ];
    expect(variants.map((variant) => hasConnectivityStatusChanged(base, variant))).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
  });
});

describe('isConnectivityMetered', () => {
  it('reads the metered level from the supplied status witness', () => {
    expect(isConnectivityMetered(hostFor(fakeProvider({ metered: true })))).toBe(true);
  });
});

describe('isConnectivitySaveDataEnabled', () => {
  it('reads the save-data level from the supplied status witness', () => {
    expect(isConnectivitySaveDataEnabled(hostFor(fakeProvider({ saveData: true })))).toBe(true);
  });
});
