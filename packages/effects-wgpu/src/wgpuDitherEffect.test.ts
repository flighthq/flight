import { applyDitherEffectToWgpu, defaultWgpuDitherEffectRunner } from './wgpuDitherEffect';

describe('applyDitherEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyDitherEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuDitherEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuDitherEffectRunner).toBe('function');
  });
});
