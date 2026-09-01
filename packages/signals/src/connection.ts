/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Signal, SignalConnection, SignalTrackedConnectOptions } from '@flighthq/types/contract';

import { connectSignal, disconnectSignal } from './slot';

// Connects through a wrapper so pause state costs only consumers that request a tracked handle. Tracked
// once connections remove themselves immediately before their real invocation: a paused wrapper can then
// be skipped without the base dispatch consuming its once registration, and a nested emit cannot repeat it.
export function connectSignalTracked<T extends (...args: any[]) => void>(
  signal: Signal<T>,
  slot: T,
  options?: Readonly<SignalTrackedConnectOptions>,
): SignalConnection<T> {
  const connection: SignalConnection<T> = { connected: true, paused: false, signal, slot };
  const once = options?.once ?? false;
  const trackedSlot = ((...args: Parameters<T>): void => {
    if (connection.paused) return;
    if (once) disconnectSignalConnection(connection);
    slot(...args);
  }) as unknown as T;
  connection.slot = trackedSlot;

  const priority = options?.priority;
  connectSignal(signal, trackedSlot, priority === undefined ? undefined : { priority });
  // The scope stores handles for signals of every shape, so its element type is the widest slot
  // signature. The cast is the variance of that container, not a claim about this connection.
  options?.scope?.connections.push(connection as unknown as SignalConnection<(...args: any[]) => void>);
  return connection;
}

export function disconnectSignalConnection<T extends (...args: any[]) => void>(connection: SignalConnection<T>): void {
  if (!connection.connected) return;
  connection.connected = false;
  disconnectSignal(connection.signal, connection.slot);
}

export function pauseSignalConnection<T extends (...args: any[]) => void>(connection: SignalConnection<T>): void {
  if (connection.connected) connection.paused = true;
}

export function resumeSignalConnection<T extends (...args: any[]) => void>(connection: SignalConnection<T>): void {
  if (connection.connected) connection.paused = false;
}
