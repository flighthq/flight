import type { ImageSource, QuadBatch } from '@flighthq/types';
import { QuadBatchKind } from '@flighthq/types';

import { createQuadBatch } from './quadBatch';

describe('createQuadBatch', () => {
  let quadBatch: QuadBatch;

  beforeEach(() => {
    quadBatch = createQuadBatch();
  });

  it('initializes default values', () => {
    expect(quadBatch.data.image).toBeNull();
    expect(quadBatch.data.indices).toBeNull();
    expect(quadBatch.data.rects).toBeNull();
    expect(quadBatch.data.transforms).toBeNull();
    expect(quadBatch.kind).toBe(QuadBatchKind);
  });

  it('allows pre-defined values', () => {
    const base = {
      data: {
        image: {} as ImageSource,
        indices: new Int16Array(),
        rects: new Float32Array(),
        transforms: new Float32Array(),
      },
    };
    const obj = createQuadBatch(base);
    expect(obj.data.image).toStrictEqual(base.data.image);
    expect(obj.data.indices).toStrictEqual(base.data.indices);
    expect(obj.data.rects).toStrictEqual(base.data.rects);
    expect(obj.data.transforms).toStrictEqual(base.data.transforms);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createQuadBatch(base);
    expect(obj).not.toStrictEqual(base);
  });
});
