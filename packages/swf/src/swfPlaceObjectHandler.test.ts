import { swfPlaceObjectHandler } from './swfPlaceObjectHandler';

describe('swfPlaceObjectHandler', () => {
  it('claims the legacy and PlaceObject2 placement tags', () => {
    expect([...swfPlaceObjectHandler.tags].sort((a, b) => a - b)).toEqual([4, 5, 26, 28]);
  });

  it('defines only parse — no instantiate, resolve, or finishTimeline', () => {
    expect(swfPlaceObjectHandler.resolve).toBeUndefined();
    expect(swfPlaceObjectHandler.finishTimeline).toBeUndefined();
    expect(swfPlaceObjectHandler.instantiate).toBeUndefined();
  });
});
