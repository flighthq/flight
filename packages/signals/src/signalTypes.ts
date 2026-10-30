import type { SignalRaw, SignalScopeRaw, SignalTimerStateRaw } from './types.ts';

/** Public payload-generic signal type. */
export type Signal<T> = SignalRaw<T>;

/** Public signal-scope type. */
export type SignalScope = SignalScopeRaw;

/** Public explicit timer-state type for debounced and throttled connections. */
export type SignalTimerState = SignalTimerStateRaw;
