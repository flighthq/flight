// Generated from crates/flight-signals/src/lib.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export {
  connectSignalTracked,
  disconnectSignalConnection,
  isSignalConnectionConnected,
  isSignalConnectionPaused,
  pauseSignalConnection,
  resumeSignalConnection,
} from './connection.ts';
export { cancelSignal, emitSignal } from './emitter.ts';
export { nullSignalEmit } from './internal.ts';
export { emitSignalSafe } from './safe.ts';
export { createSignalScope, disconnectSignalScope, initializeSignalScope } from './scope.ts';
export { createSignal, initializeSignal } from './signal.ts';
export { clearSignal, connectSignal, disconnectSignal, hasSignalSlots, isSlotConnected } from './slot.ts';
export {
  advanceSignalTimers,
  clearSignalTimeout,
  connectSignalAtFrameRate,
  connectSignalDebounced,
  connectSignalThrottled,
  createSignalTimerState,
  initializeSignalTimerState,
  setSignalTimeout,
} from './throttle.ts';
export type {
  FrameTick,
  SignalConnectOptions,
  SignalConnection,
  SignalData,
  SignalRaw,
  SignalScopeRaw,
  SignalSlot,
  SignalThrottleOptions,
  SignalTimer,
  SignalTimerState,
  SignalTrackedConnectOptions,
  SlotId,
  TimerId,
} from './types.ts';
export type { Signal, SignalScope } from './signalTypes.ts';
