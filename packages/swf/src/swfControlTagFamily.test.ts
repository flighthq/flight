import { swfControlHandler } from './swfControlHandler';
import { swfControlTagFamily } from './swfControlTagFamily';

describe('swfControlTagFamily', () => {
  it('is exactly its handlers, in the order a placed character is offered to them', () => {
    expect(swfControlTagFamily).toHaveLength(1);
    expect(swfControlTagFamily[0]).toBe(swfControlHandler);
  });

  it('claims the union of its handlers tags, with no tag claimed twice', () => {
    const claimed = swfControlTagFamily.flatMap((handler) => [...handler.tags]);
    expect([...claimed].sort((a, b) => a - b)).toEqual([...swfControlHandler.tags].sort((a, b) => a - b));
    expect(new Set(claimed).size).toBe(claimed.length);
  });
});
