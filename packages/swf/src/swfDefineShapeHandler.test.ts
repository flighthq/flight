import { swfDefineShapeHandler } from './swfDefineShapeHandler.ts';

describe('swfDefineShapeHandler', () => {
  it('claims the four static shape tags', () => {
    expect([...swfDefineShapeHandler.tags].sort((a, b) => a - b)).toEqual([2, 22, 32, 83]);
  });

  it('provides placement instantiation but no resolve or finishTimeline', () => {
    expect(swfDefineShapeHandler.resolve).toBeUndefined();
    expect(swfDefineShapeHandler.finishTimeline).toBeUndefined();
    expect(swfDefineShapeHandler.instantiate?.createPlacementNode).toBeDefined();
    expect(swfDefineShapeHandler.instantiate?.hasPlacementContent).toBeDefined();
  });

  it('does not define createResources, since shapes carry no external assets', () => {
    expect(swfDefineShapeHandler.instantiate?.createResources).toBeUndefined();
  });
});
