import { EntityRuntimeKey } from '@flighthq/types/contract';
import type { Host } from '@flighthq/types/contract';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getPermissionStates } from './permission';

describe('getPermissionStates', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('captures every resolved owner once before work and never splits repeated names across providers', async () => {
    const events: string[] = [];
    const second = permissionProvider('denied', events, 'second');
    const first = permissionProvider('granted', events, 'first', () => {
      active = second;
    });
    let active = first;
    let notificationOwnerReads = 0;
    const notification: object = {};
    Object.defineProperty(notification, 'permission', {
      get() {
        notificationOwnerReads += 1;
        events.push('capture:notification');
        return active;
      },
    });
    const host = hostWithNotificationGroup(notification);

    await expect(getPermissionStates(host, ['notifications', 'notifications'])).resolves.toEqual([
      { reason: 'ok', state: 'granted' },
      { reason: 'ok', state: 'granted' },
    ]);
    expect(notificationOwnerReads).toBe(1);
    expect(events).toEqual(['capture:notification', 'work:first', 'work:first']);
  });

  it('captures the Notification and interim Web-query owners before starting either operation', async () => {
    const events: string[] = [];
    const provider = permissionProvider('granted', events, 'notification');
    const notification: object = {};
    Object.defineProperty(notification, 'permission', {
      get() {
        events.push('capture:notification');
        return provider;
      },
    });
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

    await expect(
      getPermissionStates(hostWithNotificationGroup(notification), ['notifications', 'camera']),
    ).resolves.toEqual([
      { reason: 'ok', state: 'granted' },
      { reason: 'ok', state: 'denied' },
    ]);
    expect(events.slice(0, 2)).toEqual(['capture:notification', 'capture:web-query']);
  });

  it('keeps input order and repeated entries when work resolves out of order', async () => {
    const resolvers: Array<(state: { state: string }) => void> = [];
    vi.stubGlobal('navigator', {
      permissions: {
        query: () => new Promise((resolve) => resolvers.push(resolve)),
      },
    });
    const result = getPermissionStates(hostWithNotificationGroup({}), ['camera', 'microphone', 'camera']);
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
    const host = hostWithNotificationGroup(
      new Proxy(
        {},
        {
          get() {
            throw new Error('empty batch resolved an owner');
          },
        },
      ),
    );
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

    await expect(getPermissionStates(host, [])).resolves.toEqual([]);
  });

  it('captures the persistence-query owner once and preserves repeated entries and order', async () => {
    const events: string[] = [];
    const second = {
      async getPersistence() {
        events.push('work:second');
        return { outcome: 'persistent' as const, permissionState: 'granted' as const };
      },
    };
    const first = {
      async getPersistence() {
        events.push('work:first');
        active = second;
        return { outcome: 'best-effort' as const, permissionState: null };
      },
    };
    let active = first;
    let ownerReads = 0;
    const storage: object = {};
    Object.defineProperty(storage, 'persistenceQuery', {
      get() {
        ownerReads++;
        events.push('capture:persistence-query');
        return active;
      },
    });
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
      getPermissionStates(hostWithStorageGroup(storage), ['persistent-storage', 'persistent-storage']),
    ).resolves.toEqual([
      { reason: 'best-effort', state: null },
      { reason: 'best-effort', state: null },
    ]);
    expect(ownerReads).toBe(1);
    expect(events).toEqual(['capture:persistence-query', 'work:first', 'work:first']);
  });
});

function hostWithNotificationGroup(notification: object): Host {
  return {
    [EntityRuntimeKey]: undefined,
    accessibility: {},
    app: {},
    clipboard: {},
    connectivity: {},
    dialog: {},
    graphics: {},
    input: {},
    media: {},
    menu: {},
    net: {},
    notification,
    share: {},
    storage: {},
    system: {},
    text: {},
    tray: {},
    ui: {},
    window: {},
  } as unknown as Host;
}

function hostWithStorageGroup(storage: object): Host {
  return {
    [EntityRuntimeKey]: undefined,
    notification: {},
    storage,
  } as unknown as Host;
}

function permissionProvider(
  permission: 'denied' | 'granted',
  events: string[],
  label: string,
  beforeReturn?: () => void,
): object {
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
  };
}
