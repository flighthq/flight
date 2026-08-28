// Per-OPERATION availability, one level below `BackendExplanation`'s per-backend answer.
//
// `explain*Backend()` says a backend is installed; it cannot say which of that backend's operations the
// host actually implements. That gap is what makes a sentinel return indistinguishable from a real
// result — `getAccessoryBarVisible()` answering `false` means either "the bar is hidden" or "nothing here
// can tell you", and the caller has no way to ask which.
//
// The answer is structural, never declared: an operation is implemented iff the installed backend
// PROVIDES it. A host declares partial support by omitting the method, which is the standing
// absence-of-an-export ruling, so there is nothing to keep in sync — no capability bitfield, which would
// be a second source of truth about the same fact and would drift from the methods it describes.
//
// ★ THE SENTINEL NEVER COUNTS AS SUPPORT. It exists so a call never throws, not so a caller believes the
// operation is real; treating it as an implementation is precisely the lie this type exists to end.
export interface BackendOperationExplanation {
  // True iff a custom or host backend provides the operation. False whenever only the sentinel serves it.
  readonly implemented: boolean;
  // Which layer provides it, and why this vocabulary is not `BackendExplanation`'s: that one never had to
  // name what serves an unimplemented operation.
  //
  // `'sentinel'` and `'none'` are BOTH "nothing real implements this", and they are kept apart because
  // they are different facts about the package. `'sentinel'` means a fall-through object answers the call
  // so it cannot throw. `'none'` means there is no fall-through at all — the nullable single-slot
  // capabilities (`textshaper`, `log`) return `null` from their getter and callers handle the absence
  // directly. Reporting `'sentinel'` for those would name an object that does not exist, which is the
  // same class of lie this type exists to remove.
  readonly layer: 'custom' | 'host' | 'none' | 'sentinel';
  readonly operation: string;
}
