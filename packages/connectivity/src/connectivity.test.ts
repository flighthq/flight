import { connectSignal } from '@flighthq/signals/contract';
import type { ConnectivityBackend, ConnectivityReachability, ConnectivityStatus } from '@flighthq/types/contract';

import {
  attachConnectivity,
  createConnectivity,
  createConnectivityStatus,
  createWebConnectivityBackend,
  detachConnectivity,
  detectConnectivityReachability,
  disposeConnectivity,
  getConnectivityBackend,
  getConnectivityStatus,
  hasConnectivityStatusChanged,
  isConnectivityMetered,
  isConnectivityOnline,
  isConnectivitySaveDataEnabled,
  setConnectivityBackend,
} from './connectivity';

function fakeBackend(
  overrides?: Partial<ConnectivityStatus>,
): ConnectivityBackend & { status: ConnectivityStatus; fire: () => void } {
  let listener: (() => void) | null = null;
  const status: ConnectivityStatus = {
    downlink: 10,
    downlinkMax: 100,
    effectiveType: '4g',
    metered: false,
    online: true,
    rtt: 50,
    saveData: false,
    type: 'wifi',
    ...overrides,
  };
  return {
    status,
    getStatus(out) {
      out.online = status.online;
      out.type = status.type;
      out.downlink = status.downlink;
      out.downlinkMax = status.downlinkMax;
      out.effectiveType = status.effectiveType;
      out.rtt = status.rtt;
      out.saveData = status.saveData;
      out.metered = status.metered;
      return out;
    },
    subscribe(l) {
      listener = l;
      return () => {
        listener = null;
      };
    },
    fire() {
      listener?.();
    },
  };
}

afterEach(() => setConnectivityBackend(null));

describe('attachConnectivity', () => {
  it('emits onChange and onOffline on transition to offline', () => {
    const backend = fakeBackend();
    setConnectivityBackend(backend);
    const net = createConnectivity();
    let changes = 0;
    let offline = 0;
    connectSignal(net.onChange, () => changes++);
    connectSignal(net.onOffline, () => offline++);
    attachConnectivity(net);
    backend.status.online = false;
    (backend as ReturnType<typeof fakeBackend>).fire();
    expect(changes).toBe(1);
    expect(offline).toBe(1);
  });

  it('emits onOnline on transition to online', () => {
    const backend = fakeBackend({ online: false });
    setConnectivityBackend(backend);
    const net = createConnectivity();
    let online = 0;
    connectSignal(net.onOnline, () => online++);
    attachConnectivity(net);
    backend.status.online = true;
    (backend as ReturnType<typeof fakeBackend>).fire();
    expect(online).toBe(1);
  });

  it('emits onConnectionTypeChange on type transition', () => {
    const backend = fakeBackend();
    setConnectivityBackend(backend);
    const net = createConnectivity();
    const types: string[] = [];
    connectSignal(net.onConnectionTypeChange, (t) => types.push(t));
    attachConnectivity(net);
    backend.status.type = 'cellular';
    (backend as ReturnType<typeof fakeBackend>).fire();
    expect(types).toEqual(['cellular']);
  });

  it('does not emit onConnectionTypeChange when type is unchanged', () => {
    const backend = fakeBackend();
    setConnectivityBackend(backend);
    const net = createConnectivity();
    let count = 0;
    connectSignal(net.onConnectionTypeChange, () => count++);
    attachConnectivity(net);
    // fire without changing type
    (backend as ReturnType<typeof fakeBackend>).fire();
    expect(count).toBe(0);
  });

  it('emits onMeteredChange on metered transition', () => {
    const backend = fakeBackend();
    setConnectivityBackend(backend);
    const net = createConnectivity();
    const metered: boolean[] = [];
    connectSignal(net.onMeteredChange, (m) => metered.push(m));
    attachConnectivity(net);
    backend.status.metered = true;
    (backend as ReturnType<typeof fakeBackend>).fire();
    expect(metered).toEqual([true]);
  });

  it('is idempotent — replaces prior subscription', () => {
    const backend = fakeBackend();
    setConnectivityBackend(backend);
    const net = createConnectivity();
    let changes = 0;
    connectSignal(net.onChange, () => changes++);
    attachConnectivity(net);
    attachConnectivity(net);
    (backend as ReturnType<typeof fakeBackend>).fire();
    expect(changes).toBe(1);
  });
});

describe('createConnectivity', () => {
  it('creates an entity with five signals', () => {
    const net = createConnectivity();
    expect(net.onChange).toBeDefined();
    expect(net.onConnectionTypeChange).toBeDefined();
    expect(net.onMeteredChange).toBeDefined();
    expect(net.onOnline).toBeDefined();
    expect(net.onOffline).toBeDefined();
  });
});

describe('createConnectivityStatus', () => {
  it('allocates a zeroed status with all fields at sentinel values', () => {
    expect(createConnectivityStatus()).toEqual({
      downlink: -1,
      downlinkMax: -1,
      effectiveType: '',
      metered: false,
      online: false,
      rtt: -1,
      saveData: false,
      type: 'unknown',
    });
  });
});

describe('createWebConnectivityBackend', () => {
  it('reads a status without throwing', () => {
    const out = createConnectivityStatus();
    const result = createWebConnectivityBackend().getStatus(out);
    expect(typeof result.online).toBe('boolean');
    expect(typeof result.metered).toBe('boolean');
    expect(typeof result.saveData).toBe('boolean');
  });

  it('returns sentinel rtt and downlinkMax when connection is absent', () => {
    const out = createConnectivityStatus();
    createWebConnectivityBackend().getStatus(out);
    // In jsdom, navigator.connection is absent so rtt/downlinkMax default to -1
    expect(out.rtt).toBe(-1);
    expect(out.downlinkMax).toBe(-1);
  });
});

describe('detachConnectivity', () => {
  it('stops further delivery', () => {
    const backend = fakeBackend();
    setConnectivityBackend(backend);
    const net = createConnectivity();
    let changes = 0;
    connectSignal(net.onChange, () => changes++);
    attachConnectivity(net);
    detachConnectivity(net);
    (backend as ReturnType<typeof fakeBackend>).fire();
    expect(changes).toBe(0);
  });

  it('is safe to call when not attached', () => {
    const net = createConnectivity();
    expect(() => detachConnectivity(net)).not.toThrow();
  });
});

describe('detectConnectivityReachability', () => {
  // A backend without detectReachability falls through to the web backend's own implementation, which
  // calls fetch against options.url. BOTH CASES BELOW STUB fetch, because leaving it alone made this a
  // real request to the public internet from a unit test: 4.1s measured here against a 5000ms default
  // timeout, which full-suite load pushes it over. Egress is not what makes that a hazard — a sandboxed
  // runner with no outbound network fails it every time rather than intermittently, so the current
  // flakiness is a property of this machine's network rather than of the test. `unstubGlobals` restores
  // the real fetch between tests.
  //
  // The assertion is the sentinel itself — reachable false AND latency -1 — rather than the shape of
  // the value. A `typeof result.reachable === 'boolean'` check passes on a live success too, so it held
  // for a test whose name promises a sentinel while checking nothing that distinguishes one.
  it('returns a sentinel when fetch is unavailable (SSR/jsdom guard)', async () => {
    setConnectivityBackend(fakeBackend());
    vi.stubGlobal('fetch', undefined);
    const out: ConnectivityReachability = { latency: 0, reachable: true };
    const result = await detectConnectivityReachability({ url: 'https://example.com' }, out);
    expect(result).toBe(out);
    expect(result.reachable).toBe(false);
    expect(result.latency).toBe(-1);
  });

  // The fallback's other sentinel path: fetch exists and the HEAD request rejects. Same contract, and
  // it was unpinned — the absent-fetch branch could have returned the sentinel while this one did not.
  it('returns a sentinel when the HEAD request fails', async () => {
    setConnectivityBackend(fakeBackend());
    vi.stubGlobal('fetch', () => Promise.reject(new Error('network unreachable')));
    const out: ConnectivityReachability = { latency: 0, reachable: true };
    const result = await detectConnectivityReachability({ url: 'https://example.com' }, out);
    expect(result).toBe(out);
    expect(result.reachable).toBe(false);
    expect(result.latency).toBe(-1);
  });

  it('uses the backend detectReachability when available', async () => {
    const probeBackend: ConnectivityBackend = {
      ...fakeBackend(),
      async detectReachability(_opts, out) {
        out.reachable = true;
        out.latency = 42;
        return out;
      },
    };
    setConnectivityBackend(probeBackend);
    const out: ConnectivityReachability = { latency: 0, reachable: false };
    const result = await detectConnectivityReachability({ url: 'https://example.com' }, out);
    expect(result.reachable).toBe(true);
    expect(result.latency).toBe(42);
  });
});

describe('disposeConnectivity', () => {
  it('detaches the subscription', () => {
    const backend = fakeBackend();
    setConnectivityBackend(backend);
    const net = createConnectivity();
    attachConnectivity(net);
    expect(() => disposeConnectivity(net)).not.toThrow();
  });

  it('is safe to call when not attached', () => {
    const net = createConnectivity();
    expect(() => disposeConnectivity(net)).not.toThrow();
  });
});

describe('getConnectivityBackend', () => {
  it('falls back to a web backend', () => {
    expect(getConnectivityBackend()).not.toBeNull();
  });
});

describe('getConnectivityStatus', () => {
  it('fills the out parameter from the backend', () => {
    setConnectivityBackend(fakeBackend());
    const out = createConnectivityStatus();
    expect(getConnectivityStatus(out)).toBe(out);
    expect(out.type).toBe('wifi');
    expect(out.rtt).toBe(50);
    expect(out.downlinkMax).toBe(100);
  });
});

describe('hasConnectivityStatusChanged', () => {
  it('returns false for equal statuses', () => {
    const a = createConnectivityStatus();
    const b = createConnectivityStatus();
    expect(hasConnectivityStatusChanged(a, b)).toBe(false);
  });

  it('returns true when online differs', () => {
    const a = { ...createConnectivityStatus(), online: true };
    const b = createConnectivityStatus();
    expect(hasConnectivityStatusChanged(a, b)).toBe(true);
  });

  it('returns true when type differs', () => {
    const a = { ...createConnectivityStatus(), type: 'wifi' as const };
    const b = createConnectivityStatus();
    expect(hasConnectivityStatusChanged(a, b)).toBe(true);
  });

  it('returns true when rtt differs', () => {
    const a = { ...createConnectivityStatus(), rtt: 30 };
    const b = createConnectivityStatus();
    expect(hasConnectivityStatusChanged(a, b)).toBe(true);
  });

  it('returns true when saveData differs', () => {
    const a = { ...createConnectivityStatus(), saveData: true };
    const b = createConnectivityStatus();
    expect(hasConnectivityStatusChanged(a, b)).toBe(true);
  });

  it('returns true when metered differs', () => {
    const a = { ...createConnectivityStatus(), metered: true };
    const b = createConnectivityStatus();
    expect(hasConnectivityStatusChanged(a, b)).toBe(true);
  });

  it('is alias-safe — same object returns false', () => {
    const s = createConnectivityStatus();
    expect(hasConnectivityStatusChanged(s, s)).toBe(false);
  });
});

describe('isConnectivityMetered', () => {
  it('returns false for a non-metered connection', () => {
    setConnectivityBackend(fakeBackend({ metered: false }));
    expect(isConnectivityMetered()).toBe(false);
  });

  it('returns true for a metered connection', () => {
    setConnectivityBackend(fakeBackend({ metered: true }));
    expect(isConnectivityMetered()).toBe(true);
  });
});

describe('isConnectivityOnline', () => {
  it('reflects the backend online flag', () => {
    const backend = fakeBackend({ online: false });
    setConnectivityBackend(backend);
    expect(isConnectivityOnline()).toBe(false);
  });

  it('returns true when the backend is online', () => {
    setConnectivityBackend(fakeBackend({ online: true }));
    expect(isConnectivityOnline()).toBe(true);
  });
});

describe('isConnectivitySaveDataEnabled', () => {
  it('returns false when saveData is off', () => {
    setConnectivityBackend(fakeBackend({ saveData: false }));
    expect(isConnectivitySaveDataEnabled()).toBe(false);
  });

  it('returns true when saveData is on', () => {
    setConnectivityBackend(fakeBackend({ saveData: true }));
    expect(isConnectivitySaveDataEnabled()).toBe(true);
  });
});

describe('setConnectivityBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setConnectivityBackend(fakeBackend());
    setConnectivityBackend(null);
    expect(getConnectivityBackend()).not.toBeNull();
  });
});
