import { createParticleEmitter2D, reserveParticleEmitter2D } from '@flighthq/particleemitter/contract';
import { createQuadBatch, getQuadBatchRuntime } from '@flighthq/quadbatch/contract';
import {
  beginWgpuScreenRenderPassForTest,
  createWgpuOffscreenRenderState,
  getWgpuRenderStateRuntime,
} from '@flighthq/render-wgpu/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import type { QuadBatchRuntime, TextureAtlas, TextureAtlasRegion } from '@flighthq/types/contract';
import { QuadBatchKind } from '@flighthq/types/contract';
import { beginVelocityFrame, contributeVelocity, createVelocityField } from '@flighthq/velocity/contract';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  createWgpuVelocityTarget,
  wgpuNode2DVelocityWriter,
  wgpuParticleEmitter2DVelocityWriter,
  wgpuQuadBatchVelocityWriter,
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
    registerWgpuVelocityWriter(state, root.kind, wgpuNode2DVelocityWriter);
    expect(getWgpuVelocityWriter(state, root.kind)).toBe(wgpuNode2DVelocityWriter);
  });

  it('replaces persistent snapshots and preserves a derived pipeline snapshot', async () => {
    const state = await createWgpuRenderStateForTest();
    const kind = 'acme.Velocity';
    const replacement = vi.fn();
    const before = getWgpuRenderStateRuntime(state).registries.velocityWriters;

    registerWgpuVelocityWriter(state, kind, wgpuNode2DVelocityWriter);
    const registered = getWgpuRenderStateRuntime(state).registries.velocityWriters;
    const offscreen = createWgpuOffscreenRenderState(state.deviceState, {
      ...getWgpuRenderStateRuntime(state).registries,
      format: state.format,
    });
    registerWgpuVelocityWriter(state, kind, replacement);

    expect(registered).not.toBe(before);
    expect(before.has(kind)).toBe(false);
    expect(registered.get(kind)).toEqual(wgpuNode2DVelocityWriter);
    expect(getWgpuVelocityWriter(state, kind)).toBe(replacement);
    expect(getWgpuVelocityWriter(offscreen, kind)).toBe(wgpuNode2DVelocityWriter);
  });
});

describe('renderWgpuVelocity', () => {
  it('dispatches the registered writer for a moving node without throwing', async () => {
    const state = await createWgpuRenderStateForTest();
    const target = createWgpuVelocityTarget(state, 128, 64);
    const root = createDisplayObject();
    registerWgpuVelocityWriter(state, root.kind, wgpuNode2DVelocityWriter);

    const field = createVelocityField();
    beginVelocityFrame(field);
    contributeVelocity(field, root, 3, -2);

    beginWgpuScreenRenderPassForTest(state);
    expect(() => renderWgpuVelocity(state, root, field, target)).not.toThrow();
  });

  it('throws when no command encoder is open (no pass has opened one)', async () => {
    const state = await createWgpuRenderStateForTest();
    const target = createWgpuVelocityTarget(state, 128, 64);
    const root = createDisplayObject();
    const field = createVelocityField();
    beginVelocityFrame(field);

    expect(() => renderWgpuVelocity(state, root, field, target)).toThrow(/command encoder/);
  });
});

describe('wgpuNode2DVelocityWriter', () => {
  it('is a velocity writer function', () => {
    expect(typeof wgpuNode2DVelocityWriter).toBe('function');
  });
});

describe('wgpuParticleEmitter2DVelocityWriter', () => {
  it('is a velocity writer function', () => {
    expect(typeof wgpuParticleEmitter2DVelocityWriter).toBe('function');
  });

  it('emits per-particle velocity for an emitter with a velocities array without throwing', async () => {
    const state = await createWgpuRenderStateForTest();
    const target = createWgpuVelocityTarget(state, 128, 64);
    const region = { id: 0, x: 0, y: 0, width: 16, height: 16, pivotX: null, pivotY: null } as TextureAtlasRegion;
    const atlas = { texture: null, regions: [region] } as TextureAtlas;
    const emitter = createParticleEmitter2D();
    reserveParticleEmitter2D(emitter, 2);
    emitter.data.atlas = atlas;
    emitter.data.particleCount = 2;
    emitter.data.ids[0] = 0;
    emitter.data.ids[1] = 0;
    emitter.data.transforms.set([10, 10, 0, 1, 40, 20, 0, 1]);
    emitter.data.velocities.set([3, -2, -1, 4]);

    registerWgpuVelocityWriter(state, emitter.kind, wgpuParticleEmitter2DVelocityWriter);
    const field = createVelocityField();
    beginVelocityFrame(field);

    beginWgpuScreenRenderPassForTest(state);
    expect(() => renderWgpuVelocity(state, emitter, field, target)).not.toThrow();
  });
});

describe('wgpuQuadBatchVelocityWriter', () => {
  it('is a velocity writer function', () => {
    expect(typeof wgpuQuadBatchVelocityWriter).toBe('function');
  });

  it('emits per-instance velocity for a batch with an instanceVelocities array without throwing', async () => {
    const state = await createWgpuRenderStateForTest();
    const target = createWgpuVelocityTarget(state, 128, 64);
    const region = { id: 0, x: 0, y: 0, width: 32, height: 32, pivotX: null, pivotY: null } as TextureAtlasRegion;
    const atlas = { texture: null, regions: [region] } as TextureAtlas;
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

    registerWgpuVelocityWriter(state, QuadBatchKind, wgpuQuadBatchVelocityWriter);
    const field = createVelocityField();
    beginVelocityFrame(field);

    beginWgpuScreenRenderPassForTest(state);
    expect(() => renderWgpuVelocity(state, batch, field, target)).not.toThrow();
  });
});
