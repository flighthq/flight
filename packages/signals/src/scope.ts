// Generated from crates/flight-signals/src/scope.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { allocateEntity } from '@flighthq/entity/contract';

import { disconnectSignalConnection } from './connection.ts';
import type { SignalConnection, SignalScopeRaw } from './types.ts';

export function createSignalScope(): SignalScopeRaw {
  let out: SignalScopeRaw = Object.assign(allocateEntity<SignalScopeRaw>(), { connections: [] });
  initializeSignalScope(out);
  return out;
}

/**
 * Tears down every tracked connection in the scope and empties it (TS `disconnectSignalScope`).
 * The list is emptied before the loop so a re-entrant call sees nothing to do; each disconnect
 * is idempotent, so a member already torn down through its own handle, a once member that
 * already fired, and a duplicate listing all cost one no-op.
 */
export function disconnectSignalScope(scope: SignalScopeRaw): void {
  const pending = takeSignalScopeConnections(scope);
  if (pending === undefined) {
    return;
  }
  for (const connection of pending) {
    disconnectSignalConnection(connection);
  }
}

export function initializeSignalScope(out: SignalScopeRaw): void {
  out.connections = [] as never[];
}

function takeSignalScopeConnections(scope: SignalScopeRaw): SignalConnection[] | undefined {
  let connections = scope.connections!;
  if (connections.length === 0) {
    return undefined;
  }
  let snapshot: SignalConnection[] = [] as never[];
  for (const connection of connections) {
    snapshot.push(connection);
  }
  connections.length = 0;
  return snapshot;
}
