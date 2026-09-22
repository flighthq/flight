import { swfScriptHandler } from './swfScriptHandler';
import { swfScriptTagFamily } from './swfScriptTagFamily';

describe('swfScriptTagFamily', () => {
  it('contains the union of its handler tags', () => {
    expect([...swfScriptTagFamily.tags].sort((a, b) => a - b)).toEqual(
      [...swfScriptHandler.tags].sort((a, b) => a - b),
    );
  });

  it('composes resolve from its handler', () => {
    expect(swfScriptTagFamily.resolve).toBeDefined();
  });

  it('does not define finishTimeline or instantiate', () => {
    expect(swfScriptTagFamily.finishTimeline).toBeUndefined();
    expect(swfScriptTagFamily.instantiate).toBeUndefined();
  });
});
