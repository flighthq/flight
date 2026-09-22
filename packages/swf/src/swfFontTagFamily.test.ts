import { swfFontHandler } from './swfFontHandler';
import { swfFontTagFamily } from './swfFontTagFamily';

describe('swfFontTagFamily', () => {
  it('contains the union of its handler tags', () => {
    expect([...swfFontTagFamily.tags].sort((a, b) => a - b)).toEqual([...swfFontHandler.tags].sort((a, b) => a - b));
  });

  it('composes resolve from its handler', () => {
    expect(swfFontTagFamily.resolve).toBeDefined();
  });

  it('does not define finishTimeline or instantiate', () => {
    expect(swfFontTagFamily.finishTimeline).toBeUndefined();
    expect(swfFontTagFamily.instantiate).toBeUndefined();
  });
});
