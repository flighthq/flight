import {
  applyTiltShiftEffectToWgpu,
  wgpuTiltShiftEffectRunner,
  registerWgpuTiltShiftEffect,
} from './wgpuTiltShiftEffect.ts';

describe('applyTiltShiftEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyTiltShiftEffectToWgpu).toBe('function');
  });
});

describe('registerWgpuTiltShiftEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuTiltShiftEffect).toBeTypeOf('function');
  });
});

describe('wgpuTiltShiftEffectRunner', () => {
  it('is a function', () => {
    expect(typeof wgpuTiltShiftEffectRunner).toBe('function');
  });
});
