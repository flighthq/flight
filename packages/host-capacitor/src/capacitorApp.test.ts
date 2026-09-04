import type { CapacitorApi } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  createCapacitorAppCapabilities,
  initializeCapacitorAndroidAppCapabilities,
  initializeCapacitorCommonAppCapabilities,
} from './capacitorApp';

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

function fakeCapacitor() {
  const calls: string[] = [];
  const listeners = new Map<string, (payload: { isActive: boolean }) => void>();
  const capacitor = {
    app: {
      addListener: async (eventName: string, listener: (payload: { isActive: boolean }) => void) => {
        listeners.set(eventName, listener);
        return {
          async remove() {
            calls.push(`remove:${eventName}`);
          },
        };
      },
      exitApp: async () => {
        calls.push('exitApp');
      },
      getInfo: async () => ({ build: '42', id: 'com.flight.app', name: 'FlightApp', version: '2.3.4' }),
      minimizeApp: async () => {
        calls.push('minimizeApp');
      },
    },
  } as unknown as CapacitorApi;
  return { calls, capacitor, listeners };
}

describe('createCapacitorAppCapabilities', () => {
  it('publishes common activation and identity slots on iOS', () => {
    const app = createCapacitorAppCapabilities(fakeCapacitor().capacitor, 'ios');
    expect(EntityRuntimeKey in app).toBe(true);
    expect(Object.keys(app).sort()).toEqual(['activate', 'name', 'version']);
    for (const provider of Object.values(app)) expect(EntityRuntimeKey in provider).toBe(true);
  });

  it('adds Android-only hide and quit slots', async () => {
    const { calls, capacitor } = fakeCapacitor();
    const app = createCapacitorAppCapabilities(capacitor, 'android');
    expect(Object.keys(app).sort()).toEqual(['activate', 'hide', 'name', 'quit', 'version']);
    app.hide.hideApp();
    app.quit.quit();
    await flush();
    expect(calls).toEqual(['minimizeApp', 'exitApp']);
  });

  it('serves name and version from the construction-time prefetch', async () => {
    const app = createCapacitorAppCapabilities(fakeCapacitor().capacitor, 'ios');
    expect(app.name.getName()).toBe('');
    await flush();
    expect(app.name.getName()).toBe('FlightApp');
    expect(app.version.getVersion()).toBe('2.3.4');
  });

  it('translates active app-state changes and removes the listener', async () => {
    const { calls, capacitor, listeners } = fakeCapacitor();
    const app = createCapacitorAppCapabilities(capacitor, 'ios');
    let activated = 0;
    const off = app.activate.subscribe(() => activated++);
    await flush();
    listeners.get('appStateChange')?.({ isActive: false });
    listeners.get('appStateChange')?.({ isActive: true });
    expect(activated).toBe(1);
    off();
    await flush();
    expect(calls).toEqual(['remove:appStateChange']);
  });
});
describe('initializeCapacitorAndroidAppCapabilities', () => {
  it('is the construction initializer of createCapacitorAndroidAppCapabilities', () => {
    expect(typeof initializeCapacitorAndroidAppCapabilities).toBe('function');
  });
});

describe('initializeCapacitorCommonAppCapabilities', () => {
  it('is the construction initializer of createCapacitorCommonAppCapabilities', () => {
    expect(typeof initializeCapacitorCommonAppCapabilities).toBe('function');
  });
});
