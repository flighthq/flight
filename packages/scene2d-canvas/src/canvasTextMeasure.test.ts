import { acquireTestCanvasSurface } from './canvasTestSupport.ts';
import { createCanvasTextMeasure } from './canvasTextMeasure.ts';

describe('createCanvasTextMeasure', () => {
  it('returns a measure function that reports a non-negative width', () => {
    const measure = createCanvasTextMeasure(acquireTestCanvasSurface());
    expect(typeof measure).toBe('function');
    expect(measure('hello', {})).toBeGreaterThanOrEqual(0);
  });
});
