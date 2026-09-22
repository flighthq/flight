import { swfStaticTextHandler } from './swfStaticTextHandler';

describe('swfStaticTextHandler', () => {
  it('claims the static text tags', () => {
    expect([...swfStaticTextHandler.tags].sort((a, b) => a - b)).toEqual([11, 33]);
  });

  it('defers text composition to resolve', () => {
    expect(swfStaticTextHandler.resolve).toBeDefined();
  });

  it('does not define finishTimeline or instantiate', () => {
    expect(swfStaticTextHandler.finishTimeline).toBeUndefined();
    expect(swfStaticTextHandler.instantiate).toBeUndefined();
  });
});
