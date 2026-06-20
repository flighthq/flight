import {
  applyBloomEffectToWebGPU,
  applyExposureEffectToWebGPU,
  applyToneMapEffectToWebGPU,
  defaultWebGPUBloomEffectRunner,
  defaultWebGPUExposureEffectRunner,
  defaultWebGPUToneMapEffectRunner,
} from './toneEffects';

describe('applyBloomEffectToWebGPU', () => {
  it('is a function', () => {
    expect(typeof applyBloomEffectToWebGPU).toBe('function');
  });
});

describe('applyExposureEffectToWebGPU', () => {
  it('is a function', () => {
    expect(typeof applyExposureEffectToWebGPU).toBe('function');
  });
});

describe('applyToneMapEffectToWebGPU', () => {
  it('is a function', () => {
    expect(typeof applyToneMapEffectToWebGPU).toBe('function');
  });
});

describe('defaultWebGPUBloomEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWebGPUBloomEffectRunner).toBe('function');
  });
});

describe('defaultWebGPUExposureEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWebGPUExposureEffectRunner).toBe('function');
  });
});

describe('defaultWebGPUToneMapEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWebGPUToneMapEffectRunner).toBe('function');
  });
});
