import {
  applyBokehDepthOfFieldEffectToCanvas,
  defaultCanvasBokehDepthOfFieldEffectRunner,
} from './canvasBokehDepthOfFieldEffect';

describe('applyBokehDepthOfFieldEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyBokehDepthOfFieldEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasBokehDepthOfFieldEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasBokehDepthOfFieldEffectRunner).toBe('function');
  });
});
