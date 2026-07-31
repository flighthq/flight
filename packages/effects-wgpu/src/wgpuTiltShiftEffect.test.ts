import {
  applyTiltShiftEffectToWgpu,
  defaultWgpuTiltShiftEffectRunner,
  registerWgpuTiltShiftEffect,
} from './wgpuTiltShiftEffect';

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

describe('registerWgpuTiltShiftEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuTiltShiftEffect).toBeTypeOf('function');
  });
});
