import {
  applyFilmGrainEffectToWgpu,
  defaultWgpuFilmGrainEffectRunner,
  registerWgpuFilmGrainEffect,
} from './wgpuFilmGrainEffect';

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

describe('registerWgpuFilmGrainEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuFilmGrainEffect).toBeTypeOf('function');
  });
});
