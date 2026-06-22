import { createDisplayObject } from '@flighthq/displayobject';
import { makeGlState } from '@flighthq/render-gl';
import { createParticleEmitter, createQuadBatch, getQuadBatchRuntime, reserveParticleEmitter } from '@flighthq/sprite';
import type { QuadBatchRuntime, TextureAtlas, TextureAtlasRegion } from '@flighthq/types';
import { QuadBatchKind } from '@flighthq/types';
import { beginVelocityFrame, contributeVelocity, createVelocityField } from '@flighthq/velocity';

import {
  createGlVelocityTarget,
  defaultGlDisplayObjectVelocityWriter,
  defaultGlParticleEmitterVelocityWriter,
  defaultGlQuadBatchVelocityWriter,
  drawGlVelocityQuad,
  getGlVelocityWriter,
  registerGlVelocityWriter,
  renderGlVelocity,
} from './webglVelocity';

describe('createGlVelocityTarget', () => {
  it('allocates an rgba16f target at the requested size', () => {
    const { state } = makeGlState();
    const target = createGlVelocityTarget(state, 128, 64);
    expect(target.format).toBe('rgba16f');
    expect(target.width).toBe(128);
    expect(target.height).toBe(64);
  });
});

describe('defaultGlDisplayObjectVelocityWriter', () => {
  it('is a velocity writer function', () => {
    expect(typeof defaultGlDisplayObjectVelocityWriter).toBe('function');
  });
});

describe('defaultGlParticleEmitterVelocityWriter', () => {
  it('is a velocity writer function', () => {
    expect(typeof defaultGlParticleEmitterVelocityWriter).toBe('function');
  });

  it('emits per-particle velocity for an emitter with a velocities array without throwing', () => {
    const { state } = makeGlState();
    const target = createGlVelocityTarget(state, 128, 64);
    const region = { id: 0, x: 0, y: 0, width: 16, height: 16, pivotX: null, pivotY: null } as TextureAtlasRegion;
    const atlas = { image: null, regions: [region] } as TextureAtlas;
    const emitter = createParticleEmitter();
    reserveParticleEmitter(emitter, 2);
    emitter.data.atlas = atlas;
    emitter.data.particleCount = 2;
    emitter.data.ids[0] = 0;
    emitter.data.ids[1] = 0;
    emitter.data.transforms.set([10, 10, 0, 1, 40, 20, 0, 1]);
    emitter.data.velocities.set([3, -2, -1, 4]);

    registerGlVelocityWriter(state, emitter.kind, defaultGlParticleEmitterVelocityWriter);
    const field = createVelocityField();
    beginVelocityFrame(field);

    expect(() => renderGlVelocity(state, emitter, field, target)).not.toThrow();
  });
});

describe('defaultGlQuadBatchVelocityWriter', () => {
  it('is a velocity writer function', () => {
    expect(typeof defaultGlQuadBatchVelocityWriter).toBe('function');
  });

  it('emits per-instance velocity for a batch with an instanceVelocities array without throwing', () => {
    const { state } = makeGlState();
    const target = createGlVelocityTarget(state, 128, 64);
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

    registerGlVelocityWriter(state, QuadBatchKind, defaultGlQuadBatchVelocityWriter);
    const field = createVelocityField();
    beginVelocityFrame(field);

    expect(() => renderGlVelocity(state, batch, field, target)).not.toThrow();
  });

  it('falls back to coarse batch velocity when no instanceVelocities array is present', () => {
    const { state } = makeGlState();
    const target = createGlVelocityTarget(state, 128, 64);
    const region = { id: 0, x: 0, y: 0, width: 32, height: 32, pivotX: null, pivotY: null } as TextureAtlasRegion;
    const atlas = { image: null, regions: [region] } as TextureAtlas;
    const batch = createQuadBatch({
      data: { atlas, ids: new Uint16Array([0]), instanceCount: 1, transforms: new Float32Array([0, 0]) },
    });

    registerGlVelocityWriter(state, QuadBatchKind, defaultGlQuadBatchVelocityWriter);
    const field = createVelocityField();
    beginVelocityFrame(field);
    contributeVelocity(field, batch, 5, 1);

    expect(() => renderGlVelocity(state, batch, field, target)).not.toThrow();
  });
});

describe('drawGlVelocityQuad', () => {
  it('is callable', () => {
    expect(typeof drawGlVelocityQuad).toBe('function');
  });
});

describe('getGlVelocityWriter', () => {
  it('returns null for an unregistered kind', () => {
    const { state } = makeGlState();
    expect(getGlVelocityWriter(state, Symbol('unregistered'))).toBeNull();
  });
});

describe('registerGlVelocityWriter', () => {
  it('registers a writer dispatched by kind', () => {
    const { state } = makeGlState();
    const root = createDisplayObject();
    registerGlVelocityWriter(state, root.kind, defaultGlDisplayObjectVelocityWriter);
    expect(getGlVelocityWriter(state, root.kind)).toBe(defaultGlDisplayObjectVelocityWriter);
  });
});

describe('renderGlVelocity', () => {
  it('dispatches the registered writer for a moving node without throwing', () => {
    const { state } = makeGlState();
    const target = createGlVelocityTarget(state, 128, 64);
    const root = createDisplayObject();
    registerGlVelocityWriter(state, root.kind, defaultGlDisplayObjectVelocityWriter);

    const field = createVelocityField();
    beginVelocityFrame(field);
    contributeVelocity(field, root, 3, -2);

    expect(() => renderGlVelocity(state, root, field, target)).not.toThrow();
  });

  it('runs without throwing when no writer is registered', () => {
    const { state } = makeGlState();
    const target = createGlVelocityTarget(state, 128, 64);
    const root = createDisplayObject();
    const field = createVelocityField();
    beginVelocityFrame(field);

    expect(() => renderGlVelocity(state, root, field, target)).not.toThrow();
  });
});
