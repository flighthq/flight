import { appendPathCubicCurveTo, appendPathLineTo, appendPathMoveTo, createPath } from '@flighthq/path/contract';
import type { LottieShapePath, Path } from '@flighthq/types/contract';
/**
 * Lottie's bezier-path value: how to read one, how to build a Path from one, and how to flatten it for animation.
 *
 * ★ TWO OWNERS, WHICH IS WHY THIS IS NOT IN THE PATH ITEM'S MODULE. The `sh` shape item reads these, and so does the
 * core's MASK reader — a Lottie mask is a bezier path, and masks are read for every layer. So this code is live in
 * any Lottie build, and the honest consequence is that omitting the path shape item saves its builder and its
 * channel wiring but not this. Making masks selectable is the next boundary if that cost matters; it would change
 * what `createScene2DFromLottieDocument` reads by default, so it is not taken here.
 */

export function createLottieBezierPath(value: Readonly<LottieShapePath>): Path {
  const path = createPath();
  const count = value.v.length;
  if (count === 0) return path;
  appendPathMoveTo(path, value.v[0][0], value.v[0][1]);
  const limit = value.c ? count + 1 : count;
  for (let index = 1; index < limit; index++) {
    const previous = (index - 1) % count;
    const current = index % count;
    const start = value.v[previous];
    const end = value.v[current];
    const outgoing = value.o[previous] ?? [0, 0];
    const incoming = value.i[current] ?? [0, 0];
    if (outgoing[0] === 0 && outgoing[1] === 0 && incoming[0] === 0 && incoming[1] === 0) {
      appendPathLineTo(path, end[0], end[1]);
    } else {
      appendPathCubicCurveTo(
        path,
        start[0] + outgoing[0],
        start[1] + outgoing[1],
        end[0] + incoming[0],
        end[1] + incoming[1],
        end[0],
        end[1],
      );
    }
  }
  return path;
}

export function flattenLottieShapePath(path: Readonly<LottieShapePath>): number[] {
  const out: number[] = [];
  for (const points of [path.v, path.i, path.o]) {
    for (const point of points) out.push(point[0] ?? 0, point[1] ?? 0);
  }
  return out;
}

/**
 * A shape path as the file states it, whichever way it states it.
 *
 * A static path is the object itself; an **animated** one wraps that object in a single-element
 * array inside each keyframe. Across a corpus of eighteen real exports the wrapper is the majority
 * form — 896 keyframed paths against 627 bare — so reading only the bare form crashes on most files.
 */
export function toLottieShapePath(value: unknown): Readonly<LottieShapePath> | undefined {
  const path = Array.isArray(value) ? value[0] : value;
  if (path === null || typeof path !== 'object' || !('v' in path)) return undefined;
  return path as Readonly<LottieShapePath>;
}

export function unflattenLottieShapePath(
  template: Readonly<LottieShapePath>,
  values: readonly number[],
): LottieShapePath {
  const count = template.v.length;
  const readPoints = (offset: number): number[][] => {
    const out: number[][] = [];
    for (let index = 0; index < count; index++) {
      out.push([values[offset + index * 2] ?? 0, values[offset + index * 2 + 1] ?? 0]);
    }
    return out;
  };
  return {
    c: template.c,
    i: readPoints(count * 2),
    o: readPoints(count * 4),
    v: readPoints(0),
  };
}
