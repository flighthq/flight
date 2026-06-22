import { createCanvasTextMeasure } from './canvasTextMeasure';

describe('createCanvasTextMeasure', () => {
  it('returns a measure function that reports a non-negative width', () => {
    const measure = createCanvasTextMeasure();
    expect(typeof measure).toBe('function');
    expect(measure('hello', {})).toBeGreaterThanOrEqual(0);
  });
});
