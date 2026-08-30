import type { HasIpcMessage } from '@flighthq/types/contract';

// Inter-process message reception, over the explicitly supplied host. Every operation takes its host and
// reads `host.ipc.message` directly: there is no resolver, no sentinel, no installed-backend state and
// no "no provider" runtime arm, because the `HasIpcMessage` witness is what guarantees the slot exists.
// A caller without a provider cannot call these at all — that is a compile error, not a false answer.
//
// ★ THE WHOLE AMBIENT FAMILY IS GONE — getIpcBackend / setIpcBackend / installIpcHostBackend /
// resetIpcBackendForTest / observeIpcHostResult / explainIpcBackend / explainIpcOperation /
// hasIpcBackend / hasIpcOperation, plus the module-scoped _custom/_host/_hostConflict/_hostObservation/
// _sentinel/_listeners registry. The sentinel in particular answered every operation, so a caller could
// not tell an installed backend from nothing at all.

// Subscribes to messages on `channel` for the NEXT message only, then releases the subscription.
// Returns the unsubscribe, so a caller that never receives a message can still stop listening.
//
// The unsubscribe is idempotent and ORIGIN-PINNED: it releases exactly the subscription this call
// opened, whether it runs after the first message or before any arrives.
export function onceIpcMessage(
  host: HasIpcMessage,
  channel: string,
  listener: (...args: readonly unknown[]) => void,
): () => void {
  let unsubscribe: (() => void) | null = null;
  let done = false;
  const release = (): void => {
    if (done) return;
    done = true;
    // `unsubscribe` is null only if the provider delivered synchronously during subscribe; the guard
    // below releases in that case, so neither ordering leaks a subscription.
    unsubscribe?.();
  };
  unsubscribe = host.ipc.message.subscribe(channel, (args) => {
    if (done) return;
    release();
    listener(...args);
  });
  if (done) unsubscribe();
  return release;
}

// Subscribes to every message on `channel`. Returns the unsubscribe for THIS subscription alone —
// releasing one listener never disturbs another on the same channel.
export function onIpcMessage(
  host: HasIpcMessage,
  channel: string,
  listener: (...args: readonly unknown[]) => void,
): () => void {
  return host.ipc.message.subscribe(channel, (args) => listener(...args));
}
