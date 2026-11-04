// Generated from crates/flight-easing/src/ease_piecewise.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import type { EasingFunction } from './easingTypes.ts';

export interface EasingSegment {
  readonly ease: EasingFunction;
  readonly weight?: number;
}

/**
 * Returns an easing function that splices multiple easing functions across the
 * [0,1] input range. Each segment is allocated a proportional slice of the
 * input domain based on its `weight` (default 1). Weights are relative.
 */
export function easePiecewise(segments: Readonly<EasingSegment[]>): EasingFunction {
  if (segments.length === 0) {
    throw new Error('easePiecewise: segments array must not be empty');
  }
  const totalWeight: number = segments.map((s) => s.weight ?? 1.0).reduce((sum, value) => sum + value, 0);
  if (totalWeight <= 0.0) {
    throw new Error('easePiecewise: total segment weight must be greater than zero');
  }
  let breakpoints: Array<readonly [EasingFunction, number, number]> = [] as never[];
  let accumulated = 0.0;
  for (const segment of segments) {
    const weight = segment.weight ?? 1.0;
    const start = accumulated / totalWeight;
    accumulated += weight;
    const end = accumulated / totalWeight;
    breakpoints.push([segment.ease, start, end]);
  }
  const lastEase = segments[segments.length - 1].ease;
  return (t: number): number => {
    for (let i = 0; i < breakpoints.length; i += 1) {
      const [ease, start, end] = breakpoints[i];
      if (t <= end || i === breakpoints.length - 1) {
        const span = end - start;
        const localT = span > 0.0 ? (t - start) / span : 1.0;
        const clampedT = localT < 0.0 ? 0.0 : localT > 1.0 ? 1.0 : localT;
        return ease(clampedT);
      }
    }
    return lastEase(1.0);
  };
}
