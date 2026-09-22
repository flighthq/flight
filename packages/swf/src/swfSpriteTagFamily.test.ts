import { swfSpriteHandler } from './swfSpriteHandler';
import { swfSpriteTagFamily } from './swfSpriteTagFamily';

describe('swfSpriteTagFamily', () => {
  it('is exactly its handlers, in the order a placed character is offered to them', () => {
    expect(swfSpriteTagFamily).toHaveLength(1);
    expect(swfSpriteTagFamily[0]).toBe(swfSpriteHandler);
  });

  it('claims the union of its handlers tags, with no tag claimed twice', () => {
    const claimed = swfSpriteTagFamily.flatMap((handler) => [...handler.tags]);
    expect([...claimed].sort((a, b) => a - b)).toEqual([...swfSpriteHandler.tags].sort((a, b) => a - b));
    expect(new Set(claimed).size).toBe(claimed.length);
  });
});
