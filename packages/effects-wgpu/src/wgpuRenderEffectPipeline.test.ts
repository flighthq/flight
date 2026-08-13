import { beginWgpuFrame, createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import type { RenderEffect } from '@flighthq/types/contract';

import {
  beginWgpuRenderEffectPipeline,
  createWgpuRenderEffectPipeline,
  destroyWgpuRenderEffectPipeline,
  endWgpuRenderEffectPipeline,
  setWgpuRenderEffectPipelineSkipGuard,
  setWgpuRenderEffectVelocityTexture,
} from './wgpuRenderEffectPipeline';

beforeAll(() => installWgpuMock());

describe('beginWgpuRenderEffectPipeline', () => {
  it('is a function', () => {
    expect(typeof beginWgpuRenderEffectPipeline).toBe('function');
  });
});

describe('createWgpuRenderEffectPipeline', () => {
  it('is a function', () => {
    expect(typeof createWgpuRenderEffectPipeline).toBe('function');
  });
});

describe('destroyWgpuRenderEffectPipeline', () => {
  it('is a function', () => {
    expect(typeof destroyWgpuRenderEffectPipeline).toBe('function');
  });
});

describe('endWgpuRenderEffectPipeline', () => {
  it('is a function', () => {
    expect(typeof endWgpuRenderEffectPipeline).toBe('function');
  });
});

describe('setWgpuRenderEffectPipelineSkipGuard', () => {
  it('reports every effect kind the pass drops, and goes silent again when cleared', async () => {
    const state = await createWgpuRenderStateForTest();
    const pipeline = createWgpuRenderEffectPipeline(state);
    const dropped: string[] = [];
    const chain = [{ kind: 'test.wgpu-pipeline-skip-seam' } as RenderEffect];

    setWgpuRenderEffectPipelineSkipGuard(state, (_state, kind) => dropped.push(kind));
    beginWgpuFrame(state);
    beginWgpuRenderEffectPipeline(state, pipeline);
    endWgpuRenderEffectPipeline(state, pipeline, chain);

    expect(dropped).toEqual(['test.wgpu-pipeline-skip-seam']);

    // Clearing must restore the original silence exactly: the seam is the ONLY path by which a dropped
    // effect is observable, so a stale guard would be the difference between a diagnostic and a leak.
    setWgpuRenderEffectPipelineSkipGuard(state, null);
    beginWgpuFrame(state);
    beginWgpuRenderEffectPipeline(state, pipeline);
    endWgpuRenderEffectPipeline(state, pipeline, chain);

    expect(dropped).toEqual(['test.wgpu-pipeline-skip-seam']);
  });
});

describe('setWgpuRenderEffectVelocityTexture', () => {
  it('sets the velocity texture on the pipeline', () => {
    const pipeline = {
      options: {},
      sceneTarget: null,
      pool: { free: [] },
      lutCache: { signature: null, lut: null },
      lutTexture: { texture: null, size: 0, lut: null },
      velocityTexture: null,
    };
    const texture = {} as GPUTexture;
    setWgpuRenderEffectVelocityTexture(pipeline, texture);
    expect(pipeline.velocityTexture).toBe(texture);
  });
});
