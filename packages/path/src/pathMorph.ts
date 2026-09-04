import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Path, PathMorph } from '@flighthq/types/contract';

export type { PathMorph } from '@flighthq/types/contract';

import { buildPathMorph } from './pathMorphGeometry';

// Allocates a prepared interpolation between two paths. The paths may use different line, quadratic,
// and cubic verbs and may contain different segment counts; preparation converts them to exact cubic
// equivalents and subdivides the smaller side. Corresponding contours must have the same ordering,
// winding, count, and open/closed topology. Closed traversal direction is normalized when doing so
// preserves the fill; returns null when a non-zero path reverses only a subset of its contours.
export function createPathMorph(start: Readonly<Path>, end: Readonly<Path>): PathMorph | null {
  const morph = buildPathMorph(start, end).morph;
  return morph !== null ? createEntity(morph) : null;
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
  if (progress === 0 || progress === 1) {
    const endpoint = progress === 0 ? startData : endData;
    for (let i = 0; i < endpoint.length; i++) out.data[i] = endpoint[i];
    out.winding = morph.winding;
    return;
  }
  for (let i = 0; i < startData.length; i++) {
    const start = startData[i];
    const end = endData[i];
    out.data[i] = start + (end - start) * progress;
  }
  out.winding = morph.winding;
}
