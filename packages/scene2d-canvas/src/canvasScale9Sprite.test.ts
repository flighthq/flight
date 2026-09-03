import { createRectangle } from '@flighthq/geometry/contract';

import { CANVAS_SCALE9_SPRITE_SLICE_STRIDE, writeCanvasScale9SpriteSlices } from './canvasScale9Sprite';

// Reads one slice back as the eight numbers drawImage takes, so a failure names the slice rather than an
// index into a flat array.
function sliceAt(out: readonly number[], index: number): readonly number[] {
  const at = index * CANVAS_SCALE9_SPRITE_SLICE_STRIDE;
  return out.slice(at, at + CANVAS_SCALE9_SPRITE_SLICE_STRIDE);
}

describe('writeCanvasScale9SpriteSlices', () => {
  it('keeps the corners at source size and gives the centre the whole difference', () => {
    const out: number[] = [];
    // A 10x10 texture with a 1px border grid, drawn at 20x20: each corner stays 1x1, each edge stretches
    // along one axis only, and the centre takes 20 - 2 = 18 in both.
    const count = writeCanvasScale9SpriteSlices(out, 10, 10, createRectangle(1, 1, 8, 8), 20, 20);

    expect(count).toBe(9);
    expect(sliceAt(out, 0)).toEqual([0, 0, 1, 1, 0, 0, 1, 1]);
    expect(sliceAt(out, 2)).toEqual([9, 0, 1, 1, 19, 0, 1, 1]);
    expect(sliceAt(out, 4)).toEqual([1, 1, 8, 8, 1, 1, 18, 18]);
    expect(sliceAt(out, 8)).toEqual([9, 9, 1, 1, 19, 19, 1, 1]);
  });

  it('tiles the destination without gap or overlap', () => {
    const out: number[] = [];
    writeCanvasScale9SpriteSlices(out, 10, 10, createRectangle(3, 2, 4, 6), 25, 40);

    // The right edge of the last column must land exactly on the target width, and likewise the height:
    // a rounding or accumulation error here shows as a seam in the drawn node.
    const last = sliceAt(out, 8);
    expect(last[4] + last[6]).toBeCloseTo(25, 10);
    expect(last[5] + last[7]).toBeCloseTo(40, 10);
  });

  it('omits a band the grid leaves empty rather than emitting a zero-size blit', () => {
    const out: number[] = [];
    // The grid starts at the texture origin, so there is no left column and no top row. X bands are
    // centre 4 and end 10 - 0 - 4 = 6, so 2 columns; Y bands are centre 8 and end 10 - 0 - 8 = 2, so 2
    // rows. 2 x 2 = 4 slices, not nine, and none has a zero source extent for drawImage to reject.
    const count = writeCanvasScale9SpriteSlices(out, 10, 10, createRectangle(0, 0, 4, 8), 20, 20);

    expect(count).toBe(4);
    for (let index = 0; index < count; index++) {
      expect(sliceAt(out, index)[2]).toBeGreaterThan(0);
      expect(sliceAt(out, index)[3]).toBeGreaterThan(0);
    }
  });

  it('shrinks the fixed ends proportionally when the target is smaller than they are', () => {
    const out: number[] = [];
    // Fixed ends total 8 of the 10px source but the target is 4px, so the centre collapses and the ends
    // take 2px each. Clamping the ends instead would overflow the node by 4px.
    writeCanvasScale9SpriteSlices(out, 10, 10, createRectangle(4, 4, 2, 2), 4, 20);

    expect(sliceAt(out, 0)[6]).toBeCloseTo(2, 10);
    expect(sliceAt(out, 1)[6]).toBeCloseTo(0, 10);
    expect(sliceAt(out, 2)[6]).toBeCloseTo(2, 10);
  });

  it('reports zero for a degenerate source, a degenerate target, or a grid outside the texture', () => {
    const out: number[] = [];
    const grid = createRectangle(1, 1, 8, 8);
    expect(writeCanvasScale9SpriteSlices(out, 0, 10, grid, 20, 20)).toBe(0);
    expect(writeCanvasScale9SpriteSlices(out, 10, 10, grid, 0, 20)).toBe(0);
    expect(writeCanvasScale9SpriteSlices(out, 10, 10, createRectangle(1, 1, 20, 8), 20, 20)).toBe(0);
    // The caller draws unsliced on zero, so the scratch array must not still hold a previous frame.
    expect(out).toEqual([]);
  });

  it('leaves no tail from a longer previous write in a reused scratch array', () => {
    const out: number[] = [];
    writeCanvasScale9SpriteSlices(out, 10, 10, createRectangle(1, 1, 8, 8), 20, 20);
    expect(out).toHaveLength(9 * CANVAS_SCALE9_SPRITE_SLICE_STRIDE);

    const count = writeCanvasScale9SpriteSlices(out, 10, 10, createRectangle(0, 0, 4, 8), 20, 20);
    expect(out).toHaveLength(count * CANVAS_SCALE9_SPRITE_SLICE_STRIDE);
  });
});
