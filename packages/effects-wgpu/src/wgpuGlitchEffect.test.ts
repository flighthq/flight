import { applyGlitchEffectToWgpu, defaultWgpuGlitchEffectRunner, registerWgpuGlitchEffect } from './wgpuGlitchEffect';

describe('applyGlitchEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyGlitchEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuGlitchEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuGlitchEffectRunner).toBe('function');
  });
});

describe('registerWgpuGlitchEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuGlitchEffect).toBeTypeOf('function');
  });
});
