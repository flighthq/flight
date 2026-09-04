import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityWithoutRuntime,
  HasIpcHandle,
  HasIpcInvoke,
  HasIpcMessage,
  HasIpcSend,
  HasIpcTargetedSend,
  IpcHandleBackend,
  IpcInvokeBackend,
  IpcMessageBackend,
  IpcSendBackend,
  IpcTargetedSendBackend,
} from '@flighthq/types/contract';

import { invokeIpc, onIpcInvoke, onIpcMessage, onceIpcMessage, sendIpcMessage, sendIpcMessageTo } from './ipc';

// A host carrying a recording message provider. Nothing installs anywhere, so two hosts can be live at
// once — the property the ambient seam could not express.
function messageHost(): HasIpcMessage & {
  deliver(channel: string, ...args: readonly unknown[]): void;
  subscriberCount(channel: string): number;
} {
  const channels = new Map<string, Set<(args: readonly unknown[]) => void>>();
  return {
    deliver(channel: string, ...args: readonly unknown[]): void {
      for (const listener of [...(channels.get(channel) ?? [])]) listener(args);
    },
    ipc: {
      message: (() => {
        const out = allocateEntity<any>();
        out.subscribe = (channel: string, listener: (args: readonly unknown[]) => void): (() => void) => {
          const set = channels.get(channel) ?? new Set();
          channels.set(channel, set);
          set.add(listener);
          return () => set.delete(listener);
        };
        return finishEntity(out);
      })(),
    },
    subscriberCount(channel: string): number {
      return channels.get(channel)?.size ?? 0;
    },
  };
}

interface TestIpcTarget {
  readonly id: number;
}

function operationHost(): HasIpcHandle &
  HasIpcInvoke &
  HasIpcSend &
  HasIpcTargetedSend<TestIpcTarget> & {
    readonly handlers: Map<string, (...args: readonly unknown[]) => unknown | Promise<unknown>>;
    readonly invocations: Array<{ readonly args: readonly unknown[]; readonly channel: string }>;
    readonly sent: Array<{ readonly args: readonly unknown[]; readonly channel: string }>;
    readonly sentTo: Array<{
      readonly args: readonly unknown[];
      readonly channel: string;
      readonly target: TestIpcTarget;
    }>;
  } {
  const handlers = new Map<string, (...args: readonly unknown[]) => unknown | Promise<unknown>>();
  const invocations: Array<{ readonly args: readonly unknown[]; readonly channel: string }> = [];
  const sent: Array<{ readonly args: readonly unknown[]; readonly channel: string }> = [];
  const sentTo: Array<{
    readonly args: readonly unknown[];
    readonly channel: string;
    readonly target: TestIpcTarget;
  }> = [];
  return {
    handlers,
    invocations,
    ipc: {
      handle: (() => {
        const out = allocateEntity<IpcHandleBackend>();
        out.handle = (channel: string, handler: (...args: readonly unknown[]) => unknown | Promise<unknown>) => {
          handlers.set(channel, handler);
          return () => {
            if (handlers.get(channel) === handler) handlers.delete(channel);
          };
        };
        return finishEntity(out);
      })(),
      invoke: (() => {
        const out = allocateEntity<IpcInvokeBackend>();
        out.invoke = (channel: string, args: readonly unknown[]) => {
          invocations.push({ args, channel });
          return Promise.resolve({ args, channel });
        };
        return finishEntity(out);
      })(),
      send: (() => {
        const out = allocateEntity<IpcSendBackend>();
        out.send = (channel: string, args: readonly unknown[]) => {
          sent.push({ args, channel });
        };
        return finishEntity(out);
      })(),
      targetedSend: (() => {
        const out = allocateEntity<IpcTargetedSendBackend<TestIpcTarget>>();
        out.send = (target: TestIpcTarget, channel: string, args: readonly unknown[]) => {
          sentTo.push({ args, channel, target });
        };
        return finishEntity(out);
      })(),
    },
    sent,
    sentTo,
  };
}

describe('invokeIpc', () => {
  it('requires the invoke capability and returns its response', async () => {
    expectTypeOf(invokeIpc).parameter(0).toEqualTypeOf<HasIpcInvoke>();
    const host = operationHost();

    const response = await invokeIpc(host, 'compute', 1, 2);

    expect(response).toEqual({ args: [1, 2], channel: 'compute' });
    expect(host.invocations).toEqual([{ args: [1, 2], channel: 'compute' }]);
  });
});

describe('onceIpcMessage', () => {
  it('delivers the first message and then releases the subscription', () => {
    const host = messageHost();
    const seen: (readonly unknown[])[] = [];
    onceIpcMessage(host, 'ping', (...args) => seen.push(args));
    host.deliver('ping', 1);
    host.deliver('ping', 2);
    expect(seen).toEqual([[1]]);
    expect(host.subscriberCount('ping')).toBe(0);
  });

  // A caller that never receives a message must still be able to stop listening.
  it('returns an unsubscribe that works before any message arrives', () => {
    const host = messageHost();
    let count = 0;
    const stop = onceIpcMessage(host, 'ping', () => count++);
    stop();
    expect(host.subscriberCount('ping')).toBe(0);
    host.deliver('ping');
    expect(count).toBe(0);
  });

  it('releases exactly once across repeated stop calls', () => {
    let releases = 0;
    const host: HasIpcMessage = {
      ipc: {
        message: (() => {
          const out = allocateEntity<any>();
          out.subscribe = (): (() => void) => {
            return () => releases++;
          };
          return finishEntity(out);
        })(),
      },
    };
    const stop = onceIpcMessage(host, 'ping', () => {});
    stop();
    stop();
    expect(releases).toBe(1);
  });

  // ★ ACQUISITION RACE: a provider that delivers synchronously DURING subscribe returns its unsubscribe
  // only afterwards. Without the guard the subscription would leak, because release ran before there was
  // anything to release.
  it('releases even when the provider delivers during subscribe', () => {
    let released = false;
    const host: HasIpcMessage = {
      ipc: {
        message: (() => {
          const out = allocateEntity<IpcMessageBackend>();
          out.subscribe = (_channel: string, listener: (args: readonly unknown[]) => void): (() => void) => {
            listener([42]);
            return () => (released = true);
          };
          return finishEntity(out);
        })(),
      },
    };
    const seen: (readonly unknown[])[] = [];
    onceIpcMessage(host, 'ping', (...args) => seen.push(args));
    expect(seen).toEqual([[42]]);
    expect(released).toBe(true);
  });
});

describe('onIpcInvoke', () => {
  it('requires the handle capability, spreads arguments, and returns its release', async () => {
    expectTypeOf(onIpcInvoke).parameter(0).toEqualTypeOf<HasIpcHandle>();
    const host = operationHost();
    const stop = onIpcInvoke(host, 'double', (value) => (value as number) * 2);

    expect(await host.handlers.get('double')?.(4)).toBe(8);

    stop();
    expect(host.handlers.has('double')).toBe(false);
  });
});

describe('onIpcMessage', () => {
  it('delivers every message on its channel with the sent arguments', () => {
    const host = messageHost();
    const seen: (readonly unknown[])[] = [];
    onIpcMessage(host, 'ping', (...args) => seen.push(args));
    host.deliver('ping', 1, 'two');
    host.deliver('ping', 3);
    expect(seen).toEqual([[1, 'two'], [3]]);
  });

  it('delivers only its own channel', () => {
    const host = messageHost();
    let count = 0;
    onIpcMessage(host, 'wanted', () => count++);
    host.deliver('other', 1);
    expect(count).toBe(0);
  });

  // ★ ORIGIN-PINNED: releasing one listener must not disturb another on the SAME channel.
  it('unsubscribes exactly its own subscription', () => {
    const host = messageHost();
    const kept: unknown[] = [];
    const stopDropped = onIpcMessage(host, 'shared', () => kept.push('dropped'));
    onIpcMessage(host, 'shared', () => kept.push('kept'));
    stopDropped();
    host.deliver('shared');
    expect(kept).toEqual(['kept']);
    expect(host.subscriberCount('shared')).toBe(1);
  });

  // ★ Two hosts live at once, each serving its own subscription. Unwritable under the ambient seam,
  // which had exactly one answer per process.
  it('routes each subscription to the host it was given', () => {
    const first = messageHost();
    const second = messageHost();
    const seen: string[] = [];
    onIpcMessage(first, 'c', () => seen.push('first'));
    onIpcMessage(second, 'c', () => seen.push('second'));
    second.deliver('c');
    first.deliver('c');
    expect(seen).toEqual(['second', 'first']);
  });
});

describe('sendIpcMessage', () => {
  it('requires the send capability and forwards the arguments', () => {
    expectTypeOf(sendIpcMessage).parameter(0).toEqualTypeOf<HasIpcSend>();
    const host = operationHost();

    sendIpcMessage(host, 'log', 'hello', 7);

    expect(host.sent).toEqual([{ args: ['hello', 7], channel: 'log' }]);
  });
});

describe('sendIpcMessageTo', () => {
  it('requires a capability for the target type and forwards that target unchanged', () => {
    expectTypeOf(sendIpcMessageTo<TestIpcTarget>)
      .parameter(0)
      .toEqualTypeOf<HasIpcTargetedSend<TestIpcTarget>>();
    const host = operationHost();
    const target = { id: 7 };

    sendIpcMessageTo(host, target, 'log', 'hello');

    expect(host.sentTo).toEqual([{ args: ['hello'], channel: 'log', target }]);
    expect(host.sentTo[0].target).toBe(target);
  });
});
