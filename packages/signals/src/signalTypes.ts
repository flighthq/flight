import type { SignalRaw, SignalScopeRaw } from './types.ts';

/** Public payload-generic signal type. */
export type Signal<T> = SignalRaw<T>;

/** Public signal-scope type. */
export type SignalScope = SignalScopeRaw;
