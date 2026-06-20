import {
  applyFXAAEffectToCanvas,
  applySMAAEffectToCanvas,
  applyTAAEffectToCanvas,
  defaultCanvasFXAAEffectRunner,
  defaultCanvasSMAAEffectRunner,
  defaultCanvasTAAEffectRunner,
} from './antialiasingEffects';

describe('applyFXAAEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyFXAAEffectToCanvas).toBe('function');
  });
});

describe('applySMAAEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applySMAAEffectToCanvas).toBe('function');
  });
});

describe('applyTAAEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyTAAEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasFXAAEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasFXAAEffectRunner).toBe('function');
  });
});

describe('defaultCanvasSMAAEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasSMAAEffectRunner).toBe('function');
  });
});

describe('defaultCanvasTAAEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasTAAEffectRunner).toBe('function');
  });
});
