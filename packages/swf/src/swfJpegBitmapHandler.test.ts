import { swfJpegBitmapHandler } from './swfJpegBitmapHandler.ts';

describe('swfJpegBitmapHandler', () => {
  it('claims the JPEG bitmap tags and the JPEG tables tag', () => {
    expect([...swfJpegBitmapHandler.tags].sort((a, b) => a - b)).toEqual([6, 8, 21, 35, 90]);
  });

  it('provides full placement and resource instantiation', () => {
    expect(swfJpegBitmapHandler.instantiate?.createPlacementNode).toBeDefined();
    expect(swfJpegBitmapHandler.instantiate?.createResources).toBeDefined();
    expect(swfJpegBitmapHandler.instantiate?.hasPlacementContent).toBeDefined();
  });

  it('does not define resolve or finishTimeline', () => {
    expect(swfJpegBitmapHandler.resolve).toBeUndefined();
    expect(swfJpegBitmapHandler.finishTimeline).toBeUndefined();
  });
});
