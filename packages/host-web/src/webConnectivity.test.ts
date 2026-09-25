import type { ConnectivityStatus } from '@flighthq/types/contract';

import {
  webHostConnectivityChange,
  webHostConnectivityReachability,
  webHostConnectivityStatus,
} from './webConnectivity.ts';
import { webHost } from './webHost.ts';

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

describe('webHost connectivity', () => {
  it('publishes three stable and distinct Host leaves', () => {
    expect(webHost.connectivity).toEqual({
      change: webHostConnectivityChange,
      reachability: webHostConnectivityReachability,
      status: webHostConnectivityStatus,
    });
    expect(new Set(Object.values(webHost.connectivity)).size).toBe(3);
  });
});

describe('webHostConnectivityChange', () => {
  it('returns null rather than a silent no-op release when event APIs are unavailable', () => {
    vi.stubGlobal('window', undefined);
    expect(webHostConnectivityChange.subscribe(() => {})).toBeNull();
  });

  it('returns an exact idempotent release for the listeners it installed', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const listener = () => {};
    const release = webHostConnectivityChange.subscribe(listener);
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
    expect(webHostConnectivityChange.subscribe(() => {})).not.toBeNull();
    expect(webHostConnectivityChange.subscribe(() => {})).not.toBeNull();
    webHostConnectivityChange.destroy();
    webHostConnectivityChange.destroy();
    expect(remove.mock.calls.filter(([type]) => type === 'online')).toHaveLength(2);
    expect(remove.mock.calls.filter(([type]) => type === 'offline')).toHaveLength(2);
    expect(webHostConnectivityChange.subscribe(() => {})).toBeNull();
  });
});

describe('webHostConnectivityReachability', () => {
  it('returns the reachability sentinel without fetch', async () => {
    vi.stubGlobal('fetch', undefined);
    const out = { latency: 0, reachable: true };
    expect(await webHostConnectivityReachability.detectReachability({ url: 'https://example.invalid' }, out)).toBe(out);
    expect(out).toEqual({ latency: -1, reachable: false });
  });
});

describe('webHostConnectivityStatus', () => {
  it('reports unknown rather than online or offline when navigator is unavailable', () => {
    vi.stubGlobal('navigator', undefined);
    const out = status();
    webHostConnectivityStatus.getStatus(out);
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
});
