import type { QuadBatch, TextureAtlas } from '@flighthq/types';
import { QuadBatchKind } from '@flighthq/types';

import { createQuadBatch } from './quadBatch';

describe('createQuadBatch', () => {
  let quadBatch: QuadBatch;

  beforeEach(() => {
    quadBatch = createQuadBatch();
  });

  it('initializes default values', () => {
    expect(quadBatch.data.atlas).toBeNull();
    expect(quadBatch.data.indices).toBeNull();
    expect(quadBatch.data.overrideRects).toBeNull();
    expect(quadBatch.data.transforms).toBeNull();
    expect(quadBatch.kind).toBe(QuadBatchKind);
  });

  it('allows pre-defined values', () => {
    const base = {
      data: {
        atlas: {} as TextureAtlas,
        indices: new Int16Array(),
        overrideRects: new Float32Array(),
        transforms: new Float32Array(),
      },
    };
    const obj = createQuadBatch(base);
    expect(obj.data.atlas).toStrictEqual(base.data.atlas);
    expect(obj.data.indices).toStrictEqual(base.data.indices);
    expect(obj.data.overrideRects).toStrictEqual(base.data.overrideRects);
    expect(obj.data.transforms).toStrictEqual(base.data.transforms);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createQuadBatch(base);
    expect(obj).not.toStrictEqual(base);
  });
});
