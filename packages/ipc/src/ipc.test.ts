import type { IpcBackend } from '@flighthq/types';

import { createWebIpcBackend, getIpcBackend, invokeIpc, onIpcMessage, sendIpcMessage, setIpcBackend } from './ipc';

interface FakeIpcBackend extends IpcBackend {
  sent: { channel: string; args: readonly unknown[] }[];
  result: unknown;
  fire: (channel: string, args: readonly unknown[]) => void;
}

function fakeBackend(): FakeIpcBackend {
  const listeners = new Map<string, (args: readonly unknown[]) => void>();
  return {
    sent: [],
    result: undefined,
    send(channel, args) {
      this.sent.push({ channel, args });
    },
    invoke(_channel, _args) {
      return Promise.resolve(this.result);
    },
    subscribe(channel, listener) {
      listeners.set(channel, listener);
      return () => {
        listeners.delete(channel);
      };
    },
    fire(channel, args) {
      listeners.get(channel)?.(args);
    },
  };
}

afterEach(() => setIpcBackend(null));

describe('createWebIpcBackend', () => {
  it('no-ops send, resolves invoke to undefined, returns an inert unsubscribe', async () => {
    const backend = createWebIpcBackend();
    expect(() => backend.send('channel', [1])).not.toThrow();
    expect(await backend.invoke('channel', [])).toBeUndefined();
    expect(typeof backend.subscribe('channel', () => {})).toBe('function');
  });
});

describe('getIpcBackend', () => {
  it('falls back to a web backend', () => {
    expect(getIpcBackend()).not.toBeNull();
  });

  it('returns the registered backend', () => {
    const backend = fakeBackend();
    setIpcBackend(backend);
    expect(getIpcBackend()).toBe(backend);
  });
});

describe('invokeIpc', () => {
  it('passes variadic args as an array and resolves the backend result', async () => {
    const backend = fakeBackend();
    backend.result = 42;
    setIpcBackend(backend);
    expect(await invokeIpc('compute', 1, 2)).toBe(42);
  });
});

describe('onIpcMessage', () => {
  it('spreads incoming args to the listener and unsubscribes', () => {
    const backend = fakeBackend();
    setIpcBackend(backend);
    const received: unknown[] = [];
    const unsubscribe = onIpcMessage('event', (...args) => received.push(args));
    backend.fire('event', ['a', 'b']);
    expect(received).toEqual([['a', 'b']]);
    unsubscribe();
    backend.fire('event', ['c']);
    expect(received).toEqual([['a', 'b']]);
  });
});

describe('sendIpcMessage', () => {
  it('forwards channel and args array to the backend', () => {
    const backend = fakeBackend();
    setIpcBackend(backend);
    sendIpcMessage('log', 'hi', 7);
    expect(backend.sent).toEqual([{ channel: 'log', args: ['hi', 7] }]);
  });
});

describe('setIpcBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setIpcBackend(fakeBackend());
    setIpcBackend(null);
    expect(getIpcBackend()).not.toBeNull();
  });
});
