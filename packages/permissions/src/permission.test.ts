import type { PermissionBackend, PermissionName, PermissionState } from '@flighthq/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createWebPermissionBackend,
  getPermissionBackend,
  getPermissionState,
  requestPermission,
  setPermissionBackend,
} from './permission';

// A recording mock backend: relays a fixed state and captures the last name each method saw.
function fakeBackend(
  state: PermissionState,
): PermissionBackend & { lastGetState: PermissionName | null; lastRequest: PermissionName | null } {
  const backend = {
    lastGetState: null as PermissionName | null,
    lastRequest: null as PermissionName | null,
    async getState(name: PermissionName) {
      backend.lastGetState = name;
      return state;
    },
    async request(name: PermissionName) {
      backend.lastRequest = name;
      return state;
    },
  };
  return backend;
}

function fakeStream(trackCount = 1): { stream: MediaStream; stopped: () => number } {
  let stopped = 0;
  const tracks = Array.from({ length: trackCount }, () => ({ stop: () => (stopped += 1) }));
  const stream = { getTracks: () => tracks } as unknown as MediaStream;
  return { stream, stopped: () => stopped };
}

afterEach(() => {
  setPermissionBackend(null);
  vi.unstubAllGlobals();
});

describe('createWebPermissionBackend', () => {
  it('returns a backend with getState and request methods', () => {
    const backend = createWebPermissionBackend();
    expect(typeof backend.getState).toBe('function');
    expect(typeof backend.request).toBe('function');
  });

  it('getState resolves the queried Permissions API state', async () => {
    const query = vi.fn(async () => ({ state: 'granted' }));
    vi.stubGlobal('navigator', { permissions: { query } });
    const backend = createWebPermissionBackend();
    expect(await backend.getState('camera')).toBe('granted');
    expect(query).toHaveBeenCalledWith({ name: 'camera' });
  });

  it('getState maps clipboard names to their clipboard descriptor', async () => {
    const query = vi.fn(async () => ({ state: 'prompt' }));
    vi.stubGlobal('navigator', { permissions: { query } });
    await createWebPermissionBackend().getState('clipboard-read');
    expect(query).toHaveBeenCalledWith({ name: 'clipboard-read' });
  });

  it('getState falls back to Notification.permission when the Permissions API is absent', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('Notification', { permission: 'granted' });
    expect(await createWebPermissionBackend().getState('notifications')).toBe('granted');
  });

  it('getState maps a default Notification permission to the prompt sentinel', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('Notification', { permission: 'default' });
    expect(await createWebPermissionBackend().getState('notifications')).toBe('prompt');
  });

  it('getState returns the prompt sentinel for a non-notification name with no queryable state', async () => {
    vi.stubGlobal('navigator', {});
    expect(await createWebPermissionBackend().getState('geolocation')).toBe('prompt');
  });

  it('getState falls back when the query rejects', async () => {
    const query = vi.fn(async () => {
      throw new TypeError('unsupported');
    });
    vi.stubGlobal('navigator', { permissions: { query } });
    vi.stubGlobal('Notification', { permission: 'denied' });
    expect(await createWebPermissionBackend().getState('notifications')).toBe('denied');
    expect(await createWebPermissionBackend().getState('midi')).toBe('prompt');
  });

  it('request(notifications) maps a granted result through', async () => {
    vi.stubGlobal('Notification', { requestPermission: async () => 'granted' });
    expect(await createWebPermissionBackend().request('notifications')).toBe('granted');
  });

  it('request(notifications) maps a default result to the prompt sentinel', async () => {
    vi.stubGlobal('Notification', { requestPermission: async () => 'default' });
    expect(await createWebPermissionBackend().request('notifications')).toBe('prompt');
  });

  it('request(camera) grants and stops the granted tracks immediately', async () => {
    const { stream, stopped } = fakeStream(2);
    const getUserMedia = vi.fn(async () => stream);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    expect(await createWebPermissionBackend().request('camera')).toBe('granted');
    expect(getUserMedia).toHaveBeenCalledWith({ video: true });
    expect(stopped()).toBe(2);
  });

  it('request(microphone) requests an audio stream', async () => {
    const { stream } = fakeStream();
    const getUserMedia = vi.fn(async () => stream);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    expect(await createWebPermissionBackend().request('microphone')).toBe('granted');
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
  });

  it('request(camera) denies when getUserMedia rejects', async () => {
    const getUserMedia = vi.fn(async () => {
      throw new DOMException('denied', 'NotAllowedError');
    });
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    expect(await createWebPermissionBackend().request('camera')).toBe('denied');
  });

  it('request(camera) returns the prompt sentinel with no throw when the API is absent', async () => {
    vi.stubGlobal('navigator', {});
    expect(await createWebPermissionBackend().request('camera')).toBe('prompt');
  });

  it('request(geolocation) grants on a successful one-shot position read', async () => {
    const getCurrentPosition = (success: () => void) => success();
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    expect(await createWebPermissionBackend().request('geolocation')).toBe('granted');
  });

  it('request(geolocation) denies when the position read errors', async () => {
    const getCurrentPosition = (_success: () => void, error: () => void) => error();
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
    expect(await createWebPermissionBackend().request('geolocation')).toBe('denied');
  });

  it('request(persistent-storage) grants when persist resolves true, prompts when false', async () => {
    vi.stubGlobal('navigator', { storage: { persist: async () => true } });
    expect(await createWebPermissionBackend().request('persistent-storage')).toBe('granted');
    vi.stubGlobal('navigator', { storage: { persist: async () => false } });
    expect(await createWebPermissionBackend().request('persistent-storage')).toBe('prompt');
  });

  it('request falls back to a state query for a name with no request path', async () => {
    const query = vi.fn(async () => ({ state: 'granted' }));
    vi.stubGlobal('navigator', { permissions: { query } });
    expect(await createWebPermissionBackend().request('midi')).toBe('granted');
    expect(query).toHaveBeenCalledWith({ name: 'midi' });
  });
});

describe('getPermissionBackend', () => {
  it('returns a lazily-created web default', () => {
    expect(getPermissionBackend()).not.toBeNull();
    expect(getPermissionBackend()).toBe(getPermissionBackend());
  });

  it('returns an installed backend', () => {
    const backend = fakeBackend('granted');
    setPermissionBackend(backend);
    expect(getPermissionBackend()).toBe(backend);
  });
});

describe('getPermissionState', () => {
  it('dispatches to the active backend and relays the resolved state', async () => {
    const backend = fakeBackend('denied');
    setPermissionBackend(backend);
    expect(await getPermissionState('camera')).toBe('denied');
    expect(backend.lastGetState).toBe('camera');
  });
});

describe('requestPermission', () => {
  it('dispatches to the active backend and relays the resolved state', async () => {
    const backend = fakeBackend('granted');
    setPermissionBackend(backend);
    expect(await requestPermission('microphone')).toBe('granted');
    expect(backend.lastRequest).toBe('microphone');
  });
});

describe('setPermissionBackend', () => {
  it('installs a backend and restores a fresh distinct web default on null', () => {
    const backend = fakeBackend('prompt');
    setPermissionBackend(backend);
    expect(getPermissionBackend()).toBe(backend);
    setPermissionBackend(null);
    const restored = getPermissionBackend();
    expect(restored).not.toBe(backend);
    expect(restored.getState).toBeInstanceOf(Function);
  });
});
