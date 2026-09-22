import { swfEditTextHandler } from './swfEditTextHandler';
import { swfStaticTextHandler } from './swfStaticTextHandler';
import { swfTextTagFamily } from './swfTextTagFamily';

describe('swfTextTagFamily', () => {
  it('contains the union of its handler tags', () => {
    expect([...swfTextTagFamily.tags].sort((a, b) => a - b)).toEqual(
      [...swfStaticTextHandler.tags, ...swfEditTextHandler.tags].sort((a, b) => a - b),
    );
  });

  it('composes resolve from static text and instantiate from edit text', () => {
    expect(swfTextTagFamily.resolve).toBeDefined();
    expect(swfTextTagFamily.instantiate).toBeDefined();
  });

  it('does not define finishTimeline', () => {
    expect(swfTextTagFamily.finishTimeline).toBeUndefined();
  });
});
