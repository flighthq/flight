import {
  applyFxaaEffectToCanvas,
  applySmaaEffectToCanvas,
  applyTaaEffectToCanvas,
  defaultCanvasFxaaEffectRunner,
  defaultCanvasSmaaEffectRunner,
  defaultCanvasTaaEffectRunner,
} from './antialiasingEffects';

describe('applyFxaaEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyFxaaEffectToCanvas).toBe('function');
  });
});

describe('applySmaaEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applySmaaEffectToCanvas).toBe('function');
  });
});

describe('applyTaaEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyTaaEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasFxaaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasFxaaEffectRunner).toBe('function');
  });
});

describe('defaultCanvasSmaaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasSmaaEffectRunner).toBe('function');
  });
});

describe('defaultCanvasTaaEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasTaaEffectRunner).toBe('function');
  });
});
