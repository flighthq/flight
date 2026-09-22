import { swfFontHandler } from './swfFontHandler';

describe('swfFontHandler', () => {
  it('claims the font tags', () => {
    expect([...swfFontHandler.tags].sort((a, b) => a - b)).toEqual([10, 13, 48, 62, 75]);
  });

  it('defers code point composition to resolve', () => {
    expect(swfFontHandler.resolve).toBeDefined();
  });

  it('does not define finishTimeline or instantiate', () => {
    expect(swfFontHandler.finishTimeline).toBeUndefined();
    expect(swfFontHandler.instantiate).toBeUndefined();
  });
});
