import type { EasingFunction, EasingSegment } from '@flighthq/types';

// Returns an easing function that splices multiple EasingFunctions across the
// [0,1] input range. Each segment is allocated a proportional slice of the
// input domain based on its `weight` (default 1). Weights are relative — they
// do not need to sum to any particular value; the function normalizes them.
//
// Example: `easePiecewise([{ ease: easeInCubic }, { ease: easeLinear, weight: 2 }])`
// gives the first segment 1/3 of the input range and the second segment 2/3.
//
// An empty or weight-zero segments array is a programmer error and throws.
// Allocates a closure and an internal segment table; cache the result.
export function easePiecewise(segments: Readonly<ReadonlyArray<Readonly<EasingSegment>>>): EasingFunction {
  if (segments.length === 0) {
    throw new Error('easePiecewise: segments array must not be empty');
  }

  // Resolve weights and compute cumulative breakpoints.
  const totalWeight = segments.reduce((sum, seg) => sum + (seg.weight ?? 1), 0);
  if (totalWeight <= 0) {
    throw new Error('easePiecewise: total segment weight must be greater than zero');
  }

  // Precompute per-segment [start, end] breakpoints in [0,1] space.
  const breakpoints: { ease: EasingFunction; end: number; start: number }[] = [];
  let accumulated = 0;
  for (const seg of segments) {
    const weight = seg.weight ?? 1;
    const start = accumulated / totalWeight;
    accumulated += weight;
    const end = accumulated / totalWeight;
    breakpoints.push({ ease: seg.ease, end, start });
  }

  return (t) => {
    // Walk breakpoints to find the active segment.
    for (let i = 0; i < breakpoints.length; i++) {
      const bp = breakpoints[i];
      if (t <= bp.end || i === breakpoints.length - 1) {
        // Remap t into the local [0,1] range of this segment.
        const span = bp.end - bp.start;
        const localT = span > 0 ? (t - bp.start) / span : 1;
        const clampedT = localT < 0 ? 0 : localT > 1 ? 1 : localT;
        return bp.ease(clampedT);
      }
    }
    return segments[segments.length - 1].ease(1);
  };
}
