import {
  beginGlRenderEffectPipeline,
  createGlRenderEffectPipeline,
  destroyGlRenderEffectPipeline,
  endGlRenderEffectPipeline,
  setGlRenderEffectVelocityTexture,
} from './glRenderEffectPipeline';

describe('beginGlRenderEffectPipeline', () => {
  it('is a function', () => {
    expect(typeof beginGlRenderEffectPipeline).toBe('function');
  });
});

describe('createGlRenderEffectPipeline', () => {
  it('is a function', () => {
    expect(typeof createGlRenderEffectPipeline).toBe('function');
  });
});

describe('destroyGlRenderEffectPipeline', () => {
  it('is a function', () => {
    expect(typeof destroyGlRenderEffectPipeline).toBe('function');
  });
});

describe('endGlRenderEffectPipeline', () => {
  it('is a function', () => {
    expect(typeof endGlRenderEffectPipeline).toBe('function');
  });
});

describe('setGlRenderEffectVelocityTexture', () => {
  it('is a function', () => {
    expect(typeof setGlRenderEffectVelocityTexture).toBe('function');
  });
});
