import {
  applyFilmGrainEffectToWgpu,
  wgpuFilmGrainEffectRunner,
  registerWgpuFilmGrainEffect,
} from './wgpuFilmGrainEffect.ts';

describe('applyFilmGrainEffectToWgpu', () => {
  it('is a function', () => {
    expect(typeof applyFilmGrainEffectToWgpu).toBe('function');
  });
});

describe('registerWgpuFilmGrainEffect', () => {
  it('is a separately importable registration primitive', () => {
    expect(registerWgpuFilmGrainEffect).toBeTypeOf('function');
  });
});

describe('wgpuFilmGrainEffectRunner', () => {
  it('is a function', () => {
    expect(typeof wgpuFilmGrainEffectRunner).toBe('function');
  });
});
