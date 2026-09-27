import { appendPathLineTo, appendPathMoveTo, createPath } from '@flighthq/path/contract';
import { describe, expect, it } from 'vitest';

import { applyLottieShapeDirection } from './lottieShapeGeometry.ts';

describe('applyLottieShapeDirection', () => {
  // ★ ONLY DIRECTION 3 REVERSES. Lottie writes 1 for normal, 3 for reversed, and leaves the field off entirely for
  // the common case — so anything that is not 3 must be handed back UNTOUCHED, identity included: the four geometry
  // items push the returned path into the shape's path list, and a needless copy would break the animated rebuild's
  // index into that list.
  it.each([[undefined], [1 as const]])('returns the same path object for direction %s', (direction) => {
    const path = triangle();
    expect(applyLottieShapeDirection(path, direction)).toBe(path);
  });

  it('returns a reversed copy for direction 3, leaving the original alone', () => {
    const path = triangle();
    const reversed = applyLottieShapeDirection(path, 3);
    expect(reversed).not.toBe(path);
    expect(reversed.commands.length).toBe(path.commands.length);
    expect(reversed.winding).toBe(path.winding);
  });
});

function triangle() {
  const path = createPath();
  appendPathMoveTo(path, 0, 0);
  appendPathLineTo(path, 10, 0);
  appendPathLineTo(path, 0, 10);
  return path;
}
