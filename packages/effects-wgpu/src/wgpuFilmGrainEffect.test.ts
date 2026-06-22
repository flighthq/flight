import { applyFilmGrainEffectToWgpu, defaultWgpuFilmGrainEffectRunner } from './wgpuFilmGrainEffect';

describe('applyFilmGrainEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyFilmGrainEffectToWgpu).toBe('function');
  });
});

describe('defaultWgpuFilmGrainEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultWgpuFilmGrainEffectRunner).toBe('function');
  });
});
