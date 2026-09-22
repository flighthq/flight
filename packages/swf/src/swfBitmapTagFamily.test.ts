import { swfBitmapTagFamily } from './swfBitmapTagFamily';
import { swfJpegBitmapHandler } from './swfJpegBitmapHandler';
import { swfLosslessBitmapHandler } from './swfLosslessBitmapHandler';

describe('swfBitmapTagFamily', () => {
  it('claims the union of JPEG and lossless bitmap tags', () => {
    const expected = [...swfJpegBitmapHandler.tags, ...swfLosslessBitmapHandler.tags].sort((a, b) => a - b);
    expect([...swfBitmapTagFamily.tags].sort((a, b) => a - b)).toEqual(expected);
  });

  it('composes instantiate from the JPEG handler — the only one that defines it', () => {
    expect(swfBitmapTagFamily.instantiate?.createPlacementNode).toBeDefined();
    expect(swfBitmapTagFamily.instantiate?.createResources).toBeDefined();
    expect(swfBitmapTagFamily.instantiate?.hasPlacementContent).toBeDefined();
  });

  it('omits resolve and finishTimeline since neither handler defines them', () => {
    expect(swfBitmapTagFamily.resolve).toBeUndefined();
    expect(swfBitmapTagFamily.finishTimeline).toBeUndefined();
  });
});
