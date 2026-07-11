import {
  clearWgpuEffectTarget,
  createWgpuDualSourceEffectPipeline,
  createWgpuEffectPipeline,
  drawWgpuDualSourceEffectPass,
  drawWgpuEffectPass,
  EFFECT_VERTEX_WGSL,
  getWgpuEffectPassState,
} from './wgpuEffectPass';

describe('clearWgpuEffectTarget', () => {
  it('is a function', () => {
    expect(typeof clearWgpuEffectTarget).toBe('function');
  });
});

describe('createWgpuDualSourceEffectPipeline', () => {
  it('is a function', () => {
    expect(typeof createWgpuDualSourceEffectPipeline).toBe('function');
  });
});

describe('createWgpuEffectPipeline', () => {
  it('is a function', () => {
    expect(typeof createWgpuEffectPipeline).toBe('function');
  });
});

describe('drawWgpuDualSourceEffectPass', () => {
  it('is a function', () => {
    expect(typeof drawWgpuDualSourceEffectPass).toBe('function');
  });
});

describe('drawWgpuEffectPass', () => {
  it('is a function', () => {
    expect(typeof drawWgpuEffectPass).toBe('function');
  });
});

describe('EFFECT_VERTEX_WGSL', () => {
  it('is a WGSL string', () => {
    expect(typeof EFFECT_VERTEX_WGSL).toBe('string');
  });
});

describe('getWgpuEffectPassState', () => {
  it('is a function', () => {
    expect(typeof getWgpuEffectPassState).toBe('function');
  });
});
