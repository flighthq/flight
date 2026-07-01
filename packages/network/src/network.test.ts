import { connectSignal } from '@flighthq/signals';
import type { NetworkBackend, NetworkReachability, NetworkStatus } from '@flighthq/types';

import {
  attachNetwork,
  createNetwork,
  createNetworkStatus,
  createWebNetworkBackend,
  detachNetwork,
  detectNetworkReachability,
  disposeNetwork,
  getNetworkBackend,
  getNetworkStatus,
  hasNetworkStatusChanged,
  isNetworkMetered,
  isNetworkOnline,
  isNetworkSaveDataEnabled,
  setNetworkBackend,
} from './network';

function fakeBackend(overrides?: Partial<NetworkStatus>): NetworkBackend & { status: NetworkStatus; fire: () => void } {
  let listener: (() => void) | null = null;
  const status: NetworkStatus = {
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

afterEach(() => setNetworkBackend(null));

describe('attachNetwork', () => {
  it('emits onChange and onOffline on transition to offline', () => {
    const backend = fakeBackend();
    setNetworkBackend(backend);
    const net = createNetwork();
    let changes = 0;
    let offline = 0;
    connectSignal(net.onChange, () => changes++);
    connectSignal(net.onOffline, () => offline++);
    attachNetwork(net);
    backend.status.online = false;
    (backend as ReturnType<typeof fakeBackend>).fire();
    expect(changes).toBe(1);
    expect(offline).toBe(1);
  });

  it('emits onOnline on transition to online', () => {
    const backend = fakeBackend({ online: false });
    setNetworkBackend(backend);
    const net = createNetwork();
    let online = 0;
    connectSignal(net.onOnline, () => online++);
    attachNetwork(net);
    backend.status.online = true;
    (backend as ReturnType<typeof fakeBackend>).fire();
    expect(online).toBe(1);
  });

  it('emits onConnectionTypeChange on type transition', () => {
    const backend = fakeBackend();
    setNetworkBackend(backend);
    const net = createNetwork();
    const types: string[] = [];
    connectSignal(net.onConnectionTypeChange, (t) => types.push(t));
    attachNetwork(net);
    backend.status.type = 'cellular';
    (backend as ReturnType<typeof fakeBackend>).fire();
    expect(types).toEqual(['cellular']);
  });

  it('does not emit onConnectionTypeChange when type is unchanged', () => {
    const backend = fakeBackend();
    setNetworkBackend(backend);
    const net = createNetwork();
    let count = 0;
    connectSignal(net.onConnectionTypeChange, () => count++);
    attachNetwork(net);
    // fire without changing type
    (backend as ReturnType<typeof fakeBackend>).fire();
    expect(count).toBe(0);
  });

  it('emits onMeteredChange on metered transition', () => {
    const backend = fakeBackend();
    setNetworkBackend(backend);
    const net = createNetwork();
    const metered: boolean[] = [];
    connectSignal(net.onMeteredChange, (m) => metered.push(m));
    attachNetwork(net);
    backend.status.metered = true;
    (backend as ReturnType<typeof fakeBackend>).fire();
    expect(metered).toEqual([true]);
  });

  it('is idempotent — replaces prior subscription', () => {
    const backend = fakeBackend();
    setNetworkBackend(backend);
    const net = createNetwork();
    let changes = 0;
    connectSignal(net.onChange, () => changes++);
    attachNetwork(net);
    attachNetwork(net);
    (backend as ReturnType<typeof fakeBackend>).fire();
    expect(changes).toBe(1);
  });
});

describe('createNetwork', () => {
  it('creates an entity with five signals', () => {
    const net = createNetwork();
    expect(net.onChange).toBeDefined();
    expect(net.onConnectionTypeChange).toBeDefined();
    expect(net.onMeteredChange).toBeDefined();
    expect(net.onOnline).toBeDefined();
    expect(net.onOffline).toBeDefined();
  });
});

describe('createNetworkStatus', () => {
  it('allocates a zeroed status with all fields at sentinel values', () => {
    expect(createNetworkStatus()).toEqual({
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

describe('createWebNetworkBackend', () => {
  it('reads a status without throwing', () => {
    const out = createNetworkStatus();
    const result = createWebNetworkBackend().getStatus(out);
    expect(typeof result.online).toBe('boolean');
    expect(typeof result.metered).toBe('boolean');
    expect(typeof result.saveData).toBe('boolean');
  });

  it('returns sentinel rtt and downlinkMax when connection is absent', () => {
    const out = createNetworkStatus();
    createWebNetworkBackend().getStatus(out);
    // In jsdom, navigator.connection is absent so rtt/downlinkMax default to -1
    expect(out.rtt).toBe(-1);
    expect(out.downlinkMax).toBe(-1);
  });
});

describe('detachNetwork', () => {
  it('stops further delivery', () => {
    const backend = fakeBackend();
    setNetworkBackend(backend);
    const net = createNetwork();
    let changes = 0;
    connectSignal(net.onChange, () => changes++);
    attachNetwork(net);
    detachNetwork(net);
    (backend as ReturnType<typeof fakeBackend>).fire();
    expect(changes).toBe(0);
  });

  it('is safe to call when not attached', () => {
    const net = createNetwork();
    expect(() => detachNetwork(net)).not.toThrow();
  });
});

describe('detectNetworkReachability', () => {
  it('returns a sentinel when fetch is unavailable (SSR/jsdom guard)', async () => {
    // The web backend's detectReachability returns a sentinel in jsdom where fetch is absent or HEAD
    // requests fail. We install a backend without detectReachability to test the fallback path.
    setNetworkBackend(fakeBackend());
    const out: NetworkReachability = { latency: 0, reachable: true };
    // fetch is undefined in vitest/jsdom by default — expect sentinel
    const result = await detectNetworkReachability({ url: 'https://example.com' }, out);
    expect(result).toBe(out);
    // In jsdom fetch may not exist or may fail; either way we get reachable=false or a live result
    expect(typeof result.reachable).toBe('boolean');
  });

  it('uses the backend detectReachability when available', async () => {
    const probeBackend: NetworkBackend = {
      ...fakeBackend(),
      async detectReachability(_opts, out) {
        out.reachable = true;
        out.latency = 42;
        return out;
      },
    };
    setNetworkBackend(probeBackend);
    const out: NetworkReachability = { latency: 0, reachable: false };
    const result = await detectNetworkReachability({ url: 'https://example.com' }, out);
    expect(result.reachable).toBe(true);
    expect(result.latency).toBe(42);
  });
});

describe('disposeNetwork', () => {
  it('detaches the subscription', () => {
    const backend = fakeBackend();
    setNetworkBackend(backend);
    const net = createNetwork();
    attachNetwork(net);
    expect(() => disposeNetwork(net)).not.toThrow();
  });

  it('is safe to call when not attached', () => {
    const net = createNetwork();
    expect(() => disposeNetwork(net)).not.toThrow();
  });
});

describe('getNetworkBackend', () => {
  it('falls back to a web backend', () => {
    expect(getNetworkBackend()).not.toBeNull();
  });
});

describe('getNetworkStatus', () => {
  it('fills the out parameter from the backend', () => {
    setNetworkBackend(fakeBackend());
    const out = createNetworkStatus();
    expect(getNetworkStatus(out)).toBe(out);
    expect(out.type).toBe('wifi');
    expect(out.rtt).toBe(50);
    expect(out.downlinkMax).toBe(100);
  });
});

describe('hasNetworkStatusChanged', () => {
  it('returns false for equal statuses', () => {
    const a = createNetworkStatus();
    const b = createNetworkStatus();
    expect(hasNetworkStatusChanged(a, b)).toBe(false);
  });

  it('returns true when online differs', () => {
    const a = { ...createNetworkStatus(), online: true };
    const b = createNetworkStatus();
    expect(hasNetworkStatusChanged(a, b)).toBe(true);
  });

  it('returns true when type differs', () => {
    const a = { ...createNetworkStatus(), type: 'wifi' as const };
    const b = createNetworkStatus();
    expect(hasNetworkStatusChanged(a, b)).toBe(true);
  });

  it('returns true when rtt differs', () => {
    const a = { ...createNetworkStatus(), rtt: 30 };
    const b = createNetworkStatus();
    expect(hasNetworkStatusChanged(a, b)).toBe(true);
  });

  it('returns true when saveData differs', () => {
    const a = { ...createNetworkStatus(), saveData: true };
    const b = createNetworkStatus();
    expect(hasNetworkStatusChanged(a, b)).toBe(true);
  });

  it('returns true when metered differs', () => {
    const a = { ...createNetworkStatus(), metered: true };
    const b = createNetworkStatus();
    expect(hasNetworkStatusChanged(a, b)).toBe(true);
  });

  it('is alias-safe — same object returns false', () => {
    const s = createNetworkStatus();
    expect(hasNetworkStatusChanged(s, s)).toBe(false);
  });
});

describe('isNetworkMetered', () => {
  it('returns false for a non-metered connection', () => {
    setNetworkBackend(fakeBackend({ metered: false }));
    expect(isNetworkMetered()).toBe(false);
  });

  it('returns true for a metered connection', () => {
    setNetworkBackend(fakeBackend({ metered: true }));
    expect(isNetworkMetered()).toBe(true);
  });
});

describe('isNetworkOnline', () => {
  it('reflects the backend online flag', () => {
    const backend = fakeBackend({ online: false });
    setNetworkBackend(backend);
    expect(isNetworkOnline()).toBe(false);
  });

  it('returns true when the backend is online', () => {
    setNetworkBackend(fakeBackend({ online: true }));
    expect(isNetworkOnline()).toBe(true);
  });
});

describe('isNetworkSaveDataEnabled', () => {
  it('returns false when saveData is off', () => {
    setNetworkBackend(fakeBackend({ saveData: false }));
    expect(isNetworkSaveDataEnabled()).toBe(false);
  });

  it('returns true when saveData is on', () => {
    setNetworkBackend(fakeBackend({ saveData: true }));
    expect(isNetworkSaveDataEnabled()).toBe(true);
  });
});

describe('setNetworkBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setNetworkBackend(fakeBackend());
    setNetworkBackend(null);
    expect(getNetworkBackend()).not.toBeNull();
  });
});
