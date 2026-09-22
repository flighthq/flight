import { swfDefineMorphShapeHandler } from './swfDefineMorphShapeHandler';
import { swfDefineShapeHandler } from './swfDefineShapeHandler';
import { swfShapeTagFamily } from './swfShapeTagFamily';

describe('swfShapeTagFamily', () => {
  it('claims the union of shape and morph shape tags', () => {
    const expected = [...swfDefineShapeHandler.tags, ...swfDefineMorphShapeHandler.tags].sort((a, b) => a - b);
    expect([...swfShapeTagFamily.tags].sort((a, b) => a - b)).toEqual(expected);
  });

  it('composes instantiate from both handlers', () => {
    expect(swfShapeTagFamily.instantiate?.createPlacementNode).toBeDefined();
    expect(swfShapeTagFamily.instantiate?.hasPlacementContent).toBeDefined();
  });

  it('omits resolve and finishTimeline since neither handler defines them', () => {
    expect(swfShapeTagFamily.resolve).toBeUndefined();
    expect(swfShapeTagFamily.finishTimeline).toBeUndefined();
  });
});
