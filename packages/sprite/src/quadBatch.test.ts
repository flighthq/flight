import { createRectangle, createVector2 } from '@flighthq/geometry';
import { getNodeLocalBoundsRectangle, getNodeLocalBoundsRevision } from '@flighthq/node';
import { connectSignal } from '@flighthq/signals';
import type { QuadBatch, QuadTransformType, TextureAtlas, TextureAtlasRegion } from '@flighthq/types';
import { QuadBatchKind } from '@flighthq/types';

import {
  appendQuadBatchInstance,
  clearQuadBatch,
  cloneQuadBatch,
  compactQuadBatch,
  computeQuadBatchLocalBoundsRectangle,
  createQuadBatch,
  createQuadBatchData,
  createQuadBatchRuntime,
  createQuadBatchSignals,
  enableQuadBatchSignals,
  getQuadBatchCapacity,
  getQuadBatchInstanceId,
  getQuadBatchInstanceTransform,
  getQuadBatchRuntime,
  getQuadBatchSignals,
  getQuadBatchTransformStride,
  hitTestQuadBatchPoint,
  hitTestQuadBatchPointExact,
  hitTestQuadBatchPointExactXY,
  hitTestQuadBatchPointXY,
  iterateQuadBatchInstances,
  QUAD_BATCH_DELETED_ID,
  removeQuadBatchInstance,
  reserveQuadBatch,
  resizeQuadBatch,
  setQuadBatchInstance,
  setQuadBatchInstanceMatrix,
  setQuadBatchInstanceRange,
  setQuadBatchLocalBoundsRectangle,
  setQuadBatchTransformType,
} from './quadBatch';

function makeQuadAtlas(...regions: TextureAtlasRegion[]): TextureAtlas {
  return { image: null, regions } as TextureAtlas;
}

function makeQuadRegion(id = 0, width = 32, height = 32): TextureAtlasRegion {
  return { id, x: 0, y: 0, width, height, pivotX: null, pivotY: null } as TextureAtlasRegion;
}

describe('appendQuadBatchInstance', () => {
  it('appends an instance and returns its index', () => {
    const qb = createQuadBatch();
    const idx = appendQuadBatchInstance(qb, 3, 10, 20);
    expect(idx).toBe(0);
    expect(qb.data.instanceCount).toBe(1);
    expect(qb.data.ids[0]).toBe(3);
    expect(qb.data.transforms[0]).toBe(10);
    expect(qb.data.transforms[1]).toBe(20);
  });

  it('returns sequential indices for multiple appends', () => {
    const qb = createQuadBatch();
    expect(appendQuadBatchInstance(qb, 0, 0, 0)).toBe(0);
    expect(appendQuadBatchInstance(qb, 1, 5, 5)).toBe(1);
    expect(qb.data.instanceCount).toBe(2);
  });

  it('auto-grows capacity', () => {
    const qb = createQuadBatch();
    for (let i = 0; i < 10; i++) appendQuadBatchInstance(qb, i, i, i);
    expect(qb.data.instanceCount).toBe(10);
    expect(getQuadBatchCapacity(qb)).toBeGreaterThanOrEqual(10);
  });
});

describe('clearQuadBatch', () => {
  it('sets instanceCount to 0 and keeps capacity', () => {
    const qb = createQuadBatch();
    reserveQuadBatch(qb, 50);
    qb.data.instanceCount = 10;
    const capacityBefore = getQuadBatchCapacity(qb);
    clearQuadBatch(qb);
    expect(qb.data.instanceCount).toBe(0);
    expect(getQuadBatchCapacity(qb)).toBe(capacityBefore);
  });
});

describe('cloneQuadBatch', () => {
  it('copies atlas, count, transformType, and instance data', () => {
    const atlas = makeQuadAtlas(makeQuadRegion(0));
    const source = createQuadBatch({ data: { atlas } });
    appendQuadBatchInstance(source, 0, 10, 20);
    const clone = cloneQuadBatch(source);
    expect(clone).not.toBe(source);
    expect(clone.data.atlas).toBe(atlas);
    expect(clone.data.instanceCount).toBe(1);
    expect(clone.data.transformType).toBe('vector2');
    expect(getQuadBatchInstanceId(clone, 0)).toBe(0);
    expect(clone.data.transforms[0]).toBe(10);
    expect(clone.data.transforms[1]).toBe(20);
  });

  it('clones typed arrays so mutations do not leak back', () => {
    const source = createQuadBatch();
    appendQuadBatchInstance(source, 1, 0, 0);
    const clone = cloneQuadBatch(source);
    expect(clone.data.ids).not.toBe(source.data.ids);
    expect(clone.data.transforms).not.toBe(source.data.transforms);
    setQuadBatchInstance(clone, 0, 5, 99, 99);
    expect(getQuadBatchInstanceId(source, 0)).toBe(1);
    expect(source.data.transforms[0]).toBe(0);
  });

  it('copies materialData when present', () => {
    const source = createQuadBatch();
    appendQuadBatchInstance(source, 0, 0, 0);
    source.data.materialData = [{ tag: 'a' }];
    const clone = cloneQuadBatch(source);
    expect(clone.data.materialData).not.toBe(source.data.materialData);
    expect(clone.data.materialData).toEqual(source.data.materialData);
  });
});

describe('compactQuadBatch', () => {
  it('no-ops on an empty batch', () => {
    const qb = createQuadBatch();
    compactQuadBatch(qb);
    expect(qb.data.instanceCount).toBe(0);
  });

  it('removes sentinel-id entries and preserves order', () => {
    const qb = createQuadBatch();
    appendQuadBatchInstance(qb, 10, 1, 1);
    appendQuadBatchInstance(qb, 11, 2, 2);
    appendQuadBatchInstance(qb, 12, 3, 3);
    qb.data.ids[1] = QUAD_BATCH_DELETED_ID;
    compactQuadBatch(qb);
    expect(qb.data.instanceCount).toBe(2);
    expect(getQuadBatchInstanceId(qb, 0)).toBe(10);
    expect(getQuadBatchInstanceId(qb, 1)).toBe(12);
    expect(qb.data.transforms[2]).toBe(3); // third instance's x moved to slot 1
  });

  it('leaves a fully-live buffer unchanged', () => {
    const qb = createQuadBatch();
    appendQuadBatchInstance(qb, 1, 0, 0);
    appendQuadBatchInstance(qb, 2, 0, 0);
    compactQuadBatch(qb);
    expect(qb.data.instanceCount).toBe(2);
  });
});

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
    expect(data.materialData).toBeNull();
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

describe('createQuadBatchSignals', () => {
  it('creates a signals group with the three quad-batch signals', () => {
    const signals = createQuadBatchSignals();
    let appended = -1;
    let removed: readonly number[] = [];
    let cleared = false;
    connectSignal(signals.onInstanceAppended, (index) => {
      appended = index;
    });
    connectSignal(signals.onInstanceRemoved, (index, swapSource) => {
      removed = [index, swapSource];
    });
    connectSignal(signals.onCleared, () => {
      cleared = true;
    });
    signals.onInstanceAppended.emit(4);
    signals.onInstanceRemoved.emit(1, 2);
    signals.onCleared.emit();
    expect(appended).toBe(4);
    expect(removed).toEqual([1, 2]);
    expect(cleared).toBe(true);
  });
});

describe('enableQuadBatchSignals', () => {
  it('creates and attaches signals on first call', () => {
    const qb = createQuadBatch();
    expect(getQuadBatchSignals(qb)).toBeNull();
    const signals = enableQuadBatchSignals(qb);
    expect(signals).not.toBeNull();
    expect(getQuadBatchSignals(qb)).toBe(signals);
  });

  it('returns the same group on repeated calls', () => {
    const qb = createQuadBatch();
    expect(enableQuadBatchSignals(qb)).toBe(enableQuadBatchSignals(qb));
  });

  it('makes appendQuadBatchInstance fire onInstanceAppended', () => {
    const qb = createQuadBatch();
    const signals = enableQuadBatchSignals(qb);
    let received = -1;
    connectSignal(signals.onInstanceAppended, (index) => {
      received = index;
    });
    const idx = appendQuadBatchInstance(qb, 0, 0, 0);
    expect(received).toBe(idx);
  });

  it('makes removeQuadBatchInstance fire onInstanceRemoved with the swap source', () => {
    const qb = createQuadBatch();
    appendQuadBatchInstance(qb, 0, 0, 0);
    appendQuadBatchInstance(qb, 1, 0, 0);
    const signals = enableQuadBatchSignals(qb);
    let received: readonly number[] = [];
    connectSignal(signals.onInstanceRemoved, (index, swapSource) => {
      received = [index, swapSource];
    });
    removeQuadBatchInstance(qb, 0);
    expect(received).toEqual([0, 1]);
  });

  it('makes clearQuadBatch fire onCleared', () => {
    const qb = createQuadBatch();
    const signals = enableQuadBatchSignals(qb);
    let cleared = false;
    connectSignal(signals.onCleared, () => {
      cleared = true;
    });
    clearQuadBatch(qb);
    expect(cleared).toBe(true);
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

describe('getQuadBatchInstanceId', () => {
  it('returns the id at a valid index', () => {
    const qb = createQuadBatch();
    resizeQuadBatch(qb, 3);
    qb.data.ids[1] = 7;
    expect(getQuadBatchInstanceId(qb, 1)).toBe(7);
  });

  it('returns -1 for out-of-range index', () => {
    const qb = createQuadBatch();
    resizeQuadBatch(qb, 2);
    expect(getQuadBatchInstanceId(qb, -1)).toBe(-1);
    expect(getQuadBatchInstanceId(qb, 2)).toBe(-1);
  });
});

describe('getQuadBatchInstanceTransform', () => {
  it('writes x/y for vector2 batch', () => {
    const qb = createQuadBatch();
    resizeQuadBatch(qb, 1);
    qb.data.transforms[0] = 15;
    qb.data.transforms[1] = 25;
    const out = createVector2();
    const result = getQuadBatchInstanceTransform(out, qb, 0);
    expect(result).toBe(true);
    expect(out.x).toBe(15);
    expect(out.y).toBe(25);
  });

  it('writes tx/ty (offset 4/5) for matrix3x2 batch', () => {
    const qb = createQuadBatch({ data: { transformType: 'matrix3x2' } });
    resizeQuadBatch(qb, 1);
    // [a, b, c, d, tx, ty]
    qb.data.transforms.set([1, 0, 0, 1, 55, 66]);
    const out = createVector2();
    getQuadBatchInstanceTransform(out, qb, 0);
    expect(out.x).toBe(55);
    expect(out.y).toBe(66);
  });

  it('returns false and does not write for out-of-range index', () => {
    const qb = createQuadBatch();
    resizeQuadBatch(qb, 1);
    const out = createVector2(99, 99);
    const result = getQuadBatchInstanceTransform(out, qb, 5);
    expect(result).toBe(false);
    expect(out.x).toBe(99);
    expect(out.y).toBe(99);
  });
});

describe('getQuadBatchRuntime', () => {
  it('returns the runtime for a QuadBatch', () => {
    const quadBatch = createQuadBatch();
    const runtime = getQuadBatchRuntime(quadBatch);
    expect(runtime).not.toBeNull();
  });
});

describe('getQuadBatchSignals', () => {
  it('returns null before signals are enabled', () => {
    const qb = createQuadBatch();
    expect(getQuadBatchSignals(qb)).toBeNull();
  });

  it('returns the group after enabling', () => {
    const qb = createQuadBatch();
    const signals = enableQuadBatchSignals(qb);
    expect(getQuadBatchSignals(qb)).toBe(signals);
  });
});

describe('getQuadBatchTransformStride', () => {
  it('returns 2 if transform type is vector2', () => {
    expect(getQuadBatchTransformStride('vector2')).toBe(2);
  });

  it('returns 2 if transform type is vector2', () => {
    expect(getQuadBatchTransformStride('matrix3x2')).toBe(6);
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

describe('hitTestQuadBatchPointExact', () => {
  it('delegates to hitTestQuadBatchPointExactXY', () => {
    const atlas = makeQuadAtlas(makeQuadRegion(0));
    const quadBatch = createQuadBatch({ data: { atlas, instanceCount: 1 } });
    quadBatch.data.ids = new Uint16Array([0]);
    quadBatch.data.transforms = new Float32Array([10, 20]);
    expect(hitTestQuadBatchPointExact(quadBatch, { x: 15, y: 25 })).toBe(0);
    expect(hitTestQuadBatchPointExact(quadBatch, { x: 5, y: 5 })).toBe(-1);
  });
});

describe('hitTestQuadBatchPointExactXY', () => {
  it('returns -1 when atlas is null or empty', () => {
    expect(hitTestQuadBatchPointExactXY(createQuadBatch(), 0, 0)).toBe(-1);
    const atlas = makeQuadAtlas(makeQuadRegion(0));
    expect(hitTestQuadBatchPointExactXY(createQuadBatch({ data: { atlas } }), 0, 0)).toBe(-1);
  });

  it('hits an axis-aligned vector2 quad like the AABB variant', () => {
    const atlas = makeQuadAtlas(makeQuadRegion(0, 32, 32));
    const quadBatch = createQuadBatch({ data: { atlas, instanceCount: 1 } });
    quadBatch.data.ids = new Uint16Array([0]);
    quadBatch.data.transforms = new Float32Array([10, 20]);
    expect(hitTestQuadBatchPointExactXY(quadBatch, 15, 25)).toBe(0);
    expect(hitTestQuadBatchPointExactXY(quadBatch, 5, 5)).toBe(-1);
  });

  it('rejects an AABB corner that lies outside a rotated quad', () => {
    // 45-degree rotation of a 100x100 quad. cos45 = sin45 ≈ 0.7071.
    const s = Math.SQRT1_2;
    const atlas = makeQuadAtlas(makeQuadRegion(0, 100, 100));
    const quadBatch = createQuadBatch({ data: { atlas, instanceCount: 1, transformType: 'matrix3x2' } });
    quadBatch.data.ids = new Uint16Array([0]);
    // [a, b, c, d, tx, ty] = rotate 45 about origin, no translation.
    quadBatch.data.transforms = new Float32Array([s, s, -s, s, 0, 0]);
    // The rotated diamond reaches x in [-70.7, 70.7], y in [0, 141.4]. The point (60, 5)
    // is inside that AABB but outside the diamond near the right tip.
    expect(hitTestQuadBatchPointExactXY(quadBatch, 60, 5)).toBe(-1);
    // The AABB variant over-reports and treats it as a hit.
    expect(hitTestQuadBatchPointXY(quadBatch, 60, 5)).toBe(0);
    // The diamond center is a genuine hit for both.
    expect(hitTestQuadBatchPointExactXY(quadBatch, 0, 70)).toBe(0);
  });

  it('returns -1 for out-of-range region ids', () => {
    const atlas = makeQuadAtlas(makeQuadRegion(0));
    const quadBatch = createQuadBatch({ data: { atlas, instanceCount: 1, transformType: 'matrix3x2' } });
    quadBatch.data.ids = new Uint16Array([99]);
    quadBatch.data.transforms = new Float32Array([1, 0, 0, 1, 0, 0]);
    expect(hitTestQuadBatchPointExactXY(quadBatch, 5, 5)).toBe(-1);
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

describe('iterateQuadBatchInstances', () => {
  it('visits each live instance in order with id and transform view', () => {
    const qb = createQuadBatch();
    appendQuadBatchInstance(qb, 7, 1, 2);
    appendQuadBatchInstance(qb, 8, 3, 4);
    const seen: Array<{ index: number; id: number; x: number; y: number }> = [];
    iterateQuadBatchInstances(qb, (index, id, transforms) => {
      seen.push({ index, id, x: transforms[0], y: transforms[1] });
    });
    expect(seen).toEqual([
      { index: 0, id: 7, x: 1, y: 2 },
      { index: 1, id: 8, x: 3, y: 4 },
    ]);
  });

  it('provides a stride-length view for matrix3x2 batches', () => {
    const qb = createQuadBatch({ data: { transformType: 'matrix3x2' } });
    resizeQuadBatch(qb, 1);
    qb.data.ids[0] = 2;
    qb.data.transforms.set([1, 0, 0, 1, 9, 10]);
    let length = -1;
    iterateQuadBatchInstances(qb, (_index, _id, transforms) => {
      length = transforms.length;
    });
    expect(length).toBe(6);
  });

  it('does not invoke the visitor for an empty batch', () => {
    const qb = createQuadBatch();
    let calls = 0;
    iterateQuadBatchInstances(qb, () => {
      calls++;
    });
    expect(calls).toBe(0);
  });
});

describe('removeQuadBatchInstance', () => {
  it('swap-removes the target instance with the last', () => {
    const qb = createQuadBatch();
    appendQuadBatchInstance(qb, 0, 0, 0);
    appendQuadBatchInstance(qb, 1, 10, 10);
    appendQuadBatchInstance(qb, 2, 20, 20);
    removeQuadBatchInstance(qb, 0);
    expect(qb.data.instanceCount).toBe(2);
    // The last instance (id=2) should now be at index 0
    expect(getQuadBatchInstanceId(qb, 0)).toBe(2);
  });

  it('removes the last instance directly', () => {
    const qb = createQuadBatch();
    appendQuadBatchInstance(qb, 5, 50, 50);
    removeQuadBatchInstance(qb, 0);
    expect(qb.data.instanceCount).toBe(0);
  });

  it('no-ops for out-of-range index', () => {
    const qb = createQuadBatch();
    appendQuadBatchInstance(qb, 0, 0, 0);
    removeQuadBatchInstance(qb, -1);
    removeQuadBatchInstance(qb, 1);
    expect(qb.data.instanceCount).toBe(1);
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

describe('setQuadBatchInstance', () => {
  it('writes id and x/y into the given index', () => {
    const qb = createQuadBatch();
    resizeQuadBatch(qb, 3);
    setQuadBatchInstance(qb, 1, 7, 100, 200);
    expect(getQuadBatchInstanceId(qb, 1)).toBe(7);
    const out = createVector2();
    getQuadBatchInstanceTransform(out, qb, 1);
    expect(out.x).toBe(100);
    expect(out.y).toBe(200);
  });

  it('no-ops for out-of-range index', () => {
    const qb = createQuadBatch();
    resizeQuadBatch(qb, 1);
    qb.data.ids[0] = 0;
    setQuadBatchInstance(qb, -1, 9, 0, 0);
    setQuadBatchInstance(qb, 1, 9, 0, 0);
    expect(qb.data.ids[0]).toBe(0);
  });
});

describe('setQuadBatchInstanceMatrix', () => {
  it('writes id and all 6 matrix components', () => {
    const qb = createQuadBatch({ data: { transformType: 'matrix3x2' } });
    resizeQuadBatch(qb, 1);
    setQuadBatchInstanceMatrix(qb, 0, 3, 1, 2, 3, 4, 5, 6);
    expect(qb.data.ids[0]).toBe(3);
    expect(qb.data.transforms[0]).toBe(1); // a
    expect(qb.data.transforms[1]).toBe(2); // b
    expect(qb.data.transforms[2]).toBe(3); // c
    expect(qb.data.transforms[3]).toBe(4); // d
    expect(qb.data.transforms[4]).toBe(5); // tx
    expect(qb.data.transforms[5]).toBe(6); // ty
  });

  it('no-ops for out-of-range index', () => {
    const qb = createQuadBatch({ data: { transformType: 'matrix3x2' } });
    resizeQuadBatch(qb, 1);
    qb.data.ids[0] = 0;
    setQuadBatchInstanceMatrix(qb, 1, 9, 1, 0, 0, 1, 0, 0);
    expect(qb.data.ids[0]).toBe(0);
  });
});

describe('setQuadBatchInstanceRange', () => {
  it('writes contiguous vector2 transforms from a source array', () => {
    const qb = createQuadBatch();
    resizeQuadBatch(qb, 3);
    setQuadBatchInstanceRange(qb, 1, 2, new Float32Array([10, 20, 30, 40]));
    const out = createVector2();
    getQuadBatchInstanceTransform(out, qb, 1);
    expect(out.x).toBe(10);
    expect(out.y).toBe(20);
    getQuadBatchInstanceTransform(out, qb, 2);
    expect(out.x).toBe(30);
    expect(out.y).toBe(40);
  });

  it('writes matrix3x2 transforms using the 6-float stride', () => {
    const qb = createQuadBatch({ data: { transformType: 'matrix3x2' } });
    resizeQuadBatch(qb, 1);
    setQuadBatchInstanceRange(qb, 0, 1, new Float32Array([1, 0, 0, 1, 7, 8]));
    expect(qb.data.transforms[4]).toBe(7);
    expect(qb.data.transforms[5]).toBe(8);
  });

  it('no-ops when the range exceeds instanceCount', () => {
    const qb = createQuadBatch();
    resizeQuadBatch(qb, 2);
    setQuadBatchInstanceRange(qb, 1, 5, new Float32Array([99, 99, 99, 99, 99, 99, 99, 99, 99, 99]));
    expect(qb.data.transforms[2]).toBe(0);
  });

  it('no-ops for a non-positive count or negative start', () => {
    const qb = createQuadBatch();
    resizeQuadBatch(qb, 2);
    setQuadBatchInstanceRange(qb, 0, 0, new Float32Array([1, 2]));
    setQuadBatchInstanceRange(qb, -1, 1, new Float32Array([1, 2]));
    expect(qb.data.transforms[0]).toBe(0);
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

describe('setQuadBatchTransformType', () => {
  it('no-ops when the new type matches the current type', () => {
    const qb = createQuadBatch();
    appendQuadBatchInstance(qb, 0, 1, 2);
    const transforms = qb.data.transforms;
    setQuadBatchTransformType(qb, 'vector2');
    expect(qb.data.transformType).toBe('vector2');
    expect(qb.data.transforms).toBe(transforms);
  });

  it('expands vector2 to matrix3x2 as identity + translation', () => {
    const qb = createQuadBatch();
    appendQuadBatchInstance(qb, 0, 5, 6);
    appendQuadBatchInstance(qb, 1, 7, 8);
    setQuadBatchTransformType(qb, 'matrix3x2');
    expect(qb.data.transformType).toBe('matrix3x2');
    // First instance: [1, 0, 0, 1, 5, 6]
    expect(Array.from(qb.data.transforms.subarray(0, 6))).toEqual([1, 0, 0, 1, 5, 6]);
    // Second instance: [1, 0, 0, 1, 7, 8]
    expect(Array.from(qb.data.transforms.subarray(6, 12))).toEqual([1, 0, 0, 1, 7, 8]);
  });

  it('collapses matrix3x2 to vector2 keeping only translation', () => {
    const qb = createQuadBatch({ data: { transformType: 'matrix3x2' } });
    resizeQuadBatch(qb, 2);
    setQuadBatchInstanceMatrix(qb, 0, 0, 2, 0, 0, 2, 10, 20);
    setQuadBatchInstanceMatrix(qb, 1, 1, 2, 0, 0, 2, 30, 40);
    setQuadBatchTransformType(qb, 'vector2');
    expect(qb.data.transformType).toBe('vector2');
    expect(qb.data.transforms[0]).toBe(10);
    expect(qb.data.transforms[1]).toBe(20);
    expect(qb.data.transforms[2]).toBe(30);
    expect(qb.data.transforms[3]).toBe(40);
  });
});
