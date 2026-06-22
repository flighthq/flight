import {
  applyLookupTableGradeEffectToWgpu,
  defaultWgpuLookupTableGradeEffectRunner,
} from './wgpuLookupTableGradeEffect';

describe('applyLookupTableGradeEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyLookupTableGradeEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuLookupTableGradeEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuLookupTableGradeEffectRunner).toBe('function');
  });
});
