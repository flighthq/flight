import type { ElectronApi } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  electronHostProtocol,
  electronHostProtocolDefault,
  electronHostProtocolOpen,
  electronHostProtocolRegistration,
  electronHostProtocolRegistrationQuery,
  electronHostProtocolUnregistration,
  populateElectronHostProtocol,
  populateElectronHostProtocolDefault,
  populateElectronHostProtocolOpen,
  populateElectronHostProtocolRegistration,
  populateElectronHostProtocolRegistrationQuery,
  populateElectronHostProtocolUnregistration,
} from './electronProtocol.ts';

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

describe('electronHostProtocol', () => {
  it('publishes five exact protocol slots', () => {
    const protocol = electronHostProtocol(fakeElectron().electron);
    expect(Object.keys(protocol).sort()).toEqual([
      'default',
      'open',
      'registration',
      'registrationQuery',
      'unregistration',
    ]);
  });

  it('registers, queries, enumerates, defaults, and unregisters a scheme', () => {
    const protocol = electronHostProtocol(fakeElectron().electron);
    expect(protocol.registrationQuery.isRegistered('flight')).toBe(false);
    expect(protocol.registration.register('flight')).toBe(true);
    expect(protocol.registration.getRegisteredSchemes()).toEqual(['flight']);
    expect(protocol.default.isDefault('flight')).toBe(true);
    expect(protocol.unregistration.unregister('flight')).toBe(true);
    expect(protocol.registrationQuery.isRegistered('flight')).toBe(false);
  });

  it('adapts the open-url event and unsubscribes', () => {
    const fake = fakeElectron();
    const protocol = electronHostProtocol(fake.electron);
    let url = '';
    const off = protocol.open.subscribe((next) => (url = next));
    for (const listener of fake.listeners.get('open-url') ?? []) listener({}, 'flight://open');
    expect(url).toBe('flight://open');
    off();
    expect(fake.listeners.get('open-url')).toHaveLength(0);
  });
});

describe('electronHostProtocolDefault', () => {
  it('constructs a protocol default provider', () => {
    expect(electronHostProtocolDefault(fakeElectron().electron)).toBeDefined();
  });
});

describe('electronHostProtocolOpen', () => {
  it('constructs a protocol open provider', () => {
    expect(electronHostProtocolOpen(fakeElectron().electron)).toBeDefined();
  });
});

describe('electronHostProtocolRegistration', () => {
  it('constructs a protocol registration provider', () => {
    expect(electronHostProtocolRegistration(fakeElectron().electron)).toBeDefined();
  });
});

describe('electronHostProtocolRegistrationQuery', () => {
  it('constructs a protocol registration query provider', () => {
    expect(electronHostProtocolRegistrationQuery(fakeElectron().electron)).toBeDefined();
  });
});

describe('electronHostProtocolUnregistration', () => {
  it('constructs a protocol unregistration provider', () => {
    expect(electronHostProtocolUnregistration(fakeElectron().electron)).toBeDefined();
  });
});

describe('populateElectronHostProtocol', () => {
  it('is the construction initializer of electronHostProtocol', () => {
    expect(typeof populateElectronHostProtocol).toBe('function');
  });
});

describe('populateElectronHostProtocolDefault', () => {
  it('is the construction initializer of electronHostProtocolDefault', () => {
    expect(typeof populateElectronHostProtocolDefault).toBe('function');
  });
});

describe('populateElectronHostProtocolOpen', () => {
  it('is the construction initializer of electronHostProtocolOpen', () => {
    expect(typeof populateElectronHostProtocolOpen).toBe('function');
  });
});

describe('populateElectronHostProtocolRegistration', () => {
  it('is the construction initializer of electronHostProtocolRegistration', () => {
    expect(typeof populateElectronHostProtocolRegistration).toBe('function');
  });
});

describe('populateElectronHostProtocolRegistrationQuery', () => {
  it('is the construction initializer of electronHostProtocolRegistrationQuery', () => {
    expect(typeof populateElectronHostProtocolRegistrationQuery).toBe('function');
  });
});

describe('populateElectronHostProtocolUnregistration', () => {
  it('is the construction initializer of electronHostProtocolUnregistration', () => {
    expect(typeof populateElectronHostProtocolUnregistration).toBe('function');
  });
});
