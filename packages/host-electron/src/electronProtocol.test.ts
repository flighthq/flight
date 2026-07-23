import type { ElectronApi } from '@flighthq/types';

import { createElectronProtocolBackend } from './electronProtocol';

function fakeElectron(): {
  electron: ElectronApi;
  listeners: Map<string, ((...args: unknown[]) => void)[]>;
  registered: Set<string>;
} {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  const registered = new Set<string>();
  const electron = {
    app: {
      setAsDefaultProtocolClient: (scheme: string) => {
        registered.add(scheme);
        return true;
      },
      removeAsDefaultProtocolClient: (scheme: string) => {
        registered.delete(scheme);
        return true;
      },
      isDefaultProtocolClient: (scheme: string) => registered.has(scheme),
      on: (event: string, listener: (...args: unknown[]) => void) => {
        const list = listeners.get(event) ?? [];
        list.push(listener);
        listeners.set(event, list);
      },
      removeListener: (event: string, listener: (...args: unknown[]) => void) => {
        const list = listeners.get(event) ?? [];
        listeners.set(
          event,
          list.filter((l) => l !== listener),
        );
      },
    },
  } as unknown as ElectronApi;
  return { electron, listeners, registered };
}

describe('createElectronProtocolBackend', () => {
  it('registers, queries, and unregisters a scheme', () => {
    const fake = fakeElectron();
    const backend = createElectronProtocolBackend(fake.electron);
    expect(backend.isRegistered('flight')).toBe(false);
    expect(backend.register('flight')).toBe(true);
    expect(backend.isRegistered('flight')).toBe(true);
    expect(backend.setAsDefault('flight')).toBe(true);
    expect(backend.unregister('flight')).toBe(true);
    expect(backend.isRegistered('flight')).toBe(false);
  });

  it('adapts the open-url event and unsubscribes', () => {
    const fake = fakeElectron();
    const backend = createElectronProtocolBackend(fake.electron);
    let url = '';
    const off = backend.subscribe((next) => {
      url = next;
    });
    for (const l of fake.listeners.get('open-url') ?? []) l({}, 'flight://open');
    expect(url).toBe('flight://open');
    off();
    expect(fake.listeners.get('open-url')).toHaveLength(0);
  });
});
