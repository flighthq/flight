import type { IpcBackend, IpcBackendCapabilities, IpcChannel, IpcSignals } from '@flighthq/types';
import { IpcTimeoutError } from '@flighthq/types';

import {
  createIpcChannel,
  createWebIpcBackend,
  enableIpcSignals,
  getIpcBackend,
  getIpcListenerCount,
  getIpcSignals,
  hasIpcBackend,
  invokeIpc,
  invokeIpcWithTimeout,
  onceIpcMessage,
  onIpcInvoke,
  onIpcMessage,
  onIpcMessageEvent,
  removeAllIpcListeners,
  sendIpcMessage,
  sendIpcMessageTo,
  setIpcBackend,
} from './ipc';

interface FakeIpcBackend extends IpcBackend {
  sent: { channel: string; args: readonly unknown[] }[];
  sentTo: { target: { windowId: number }; channel: string; args: readonly unknown[] }[];
  result: unknown;
  handlers: Map<string, (...args: readonly unknown[]) => unknown | Promise<unknown>>;
  fire: (channel: string, args: readonly unknown[]) => void;
}

function fakeBackend(
  opts: { canSend?: boolean; canInvoke?: boolean; canHandle?: boolean; canTarget?: boolean } = {},
): FakeIpcBackend {
  const { canSend = true, canInvoke = true, canHandle = true, canTarget = true } = opts;

  const listeners = new Map<string, (args: readonly unknown[]) => void>();
  const backend: FakeIpcBackend = {
    sent: [],
    sentTo: [],
    result: undefined,
    handlers: new Map(),
    send(channel, args) {
      this.sent.push({ channel, args });
    },
    invoke(channel, _args) {
      return Promise.resolve(this.result);
    },
    subscribe(channel, listener) {
      listeners.set(channel, listener);
      return () => {
        listeners.delete(channel);
      };
    },
    handle(channel, handler) {
      this.handlers.set(channel, handler);
      return () => {
        this.handlers.delete(channel);
      };
    },
    sendTo(target, channel, args) {
      this.sentTo.push({ target, channel, args });
    },
    getCapabilities(): Readonly<IpcBackendCapabilities> {
      return { canHandle, canInvoke, canSend, canTarget };
    },
    fire(channel, args) {
      listeners.get(channel)?.(args);
    },
  };
  return backend;
}

afterEach(() => {
  setIpcBackend(null);
  removeAllIpcListeners();
});

describe('createIpcChannel', () => {
  it('returns a descriptor with the given name', () => {
    const ch: IpcChannel = createIpcChannel('events.ready');
    expect(ch.name).toBe('events.ready');
  });

  it('accepts IpcChannel descriptors in sendIpcMessage', () => {
    const backend = fakeBackend();
    setIpcBackend(backend);
    const ch = createIpcChannel('log');
    sendIpcMessage(ch, 'hello');
    expect(backend.sent).toEqual([{ channel: 'log', args: ['hello'] }]);
  });

  it('accepts IpcChannel descriptors in onIpcMessage', () => {
    const backend = fakeBackend();
    setIpcBackend(backend);
    const ch = createIpcChannel('event');
    const received: unknown[] = [];
    onIpcMessage(ch, (...args) => received.push(...args));
    backend.fire('event', ['x']);
    expect(received).toEqual(['x']);
  });
});

describe('createWebIpcBackend', () => {
  it('no-ops send, resolves invoke to undefined, returns an inert unsubscribe', async () => {
    const backend = createWebIpcBackend();
    expect(() => backend.send('channel', [1])).not.toThrow();
    expect(await backend.invoke('channel', [])).toBeUndefined();
    expect(typeof backend.subscribe('channel', () => {})).toBe('function');
  });

  it('reports canSend/canInvoke/canHandle/canTarget as false', () => {
    const backend = createWebIpcBackend();
    const caps = backend.getCapabilities!();
    expect(caps.canSend).toBe(false);
    expect(caps.canInvoke).toBe(false);
    expect(caps.canHandle).toBe(false);
    expect(caps.canTarget).toBe(false);
  });
});

describe('enableIpcSignals', () => {
  it('returns an IpcSignals group', () => {
    const signals: IpcSignals = enableIpcSignals();
    expect(signals.onBackendChanged).toBeDefined();
    expect(signals.onChannelMessage).toBeDefined();
  });

  it('returns the same instance on repeated calls', () => {
    const a = enableIpcSignals();
    const b = enableIpcSignals();
    expect(a).toBe(b);
  });

  it('fires onBackendChanged when setIpcBackend is called', () => {
    const signals = enableIpcSignals();
    let fired = 0;
    signals.onBackendChanged.emit = () => {
      fired++;
    };
    setIpcBackend(fakeBackend());
    expect(fired).toBe(1);
    setIpcBackend(null);
    expect(fired).toBe(2);
  });

  it('fires onChannelMessage when a message is received', () => {
    const signals = enableIpcSignals();
    const backend = fakeBackend();
    setIpcBackend(backend);
    const channels: string[] = [];
    signals.onChannelMessage.emit = (ch) => {
      channels.push(ch);
    };
    onIpcMessage('events', () => {});
    backend.fire('events', []);
    expect(channels).toEqual(['events']);
  });

  it('does not emit onChannelMessage at subscribe time, only on delivery', () => {
    const signals = enableIpcSignals();
    const backend = fakeBackend();
    setIpcBackend(backend);
    const channels: string[] = [];
    signals.onChannelMessage.emit = (ch) => {
      channels.push(ch);
    };
    onIpcMessage('events', () => {});
    onIpcMessageEvent('events2', () => {});
    // Registering listeners must not emit; the signal is a per-delivery notification.
    expect(channels).toEqual([]);
    backend.fire('events', []);
    backend.fire('events2', []);
    expect(channels).toEqual(['events', 'events2']);
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

describe('getIpcListenerCount', () => {
  it('returns 0 for an unknown channel', () => {
    expect(getIpcListenerCount('never')).toBe(0);
  });

  it('increments when listeners are added', () => {
    const backend = fakeBackend();
    setIpcBackend(backend);
    onIpcMessage('ch', () => {});
    onIpcMessage('ch', () => {});
    expect(getIpcListenerCount('ch')).toBe(2);
  });

  it('decrements when a listener unsubscribes', () => {
    const backend = fakeBackend();
    setIpcBackend(backend);
    const off = onIpcMessage('ch', () => {});
    expect(getIpcListenerCount('ch')).toBe(1);
    off();
    expect(getIpcListenerCount('ch')).toBe(0);
  });

  it('accepts an IpcChannel descriptor', () => {
    const backend = fakeBackend();
    setIpcBackend(backend);
    const ch = createIpcChannel('typed');
    onIpcMessage(ch, () => {});
    expect(getIpcListenerCount(ch)).toBe(1);
  });
});

describe('getIpcSignals', () => {
  it('returns null before enableIpcSignals is called', async () => {
    // The IpcSignals group is a module-level singleton, so once any test in this suite calls
    // enableIpcSignals the value persists. Re-import the module in isolation to assert the
    // lazy-null contract deterministically: a fresh module has no group until enable is called.
    vi.resetModules();
    const fresh = await import('./ipc');
    expect(fresh.getIpcSignals()).toBeNull();
    // Delivery still works with the group disabled — the emit is guarded, never required.
    const backend = fakeBackend();
    fresh.setIpcBackend(backend);
    const received: unknown[] = [];
    fresh.onIpcMessage('disabled', (...args) => received.push(...args));
    backend.fire('disabled', ['x']);
    expect(received).toEqual(['x']);
    expect(fresh.getIpcSignals()).toBeNull();
    fresh.setIpcBackend(null);
  });

  it('returns the signals object after enableIpcSignals', () => {
    const signals = enableIpcSignals();
    expect(getIpcSignals()).toBe(signals);
  });
});

describe('hasIpcBackend', () => {
  it('returns false before any backend is set', () => {
    expect(hasIpcBackend()).toBe(false);
  });

  it('returns true after setting a native backend', () => {
    setIpcBackend(fakeBackend());
    expect(hasIpcBackend()).toBe(true);
  });

  it('returns false after resetting to null', () => {
    setIpcBackend(fakeBackend());
    setIpcBackend(null);
    expect(hasIpcBackend()).toBe(false);
  });
});

describe('invokeIpc', () => {
  it('passes variadic args as an array and resolves the backend result', async () => {
    const backend = fakeBackend();
    backend.result = 42;
    setIpcBackend(backend);
    expect(await invokeIpc('compute', 1, 2)).toBe(42);
  });

  it('accepts an IpcChannel descriptor', async () => {
    const backend = fakeBackend();
    backend.result = 'ok';
    setIpcBackend(backend);
    expect(await invokeIpc(createIpcChannel('compute'), 1)).toBe('ok');
  });
});

describe('invokeIpcWithTimeout', () => {
  it('resolves when the backend responds before timeout', async () => {
    const backend = fakeBackend();
    backend.result = 99;
    setIpcBackend(backend);
    expect(await invokeIpcWithTimeout('cmd', 1000)).toBe(99);
  });

  it('rejects with IpcTimeoutError when the backend does not respond in time', async () => {
    // Replace invoke with one that never resolves.
    const backend = fakeBackend();
    backend.invoke = (_channel, _args) => new Promise(() => {});
    setIpcBackend(backend);
    await expect(invokeIpcWithTimeout('cmd', 10)).rejects.toBeInstanceOf(IpcTimeoutError);
  });

  it('IpcTimeoutError carries channel and timeoutMs', async () => {
    const backend = fakeBackend();
    backend.invoke = () => new Promise(() => {});
    setIpcBackend(backend);
    let err: IpcTimeoutError | undefined;
    try {
      await invokeIpcWithTimeout('slow-channel', 5);
    } catch (e) {
      err = e as IpcTimeoutError;
    }
    expect(err?.channel).toBe('slow-channel');
    expect(err?.timeoutMs).toBe(5);
  });
});

describe('onceIpcMessage', () => {
  it('auto-unsubscribes after the first message', () => {
    const backend = fakeBackend();
    setIpcBackend(backend);
    const received: unknown[] = [];
    onceIpcMessage('ping', (...args) => received.push(...args));
    backend.fire('ping', ['first']);
    backend.fire('ping', ['second']);
    expect(received).toEqual(['first']);
  });

  it('can be manually unsubscribed before the message fires', () => {
    const backend = fakeBackend();
    setIpcBackend(backend);
    const received: unknown[] = [];
    const off = onceIpcMessage('ping', () => received.push('fired'));
    off();
    backend.fire('ping', []);
    expect(received).toHaveLength(0);
  });
});

describe('onIpcInvoke', () => {
  it('registers a handler via backend.handle', async () => {
    const backend = fakeBackend();
    setIpcBackend(backend);
    onIpcInvoke('compute', (...args) => (args[0] as number) * 2);
    expect(backend.handlers.has('compute')).toBe(true);
  });

  it('returns an inert unsubscribe when backend has no handle method', () => {
    const backend = fakeBackend();
    // Remove optional handle method.
    delete (backend as Partial<FakeIpcBackend>).handle;
    setIpcBackend(backend);
    const off = onIpcInvoke('compute', () => {});
    expect(typeof off).toBe('function');
    expect(() => off()).not.toThrow();
  });

  it('unregisters the handler when unsubscribe is called', () => {
    const backend = fakeBackend();
    setIpcBackend(backend);
    const off = onIpcInvoke('compute', () => {});
    off();
    expect(backend.handlers.has('compute')).toBe(false);
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

  it('tracks listener count correctly', () => {
    const backend = fakeBackend();
    setIpcBackend(backend);
    expect(getIpcListenerCount('evt')).toBe(0);
    const off = onIpcMessage('evt', () => {});
    expect(getIpcListenerCount('evt')).toBe(1);
    off();
    expect(getIpcListenerCount('evt')).toBe(0);
  });
});

describe('onIpcMessageEvent', () => {
  it('delivers an IpcMessageEvent with channel, senderId -1, and args', () => {
    const backend = fakeBackend();
    setIpcBackend(backend);
    const events: Array<{ channel: string; senderId: number; args: readonly unknown[] }> = [];
    const off = onIpcMessageEvent('ch', (ev) =>
      events.push({ channel: ev.channel, senderId: ev.senderId, args: ev.args }),
    );
    backend.fire('ch', ['hello', 42]);
    expect(events).toEqual([{ channel: 'ch', senderId: -1, args: ['hello', 42] }]);
    off();
  });

  it('reply is a no-op when senderId is -1, even with a sendTo-capable backend', () => {
    // No backend surfaces sender identity yet, so senderId is permanently -1 and reply must
    // early-return before touching backend.sendTo. Use a sendTo-capable fake to prove the gate
    // is on senderId, not method presence: a reply still produces zero outbound sends. This pins
    // the forward-compatible contract until a backend supplies a real senderId.
    const backend = fakeBackend();
    setIpcBackend(backend);
    let observedSenderId: number | undefined;
    const off = onIpcMessageEvent('ch', (ev) => {
      observedSenderId = ev.senderId;
      ev.reply('pong');
    });
    backend.fire('ch', []);
    expect(observedSenderId).toBe(-1);
    expect(typeof backend.sendTo).toBe('function');
    expect(backend.sentTo).toHaveLength(0);
    off();
  });

  it('tracks listener count and unsubscribes correctly', () => {
    const backend = fakeBackend();
    setIpcBackend(backend);
    const off = onIpcMessageEvent('ch2', () => {});
    expect(getIpcListenerCount('ch2')).toBe(1);
    off();
    expect(getIpcListenerCount('ch2')).toBe(0);
  });
});

describe('removeAllIpcListeners', () => {
  it('removes all listeners for a specific channel', () => {
    const backend = fakeBackend();
    setIpcBackend(backend);
    const received: string[] = [];
    onIpcMessage('a', () => received.push('a1'));
    onIpcMessage('a', () => received.push('a2'));
    onIpcMessage('b', () => received.push('b1'));
    removeAllIpcListeners('a');
    backend.fire('a', []);
    backend.fire('b', []);
    // 'a' listeners removed, 'b' still active.
    expect(received).toEqual(['b1']);
  });

  it('removes all listeners for all channels when omitted', () => {
    const backend = fakeBackend();
    setIpcBackend(backend);
    const received: string[] = [];
    onIpcMessage('a', () => received.push('a'));
    onIpcMessage('b', () => received.push('b'));
    removeAllIpcListeners();
    backend.fire('a', []);
    backend.fire('b', []);
    expect(received).toHaveLength(0);
  });

  it('accepts an IpcChannel descriptor', () => {
    const backend = fakeBackend();
    setIpcBackend(backend);
    const ch = createIpcChannel('typed');
    const received: number[] = [];
    onIpcMessage(ch, () => received.push(1));
    removeAllIpcListeners(ch);
    backend.fire('typed', []);
    expect(received).toHaveLength(0);
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

describe('sendIpcMessageTo', () => {
  it('forwards target, channel, and args to backend.sendTo', () => {
    const backend = fakeBackend();
    setIpcBackend(backend);
    sendIpcMessageTo({ windowId: 3 }, 'log', 'hello');
    expect(backend.sentTo).toEqual([{ target: { windowId: 3 }, channel: 'log', args: ['hello'] }]);
  });

  it('no-ops when backend has no sendTo method', () => {
    const backend = fakeBackend();
    delete (backend as Partial<FakeIpcBackend>).sendTo;
    setIpcBackend(backend);
    expect(() => sendIpcMessageTo({ windowId: 1 }, 'log', 'hi')).not.toThrow();
  });
});

describe('setIpcBackend', () => {
  it('clears back to the web fallback when passed null', () => {
    setIpcBackend(fakeBackend());
    setIpcBackend(null);
    expect(getIpcBackend()).not.toBeNull();
  });
});
