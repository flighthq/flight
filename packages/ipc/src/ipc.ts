import type {
  HostIpcHandleProvider,
  HostIpcInvokeProvider,
  HostIpcMessageProvider,
  HostIpcSendProvider,
  HostIpcTargetedSendProvider,
} from '@flighthq/types/contract';

// Inter-process messaging over explicitly supplied, operation-tight Host capabilities. Every operation
// reads its own slot directly: there is no aggregate backend, resolver, sentinel, installed state, or
// "no provider" runtime arm. A caller without the exact witness cannot compile the call.
//
// ★ THE WHOLE AMBIENT FAMILY IS GONE — getIpcBackend / setIpcBackend / installIpcHostBackend /
// resetIpcBackendForTest / observeIpcHostResult / explainIpcBackend / explainIpcOperation /
// hasIpcBackend / hasIpcOperation, plus the module-scoped _custom/_host/_hostConflict/_hostObservation/
// _sentinel/_listeners registry. The sentinel in particular answered every operation, so a caller could
// not tell an installed backend from nothing at all.

export function invokeIpc(
  hostIpcInvoke: Readonly<HostIpcInvokeProvider>,
  channel: string,
  ...args: readonly unknown[]
): Promise<unknown> {
  return hostIpcInvoke.invoke(channel, args);
}

// Subscribes to messages on `channel` for the NEXT message only, then releases the subscription.
// Returns the unsubscribe, so a caller that never receives a message can still stop listening.
//
// The unsubscribe is idempotent and ORIGIN-PINNED: it releases exactly the subscription this call
// opened, whether it runs after the first message or before any arrives.
export function onceIpcMessage(
  hostIpcMessage: Readonly<HostIpcMessageProvider>,
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
  unsubscribe = hostIpcMessage.subscribe(channel, (args) => {
    if (done) return;
    release();
    listener(...args);
  });
  if (done) unsubscribe();
  return release;
}

// Registers an invoke responder on `channel`. The returned release belongs to this registration.
export function onIpcInvoke(
  hostIpcHandle: Readonly<HostIpcHandleProvider>,
  channel: string,
  handler: (...args: readonly unknown[]) => unknown | Promise<unknown>,
): () => void {
  return hostIpcHandle.handle(channel, handler);
}

// Subscribes to every message on `channel`. Returns the unsubscribe for THIS subscription alone —
// releasing one listener never disturbs another on the same channel.
export function onIpcMessage(
  hostIpcMessage: Readonly<HostIpcMessageProvider>,
  channel: string,
  listener: (...args: readonly unknown[]) => void,
): () => void {
  return hostIpcMessage.subscribe(channel, (args) => listener(...args));
}

export function sendIpcMessage(
  hostIpcSend: Readonly<HostIpcSendProvider>,
  channel: string,
  ...args: readonly unknown[]
): void {
  hostIpcSend.send(channel, args);
}

export function sendIpcMessageTo<Target>(
  hostIpcTargetedSend: Readonly<HostIpcTargetedSendProvider<Target>>,
  target: NoInfer<Target>,
  channel: string,
  ...args: readonly unknown[]
): void {
  hostIpcTargetedSend.send(target, channel, args);
}
