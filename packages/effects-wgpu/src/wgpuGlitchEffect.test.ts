import { applyGlitchEffectToWgpu, wgpuGlitchEffectRunner, registerWgpuGlitchEffect } from './wgpuGlitchEffect.ts';

describe('applyGlitchEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyGlitchEffectToWgpu).toBe('function');
  });
});

describe('registerWgpuGlitchEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuGlitchEffect).toBeTypeOf('function');
  });
});

describe('wgpuGlitchEffectRunner', () => {
  it('is a function', () => {
    expect(typeof wgpuGlitchEffectRunner).toBe('function');
  });
});
