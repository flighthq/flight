import { createEntity } from '@flighthq/entity/contract';
import type { EntityWithoutRuntime, HasIpcMessage, IpcMessageBackend } from '@flighthq/types/contract';

import { onIpcMessage, onceIpcMessage } from './ipc';

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
      message: createEntity<EntityWithoutRuntime<IpcMessageBackend>>({
        subscribe(channel: string, listener: (args: readonly unknown[]) => void): () => void {
          const set = channels.get(channel) ?? new Set();
          channels.set(channel, set);
          set.add(listener);
          return () => set.delete(listener);
        },
      }),
    },
    subscriberCount(channel: string): number {
      return channels.get(channel)?.size ?? 0;
    },
  };
}

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
        message: createEntity<EntityWithoutRuntime<IpcMessageBackend>>({
          subscribe(): () => void {
            return () => releases++;
          },
        }),
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
        message: createEntity<EntityWithoutRuntime<IpcMessageBackend>>({
          subscribe(_channel, listener): () => void {
            listener([42]);
            return () => (released = true);
          },
        }),
      },
    };
    const seen: (readonly unknown[])[] = [];
    onceIpcMessage(host, 'ping', (...args) => seen.push(args));
    expect(seen).toEqual([[42]]);
    expect(released).toBe(true);
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
