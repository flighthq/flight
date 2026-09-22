import { swfPlacementTagFamily } from './swfPlacementTagFamily';
import { swfPlaceObject3Handler } from './swfPlaceObject3Handler';
import { swfPlaceObjectHandler } from './swfPlaceObjectHandler';

describe('swfPlacementTagFamily', () => {
  it('is exactly its handlers, in the order a placed character is offered to them', () => {
    expect(swfPlacementTagFamily).toHaveLength(2);
    expect(swfPlacementTagFamily[0]).toBe(swfPlaceObjectHandler);
    expect(swfPlacementTagFamily[1]).toBe(swfPlaceObject3Handler);
  });

  it('claims the union of its handlers tags, with no tag claimed twice', () => {
    const claimed = swfPlacementTagFamily.flatMap((handler) => [...handler.tags]);
    expect([...claimed].sort((a, b) => a - b)).toEqual(
      [...swfPlaceObjectHandler.tags, ...swfPlaceObject3Handler.tags].sort((a, b) => a - b),
    );
    expect(new Set(claimed).size).toBe(claimed.length);
  });
});
