import type { ElectronApi } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  createElectronProtocolCapabilities,
  initializeElectronProtocolCapabilities,
  initializeProtocolDefaultBackend,
  initializeProtocolOpenBackend,
  initializeProtocolRegistrationBackend,
  initializeProtocolRegistrationQueryBackend,
  initializeProtocolUnregistrationBackend,
} from './electronProtocol';

function fakeElectron() {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  const registered = new Set<string>();
  const electron = {
    app: {
      isDefaultProtocolClient: (scheme: string) => registered.has(scheme),
      on: (event: string, listener: (...args: unknown[]) => void) => {
        const list = listeners.get(event) ?? [];
        list.push(listener);
        listeners.set(event, list);
      },
      removeAsDefaultProtocolClient: (scheme: string) => (registered.delete(scheme), true),
      removeListener: (event: string, listener: (...args: unknown[]) => void) => {
        listeners.set(
          event,
          (listeners.get(event) ?? []).filter((candidate) => candidate !== listener),
        );
      },
      setAsDefaultProtocolClient: (scheme: string) => (registered.add(scheme), true),
    },
  } as unknown as ElectronApi;
  return { electron, listeners };
}

describe('createElectronProtocolCapabilities', () => {
  it('publishes five exact Entity-backed protocol slots', () => {
    const protocol = createElectronProtocolCapabilities(fakeElectron().electron);
    expect(EntityRuntimeKey in protocol).toBe(true);
    expect(Object.keys(protocol).sort()).toEqual([
      'default',
      'open',
      'registration',
      'registrationQuery',
      'unregistration',
    ]);
    for (const provider of Object.values(protocol)) expect(EntityRuntimeKey in provider).toBe(true);
  });

  it('registers, queries, enumerates, defaults, and unregisters a scheme', () => {
    const protocol = createElectronProtocolCapabilities(fakeElectron().electron);
    expect(protocol.registrationQuery.isRegistered('flight')).toBe(false);
    expect(protocol.registration.register('flight')).toBe(true);
    expect(protocol.registration.getRegisteredSchemes()).toEqual(['flight']);
    expect(protocol.default.isDefault('flight')).toBe(true);
    expect(protocol.unregistration.unregister('flight')).toBe(true);
    expect(protocol.registrationQuery.isRegistered('flight')).toBe(false);
  });

  it('adapts the open-url event and unsubscribes', () => {
    const fake = fakeElectron();
    const protocol = createElectronProtocolCapabilities(fake.electron);
    let url = '';
    const off = protocol.open.subscribe((next) => (url = next));
    for (const listener of fake.listeners.get('open-url') ?? []) listener({}, 'flight://open');
    expect(url).toBe('flight://open');
    off();
    expect(fake.listeners.get('open-url')).toHaveLength(0);
  });
});
describe('initializeElectronProtocolCapabilities', () => {
  it('is the construction initializer of createElectronProtocolCapabilities', () => {
    expect(typeof initializeElectronProtocolCapabilities).toBe('function');
  });
});

describe('initializeProtocolDefaultBackend', () => {
  it('is the construction initializer of createProtocolDefaultBackend', () => {
    expect(typeof initializeProtocolDefaultBackend).toBe('function');
  });
});

describe('initializeProtocolOpenBackend', () => {
  it('is the construction initializer of createProtocolOpenBackend', () => {
    expect(typeof initializeProtocolOpenBackend).toBe('function');
  });
});

describe('initializeProtocolRegistrationBackend', () => {
  it('is the construction initializer of createProtocolRegistrationBackend', () => {
    expect(typeof initializeProtocolRegistrationBackend).toBe('function');
  });
});

describe('initializeProtocolRegistrationQueryBackend', () => {
  it('is the construction initializer of createProtocolRegistrationQueryBackend', () => {
    expect(typeof initializeProtocolRegistrationQueryBackend).toBe('function');
  });
});

describe('initializeProtocolUnregistrationBackend', () => {
  it('is the construction initializer of createProtocolUnregistrationBackend', () => {
    expect(typeof initializeProtocolUnregistrationBackend).toBe('function');
  });
});
