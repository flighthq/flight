import { applySketchEffectToCanvas, defaultCanvasSketchEffectRunner } from './canvasSketchEffect';

describe('applySketchEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applySketchEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasSketchEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasSketchEffectRunner).toBe('function');
  });
});
