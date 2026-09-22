import { swfPlacementTagFamily } from './swfPlacementTagFamily';
import { swfPlaceObject3Handler } from './swfPlaceObject3Handler';
import { swfPlaceObjectHandler } from './swfPlaceObjectHandler';

describe('swfPlacementTagFamily', () => {
  it('contains the union of its handler tags', () => {
    expect([...swfPlacementTagFamily.tags].sort((a, b) => a - b)).toEqual(
      [...swfPlaceObjectHandler.tags, ...swfPlaceObject3Handler.tags].sort((a, b) => a - b),
    );
  });

  it('defines only parse — no instantiate, resolve, or finishTimeline', () => {
    expect(swfPlacementTagFamily.resolve).toBeUndefined();
    expect(swfPlacementTagFamily.finishTimeline).toBeUndefined();
    expect(swfPlacementTagFamily.instantiate).toBeUndefined();
  });
});
