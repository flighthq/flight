import type { TimelineSignals } from './TimelineSignals';

// A MovieClip's per-frame lifecycle signals are exactly its timeline's signals — enableMovieClipSignals
// arms the underlying timeline and exposes the same group on the clip's runtime.
export type MovieClipSignals = TimelineSignals;
