import { EntityRuntimeKey } from '@flighthq/types/contract';
import type {
  HostMidiPermissionProvider,
  HostNotificationPermissionProvider,
  HostStoragePersistenceQueryProvider,
  StoragePersistenceResult,
} from '@flighthq/types/contract';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getPermissionStates } from './permission';

describe('getPermissionStates', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('pins repeated names to the direct provider passed by the caller', async () => {
    const events: string[] = [];
    const second = permissionProvider('denied', events, 'second');
    const first = permissionProvider('granted', events, 'first', () => {
      active = second;
    });
    let active = first;

    await expect(getPermissionStates(first, undefined, undefined, ['notifications', 'notifications'])).resolves.toEqual(
      [
        { reason: 'ok', state: 'granted' },
        { reason: 'ok', state: 'granted' },
      ],
    );
    expect(active).toBe(second);
    expect(events).toEqual(['work:first', 'work:first']);
  });

  it('captures the interim Web-query owner before starting provider work', async () => {
    const events: string[] = [];
    const provider = permissionProvider('granted', events, 'notification');
    const permissions = {
      query: async () => {
        events.push('work:web-query');
        return { state: 'denied' };
      },
    };
    const navigatorValue: object = {};
    Object.defineProperty(navigatorValue, 'permissions', {
      get() {
        events.push('capture:web-query');
        return permissions;
      },
    });
    vi.stubGlobal('navigator', navigatorValue);

    await expect(getPermissionStates(provider, undefined, undefined, ['notifications', 'camera'])).resolves.toEqual([
      { reason: 'ok', state: 'granted' },
      { reason: 'ok', state: 'denied' },
    ]);
    expect(events.slice(0, 2)).toEqual(['capture:web-query', 'work:notification']);
  });

  it('keeps repeated MIDI queries pinned to the direct provider', async () => {
    const events: string[] = [];
    const second = {
      async getPermission() {
        events.push('work:second');
        return { reason: 'ok' as const, state: 'denied' as const };
      },
    };
    const first = {
      async getPermission() {
        events.push('work:first');
        active = second;
        return { reason: 'ok' as const, state: 'granted' as const };
      },
    };
    let active: {
      getPermission(): Promise<{ reason: 'ok'; state: 'denied' | 'granted' }>;
    } = first;
    const provider = { [EntityRuntimeKey]: undefined, ...first } as HostMidiPermissionProvider;
    vi.stubGlobal(
      'navigator',
      new Proxy(
        {},
        {
          get() {
            throw new Error('batch MIDI query resolved ambient Web');
          },
        },
      ),
    );

    await expect(getPermissionStates(undefined, provider, undefined, ['midi', 'midi'])).resolves.toEqual([
      { reason: 'ok', state: 'granted' },
      { reason: 'ok', state: 'granted' },
    ]);
    expect(active).toBe(second);
    expect(events).toEqual(['work:first', 'work:first']);
  });

  it('keeps input order and repeated entries when work resolves out of order', async () => {
    const resolvers: Array<(state: { state: string }) => void> = [];
    vi.stubGlobal('navigator', {
      permissions: {
        query: () => new Promise((resolve) => resolvers.push(resolve)),
      },
    });
    const result = getPermissionStates(undefined, undefined, undefined, ['camera', 'microphone', 'camera']);
    await vi.waitFor(() => expect(resolvers).toHaveLength(3));
    resolvers[2]({ state: 'prompt' });
    resolvers[0]({ state: 'granted' });
    resolvers[1]({ state: 'denied' });

    await expect(result).resolves.toEqual([
      { reason: 'ok', state: 'granted' },
      { reason: 'ok', state: 'denied' },
      { reason: 'ok', state: 'prompt' },
    ]);
  });

  it('does not resolve an owner for an empty batch', async () => {
    const provider = new Proxy(
      {},
      {
        get() {
          throw new Error('empty batch resolved an owner');
        },
      },
    ) as HostNotificationPermissionProvider;
    vi.stubGlobal(
      'navigator',
      new Proxy(
        {},
        {
          get() {
            throw new Error('empty batch resolved Web');
          },
        },
      ),
    );

    await expect(getPermissionStates(provider, undefined, undefined, [])).resolves.toEqual([]);
  });

  it('captures the persistence-query owner once and preserves repeated entries and order', async () => {
    const events: string[] = [];
    const second = {
      async getPersistence(): Promise<StoragePersistenceResult> {
        events.push('work:second');
        return { outcome: 'persistent' as const, permissionState: 'granted' as const };
      },
    };
    const first = {
      async getPersistence(): Promise<StoragePersistenceResult> {
        events.push('work:first');
        active = second;
        return { outcome: 'best-effort' as const, permissionState: null };
      },
    };
    let active = first;
    const provider = { [EntityRuntimeKey]: undefined, ...first } as HostStoragePersistenceQueryProvider;
    vi.stubGlobal(
      'navigator',
      new Proxy(
        {},
        {
          get() {
            throw new Error('batch projection must not resolve a native persistent-storage owner');
          },
        },
      ),
    );

    await expect(
      getPermissionStates(undefined, undefined, provider, ['persistent-storage', 'persistent-storage']),
    ).resolves.toEqual([
      { reason: 'best-effort', state: null },
      { reason: 'best-effort', state: null },
    ]);
    expect(active).toBe(second);
    expect(events).toEqual(['work:first', 'work:first']);
  });
});

function permissionProvider(
  permission: 'denied' | 'granted',
  events: string[],
  label: string,
  beforeReturn?: () => void,
): HostNotificationPermissionProvider {
  return {
    [EntityRuntimeKey]: undefined,
    async getPermission() {
      events.push(`work:${label}`);
      beforeReturn?.();
      return { permission, reason: 'ok' as const };
    },
    async requestPermission() {
      return { reason: permission };
    },
  } as HostNotificationPermissionProvider;
}
