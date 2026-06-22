import {
  applyChromaticAberrationEffectToWgpu,
  defaultWgpuChromaticAberrationEffectRunner,
} from './wgpuChromaticAberrationEffect';

describe('applyChromaticAberrationEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyChromaticAberrationEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuChromaticAberrationEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuChromaticAberrationEffectRunner).toBe('function');
  });
});
