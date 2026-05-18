import type { QuadBatch, QuadTransformType, TextureAtlas } from '@flighthq/types';
import { QuadBatchKind } from '@flighthq/types';

import {
  createQuadBatch,
  getQuadBatchCapacity,
  getQuadTransformStride,
  reserveQuadBatch,
  resizeQuadBatch,
} from './quadBatch';

describe('createQuadBatch', () => {
  let quadBatch: QuadBatch;

  beforeEach(() => {
    quadBatch = createQuadBatch();
  });

  it('initializes default values', () => {
    expect(quadBatch.data.atlas).toBeNull();
    expect(quadBatch.data.ids).toStrictEqual(new Uint16Array());
    expect(quadBatch.data.instanceCount).toBe(0);
    expect(quadBatch.data.transforms).toStrictEqual(new Float32Array());
    expect(quadBatch.data.transformType).toBe('vector2');
    expect(quadBatch.kind).toBe(QuadBatchKind);
  });

  it('allows pre-defined values', () => {
    const base = {
      data: {
        atlas: {} as TextureAtlas,
        ids: new Uint16Array(),
        instanceCount: 1000,
        transforms: new Float32Array(),
        transformType: 'matrix3x2' as QuadTransformType,
      },
    };
    const obj = createQuadBatch(base);
    expect(obj.data.atlas).toStrictEqual(base.data.atlas);
    expect(obj.data.ids).toStrictEqual(base.data.ids);
    expect(obj.data.instanceCount).toStrictEqual(base.data.instanceCount);
    expect(obj.data.transforms).toStrictEqual(base.data.transforms);
    expect(obj.data.transformType).toStrictEqual(base.data.transformType);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createQuadBatch(base);
    expect(obj).not.toStrictEqual(base);
  });
});

describe('getQuadBatchCapacity', () => {
  it('returns 0 for a new quad batch', () => {
    const quadBatch = createQuadBatch();
    expect(getQuadBatchCapacity(quadBatch)).toBe(0);
  });

  it('returns the current capacity', () => {
    const quadBatch = createQuadBatch();
    quadBatch.data.ids = new Uint16Array(20);
    quadBatch.data.transforms = new Float32Array(40); // 20 * 2
    expect(getQuadBatchCapacity(quadBatch)).toBe(20);
  });

  it('returns the lowest value if arrays are misaligned in size', () => {
    const quadBatch = createQuadBatch();
    quadBatch.data.ids = new Uint16Array(10);
    quadBatch.data.transforms = new Float32Array(40); // 20 * 2
    expect(getQuadBatchCapacity(quadBatch)).toBe(10);
    quadBatch.data.ids = new Uint16Array(100);
    expect(getQuadBatchCapacity(quadBatch)).toBe(20);
  });
});

describe('getQuadTransformStride', () => {
  it('returns 2 if transform type is vector2', () => {
    expect(getQuadTransformStride('vector2')).toBe(2);
  });

  it('returns 2 if transform type is vector2', () => {
    expect(getQuadTransformStride('matrix3x2')).toBe(6);
  });
});

describe('reserveQuadBatch', () => {
  it('allocates if capacity is larger', () => {
    const quadBatch = createQuadBatch();
    reserveQuadBatch(quadBatch, 100);
    expect(quadBatch.data.ids.length).toBe(100);
    expect(quadBatch.data.transforms.length).toBe(100 * 2); // vector2
  });

  it('does not allocate if capacity is less than', () => {
    const quadBatch = createQuadBatch();
    quadBatch.data.ids = new Uint16Array(100);
    quadBatch.data.transforms = new Float32Array(2 * 100);
    const { ids, transforms } = quadBatch.data;
    reserveQuadBatch(quadBatch, 50);
    expect(quadBatch.data.ids).toStrictEqual(ids);
    expect(quadBatch.data.transforms).toStrictEqual(transforms);
  });

  it('does not allocate if capacity is equal', () => {
    const quadBatch = createQuadBatch();
    quadBatch.data.ids = new Uint16Array(100);
    quadBatch.data.transforms = new Float32Array(2 * 100);
    const { ids, transforms } = quadBatch.data;
    reserveQuadBatch(quadBatch, 100);
    expect(quadBatch.data.ids).toStrictEqual(ids);
    expect(quadBatch.data.transforms).toStrictEqual(transforms);
  });
});

describe('resizeQuadBatch', () => {
  it('allocates if instance count is greater than capacity', () => {
    const quadBatch = createQuadBatch();
    resizeQuadBatch(quadBatch, 100);
    expect(quadBatch.data.ids.length).toBe(100);
    expect(quadBatch.data.transforms.length).toBe(100 * 2);
  });

  it('sets instance count', () => {
    const quadBatch = createQuadBatch();
    resizeQuadBatch(quadBatch, 100);
    expect(quadBatch.data.instanceCount).toBe(100);
  });

  it('trusts instance count and does not allocate if shrinking', () => {
    const quadBatch = createQuadBatch();
    expect(quadBatch.data.ids.length).toBe(0);
    expect(quadBatch.data.transforms.length).toBe(0);
    quadBatch.data.instanceCount = 200;
    resizeQuadBatch(quadBatch, 100);
    expect(quadBatch.data.ids.length).toBe(0);
    expect(quadBatch.data.transforms.length).toBe(0);
    expect(quadBatch.data.instanceCount).toBe(100);
  });
});
