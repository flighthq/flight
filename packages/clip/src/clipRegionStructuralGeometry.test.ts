import type { MatrixLike, RectangleLike } from '@flighthq/geometry/contract';
import { createMatrix, createRectangle } from '@flighthq/geometry/contract';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  clipRegionContainsRectangle,
  clipRegionIntersectsRectangle,
  createClipRegionFromEllipse,
  createClipRegionFromRectangle,
  createClipRegionFromRoundedRectangle,
  getClipRegionBounds,
  initializeClipRegionFromRectangle,
  setClipRegionToRectangle,
  transformClipRegion,
} from './contract.ts';
import type { ClipRegion } from './types.ts';

describe('ClipRegion structural geometry compatibility', () => {
  it('preserves all nine established public signatures exactly', () => {
    expectTypeOf(clipRegionContainsRectangle).toEqualTypeOf<
      (clip: Readonly<ClipRegion>, rectangle: Readonly<RectangleLike>) => boolean
    >();
    expectTypeOf(clipRegionIntersectsRectangle).toEqualTypeOf<
      (clip: Readonly<ClipRegion>, rectangle: Readonly<RectangleLike>) => boolean
    >();
    expectTypeOf(createClipRegionFromEllipse).toEqualTypeOf<
      (rectangle: Readonly<RectangleLike>, tolerance?: number) => ClipRegion
    >();
    expectTypeOf(createClipRegionFromRectangle).toEqualTypeOf<(rectangle: Readonly<RectangleLike>) => ClipRegion>();
    expectTypeOf(createClipRegionFromRoundedRectangle).toEqualTypeOf<
      (rectangle: Readonly<RectangleLike>, radius: number, tolerance?: number) => ClipRegion
    >();
    expectTypeOf(initializeClipRegionFromRectangle).toEqualTypeOf<
      (out: ClipRegion, rectangle: Readonly<RectangleLike>) => void
    >();
    expectTypeOf(getClipRegionBounds).toEqualTypeOf<(out: RectangleLike, clip: Readonly<ClipRegion>) => void>();
    expectTypeOf(setClipRegionToRectangle).toEqualTypeOf<
      (out: Readonly<ClipRegion>, rectangle: Readonly<RectangleLike>) => void
    >();
    expectTypeOf(transformClipRegion).toEqualTypeOf<
      (out: Readonly<ClipRegion>, clip: Readonly<ClipRegion>, matrix: Readonly<MatrixLike>) => void
    >();
  });

  it('accepts plain and explicitly typed structural consumers without changing behavior', () => {
    const source: RectangleLike = { height: 4, width: 6, x: 1, y: 2 };
    const contained = { height: 1, width: 1, x: 2, y: 3 };
    const overlapping: Readonly<RectangleLike> = { height: 2, width: 2, x: 6, y: 4 };
    const matrix: Readonly<MatrixLike> = { a: 1, b: 0, c: 0, d: 1, tx: 5, ty: 7 };

    const clip = createClipRegionFromRectangle(source);
    expect(clipRegionContainsRectangle(clip, contained)).toBe(true);
    expect(clipRegionIntersectsRectangle(clip, overlapping)).toBe(true);

    const ellipse = createClipRegionFromEllipse(source);
    const rounded = createClipRegionFromRoundedRectangle(source, 1);
    expect(ellipse.rect).toEqual(source);
    expect(rounded.rect).toEqual(source);

    initializeClipRegionFromRectangle(clip, { height: 6, width: 5, x: 3, y: 4 });
    const bounds: RectangleLike = { height: 0, width: 0, x: 0, y: 0 };
    getClipRegionBounds(bounds, clip);
    expect(bounds).toEqual({ height: 6, width: 5, x: 3, y: 4 });

    setClipRegionToRectangle(clip, source);
    transformClipRegion(clip, clip, matrix);
    getClipRegionBounds(bounds, clip);
    expect(bounds).toEqual({ height: 4, width: 6, x: 6, y: 9 });
  });

  it('continues to accept geometry entities for every structural role', () => {
    const source = createRectangle(1, 2, 6, 4);
    const clip = createClipRegionFromRectangle(source);
    expect(clipRegionContainsRectangle(clip, createRectangle(2, 3, 1, 1))).toBe(true);
    expect(clipRegionIntersectsRectangle(clip, createRectangle(6, 4, 2, 2))).toBe(true);
    expect(createClipRegionFromEllipse(source).rect).toEqual(source);
    expect(createClipRegionFromRoundedRectangle(source, 1).rect).toEqual(source);

    initializeClipRegionFromRectangle(clip, createRectangle(3, 4, 5, 6));
    const bounds = createRectangle(0, 0, 0, 0);
    getClipRegionBounds(bounds, clip);
    expect(bounds).toEqual(createRectangle(3, 4, 5, 6));

    setClipRegionToRectangle(clip, source);
    transformClipRegion(clip, clip, createMatrix(1, 0, 0, 1, 5, 7));
    getClipRegionBounds(bounds, clip);
    expect(bounds).toEqual(createRectangle(6, 9, 6, 4));
  });
});
