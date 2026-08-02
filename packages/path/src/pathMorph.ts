import type { Path, PathMorph } from '@flighthq/types/contract';

export type { PathMorph } from '@flighthq/types/contract';

import { buildPathMorph } from './pathMorphGeometry';

// Allocates a prepared interpolation between two paths. The paths may use different line, quadratic,
// and cubic verbs and may contain different segment counts; preparation converts them to exact cubic
// equivalents and subdivides the smaller side. Corresponding contours must have the same ordering,
// winding, count, and open/closed topology. Returns null for an incompatible pair.
export function createPathMorph(start: Readonly<Path>, end: Readonly<Path>): PathMorph | null {
  return buildPathMorph(start, end).morph;
}

// Samples a prepared morph into `out`. Reuses the existing command and coordinate arrays, making
// repeated calls allocation-free once they have sufficient capacity. Progress is not clamped: 0 and
// 1 are the endpoints, while values outside that range permit deliberate easing overshoot.
export function samplePathMorph(out: Path, morph: Readonly<PathMorph>, progress: number): void {
  const commands = morph.commands;
  out.commands.length = commands.length;
  for (let i = 0; i < commands.length; i++) out.commands[i] = commands[i];

  const startData = morph.startData;
  const endData = morph.endData;
  out.data.length = startData.length;
  for (let i = 0; i < startData.length; i++) {
    const start = startData[i];
    const end = endData[i];
    out.data[i] = start + (end - start) * progress;
  }
  out.winding = morph.winding;
}
