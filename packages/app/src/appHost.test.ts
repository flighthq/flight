import { createEntity } from '@flighthq/entity/contract';
import { connectSignal } from '@flighthq/signals/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it, vi } from 'vitest';

import { attachApp, createApp, focusApp, getAppName, quitApp, setAppBadgeCount } from './app';
import * as appContract from './contract';

describe('app explicit Host ownership', () => {
  it('delegates commands and queries only through the selected Host slots', () => {
    const focus = vi.fn();
    const getName = vi.fn(() => 'Explicit App');
    const quit = vi.fn();
    const setBadgeCount = vi.fn(() => true);
    const host = {
      app: {
        badge: createEntity({ setBadgeCount }),
        focus: createEntity({ focus }),
        name: createEntity({ getName }),
        quit: createEntity({ quit }),
      },
    };

    Reflect.apply(focusApp, undefined, [host]);
    expect(Reflect.apply(getAppName, undefined, [host])).toBe('Explicit App');
    Reflect.apply(quitApp, undefined, [host]);
    expect(Reflect.apply(setAppBadgeCount, undefined, [host, 3])).toBe(true);

    expect(focus).toHaveBeenCalledOnce();
    expect(getName).toHaveBeenCalledOnce();
    expect(quit).toHaveBeenCalledOnce();
    expect(setBadgeCount).toHaveBeenCalledExactlyOnceWith(3);
  });

  it('takes event providers from Host and publishes an Entity', () => {
    const listeners: { ready?: () => void } = {};
    const subscribe = vi.fn((listener: () => void) => {
      listeners.ready = listener;
      return vi.fn();
    });
    const inert = createEntity({ subscribe: () => vi.fn() });
    const host = {
      app: {
        activate: inert,
        allWindowsClosed: inert,
        openFile: inert,
        quitRequest: inert,
        ready: createEntity({ subscribe }),
        secondInstance: inert,
      },
    };
    const app = createApp();
    let readyCount = 0;
    connectSignal(app.onReady, () => readyCount++);

    Reflect.apply(attachApp, undefined, [host, app]);
    listeners.ready?.();

    expect(subscribe).toHaveBeenCalledOnce();
    expect(readyCount).toBe(1);
    expect(EntityRuntimeKey in app).toBe(true);
  });

  it('deletes the ambient resolver family instead of retaining a parallel API', () => {
    expect(appContract).not.toHaveProperty('explainAppBackend');
    expect(appContract).not.toHaveProperty('getAppBackend');
    expect(appContract).not.toHaveProperty('installAppHostBackend');
    expect(appContract).not.toHaveProperty('observeAppHostResult');
    expect(appContract).not.toHaveProperty('resetAppBackendForTest');
    expect(appContract).not.toHaveProperty('setAppBackend');
  });
});
