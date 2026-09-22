import { swfSpriteHandler } from './swfSpriteHandler';
import { swfSpriteTagFamily } from './swfSpriteTagFamily';

describe('swfSpriteTagFamily', () => {
  it('contains the union of its handler tags', () => {
    expect([...swfSpriteTagFamily.tags]).toEqual([...swfSpriteHandler.tags]);
  });

  it('composes instantiate from its handler', () => {
    expect(swfSpriteTagFamily.instantiate).toBeDefined();
  });

  it('does not define resolve or finishTimeline', () => {
    expect(swfSpriteTagFamily.resolve).toBeUndefined();
    expect(swfSpriteTagFamily.finishTimeline).toBeUndefined();
  });
});
