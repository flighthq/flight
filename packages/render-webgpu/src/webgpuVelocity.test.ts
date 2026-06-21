import { createDisplayObject } from '@flighthq/displayobject';
import { createParticleEmitter, createQuadBatch, getQuadBatchRuntime, reserveParticleEmitter } from '@flighthq/sprite';
import type { QuadBatchRuntime, TextureAtlas, TextureAtlasRegion } from '@flighthq/types';
import { QuadBatchKind } from '@flighthq/types';
import { beginVelocityFrame, contributeVelocity, createVelocityField } from '@flighthq/velocity';
import { beforeAll, describe, expect, it } from 'vitest';

import { renderWebGPUBackground } from './webgpuBackground';
import { createWebGPURenderStateForTest, installWebGPUMock } from './webgpuTestHelper';
import {
  createWebGPUVelocityTarget,
  defaultWebGPUDisplayObjectVelocityWriter,
  defaultWebGPUParticleEmitterVelocityWriter,
  defaultWebGPUQuadBatchVelocityWriter,
  drawWebGPUVelocityQuad,
  getWebGPUVelocityWriter,
  registerWebGPUVelocityWriter,
  renderWebGPUVelocity,
} from './webgpuVelocity';

beforeAll(() => {
  installWebGPUMock();
});

describe('createWebGPUVelocityTarget', () => {
  it('allocates an rgba16float target at the requested size', async () => {
    const state = await createWebGPURenderStateForTest();
    const target = createWebGPUVelocityTarget(state, 128, 64);
    expect(target.format).toBe('rgba16float');
    expect(target.width).toBe(128);
    expect(target.height).toBe(64);
  });
});

describe('defaultWebGPUDisplayObjectVelocityWriter', () => {
  it('is a velocity writer function', () => {
    expect(typeof defaultWebGPUDisplayObjectVelocityWriter).toBe('function');
  });
});

describe('defaultWebGPUParticleEmitterVelocityWriter', () => {
  it('is a velocity writer function', () => {
    expect(typeof defaultWebGPUParticleEmitterVelocityWriter).toBe('function');
  });

  it('emits per-particle velocity for an emitter with a velocities array without throwing', async () => {
    const state = await createWebGPURenderStateForTest();
    const target = createWebGPUVelocityTarget(state, 128, 64);
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

    registerWebGPUVelocityWriter(state, emitter.kind, defaultWebGPUParticleEmitterVelocityWriter);
    const field = createVelocityField();
    beginVelocityFrame(field);

    renderWebGPUBackground(state);
    expect(() => renderWebGPUVelocity(state, emitter, field, target)).not.toThrow();
  });
});

describe('defaultWebGPUQuadBatchVelocityWriter', () => {
  it('is a velocity writer function', () => {
    expect(typeof defaultWebGPUQuadBatchVelocityWriter).toBe('function');
  });

  it('emits per-instance velocity for a batch with an instanceVelocities array without throwing', async () => {
    const state = await createWebGPURenderStateForTest();
    const target = createWebGPUVelocityTarget(state, 128, 64);
    const region = { id: 0, x: 0, y: 0, width: 32, height: 32, pivotX: null, pivotY: null } as TextureAtlasRegion;
    const atlas = { image: null, regions: [region] } as TextureAtlas;
    const batch = createQuadBatch({
      data: {
        atlas,
        ids: new Uint16Array([0, 0]),
        instanceCount: 2,
        transforms: new Float32Array([0, 0, 40, 10]),
        transformType: 'vector2',
      },
    });
    (getQuadBatchRuntime(batch) as QuadBatchRuntime).instanceVelocities = new Float32Array([3, -2, -1, 4]);

    registerWebGPUVelocityWriter(state, QuadBatchKind, defaultWebGPUQuadBatchVelocityWriter);
    const field = createVelocityField();
    beginVelocityFrame(field);

    renderWebGPUBackground(state);
    expect(() => renderWebGPUVelocity(state, batch, field, target)).not.toThrow();
  });
});

describe('drawWebGPUVelocityQuad', () => {
  it('is a no-op outside an active velocity pass', async () => {
    const state = await createWebGPURenderStateForTest();
    const ctx = { state, field: createVelocityField(), width: 128, height: 64, pixelRatio: 1 };
    expect(() => drawWebGPUVelocityQuad(ctx, 0, 0, 10, 10, 1, 0)).not.toThrow();
  });
});

describe('getWebGPUVelocityWriter', () => {
  it('returns null for an unregistered kind', async () => {
    const state = await createWebGPURenderStateForTest();
    expect(getWebGPUVelocityWriter(state, Symbol('unregistered'))).toBeNull();
  });
});

describe('registerWebGPUVelocityWriter', () => {
  it('registers a writer dispatched by kind', async () => {
    const state = await createWebGPURenderStateForTest();
    const root = createDisplayObject();
    registerWebGPUVelocityWriter(state, root.kind, defaultWebGPUDisplayObjectVelocityWriter);
    expect(getWebGPUVelocityWriter(state, root.kind)).toBe(defaultWebGPUDisplayObjectVelocityWriter);
  });
});

describe('renderWebGPUVelocity', () => {
  it('dispatches the registered writer for a moving node without throwing', async () => {
    const state = await createWebGPURenderStateForTest();
    const target = createWebGPUVelocityTarget(state, 128, 64);
    const root = createDisplayObject();
    registerWebGPUVelocityWriter(state, root.kind, defaultWebGPUDisplayObjectVelocityWriter);

    const field = createVelocityField();
    beginVelocityFrame(field);
    contributeVelocity(field, root, 3, -2);

    renderWebGPUBackground(state);
    expect(() => renderWebGPUVelocity(state, root, field, target)).not.toThrow();
  });

  it('throws when no command encoder is open (renderWebGPUBackground not called)', async () => {
    const state = await createWebGPURenderStateForTest();
    const target = createWebGPUVelocityTarget(state, 128, 64);
    const root = createDisplayObject();
    const field = createVelocityField();
    beginVelocityFrame(field);

    expect(() => renderWebGPUVelocity(state, root, field, target)).toThrow(/command encoder/);
  });
});
