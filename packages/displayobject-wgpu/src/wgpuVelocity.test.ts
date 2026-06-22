import { createDisplayObject } from '@flighthq/displayobject';
import { renderWgpuBackground } from '@flighthq/render-wgpu';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu';
import { createParticleEmitter, createQuadBatch, getQuadBatchRuntime, reserveParticleEmitter } from '@flighthq/sprite';
import type { QuadBatchRuntime, TextureAtlas, TextureAtlasRegion } from '@flighthq/types';
import { QuadBatchKind } from '@flighthq/types';
import { beginVelocityFrame, contributeVelocity, createVelocityField } from '@flighthq/velocity';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  createWgpuVelocityTarget,
  defaultWgpuDisplayObjectVelocityWriter,
  defaultWgpuParticleEmitterVelocityWriter,
  defaultWgpuQuadBatchVelocityWriter,
  drawWgpuVelocityQuad,
  getWgpuVelocityWriter,
  registerWgpuVelocityWriter,
  renderWgpuVelocity,
} from './wgpuVelocity';

beforeAll(() => {
  installWgpuMock();
});

describe('createWgpuVelocityTarget', () => {
  it('allocates an rgba16float target at the requested size', async () => {
    const state = await createWgpuRenderStateForTest();
    const target = createWgpuVelocityTarget(state, 128, 64);
    expect(target.format).toBe('rgba16float');
    expect(target.width).toBe(128);
    expect(target.height).toBe(64);
  });
});

describe('defaultWgpuDisplayObjectVelocityWriter', () => {
  it('is a velocity writer function', () => {
    expect(typeof defaultWgpuDisplayObjectVelocityWriter).toBe('function');
  });
});

describe('defaultWgpuParticleEmitterVelocityWriter', () => {
  it('is a velocity writer function', () => {
    expect(typeof defaultWgpuParticleEmitterVelocityWriter).toBe('function');
  });

  it('emits per-particle velocity for an emitter with a velocities array without throwing', async () => {
    const state = await createWgpuRenderStateForTest();
    const target = createWgpuVelocityTarget(state, 128, 64);
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

    registerWgpuVelocityWriter(state, emitter.kind, defaultWgpuParticleEmitterVelocityWriter);
    const field = createVelocityField();
    beginVelocityFrame(field);

    renderWgpuBackground(state);
    expect(() => renderWgpuVelocity(state, emitter, field, target)).not.toThrow();
  });
});

describe('defaultWgpuQuadBatchVelocityWriter', () => {
  it('is a velocity writer function', () => {
    expect(typeof defaultWgpuQuadBatchVelocityWriter).toBe('function');
  });

  it('emits per-instance velocity for a batch with an instanceVelocities array without throwing', async () => {
    const state = await createWgpuRenderStateForTest();
    const target = createWgpuVelocityTarget(state, 128, 64);
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

    registerWgpuVelocityWriter(state, QuadBatchKind, defaultWgpuQuadBatchVelocityWriter);
    const field = createVelocityField();
    beginVelocityFrame(field);

    renderWgpuBackground(state);
    expect(() => renderWgpuVelocity(state, batch, field, target)).not.toThrow();
  });
});

describe('drawWgpuVelocityQuad', () => {
  it('is a no-op outside an active velocity pass', async () => {
    const state = await createWgpuRenderStateForTest();
    const ctx = { state, field: createVelocityField(), width: 128, height: 64, pixelRatio: 1 };
    expect(() => drawWgpuVelocityQuad(ctx, 0, 0, 10, 10, 1, 0)).not.toThrow();
  });
});

describe('getWgpuVelocityWriter', () => {
  it('returns null for an unregistered kind', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(getWgpuVelocityWriter(state, 'unregistered')).toBeNull();
  });
});

describe('registerWgpuVelocityWriter', () => {
  it('registers a writer dispatched by kind', async () => {
    const state = await createWgpuRenderStateForTest();
    const root = createDisplayObject();
    registerWgpuVelocityWriter(state, root.kind, defaultWgpuDisplayObjectVelocityWriter);
    expect(getWgpuVelocityWriter(state, root.kind)).toBe(defaultWgpuDisplayObjectVelocityWriter);
  });
});

describe('renderWgpuVelocity', () => {
  it('dispatches the registered writer for a moving node without throwing', async () => {
    const state = await createWgpuRenderStateForTest();
    const target = createWgpuVelocityTarget(state, 128, 64);
    const root = createDisplayObject();
    registerWgpuVelocityWriter(state, root.kind, defaultWgpuDisplayObjectVelocityWriter);

    const field = createVelocityField();
    beginVelocityFrame(field);
    contributeVelocity(field, root, 3, -2);

    renderWgpuBackground(state);
    expect(() => renderWgpuVelocity(state, root, field, target)).not.toThrow();
  });

  it('throws when no command encoder is open (renderWgpuBackground not called)', async () => {
    const state = await createWgpuRenderStateForTest();
    const target = createWgpuVelocityTarget(state, 128, 64);
    const root = createDisplayObject();
    const field = createVelocityField();
    beginVelocityFrame(field);

    expect(() => renderWgpuVelocity(state, root, field, target)).toThrow(/command encoder/);
  });
});
