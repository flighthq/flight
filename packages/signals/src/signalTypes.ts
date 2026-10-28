/* eslint-disable @typescript-eslint/no-explicit-any */

import type { EntityRaw } from '@flighthq/entity/contract';

// TypeScript parameterizes a signal by its complete callback shape so signals can carry zero, one, or
// many arguments without wrapping them in a payload object. The Rust IR parameterizes by one payload
// type instead; this is the target-native representation of that boundary.
export interface Signal<T extends (...args: any[]) => void> extends EntityRaw {
  data: SignalData<T> | null;
  emit: T;
}

/**
 * A handle returned by `connectSignalTracked` that identifies one specific slot
 * registration on a signal. Use it to disconnect, inspect, or pause/resume the
 * individual connection without holding a reference to the original slot function.
 *
 * Plain data — not a class. Carry the handle; do not reach into its fields.
 */
export interface SignalConnection<T extends (...args: any[]) => void = (...args: any[]) => void> {
  /** The signal this connection belongs to. */
  signal: Signal<T>;
  /** The tracking slot registered on the signal. Treat it as opaque. */
  slot: T;
  /** Whether the connection is currently active (not yet disconnected). */
  connected: boolean;
  /**
   * Whether the connection is currently paused. Paused connections remain
   * registered (preserving priority order) but are skipped during dispatch.
   */
  paused: boolean;
}

export interface SignalConnectOptions {
  once?: boolean;
  priority?: number;
}

// The parallel arrays carry a tombstone convention: a null slot is a dead entry whose priority and
// repeat cells are still present, kept so a dispatch already walking the arrays never sees indices
// move under it. `depth` counts nested dispatches on this signal; removal splices only at depth 0 and
// tombstones otherwise, and the outermost exit compacts the dead entries away.
export interface SignalData<T extends (...args: any[]) => void> {
  slots: (T | null)[];
  priorities: number[];
  repeat: boolean[];
  cancelled: boolean;
  depth: number;
}

/**
 * A collection of `SignalConnection` handles that can all be torn down in one
 * call to `disconnectSignalScope`. The canonical pattern for component teardown:
 * collect connections as a component is wired up, then call
 * `disconnectSignalScope` when the component is disposed.
 *
 * Plain data — not a class. Create with `createSignalScope`.
 */
export interface SignalScope extends EntityRaw {
  connections: SignalConnection<(...args: any[]) => void>[];
}

export interface SignalThrottleOptions {
  /**
   * Whether to fire on the leading edge of the interval (before the delay).
   * Default: `true`.
   */
  leading?: boolean;
  /**
   * Whether to fire on the trailing edge of the interval (after the delay).
   * Default: `true`.
   */
  trailing?: boolean;
}

/**
 * Options for `connectSignalTracked`. A separate type from `SignalConnectOptions` because `scope` is
 * only meaningful where a handle exists to register: widening the base options would let
 * `connectSignal` accept a scope it silently ignores, which is a no-op the caller cannot see.
 */
export interface SignalTrackedConnectOptions extends SignalConnectOptions {
  /** Scope to register the returned connection with, so `disconnectSignalScope` tears it down. */
  scope?: SignalScope;
}
