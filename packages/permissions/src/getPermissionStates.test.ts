import { EntityRuntimeKey } from '@flighthq/types/contract';
import type {
  HostMidiPermissionCapability,
  HostPermissionsCapability,
  HostPreferencesPersistenceQueryCapability,
  StoragePersistenceOutcome,
} from '@flighthq/types/contract';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getPermissionStates } from './permission.ts';

describe('getPermissionStates', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('pins repeated names to the direct provider passed by the caller', async () => {
    const events: string[] = [];
    const second = permissionsProvider('denied', events, 'second');
    const first = permissionsProvider('granted', events, 'first', () => {
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

  it('pins native queries to the permissions provider captured before work starts', async () => {
    const events: string[] = [];
    const second = permissionsProvider('denied', events, 'second');
    const first = permissionsProvider('granted', events, 'first', () => {
      active = second;
    });
    let active = first;

    await expect(getPermissionStates(first, undefined, undefined, ['notifications', 'camera'])).resolves.toEqual([
      { reason: 'ok', state: 'granted' },
      { reason: 'ok', state: 'granted' },
    ]);
    expect(active).toBe(second);
    expect(events).toEqual(['work:first', 'query:first:camera']);
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
    const provider = { [EntityRuntimeKey]: undefined, ...first } as HostMidiPermissionCapability;
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

    await expect(getPermissionStates(permissionsProvider(), provider, undefined, ['midi', 'midi'])).resolves.toEqual([
      { reason: 'ok', state: 'granted' },
      { reason: 'ok', state: 'granted' },
    ]);
    expect(active).toBe(second);
    expect(events).toEqual(['work:first', 'work:first']);
  });

  it('keeps input order and repeated entries when work resolves out of order', async () => {
    const resolvers: Array<(state: { state: string }) => void> = [];
    const provider = permissionsProvider(
      'granted',
      [],
      'query',
      undefined,
      () =>
        new Promise((resolve) =>
          resolvers.push(({ state }) =>
            resolve(
              state === 'denied' || state === 'granted' || state === 'prompt'
                ? { reason: 'ok', state }
                : { reason: 'operation-failed' },
            ),
          ),
        ),
    );
    const result = getPermissionStates(provider, undefined, undefined, ['camera', 'microphone', 'camera']);
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
    ) as HostPermissionsCapability;

    await expect(getPermissionStates(provider, undefined, undefined, [])).resolves.toEqual([]);
  });

  it('captures the persistence-query owner once and preserves repeated entries and order', async () => {
    const events: string[] = [];
    const second = {
      async getPersistence(): Promise<StoragePersistenceOutcome> {
        events.push('work:second');
        return { outcome: 'persistent' as const, permissionState: 'granted' as const };
      },
    };
    const first = {
      async getPersistence(): Promise<StoragePersistenceOutcome> {
        events.push('work:first');
        active = second;
        return { outcome: 'best-effort' as const, permissionState: null };
      },
    };
    let active = first;
    const provider = { [EntityRuntimeKey]: undefined, ...first } as HostPreferencesPersistenceQueryCapability;
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
      getPermissionStates(permissionsProvider(), undefined, provider, ['persistent-storage', 'persistent-storage']),
    ).resolves.toEqual([
      { reason: 'best-effort', state: null },
      { reason: 'best-effort', state: null },
    ]);
    expect(active).toBe(second);
    expect(events).toEqual(['work:first', 'work:first']);
  });
});

function permissionsProvider(
  permission: 'denied' | 'granted' = 'granted',
  events: string[] = [],
  label = 'permission',
  beforeReturn?: () => void,
  queryPermission?: HostPermissionsCapability['queryPermission'],
): HostPermissionsCapability {
  return {
    notification: {
      async getPermission() {
        events.push(`work:${label}`);
        beforeReturn?.();
        return { permission, reason: 'ok' as const };
      },
      async requestPermission() {
        return { reason: permission };
      },
    },
    queryPermission:
      queryPermission ??
      (async (name) => {
        events.push(`query:${label}:${name}`);
        return { reason: 'ok', state: permission };
      }),
    async requestMediaAccess() {
      return { reason: 'runtime-unavailable' };
    },
    async requestWakeLock() {
      return { reason: 'runtime-unavailable' };
    },
  };
}
