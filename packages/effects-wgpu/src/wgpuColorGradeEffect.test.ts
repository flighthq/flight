import { applyColorGradeEffectToWgpu, defaultWgpuColorGradeEffectRunner } from './wgpuColorGradeEffect';

describe('applyColorGradeEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyColorGradeEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuColorGradeEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuColorGradeEffectRunner).toBe('function');
  });
});
