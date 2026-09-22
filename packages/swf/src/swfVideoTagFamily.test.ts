import { swfVideoHandler } from './swfVideoHandler';
import { swfVideoTagFamily } from './swfVideoTagFamily';

describe('swfVideoTagFamily', () => {
  it('is exactly its handlers, in the order a placed character is offered to them', () => {
    expect(swfVideoTagFamily).toHaveLength(1);
    expect(swfVideoTagFamily[0]).toBe(swfVideoHandler);
  });

  it('claims the union of its handlers tags, with no tag claimed twice', () => {
    const claimed = swfVideoTagFamily.flatMap((handler) => [...handler.tags]);
    expect([...claimed].sort((a, b) => a - b)).toEqual([...swfVideoHandler.tags].sort((a, b) => a - b));
    expect(new Set(claimed).size).toBe(claimed.length);
  });
});
