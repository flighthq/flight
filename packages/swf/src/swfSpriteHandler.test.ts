import { swfSpriteHandler } from './swfSpriteHandler';

describe('swfSpriteHandler', () => {
  it('claims the sprite tag', () => {
    expect([...swfSpriteHandler.tags]).toEqual([39]);
  });

  it('provides hasPlacementContent but no createPlacementNode or createResources', () => {
    expect(swfSpriteHandler.instantiate?.hasPlacementContent).toBeDefined();
    expect(swfSpriteHandler.instantiate?.createPlacementNode).toBeUndefined();
    expect(swfSpriteHandler.instantiate?.createResources).toBeUndefined();
  });

  it('does not define resolve or finishTimeline', () => {
    expect(swfSpriteHandler.resolve).toBeUndefined();
    expect(swfSpriteHandler.finishTimeline).toBeUndefined();
  });
});
