import {
  beginWebGPURenderEffectPipeline,
  createWebGPURenderEffectPipeline,
  destroyWebGPURenderEffectPipeline,
  endWebGPURenderEffectPipeline,
  setWebGPURenderEffectVelocityTexture,
} from './renderEffectPipeline';

describe('beginWebGPURenderEffectPipeline', () => {
  it('is a function', () => {
    expect(typeof beginWebGPURenderEffectPipeline).toBe('function');
  });
});

describe('createWebGPURenderEffectPipeline', () => {
  it('is a function', () => {
    expect(typeof createWebGPURenderEffectPipeline).toBe('function');
  });
});

describe('destroyWebGPURenderEffectPipeline', () => {
  it('is a function', () => {
    expect(typeof destroyWebGPURenderEffectPipeline).toBe('function');
  });
});

describe('endWebGPURenderEffectPipeline', () => {
  it('is a function', () => {
    expect(typeof endWebGPURenderEffectPipeline).toBe('function');
  });
});

describe('setWebGPURenderEffectVelocityTexture', () => {
  it('sets the velocity texture on the pipeline', () => {
    const pipeline = {
      options: {},
      sceneTarget: null,
      pool: { free: [] },
      velocityTexture: null,
    };
    const texture = {} as GPUTexture;
    setWebGPURenderEffectVelocityTexture(pipeline, texture);
    expect(pipeline.velocityTexture).toBe(texture);
  });
});
