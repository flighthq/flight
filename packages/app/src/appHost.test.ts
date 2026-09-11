import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { connectSignal } from '@flighthq/signals/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it, vi } from 'vitest';

import { attachApp, createApp, focusApp, getAppName, quitApp, setAppBadgeCount } from './app';
import * as appContract from './contract';

describe('app explicit Host ownership', () => {
  it('delegates commands and queries only through the selected direct providers', async () => {
    const focus = vi.fn();
    const getName = vi.fn(() => 'Explicit App');
    const quit = vi.fn();
    const setBadgeCount = vi.fn(async () => true);
    const hostAppBadge = (() => {
      const out = allocateEntity<any>();
      out.setBadgeCount = setBadgeCount;
      return finishEntity(out);
    })();
    const hostAppFocus = (() => {
      const out = allocateEntity<any>();
      out.focus = focus;
      return finishEntity(out);
    })();
    const hostAppName = (() => {
      const out = allocateEntity<any>();
      out.getName = getName;
      return finishEntity(out);
    })();
    const hostAppQuit = (() => {
      const out = allocateEntity<any>();
      out.quit = quit;
      return finishEntity(out);
    })();

    focusApp(hostAppFocus);
    expect(getAppName(hostAppName)).toBe('Explicit App');
    quitApp(hostAppQuit);
    await expect(setAppBadgeCount(hostAppBadge, 3)).resolves.toBe(true);

    expect(focus).toHaveBeenCalledOnce();
    expect(getName).toHaveBeenCalledOnce();
    expect(quit).toHaveBeenCalledOnce();
    expect(setBadgeCount).toHaveBeenCalledExactlyOnceWith(3);
  });

  it('takes event providers directly and publishes an Entity', () => {
    const listeners: { ready?: () => void } = {};
    const subscribe = vi.fn((listener: () => void) => {
      listeners.ready = listener;
      return vi.fn();
    });
    const inert = (() => {
      const out = allocateEntity<any>();
      out.subscribe = () => vi.fn();
      return finishEntity(out);
    })();
    const hostAppReady = (() => {
      const out = allocateEntity<any>();
      out.subscribe = subscribe;
      return finishEntity(out);
    })();
    const app = createApp();
    let readyCount = 0;
    connectSignal(app.onReady, () => readyCount++);

    attachApp(inert, inert, inert, inert, hostAppReady, inert, app);
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
