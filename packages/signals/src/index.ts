// Generated from crates/flight-signals/src/lib.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export {
  advanceSignalTimers,
  cancelSignal,
  clearSignal,
  clearSignalTimeout,
  connectSignal,
  connectSignalAtFrameRate,
  connectSignalDebounced,
  connectSignalThrottled,
  connectSignalTracked,
  createSignal,
  createSignalScope,
  createSignalTimerState,
  disconnectSignal,
  disconnectSignalConnection,
  disconnectSignalScope,
  emitSignal,
  emitSignalSafe,
  hasSignalSlots,
  isSlotConnected,
  pauseSignalConnection,
  resumeSignalConnection,
  setSignalTimeout,
} from './contract.ts';

export type {
  FrameTick,
  SignalConnectOptions,
  SignalConnection,
  SignalData,
  SignalThrottleOptions,
  SignalTrackedConnectOptions,
  TimerId,
} from './contract.ts';

export type { Signal, SignalScope, SignalTimerState } from './signalTypes.ts';
