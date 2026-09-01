import type { SignalConnectOptions } from './SignalConnectOptions';
import type { SignalScope } from './SignalScope';

/**
 * Options for `connectSignalTracked`. A separate type from `SignalConnectOptions` because `scope` is
 * only meaningful where a handle exists to register: widening the base options would let
 * `connectSignal` accept a scope it silently ignores, which is a no-op the caller cannot see.
 */
export interface SignalTrackedConnectOptions extends SignalConnectOptions {
  /** Scope to register the returned connection with, so `disconnectSignalScope` tears it down. */
  scope?: SignalScope;
}
