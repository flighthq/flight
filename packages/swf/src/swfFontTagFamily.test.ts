import { swfFontHandler } from './swfFontHandler';
import { swfFontTagFamily } from './swfFontTagFamily';

describe('swfFontTagFamily', () => {
  it('is exactly its handlers, in the order a placed character is offered to them', () => {
    expect(swfFontTagFamily).toHaveLength(1);
    expect(swfFontTagFamily[0]).toBe(swfFontHandler);
  });

  it('claims the union of its handlers tags, with no tag claimed twice', () => {
    const claimed = swfFontTagFamily.flatMap((handler) => [...handler.tags]);
    expect([...claimed].sort((a, b) => a - b)).toEqual([...swfFontHandler.tags].sort((a, b) => a - b));
    expect(new Set(claimed).size).toBe(claimed.length);
  });
});
