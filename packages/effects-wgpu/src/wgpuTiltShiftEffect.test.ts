import { applyTiltShiftEffectToWgpu, defaultWgpuTiltShiftEffectRunner } from './wgpuTiltShiftEffect';

describe('applyTiltShiftEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyTiltShiftEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuTiltShiftEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuTiltShiftEffectRunner).toBe('function');
  });
});
