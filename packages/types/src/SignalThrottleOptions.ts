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
