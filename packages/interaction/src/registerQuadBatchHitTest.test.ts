import {
  appendQuadBatchInstance,
  createQuadBatch,
  setQuadBatchInstanceMatrix,
  setQuadBatchTransformType,
} from '@flighthq/quadbatch/contract';
import type { HitTestResult, QuadBatch, TextureAtlas, TextureAtlasRegion } from '@flighthq/types/contract';
import { TextureAtlasRotation } from '@flighthq/types/contract';

import { describeGraphHit } from './hitTests';
import { registerQuadBatchHitTest } from './registerQuadBatchHitTest';

function quadRegion(id: number, width: number, height: number, rotation = TextureAtlasRotation.None) {
  return { id, x: 0, y: 0, width, height, pivotX: null, pivotY: null, rotation } as TextureAtlasRegion;
}

function quadAtlas(...regions: TextureAtlasRegion[]): TextureAtlas {
  return { texture: null, regions } as TextureAtlas;
}

function subIndexAt(batch: QuadBatch, x: number, y: number): number {
  const out: HitTestResult = { localX: 0, localY: 0, node: batch, subIndex: -2 };
  describeGraphHit(batch, x, y, out);
  return out.subIndex;
}

beforeAll(() => {
  registerQuadBatchHitTest();
});

describe('registerQuadBatchHitTest', () => {
  it('resolves the point to the instance whose region rect covers it', () => {
    const batch = createQuadBatch({ data: { atlas: quadAtlas(quadRegion(0, 10, 10)) } });
    appendQuadBatchInstance(batch, 0, 0, 0);
    appendQuadBatchInstance(batch, 0, 40, 40);
    expect(subIndexAt(batch, 5, 5)).toBe(0);
    expect(subIndexAt(batch, 45, 45)).toBe(1);
    // The gap between the two quads is a miss, not a bounding-box hit over the whole batch.
    expect(subIndexAt(batch, 25, 25)).toBe(-1);
  });

  it('returns the frontmost instance when quads overlap', () => {
    const batch = createQuadBatch({ data: { atlas: quadAtlas(quadRegion(0, 20, 20)) } });
    appendQuadBatchInstance(batch, 0, 0, 0);
    appendQuadBatchInstance(batch, 0, 5, 5);
    // Both cover (10, 10); the later instance draws on top, so it owns the point.
    expect(subIndexAt(batch, 10, 10)).toBe(1);
    // Only the first covers (2, 2).
    expect(subIndexAt(batch, 2, 2)).toBe(0);
  });

  it('swaps width and height for a packer quarter-turn', () => {
    const batch = createQuadBatch({
      data: { atlas: quadAtlas(quadRegion(0, 40, 10, TextureAtlasRotation.Clockwise90)) },
    });
    appendQuadBatchInstance(batch, 0, 0, 0);
    // Packed 40x10, so the drawn quad is 10 wide by 40 tall — the opposite of the packed extent.
    expect(subIndexAt(batch, 5, 35)).toBe(0);
    expect(subIndexAt(batch, 35, 5)).toBe(-1);
  });

  it('inverts a per-instance matrix rather than offsetting, so a rotated quad picks correctly', () => {
    const batch = createQuadBatch({ data: { atlas: quadAtlas(quadRegion(0, 20, 10)) } });
    appendQuadBatchInstance(batch, 0, 0, 0);
    setQuadBatchTransformType(batch, 'matrix3x2');
    // A quarter turn about the origin: the quad's local +x runs down the node's +y.
    setQuadBatchInstanceMatrix(batch, 0, 0, 0, 1, -1, 0, 0, 0);
    // Node (-5, 15) is quad-local (15, 5) — inside the 20x10 rect.
    expect(subIndexAt(batch, -5, 15)).toBe(0);
    // Node (15, 5) is quad-local (5, -15) — above the quad, a miss.
    expect(subIndexAt(batch, 15, 5)).toBe(-1);
  });

  it('misses a batch with no atlas, no instances, or a degenerate region', () => {
    expect(subIndexAt(createQuadBatch(), 0, 0)).toBe(-1);
    const empty = createQuadBatch({ data: { atlas: quadAtlas(quadRegion(0, 10, 10)) } });
    expect(subIndexAt(empty, 0, 0)).toBe(-1);
    const degenerate = createQuadBatch({ data: { atlas: quadAtlas(quadRegion(0, 0, 10)) } });
    appendQuadBatchInstance(degenerate, 0, 0, 0);
    expect(subIndexAt(degenerate, 0, 0)).toBe(-1);
  });
});
