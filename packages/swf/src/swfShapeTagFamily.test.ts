import { swfDefineMorphShapeHandler } from './swfDefineMorphShapeHandler';
import { swfDefineShapeHandler } from './swfDefineShapeHandler';
import { swfShapeTagFamily } from './swfShapeTagFamily';

describe('swfShapeTagFamily', () => {
  it('is exactly its handlers, in the order a placed character is offered to them', () => {
    expect(swfShapeTagFamily).toHaveLength(2);
    expect(swfShapeTagFamily[0]).toBe(swfDefineShapeHandler);
    expect(swfShapeTagFamily[1]).toBe(swfDefineMorphShapeHandler);
  });

  it('claims the union of its handlers tags, with no tag claimed twice', () => {
    const claimed = swfShapeTagFamily.flatMap((handler) => [...handler.tags]);
    expect([...claimed].sort((a, b) => a - b)).toEqual(
      [...swfDefineShapeHandler.tags, ...swfDefineMorphShapeHandler.tags].sort((a, b) => a - b),
    );
    expect(new Set(claimed).size).toBe(claimed.length);
  });
});
