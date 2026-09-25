import { swfLosslessBitmapHandler } from './swfLosslessBitmapHandler.ts';

describe('swfLosslessBitmapHandler', () => {
  it('claims the two lossless bitmap tags', () => {
    expect([...swfLosslessBitmapHandler.tags].sort((a, b) => a - b)).toEqual([20, 36]);
  });

  it('defines only parse — no instantiate, resolve, or finishTimeline', () => {
    expect(swfLosslessBitmapHandler.resolve).toBeUndefined();
    expect(swfLosslessBitmapHandler.finishTimeline).toBeUndefined();
    expect(swfLosslessBitmapHandler.instantiate).toBeUndefined();
  });
});
