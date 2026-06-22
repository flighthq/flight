import {
  applyBloomEffectToWgpu,
  applyExposureEffectToWgpu,
  applyToneMapEffectToWgpu,
  defaultWgpuBloomEffectRunner,
  defaultWgpuExposureEffectRunner,
  defaultWgpuToneMapEffectRunner,
} from './toneEffects';

describe('applyBloomEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyBloomEffectToWgpu).toBe('function');
  });
});

describe('applyExposureEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyExposureEffectToWgpu).toBe('function');
  });
});

describe('applyToneMapEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyToneMapEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuBloomEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuBloomEffectRunner).toBe('function');
  });
});

describe('defaultWgpuExposureEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuExposureEffectRunner).toBe('function');
  });
});

describe('defaultWgpuToneMapEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuToneMapEffectRunner).toBe('function');
  });
});
