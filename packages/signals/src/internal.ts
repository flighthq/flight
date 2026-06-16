/**
 * The `emit` implementation for a signal with no connected slots. Assigned by
 * `createSignal` and restored when the last slot disconnects, so emitting on an
 * empty signal is a no-op without a null check. Package-internal: not exported
 * from the barrel.
 */
export const nullSignalEmit = (): void => {};
