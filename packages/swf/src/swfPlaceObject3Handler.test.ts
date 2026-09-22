import { swfPlaceObject3Handler } from './swfPlaceObject3Handler';

describe('swfPlaceObject3Handler', () => {
  it('claims the PlaceObject3 and PlaceObject4 tags', () => {
    expect([...swfPlaceObject3Handler.tags].sort((a, b) => a - b)).toEqual([70, 94]);
  });

  it('defines only parse — no instantiate, resolve, or finishTimeline', () => {
    expect(swfPlaceObject3Handler.resolve).toBeUndefined();
    expect(swfPlaceObject3Handler.finishTimeline).toBeUndefined();
    expect(swfPlaceObject3Handler.instantiate).toBeUndefined();
  });
});
