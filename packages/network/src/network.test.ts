import { connectSignal } from '@flighthq/signals';
import type { NetworkBackend, NetworkStatus } from '@flighthq/types';

import {
  attachNetwork,
  createNetwork,
  createNetworkStatus,
  createWebNetworkBackend,
  detachNetwork,
  disposeNetwork,
  getNetworkBackend,
  getNetworkStatus,
  isNetworkOnline,
  setNetworkBackend,
} from './network';

function fakeBackend(): NetworkBackend & { online: boolean; fire: () => void } {
  let listener: (() => void) | null = null;
  return {
    online: true,
    getStatus(out) {
      out.online = this.online;
      out.type = 'wifi';
      out.downlink = 10;
      out.effectiveType = '4g';
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
  it('emits onChange and the online/offline transition signals', () => {
    const backend = fakeBackend();
    setNetworkBackend(backend);
    const net = createNetwork();
    let changes = 0;
    let offline = 0;
    connectSignal(net.onChange, () => changes++);
    connectSignal(net.onOffline, () => offline++);
    attachNetwork(net);
    backend.online = false;
    backend.fire();
    expect(changes).toBe(1);
    expect(offline).toBe(1);
  });
});

describe('createNetwork', () => {
  it('creates an entity with three signals', () => {
    const net = createNetwork();
    expect(net.onChange).toBeDefined();
    expect(net.onOnline).toBeDefined();
    expect(net.onOffline).toBeDefined();
  });
});

describe('createNetworkStatus', () => {
  it('allocates a zeroed status', () => {
    expect(createNetworkStatus()).toEqual({ downlink: -1, effectiveType: '', online: false, type: 'unknown' });
  });
});

describe('createWebNetworkBackend', () => {
  it('reads a status without throwing', () => {
    const out = createNetworkStatus();
    expect(typeof createWebNetworkBackend().getStatus(out).online).toBe('boolean');
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
    backend.fire();
    expect(changes).toBe(0);
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
  });
});

describe('isNetworkOnline', () => {
  it('reflects the backend online flag', () => {
    const backend = fakeBackend();
    backend.online = false;
    setNetworkBackend(backend);
    expect(isNetworkOnline()).toBe(false);
  });
});

describe('setNetworkBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setNetworkBackend(fakeBackend());
    setNetworkBackend(null);
    expect(getNetworkBackend()).not.toBeNull();
  });
});
