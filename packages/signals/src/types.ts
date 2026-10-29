// Generated from crates/flight-signals/src/types.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { EntityRaw } from '@flighthq/entity/contract';

/**
 * A slot callback, stored or passed by reference (D9d). Shared by the signal rather than cloned
 * per dispatch, so one allocation serves every emission.
 */
export type SignalSlot<T> = (arg0: T) => void;

/**
 * Identity of one slot registration on a `Signal`.
 *
 * D4: `connectSignal` returns this handle and `disconnectSignal` takes it. It is an opaque
 * Rust-side handle; it is never transpiled as a TS number.
 */
export interface SlotId {
  value: number;
}

/**
 * Identity of one pending signal timer, returned by `setSignalTimeout`.
 */
export interface TimerId {
  value: number;
}

/**
 * The payload of `connectSignalAtFrameRate`: the accumulated delta time in milliseconds.
 */
export interface FrameTick {
  deltaTime: number;
}

/**
 * One live signal registration. The dispatch arrays keep tombstones for removed entries so an
 * emission that is already walking them never sees an index move under it.
 */
export interface SignalData<T> {
  slots: (SignalSlot<T> | undefined)[];
  ids: SlotId[];
  priorities: number[];
  repeat: boolean[];
  paused: boolean[];
  cancelled: boolean;
  depth: number;
}

/**
 * A signal with a typed payload (D4). Both targets parameterize the signal by that payload, and
 * slots receive `&T` in Rust or `T` in TypeScript.
 *
 * Cloning shares signal data and the current callback value, matching a TS spread copy.
 * Each clone owns a fresh callback cell and Entity runtime. Registration ids come from one atomic
 * sequence, so a stale handle cannot collide with a later registration after `clearSignal`.
 */
export interface SignalRaw<T> extends EntityRaw {
  /**
   * Source-required emission callback. A spread clone may replace it while sharing data.
   */
  emit: (arg0: T) => void;
  data: SignalData<T> | undefined;
}

/**
 * Options for `connectSignal`.
 */
export interface SignalConnectOptions {
  priority?: number;
  once?: boolean;
}

/**
 * Options for `connectSignalTracked`.
 */
export interface SignalTrackedConnectOptions {
  priority?: number;
  once?: boolean;
  scope?: SignalScopeRaw;
}

/**
 * Options for throttled and debounced signal connections.
 */
export interface SignalThrottleOptions {
  leading?: boolean;
  trailing?: boolean;
}

/**
 * A handle to one tracked slot registration.
 *
 * The fields are opaque: use `isSignalConnectionConnected`, `isSignalConnectionPaused`,
 * `pauseSignalConnection`, `resumeSignalConnection` and `disconnectSignalConnection`.
 * The operations are closures so one non-generic handle can live in a `SignalScope`, which
 * holds connections for signals of every payload type.
 */
export interface SignalConnection {
  disconnect: () => void;
  setPaused: (arg0: boolean) => void;
  isConnected: () => boolean;
  paused: boolean;
}

/**
 * A collection of tracked connections torn down together.
 *
 * Cloning shares the list, matching a TS object reference. The connections vector is shared so
 * a scope can be registered on a connection and then torn down from anywhere.
 */
export interface SignalScopeRaw extends EntityRaw {
  connections: SignalConnection[];
}

/**
 * One pending timer callback.
 */
export interface SignalTimer {
  id: TimerId;
  fireAtMs: number;
  callback: () => void;
}

/**
 * Explicit timer state for debounced and throttled connections (D5): the caller creates it,
 * injects time through `advanceSignalTimers`, and no clock is read inside the contract.
 */
export interface SignalTimerState {
  nowMs: number;
  timers: SignalTimer[];
  nextId: number;
}
