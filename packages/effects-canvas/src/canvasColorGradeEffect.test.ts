import { applyColorGradeEffectToCanvas, defaultCanvasColorGradeEffectRunner } from './canvasColorGradeEffect';

describe('applyColorGradeEffectToCanvas', () => {
  it('is a function', () => {
    expect(typeof applyColorGradeEffectToCanvas).toBe('function');
  });
});

describe('defaultCanvasColorGradeEffectRunner', () => {
  it('is a function', () => {
    expect(typeof defaultCanvasColorGradeEffectRunner).toBe('function');
  });
});
