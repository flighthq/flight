/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Signal } from './Signal';
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
