import { swfDefineMorphShapeHandler } from './swfDefineMorphShapeHandler';

describe('swfDefineMorphShapeHandler', () => {
  it('claims the two morph shape tags', () => {
    expect([...swfDefineMorphShapeHandler.tags].sort((a, b) => a - b)).toEqual([46, 84]);
  });

  it('provides placement instantiation but no resolve or finishTimeline', () => {
    expect(swfDefineMorphShapeHandler.resolve).toBeUndefined();
    expect(swfDefineMorphShapeHandler.finishTimeline).toBeUndefined();
    expect(swfDefineMorphShapeHandler.instantiate?.createPlacementNode).toBeDefined();
    expect(swfDefineMorphShapeHandler.instantiate?.hasPlacementContent).toBeDefined();
  });

  it('does not define createResources, since morph shapes carry no external assets', () => {
    expect(swfDefineMorphShapeHandler.instantiate?.createResources).toBeUndefined();
  });
});
