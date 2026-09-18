import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createWebPermissionsBackend,
  initializeWebPermissionsBackend,
  webHostNotificationPermission,
  webHostPermissions,
} from './webPermissions';

describe('createWebPermissionsBackend', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('creates a fresh Entity with the exact narrow permission surface', () => {
    const first = createWebPermissionsBackend();
    const second = createWebPermissionsBackend();
    expect(first).not.toBe(second);
    expect(Object.keys(first).sort()).toEqual([
      'notification',
      'queryPermission',
      'requestMediaAccess',
      'requestWakeLock',
    ]);
  });

  it.each(['denied', 'granted', 'prompt'] as const)('queries the Web Permissions API state %s', async (state) => {
    const query = vi.fn(async () => ({ state }));
    vi.stubGlobal('navigator', { permissions: { query } });

    await expect(createWebPermissionsBackend().queryPermission('camera')).resolves.toEqual({ reason: 'ok', state });
    expect(query).toHaveBeenCalledWith({ name: 'camera' });
  });

  it('distinguishes an unsupported query from an operational failure', async () => {
    const unsupported = Object.assign(new Error('unsupported'), { name: 'NotSupportedError' });
    vi.stubGlobal('navigator', {
      permissions: {
        query: vi.fn().mockRejectedValueOnce(unsupported).mockRejectedValueOnce(new Error('failed')),
      },
    });
    const provider = createWebPermissionsBackend();

    await expect(provider.queryPermission('vendor-first')).resolves.toEqual({ reason: 'unsupported' });
    await expect(provider.queryPermission('vendor-second')).resolves.toEqual({ reason: 'operation-failed' });
  });

  it('reports a missing Web Permissions API without throwing', async () => {
    vi.stubGlobal('navigator', {});
    await expect(createWebPermissionsBackend().queryPermission('camera')).resolves.toEqual({
      reason: 'runtime-unavailable',
    });
  });

  it('requests camera and microphone access with their exact constraints and releases every track', async () => {
    const stopped: string[] = [];
    const getUserMedia = vi.fn(async () => ({
      getTracks: () => [{ stop: () => stopped.push('first') }, { stop: () => stopped.push('second') }],
    }));
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const provider = createWebPermissionsBackend();

    await expect(provider.requestMediaAccess('camera')).resolves.toEqual({ reason: 'granted', state: 'granted' });
    await expect(provider.requestMediaAccess('microphone')).resolves.toEqual({ reason: 'granted', state: 'granted' });
    expect(getUserMedia).toHaveBeenNthCalledWith(1, { video: true });
    expect(getUserMedia).toHaveBeenNthCalledWith(2, { audio: true });
    expect(stopped).toEqual(['first', 'second', 'first', 'second']);
  });

  it('attempts all media cleanup and preserves granted state when one track fails', async () => {
    const stopped: string[] = [];
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: async () => ({
          getTracks: () => [
            { stop: () => stopped.push('first') },
            {
              stop: () => {
                stopped.push('second');
                throw new Error('cleanup failed');
              },
            },
            { stop: () => stopped.push('third') },
          ],
        }),
      },
    });

    await expect(createWebPermissionsBackend().requestMediaAccess('camera')).resolves.toEqual({
      reason: 'cleanup-failed',
      state: 'granted',
    });
    expect(stopped).toEqual(['first', 'second', 'third']);
  });

  it('distinguishes denied media access from an operational failure', async () => {
    const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValueOnce(denied).mockRejectedValueOnce(new Error('failed')),
      },
    });
    const provider = createWebPermissionsBackend();

    await expect(provider.requestMediaAccess('camera')).resolves.toEqual({ reason: 'denied', state: 'denied' });
    await expect(provider.requestMediaAccess('camera')).resolves.toEqual({ reason: 'operation-failed' });
  });

  it('releases an acquired wake lock and reports release failure after acquisition', async () => {
    const release = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('failed'));
    vi.stubGlobal('navigator', {
      wakeLock: {
        request: vi.fn(async () => ({ release })),
      },
    });
    const provider = createWebPermissionsBackend();

    await expect(provider.requestWakeLock()).resolves.toEqual({ reason: 'granted', state: 'granted' });
    await expect(provider.requestWakeLock()).resolves.toEqual({ reason: 'cleanup-failed', state: 'granted' });
    expect(release).toHaveBeenCalledTimes(2);
  });

  it('reports a missing Wake Lock API without throwing', async () => {
    vi.stubGlobal('navigator', {});
    await expect(createWebPermissionsBackend().requestWakeLock()).resolves.toEqual({
      reason: 'runtime-unavailable',
    });
  });

  it('owns Notification permission query and request behind the provider', async () => {
    const requestPermission = vi.fn(async () => 'default' as const);
    vi.stubGlobal('Notification', { permission: 'granted', requestPermission });
    const provider = createWebPermissionsBackend();

    await expect(provider.notification.getPermission()).resolves.toEqual({ permission: 'granted', reason: 'ok' });
    await expect(provider.notification.requestPermission()).resolves.toEqual({ reason: 'dismissed' });
    expect(requestPermission).toHaveBeenCalledOnce();
  });

  it('reports a missing Notification API through its method-tight failure outcome', async () => {
    vi.stubGlobal('Notification', undefined);
    const provider = createWebPermissionsBackend();
    await expect(provider.notification.getPermission()).resolves.toEqual({ reason: 'operation-failed' });
    await expect(provider.notification.requestPermission()).resolves.toEqual({ reason: 'operation-failed' });
  });

  it('publishes one stable provider and its shared Notification permission identity', () => {
    expect(webHostNotificationPermission).toBe(webHostPermissions.notification);
  });
});

describe('initializeWebPermissionsBackend', () => {
  it('is the construction initializer of createWebPermissionsBackend', () => {
    expect(initializeWebPermissionsBackend).toBeTypeOf('function');
  });
});
