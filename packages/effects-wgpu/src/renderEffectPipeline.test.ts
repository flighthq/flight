import {
  beginWgpuRenderEffectPipeline,
  createWgpuRenderEffectPipeline,
  destroyWgpuRenderEffectPipeline,
  endWgpuRenderEffectPipeline,
  setWgpuRenderEffectVelocityTexture,
} from './renderEffectPipeline';

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

describe('setWgpuRenderEffectVelocityTexture', () => {
  it('sets the velocity texture on the pipeline', () => {
    const pipeline = {
      options: {},
      sceneTarget: null,
      pool: { free: [] },
      velocityTexture: null,
    };
    const texture = {} as GPUTexture;
    setWgpuRenderEffectVelocityTexture(pipeline, texture);
    expect(pipeline.velocityTexture).toBe(texture);
  });
});
