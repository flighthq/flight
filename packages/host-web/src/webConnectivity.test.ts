import type { ConnectivityStatus } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import {
  createWebConnectivityBackend,
  initializeWebConnectivityBackend,
  webConnectivityBackend,
} from './webConnectivity';
import { webHost } from './webHost';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function status(): ConnectivityStatus {
  return {
    downlink: 0,
    downlinkMax: 0,
    effectiveType: 'stale',
    metered: true,
    online: false,
    rtt: 0,
    saveData: true,
    type: 'cellular',
  };
}

describe('createWebConnectivityBackend', () => {
  it('returns one Entity implementing all three provider facets', () => {
    const backend = createWebConnectivityBackend();
    expect(EntityRuntimeKey in backend).toBe(true);
    expect(backend.getStatus).toBeTypeOf('function');
    expect(backend.subscribe).toBeTypeOf('function');
    expect(backend.detectReachability).toBeTypeOf('function');
    expect(backend.destroy).toBeTypeOf('function');
  });

  it('reports unknown rather than online or offline when navigator is unavailable', () => {
    vi.stubGlobal('navigator', undefined);
    const out = status();
    createWebConnectivityBackend().getStatus(out);
    expect(out).toEqual({
      downlink: -1,
      downlinkMax: -1,
      effectiveType: '',
      metered: false,
      online: null,
      rtt: -1,
      saveData: false,
      type: 'unknown',
    });
  });

  it('returns null rather than a silent no-op release when event APIs are unavailable', () => {
    vi.stubGlobal('window', undefined);
    expect(createWebConnectivityBackend().subscribe(() => {})).toBeNull();
  });

  it('returns an exact idempotent release for the listeners it installed', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const backend = createWebConnectivityBackend();
    const listener = () => {};
    const release = backend.subscribe(listener);
    expect(release).not.toBeNull();
    expect(add).toHaveBeenCalledWith('online', listener);
    expect(add).toHaveBeenCalledWith('offline', listener);
    release?.();
    release?.();
    expect(remove.mock.calls.filter(([type]) => type === 'online')).toHaveLength(1);
    expect(remove.mock.calls.filter(([type]) => type === 'offline')).toHaveLength(1);
  });

  it('destroy releases every live subscription exactly once and is terminal', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const backend = createWebConnectivityBackend();
    expect(backend.subscribe(() => {})).not.toBeNull();
    expect(backend.subscribe(() => {})).not.toBeNull();
    backend.destroy();
    backend.destroy();
    expect(remove.mock.calls.filter(([type]) => type === 'online')).toHaveLength(2);
    expect(remove.mock.calls.filter(([type]) => type === 'offline')).toHaveLength(2);
    expect(backend.subscribe(() => {})).toBeNull();
  });

  it('returns the reachability sentinel without fetch', async () => {
    vi.stubGlobal('fetch', undefined);
    const out = { latency: 0, reachable: true };
    expect(await createWebConnectivityBackend().detectReachability({ url: 'https://example.invalid' }, out)).toBe(out);
    expect(out).toEqual({ latency: -1, reachable: false });
  });
});

describe('initializeWebConnectivityBackend', () => {
  it('is the construction initializer of createWebConnectivityBackend', () => {
    expect(typeof initializeWebConnectivityBackend).toBe('function');
  });
});
describe('webHost connectivity', () => {
  it('publishes stable status/change/reachability slots backed by one Entity', () => {
    expect(webHost.connectivity).toEqual({
      change: webConnectivityBackend,
      reachability: webConnectivityBackend,
      status: webConnectivityBackend,
    });
    expect(EntityRuntimeKey in webHost.connectivity.status).toBe(true);
  });
});
