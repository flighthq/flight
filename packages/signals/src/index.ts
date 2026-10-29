// Generated from crates/flight-signals/src/lib.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

export {
  cancelSignal,
  clearSignal,
  connectSignal,
  connectSignalAtFrameRate,
  connectSignalDebounced,
  connectSignalThrottled,
  connectSignalTracked,
  createSignal,
  createSignalScope,
  disconnectSignal,
  disconnectSignalConnection,
  disconnectSignalScope,
  emitSignal,
  emitSignalSafe,
  hasSignalSlots,
  isSlotConnected,
  pauseSignalConnection,
  resumeSignalConnection,
} from './contract.ts';

export type {
  SignalConnectOptions,
  SignalConnection,
  SignalData,
  SignalThrottleOptions,
  SignalTrackedConnectOptions,
} from './contract.ts';

export type { Signal, SignalScope } from './signalTypes.ts';
