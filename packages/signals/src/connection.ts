// Generated from crates/flight-signals/src/connection.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { connectSignal, disconnectSignal, isSlotConnected, setSlotPaused } from './slot.ts';
import type {
  SignalConnectOptions,
  SignalConnection,
  SignalRaw,
  SignalSlot,
  SignalTrackedConnectOptions,
} from './types.ts';

/**
 * Connects a tracked registration and returns a handle for it (TS `connectSignalTracked`).
 * The optional scope is part of the options, matching TS.
 */
export function connectSignalTracked<T>(
  signal: SignalRaw<T>,
  slot: SignalSlot<T>,
  options?: Readonly<SignalTrackedConnectOptions>,
): SignalConnection {
  const priority = options?.priority;
  const once = options?.once ?? false;
  const connectOptions: SignalConnectOptions = { priority: priority, once: once };
  const id = connectSignal(signal, slot, connectOptions);
  const disconnectSignalHandle = Object.defineProperties(
    { ...signal },
    {
      data: {
        get: () => signal.data,
        set: (value) => {
          signal.data = value;
        },
        enumerable: true,
        configurable: true,
      },
    },
  );
  const pauseSignalHandle = Object.defineProperties(
    { ...signal },
    {
      data: {
        get: () => signal.data,
        set: (value) => {
          signal.data = value;
        },
        enumerable: true,
        configurable: true,
      },
    },
  );
  const connectedSignalHandle = Object.defineProperties(
    { ...signal },
    {
      data: {
        get: () => signal.data,
        set: (value) => {
          signal.data = value;
        },
        enumerable: true,
        configurable: true,
      },
    },
  );
  const connection: SignalConnection = {
    disconnect: () => disconnectSignal(disconnectSignalHandle, id),
    setPaused: (paused) => {
      setSlotPaused(pauseSignalHandle, id, paused);
    },
    isConnected: () => isSlotConnected(connectedSignalHandle, id),
    paused: false,
  };
  {
    const $scope = ((o) => (o === undefined ? undefined : o.scope))(options);
    if ($scope !== undefined) {
      const scope = $scope;
      scope.connections!.push(connection);
    }
  }
  return connection;
}

export function disconnectSignalConnection(connection: SignalConnection): void {
  connection.disconnect();
}

export function isSignalConnectionConnected(connection: SignalConnection): boolean {
  return connection.isConnected();
}

/**
 * True while the connection is paused. A torn-down connection keeps its last paused flag, as in
 * TS, so resuming it cannot appear to bring it back.
 */
export function isSignalConnectionPaused(connection: SignalConnection): boolean {
  return connection.paused!;
}

export function pauseSignalConnection(connection: SignalConnection): void {
  if (!connection.isConnected()) {
    return;
  }
  connection.setPaused(true);
  connection.paused = true;
}

export function resumeSignalConnection(connection: SignalConnection): void {
  connection.setPaused(false);
  if (connection.isConnected()) {
    connection.paused = false;
  }
}
