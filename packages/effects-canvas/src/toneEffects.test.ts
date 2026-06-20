import {
  applyBloomEffectToCanvas,
  applyExposureEffectToCanvas,
  applyToneMapEffectToCanvas,
  defaultCanvasBloomEffectRunner,
  defaultCanvasExposureEffectRunner,
  defaultCanvasToneMapEffectRunner,
} from './toneEffects';

describe('applyBloomEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyBloomEffectToCanvas).toBe('function');
  });
});

describe('applyExposureEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyExposureEffectToCanvas).toBe('function');
  });
});

describe('applyToneMapEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyToneMapEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasBloomEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasBloomEffectRunner).toBe('function');
  });
});

describe('defaultCanvasExposureEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasExposureEffectRunner).toBe('function');
  });
});

describe('defaultCanvasToneMapEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasToneMapEffectRunner).toBe('function');
  });
});
