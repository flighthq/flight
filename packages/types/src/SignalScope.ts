/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Entity } from './Entity.ts';
import type { SignalConnection } from './SignalConnection.ts';
/**
 * A collection of `SignalConnection` handles that can all be torn down in one
 * call to `disconnectSignalScope`. The canonical pattern for component teardown:
 * collect connections as a component is wired up, then call
 * `disconnectSignalScope` when the component is disposed.
 *
 * Plain data — not a class. Create with `createSignalScope`.
 */
export interface SignalScope extends Entity {
  connections: SignalConnection<(...args: any[]) => void>[];
}
