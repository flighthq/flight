import {
  applyBrightnessContrastEffectToWgpu,
  defaultWgpuBrightnessContrastEffectRunner,
} from './wgpuBrightnessContrastEffect';

describe('applyBrightnessContrastEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyBrightnessContrastEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuBrightnessContrastEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuBrightnessContrastEffectRunner).toBe('function');
  });
});
