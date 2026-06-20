import { createDisplayObject } from '@flighthq/displayobject';
import { createQuadBatch, getQuadBatchRuntime } from '@flighthq/sprite';
import type { QuadBatchRuntime, TextureAtlas, TextureAtlasRegion } from '@flighthq/types';
import { QuadBatchKind } from '@flighthq/types';
import { beginVelocityFrame, contributeVelocity, createVelocityField } from '@flighthq/velocity';

import { makeWebGLState } from './webglTestHelper';
import {
  createWebGLVelocityTarget,
  defaultWebGLDisplayObjectVelocityWriter,
  defaultWebGLQuadBatchVelocityWriter,
  drawWebGLVelocityQuad,
  getWebGLVelocityWriter,
  registerWebGLVelocityWriter,
  renderWebGLVelocity,
} from './webglVelocity';

describe('createWebGLVelocityTarget', () => {
  it('allocates an rgba16f target at the requested size', () => {
    const { state } = makeWebGLState();
    const target = createWebGLVelocityTarget(state, 128, 64);
    expect(target.format).toBe('rgba16f');
    expect(target.width).toBe(128);
    expect(target.height).toBe(64);
  });
});

describe('defaultWebGLDisplayObjectVelocityWriter', () => {
  it('is a velocity writer function', () => {
    expect(typeof defaultWebGLDisplayObjectVelocityWriter).toBe('function');
  });
});

describe('defaultWebGLQuadBatchVelocityWriter', () => {
  it('is a velocity writer function', () => {
    expect(typeof defaultWebGLQuadBatchVelocityWriter).toBe('function');
  });

  it('emits per-instance velocity for a batch with an instanceVelocities array without throwing', () => {
    const { state } = makeWebGLState();
    const target = createWebGLVelocityTarget(state, 128, 64);
    const region = { id: 0, x: 0, y: 0, width: 32, height: 32, pivotX: null, pivotY: null } as TextureAtlasRegion;
    const atlas = { image: null, regions: [region] } as TextureAtlas;
    // Two vector2 instances at distinct positions, each moving independently.
    const batch = createQuadBatch({
      data: {
        atlas,
        ids: new Uint16Array([0, 0]),
        instanceCount: 2,
        transforms: new Float32Array([0, 0, 40, 10]),
        transformType: 'vector2',
      },
    });
    // The batch owns its per-instance velocity (NOT the VelocityField); whatever drives the quads fills it.
    (getQuadBatchRuntime(batch) as QuadBatchRuntime).instanceVelocities = new Float32Array([3, -2, -1, 4]);

    registerWebGLVelocityWriter(state, QuadBatchKind, defaultWebGLQuadBatchVelocityWriter);
    const field = createVelocityField();
    beginVelocityFrame(field);

    expect(() => renderWebGLVelocity(state, batch, field, target)).not.toThrow();
  });

  it('falls back to coarse batch velocity when no instanceVelocities array is present', () => {
    const { state } = makeWebGLState();
    const target = createWebGLVelocityTarget(state, 128, 64);
    const region = { id: 0, x: 0, y: 0, width: 32, height: 32, pivotX: null, pivotY: null } as TextureAtlasRegion;
    const atlas = { image: null, regions: [region] } as TextureAtlas;
    const batch = createQuadBatch({
      data: { atlas, ids: new Uint16Array([0]), instanceCount: 1, transforms: new Float32Array([0, 0]) },
    });

    registerWebGLVelocityWriter(state, QuadBatchKind, defaultWebGLQuadBatchVelocityWriter);
    const field = createVelocityField();
    beginVelocityFrame(field);
    contributeVelocity(field, batch, 5, 1);

    expect(() => renderWebGLVelocity(state, batch, field, target)).not.toThrow();
  });
});

describe('drawWebGLVelocityQuad', () => {
  it('is callable', () => {
    expect(typeof drawWebGLVelocityQuad).toBe('function');
  });
});

describe('getWebGLVelocityWriter', () => {
  it('returns null for an unregistered kind', () => {
    const { state } = makeWebGLState();
    expect(getWebGLVelocityWriter(state, Symbol('unregistered'))).toBeNull();
  });
});

describe('registerWebGLVelocityWriter', () => {
  it('registers a writer dispatched by kind', () => {
    const { state } = makeWebGLState();
    const root = createDisplayObject();
    registerWebGLVelocityWriter(state, root.kind, defaultWebGLDisplayObjectVelocityWriter);
    expect(getWebGLVelocityWriter(state, root.kind)).toBe(defaultWebGLDisplayObjectVelocityWriter);
  });
});

describe('renderWebGLVelocity', () => {
  it('dispatches the registered writer for a moving node without throwing', () => {
    const { state } = makeWebGLState();
    const target = createWebGLVelocityTarget(state, 128, 64);
    const root = createDisplayObject();
    registerWebGLVelocityWriter(state, root.kind, defaultWebGLDisplayObjectVelocityWriter);

    const field = createVelocityField();
    beginVelocityFrame(field);
    contributeVelocity(field, root, 3, -2);

    expect(() => renderWebGLVelocity(state, root, field, target)).not.toThrow();
  });

  it('runs without throwing when no writer is registered', () => {
    const { state } = makeWebGLState();
    const target = createWebGLVelocityTarget(state, 128, 64);
    const root = createDisplayObject();
    const field = createVelocityField();
    beginVelocityFrame(field);

    expect(() => renderWebGLVelocity(state, root, field, target)).not.toThrow();
  });
});
