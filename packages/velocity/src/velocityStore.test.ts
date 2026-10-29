import { createMatrix } from '@flighthq/geometry/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';

import {
  beginVelocityFrame,
  contributeVelocity,
  createVelocityField,
  createVelocitySample,
  ensureNodeVelocitySample,
  ensureVelocitySample,
  explainVelocity,
  findVelocitySample,
  getVelocity,
  getVelocitySampleAt,
  hasVelocity,
  initializeVelocityField,
  suppressVelocity,
} from './contract.ts';

function readVelocity(field: Parameters<typeof getVelocity>[0], source: Parameters<typeof getVelocity>[1]) {
  const out = { x: 0, y: 0 };
  getVelocity(field, source, out);
  return out;
}

describe('beginVelocityFrame', () => {
  it('advances the frame id', () => {
    const field = createVelocityField();
    const before = field.frameId;
    beginVelocityFrame(field);
    expect(field.frameId).toBe(before + 1);
  });

  it('makes a source stale after a frame begins and fresh after a new write', () => {
    const field = createVelocityField();
    const source = {};
    contributeVelocity(field, source, 2, 2);
    beginVelocityFrame(field);
    expect(readVelocity(field, source)).toEqual({ x: 0, y: 0 });
    expect(hasVelocity(field, source)).toBe(false);
    expect(explainVelocity(field, source)).toMatchObject({
      reason: 'stale',
      lastFrameId: field.frameId - 1,
      currentFrameId: field.frameId,
    });
    contributeVelocity(field, source, 5, 0);
    expect(readVelocity(field, source)).toEqual({ x: 5, y: 0 });
    expect(explainVelocity(field, source).lastFrameId).toBe(field.frameId);
  });
});

describe('contributeVelocity', () => {
  it('records an explicit velocity readable this frame', () => {
    const field = createVelocityField();
    const source = {};
    contributeVelocity(field, source, 3, -4);
    expect(readVelocity(field, source)).toEqual({ x: 3, y: -4 });
  });

  it('accepts arbitrary non-entity object sources', () => {
    class Batch {
      instances = 3;
    }
    const field = createVelocityField();
    const sources: object[] = [{}, new Batch(), [1, 2, 3], () => 0, Object.freeze({ id: 1 })];
    sources.forEach((source, i) => contributeVelocity(field, source, i + 1, -(i + 1)));
    sources.forEach((source, i) => {
      expect(readVelocity(field, source)).toEqual({ x: i + 1, y: -(i + 1) });
    });
  });

  it('rejects primitive sources at the type level', () => {
    const field = createVelocityField();
    const out = { x: 0, y: 0 };
    const typeOnly = (): void => {
      // @ts-expect-error a number is not an object source
      contributeVelocity(field, 1, 0, 0);
      // @ts-expect-error a string is not an object source
      suppressVelocity(field, 'node');
      // @ts-expect-error null is not an object source
      getVelocity(field, null, out);
      // @ts-expect-error a boolean is not an object source
      hasVelocity(field, true);
      // @ts-expect-error a symbol is not an object source
      explainVelocity(field, Symbol('s'));
      // @ts-expect-error undefined is not an object source
      ensureVelocitySample(field, undefined);
    };
    expect(typeof typeOnly).toBe('function');
  });
});

describe('createVelocityField', () => {
  it('starts at frame zero and returns zero for unknown sources', () => {
    const field = createVelocityField();
    expect(field.frameId).toBe(0);
    expect(readVelocity(field, {})).toEqual({ x: 0, y: 0 });
  });

  it('stores samples in a WeakMap so sources are not strongly retained', () => {
    const field = createVelocityField();
    contributeVelocity(field, {}, 1, 1);
    expect(field.samples).toBeInstanceOf(WeakMap);
    expect('size' in field.samples).toBe(false);
    expect(Symbol.iterator in field.samples).toBe(false);
    expect('keys' in field.samples).toBe(false);
    expect('forEach' in field.samples).toBe(false);
  });
});

describe('ensureNodeVelocitySample', () => {
  it('keys the sample by the node identity', () => {
    const field = createVelocityField();
    const node = createDisplayObject();
    ensureNodeVelocitySample(field, node).velocity.x = 6;
    expect(findVelocitySample(field, node)?.velocity.x).toBe(6);
  });

  it('gives distinct nodes distinct samples', () => {
    const field = createVelocityField();
    const a = createDisplayObject();
    const b = createDisplayObject();
    ensureNodeVelocitySample(field, a).velocity.x = 1;
    ensureNodeVelocitySample(field, b).velocity.x = 2;
    expect(ensureNodeVelocitySample(field, a).velocity.x).toBe(1);
    expect(ensureNodeVelocitySample(field, b).velocity.x).toBe(2);
  });
});

describe('ensureVelocitySample', () => {
  it('creates the default sample for a new source', () => {
    const field = createVelocityField();
    expect(ensureVelocitySample(field, {})).toEqual(createVelocitySample());
  });

  it('returns the same sample on repeat calls', () => {
    const field = createVelocityField();
    const source = {};
    ensureVelocitySample(field, source).velocity.x = 42;
    expect(ensureVelocitySample(field, source).velocity.x).toBe(42);
  });

  it('gives distinct objects with equal fields distinct samples', () => {
    const field = createVelocityField();
    const a = { id: 7 };
    const b = { id: 7 };
    expect(ensureVelocitySample(field, a)).not.toBe(ensureVelocitySample(field, b));
    contributeVelocity(field, a, 4, 5);
    expect(readVelocity(field, a)).toEqual({ x: 4, y: 5 });
    expect(readVelocity(field, b)).toEqual({ x: 0, y: 0 });
    expect(explainVelocity(field, b).reason).toBe('stale');
  });

  it('reuses the same sample object for the same source across frames', () => {
    const field = createVelocityField();
    const source = {};
    const first = ensureVelocitySample(field, source);
    beginVelocityFrame(field);
    beginVelocityFrame(field);
    expect(ensureVelocitySample(field, source)).toBe(first);
    contributeVelocity(field, source, 1, 1);
    expect(ensureVelocitySample(field, source)).toBe(first);
    expect(first.velocity).toEqual({ x: 1, y: 1 });
  });
});

describe('explainVelocity', () => {
  it('reports no sample for an unknown source', () => {
    const field = createVelocityField();
    expect(explainVelocity(field, {})).toMatchObject({ reason: 'no-sample', lastFrameId: -1 });
  });

  it('reports stale when the sample was not touched this frame', () => {
    const field = createVelocityField();
    const source = {};
    contributeVelocity(field, source, 5, 5);
    beginVelocityFrame(field);
    expect(explainVelocity(field, source).reason).toBe('stale');
  });

  it('reports explicit zero for a suppressed velocity', () => {
    const field = createVelocityField();
    const source = {};
    suppressVelocity(field, source);
    expect(explainVelocity(field, source)).toMatchObject({ reason: 'explicit-zero', explicit: true });
  });

  it('reports derived zero when the transform baseline produces zero', () => {
    const field = createVelocityField();
    const source = {};
    const sample = ensureVelocitySample(field, source);
    sample.velocity.x = 0;
    sample.velocity.y = 0;
    sample.lastFrameId = field.frameId;
    expect(explainVelocity(field, source)).toMatchObject({ reason: 'derived-zero', explicit: false });
  });

  it('reports ok with velocity values for a contributing source', () => {
    const field = createVelocityField();
    const source = {};
    contributeVelocity(field, source, 3, -4);
    expect(explainVelocity(field, source)).toMatchObject({ reason: 'ok', x: 3, y: -4, explicit: true });
  });

  it('reports ok with explicit false for a derived nonzero velocity', () => {
    const field = createVelocityField();
    const source = {};
    const sample = ensureVelocitySample(field, source);
    sample.velocity.x = 7;
    sample.velocity.y = -2;
    sample.lastFrameId = field.frameId;
    expect(explainVelocity(field, source)).toMatchObject({ reason: 'ok', x: 7, y: -2, explicit: false });
  });

  it('keys contribute, suppress, has and explain by identity', () => {
    const field = createVelocityField();
    const moving = { kind: 'a' };
    const twin = { kind: 'a' };
    contributeVelocity(field, moving, 3, 0);
    suppressVelocity(field, twin);
    expect(hasVelocity(field, moving)).toBe(true);
    expect(hasVelocity(field, twin)).toBe(false);
    expect(explainVelocity(field, moving)).toMatchObject({ reason: 'ok', x: 3, explicit: true });
    expect(explainVelocity(field, twin)).toMatchObject({ reason: 'explicit-zero', explicit: true });
    expect(explainVelocity(field, { kind: 'a' })).toMatchObject({ reason: 'no-sample', lastFrameId: -1 });
  });
});

describe('findVelocitySample', () => {
  it('returns null for an unknown source without creating one', () => {
    const field = createVelocityField();
    const source = {};
    expect(findVelocitySample(field, source)).toBeNull();
    expect(findVelocitySample(field, source)).toBeNull();
    expect(field.samples.has(source)).toBe(false);
  });

  it('returns the stored sample for a known source', () => {
    const field = createVelocityField();
    const source = {};
    contributeVelocity(field, source, 1, 2);
    expect(findVelocitySample(field, source)?.velocity).toEqual({ x: 1, y: 2 });
    expect(findVelocitySample(field, source)).toBe(ensureVelocitySample(field, source));
    expect(findVelocitySample(field, {})).toBeNull();
  });
});

describe('getVelocity', () => {
  it('returns zero once the sample is stale after the frame advances', () => {
    const field = createVelocityField();
    const source = {};
    contributeVelocity(field, source, 5, 5);
    beginVelocityFrame(field);
    expect(readVelocity(field, source)).toEqual({ x: 0, y: 0 });
  });
});

describe('hasVelocity', () => {
  it('is true for nonzero velocity and false for suppressed', () => {
    const field = createVelocityField();
    const moving = {};
    const still = {};
    contributeVelocity(field, moving, 1, 0);
    suppressVelocity(field, still);
    expect(hasVelocity(field, moving)).toBe(true);
    expect(hasVelocity(field, still)).toBe(false);
  });
});

describe('initializeVelocityField', () => {
  it('is the construction initializer of createVelocityField', () => {
    const field = createVelocityField();
    field.frameId = 5;
    initializeVelocityField(field);
    expect(field.frameId).toBe(0);
    expect(field.samples).toBeInstanceOf(WeakMap);
  });
});

describe('suppressVelocity', () => {
  it('keeps the previous world transform for reprojection', () => {
    const field = createVelocityField();
    const source = {};
    ensureVelocitySample(field, source).previousWorldTransform = createMatrix(1, 0, 0, 1, 0, 0);
    const current = createMatrix(1, 0, 0, 1, 7, 3);
    contributeVelocity(field, source, 0, 0);
    suppressVelocity(field, source);
    const out = { x: 0, y: 0 };
    getVelocitySampleAt(ensureVelocitySample(field, source), current, 0, 0, out);
    expect(out).toEqual({ x: 7, y: 3 });
  });

  it('zeroes a previously set velocity', () => {
    const field = createVelocityField();
    const source = {};
    contributeVelocity(field, source, 9, 9);
    suppressVelocity(field, source);
    expect(readVelocity(field, source)).toEqual({ x: 0, y: 0 });
  });
});
