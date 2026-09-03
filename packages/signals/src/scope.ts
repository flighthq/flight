import { createEntity } from '@flighthq/entity/contract';
import type { SignalScope } from '@flighthq/types/contract';

import { disconnectSignalConnection } from './connection';

export function createSignalScope(): SignalScope {
  return createEntity({ connections: [] });
}

// The scope is emptied before the loop rather than after it, so it is never left half-drained and a
// re-entrant call sees nothing to do. No public path runs caller code inside the loop today —
// disconnecting a handle reaches only the signal's own arrays — so the ordering is a property of the
// code rather than one a test can observe; it is chosen so that stops being true safely.
export function disconnectSignalScope(scope: SignalScope): void {
  const members = scope.connections;
  if (members.length === 0) return;
  const pending = members.slice();
  members.length = 0;
  for (let i = 0; i < pending.length; i++) {
    // Idempotent per handle, so a member already torn down through its own handle, a once member that
    // already fired, and a duplicate listing all cost one early return rather than a second removal.
    disconnectSignalConnection(pending[i]);
  }
}
