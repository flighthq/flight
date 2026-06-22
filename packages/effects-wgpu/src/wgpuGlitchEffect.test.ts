import { applyGlitchEffectToWgpu, defaultWgpuGlitchEffectRunner } from './wgpuGlitchEffect';

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
