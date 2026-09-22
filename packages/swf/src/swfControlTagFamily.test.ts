import { swfControlHandler } from './swfControlHandler';
import { swfControlTagFamily } from './swfControlTagFamily';

describe('swfControlTagFamily', () => {
  it('contains the union of its handler tags', () => {
    expect([...swfControlTagFamily.tags].sort((a, b) => a - b)).toEqual(
      [...swfControlHandler.tags].sort((a, b) => a - b),
    );
  });

  it('defines only parse — no instantiate, resolve, or finishTimeline', () => {
    expect(swfControlTagFamily.resolve).toBeUndefined();
    expect(swfControlTagFamily.finishTimeline).toBeUndefined();
    expect(swfControlTagFamily.instantiate).toBeUndefined();
  });
});
