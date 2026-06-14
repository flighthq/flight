import { createRectangle } from '@flighthq/geometry';
import { getNodeLocalBoundsRectangle, getNodeLocalBoundsRevision } from '@flighthq/node';
import type { QuadBatch, QuadTransformType, TextureAtlas, TextureAtlasRegion } from '@flighthq/types';
import { QuadBatchKind } from '@flighthq/types';

import {
  computeQuadBatchLocalBoundsRectangle,
  createQuadBatch,
  createQuadBatchData,
  createQuadBatchRuntime,
  getQuadBatchCapacity,
  getQuadBatchRuntime,
  getQuadTransformStride,
  hitTestQuadBatchPoint,
  hitTestQuadBatchPointXY,
  reserveQuadBatch,
  resizeQuadBatch,
  setQuadBatchLocalBoundsRectangle,
} from './quadBatch';

describe('computeQuadBatchLocalBoundsRectangle', () => {
  it('returns zero bounds when atlas is null', () => {
    const quadBatch = createQuadBatch();
    const out = createRectangle(1, 2, 3, 4);
    computeQuadBatchLocalBoundsRectangle(out, quadBatch);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBe(0);
    expect(out.height).toBe(0);
  });

  it('returns zero bounds when instanceCount is 0', () => {
    const region = { id: 0, x: 0, y: 0, width: 32, height: 32, pivotX: null, pivotY: null } as TextureAtlasRegion;
    const atlas = { image: null, regions: [region] } as TextureAtlas;
    const quadBatch = createQuadBatch({ data: { atlas } });
    const out = createRectangle(1, 2, 3, 4);
    computeQuadBatchLocalBoundsRectangle(out, quadBatch);
    expect(out.width).toBe(0);
    expect(out.height).toBe(0);
  });

  it('computes AABB over all quads for vector2 transforms', () => {
    const region = { id: 0, x: 0, y: 0, width: 32, height: 16, pivotX: null, pivotY: null } as TextureAtlasRegion;
    const atlas = { image: null, regions: [region] } as TextureAtlas;
    const quadBatch = createQuadBatch({ data: { atlas, instanceCount: 2 } });
    quadBatch.data.ids = new Uint16Array([0, 0]);
    quadBatch.data.transforms = new Float32Array([10, 20, 50, 100]);
    const out = createRectangle();
    computeQuadBatchLocalBoundsRectangle(out, quadBatch);
    expect(out.x).toBe(10);
    expect(out.y).toBe(20);
    expect(out.width).toBe(72); // 50+32 - 10
    expect(out.height).toBe(96); // 100+16 - 20
  });

  it('skips quads with out-of-range region ids for vector2 transforms', () => {
    const region = { id: 0, x: 0, y: 0, width: 32, height: 32, pivotX: null, pivotY: null } as TextureAtlasRegion;
    const atlas = { image: null, regions: [region] } as TextureAtlas;
    const quadBatch = createQuadBatch({ data: { atlas, instanceCount: 2 } });
    quadBatch.data.ids = new Uint16Array([0, 99]);
    quadBatch.data.transforms = new Float32Array([0, 0, 1000, 1000]);
    const out = createRectangle();
    computeQuadBatchLocalBoundsRectangle(out, quadBatch);
    expect(out.width).toBe(32);
    expect(out.height).toBe(32);
  });

  it('computes AABB over all quads for matrix3x2 transforms', () => {
    const region = { id: 0, x: 0, y: 0, width: 10, height: 10, pivotX: null, pivotY: null } as TextureAtlasRegion;
    const atlas = { image: null, regions: [region] } as TextureAtlas;
    const quadBatch = createQuadBatch({ data: { atlas, instanceCount: 1, transformType: 'matrix3x2' } });
    quadBatch.data.ids = new Uint16Array([0]);
    // identity matrix at offset (5, 5): [1, 0, 0, 1, 5, 5]
    quadBatch.data.transforms = new Float32Array([1, 0, 0, 1, 5, 5]);
    const out = createRectangle();
    computeQuadBatchLocalBoundsRectangle(out, quadBatch);
    expect(out.x).toBe(5);
    expect(out.y).toBe(5);
    expect(out.width).toBe(10);
    expect(out.height).toBe(10);
  });

  it('does not store the result on the batch', () => {
    const region = { id: 0, x: 0, y: 0, width: 32, height: 16, pivotX: null, pivotY: null } as TextureAtlasRegion;
    const atlas = { image: null, regions: [region] } as TextureAtlas;
    const quadBatch = createQuadBatch({ data: { atlas, instanceCount: 1 } });
    quadBatch.data.ids = new Uint16Array([0]);
    quadBatch.data.transforms = new Float32Array([10, 20]);
    const revisionBefore = getNodeLocalBoundsRevision(quadBatch);
    computeQuadBatchLocalBoundsRectangle(createRectangle(), quadBatch);
    expect(getNodeLocalBoundsRevision(quadBatch)).toBe(revisionBefore);
    expect(getNodeLocalBoundsRectangle(quadBatch).width).toBe(0);
  });
});

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

describe('createQuadBatchData', () => {
  it('returns default values', () => {
    const data = createQuadBatchData();
    expect(data.atlas).toBeNull();
    expect(data.instanceCount).toBe(0);
    expect(data.ids).toBeInstanceOf(Uint16Array);
    expect(data.transforms).toBeInstanceOf(Float32Array);
    expect(data.transformType).toBe('vector2');
  });

  it('allows pre-defined values', () => {
    const data = createQuadBatchData({ instanceCount: 10 });
    expect(data.instanceCount).toBe(10);
  });
});

describe('createQuadBatchRuntime', () => {
  it('returns a non-null runtime', () => {
    const runtime = createQuadBatchRuntime();
    expect(runtime).not.toBeNull();
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

describe('getQuadBatchRuntime', () => {
  it('returns the runtime for a QuadBatch', () => {
    const quadBatch = createQuadBatch();
    const runtime = getQuadBatchRuntime(quadBatch);
    expect(runtime).not.toBeNull();
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

describe('hitTestQuadBatchPoint', () => {
  it('delegates to hitTestQuadBatchPointXY', () => {
    const region = { id: 0, x: 0, y: 0, width: 32, height: 32, pivotX: null, pivotY: null } as TextureAtlasRegion;
    const atlas = { image: null, regions: [region] } as TextureAtlas;
    const quadBatch = createQuadBatch({ data: { atlas, instanceCount: 1 } });
    quadBatch.data.ids = new Uint16Array([0]);
    quadBatch.data.transforms = new Float32Array([10, 20]);
    expect(hitTestQuadBatchPoint(quadBatch, { x: 15, y: 25 })).toBe(0);
    expect(hitTestQuadBatchPoint(quadBatch, { x: 5, y: 5 })).toBe(-1);
  });
});

describe('hitTestQuadBatchPointXY', () => {
  it('returns -1 when atlas is null', () => {
    const quadBatch = createQuadBatch();
    expect(hitTestQuadBatchPointXY(quadBatch, 0, 0)).toBe(-1);
  });

  it('returns -1 when instanceCount is 0', () => {
    const region = { id: 0, x: 0, y: 0, width: 32, height: 32, pivotX: null, pivotY: null } as TextureAtlasRegion;
    const atlas = { image: null, regions: [region] } as TextureAtlas;
    const quadBatch = createQuadBatch({ data: { atlas } });
    expect(hitTestQuadBatchPointXY(quadBatch, 0, 0)).toBe(-1);
  });

  it('returns the index of a hit quad for vector2 transforms', () => {
    const region = { id: 0, x: 0, y: 0, width: 32, height: 32, pivotX: null, pivotY: null } as TextureAtlasRegion;
    const atlas = { image: null, regions: [region] } as TextureAtlas;
    const quadBatch = createQuadBatch({ data: { atlas, instanceCount: 2 } });
    quadBatch.data.ids = new Uint16Array([0, 0]);
    quadBatch.data.transforms = new Float32Array([10, 20, 100, 200]);
    expect(hitTestQuadBatchPointXY(quadBatch, 15, 25)).toBe(0);
    expect(hitTestQuadBatchPointXY(quadBatch, 110, 210)).toBe(1);
  });

  it('returns -1 when point is outside all quads for vector2 transforms', () => {
    const region = { id: 0, x: 0, y: 0, width: 32, height: 32, pivotX: null, pivotY: null } as TextureAtlasRegion;
    const atlas = { image: null, regions: [region] } as TextureAtlas;
    const quadBatch = createQuadBatch({ data: { atlas, instanceCount: 1 } });
    quadBatch.data.ids = new Uint16Array([0]);
    quadBatch.data.transforms = new Float32Array([10, 20]);
    expect(hitTestQuadBatchPointXY(quadBatch, 0, 0)).toBe(-1);
    expect(hitTestQuadBatchPointXY(quadBatch, 42, 20)).toBe(-1);
  });

  it('returns the first hit index when quads overlap for vector2 transforms', () => {
    const region = { id: 0, x: 0, y: 0, width: 32, height: 32, pivotX: null, pivotY: null } as TextureAtlasRegion;
    const atlas = { image: null, regions: [region] } as TextureAtlas;
    const quadBatch = createQuadBatch({ data: { atlas, instanceCount: 2 } });
    quadBatch.data.ids = new Uint16Array([0, 0]);
    quadBatch.data.transforms = new Float32Array([0, 0, 0, 0]);
    expect(hitTestQuadBatchPointXY(quadBatch, 10, 10)).toBe(0);
  });

  it('returns -1 for out-of-range region id for vector2 transforms', () => {
    const region = { id: 0, x: 0, y: 0, width: 32, height: 32, pivotX: null, pivotY: null } as TextureAtlasRegion;
    const atlas = { image: null, regions: [region] } as TextureAtlas;
    const quadBatch = createQuadBatch({ data: { atlas, instanceCount: 1 } });
    quadBatch.data.ids = new Uint16Array([99]);
    quadBatch.data.transforms = new Float32Array([0, 0]);
    expect(hitTestQuadBatchPointXY(quadBatch, 5, 5)).toBe(-1);
  });

  it('returns the index of a hit quad for matrix3x2 transforms', () => {
    const region = { id: 0, x: 0, y: 0, width: 32, height: 32, pivotX: null, pivotY: null } as TextureAtlasRegion;
    const atlas = { image: null, regions: [region] } as TextureAtlas;
    const quadBatch = createQuadBatch({ data: { atlas, instanceCount: 1, transformType: 'matrix3x2' } });
    quadBatch.data.ids = new Uint16Array([0]);
    // identity matrix at offset (50, 60): [1, 0, 0, 1, 50, 60]
    quadBatch.data.transforms = new Float32Array([1, 0, 0, 1, 50, 60]);
    expect(hitTestQuadBatchPointXY(quadBatch, 60, 70)).toBe(0);
    expect(hitTestQuadBatchPointXY(quadBatch, 40, 50)).toBe(-1);
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

describe('setQuadBatchLocalBoundsRectangle', () => {
  it('makes getNodeLocalBoundsRectangle reflect the new bounds', () => {
    const quadBatch = createQuadBatch();
    setQuadBatchLocalBoundsRectangle(quadBatch, createRectangle(10, 20, 32, 16));
    const local = getNodeLocalBoundsRectangle(quadBatch);
    expect(local.x).toBe(10);
    expect(local.y).toBe(20);
    expect(local.width).toBe(32);
    expect(local.height).toBe(16);
  });

  it('copies the rect so later mutations to the source do not affect stored bounds', () => {
    const quadBatch = createQuadBatch();
    const rect = createRectangle(10, 20, 32, 16);
    setQuadBatchLocalBoundsRectangle(quadBatch, rect);
    rect.width = 999;
    expect(getNodeLocalBoundsRectangle(quadBatch).width).toBe(32);
  });

  it('invalidates local bounds', () => {
    const quadBatch = createQuadBatch();
    const before = getNodeLocalBoundsRevision(quadBatch);
    setQuadBatchLocalBoundsRectangle(quadBatch, createRectangle());
    expect(getNodeLocalBoundsRevision(quadBatch)).not.toBe(before);
  });

  it('returns zero bounds via getNodeLocalBoundsRectangle before any set', () => {
    const quadBatch = createQuadBatch();
    const local = getNodeLocalBoundsRectangle(quadBatch);
    expect(local.width).toBe(0);
    expect(local.height).toBe(0);
  });
});
