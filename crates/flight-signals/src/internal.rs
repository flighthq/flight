/// The TS package's no-op emit used by a signal with no connected slots. In the D4 payload model
/// the slot list is empty instead of pointing at this function; it stays in the contract so the
/// translated surface matches TS `internal.ts`.
pub fn null_signal_emit() {}
