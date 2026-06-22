import {
  applyScreenSpaceFogEffectToCanvas,
  defaultCanvasScreenSpaceFogEffectRunner,
} from './canvasScreenSpaceFogEffect';

describe('applyScreenSpaceFogEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyScreenSpaceFogEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasScreenSpaceFogEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasScreenSpaceFogEffectRunner).toBe('function');
  });
});
