/* eslint-disable @typescript-eslint/no-explicit-any */

export interface Signal<T extends (...args: any[]) => void> {
  data: SignalData<T> | null;
  emit: T;
}

// The parallel arrays carry a tombstone convention: a null slot is a dead entry whose priority and
// repeat cells are still present, kept so a dispatch already walking the arrays never sees indices
// move under it. `depth` counts nested dispatches on this signal; removal splices only at depth 0 and
// tombstones otherwise, and the outermost exit compacts the dead entries away.
export interface SignalData<T extends (...args: any[]) => void> {
  slots: (T | null)[];
  priorities: number[];
  repeat: boolean[];
  cancelled: boolean;
  depth: number;
}
