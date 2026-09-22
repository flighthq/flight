import { swfVideoHandler } from './swfVideoHandler';
import { swfVideoTagFamily } from './swfVideoTagFamily';

describe('swfVideoTagFamily', () => {
  it('contains the union of its handler tags', () => {
    expect([...swfVideoTagFamily.tags]).toEqual([...swfVideoHandler.tags]);
  });

  it('composes instantiate from its handler', () => {
    expect(swfVideoTagFamily.instantiate).toBeDefined();
  });

  it('does not define resolve or finishTimeline', () => {
    expect(swfVideoTagFamily.resolve).toBeUndefined();
    expect(swfVideoTagFamily.finishTimeline).toBeUndefined();
  });
});
