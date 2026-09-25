import { swfScriptHandler } from './swfScriptHandler.ts';

describe('swfScriptHandler', () => {
  it('claims the script tags', () => {
    expect([...swfScriptHandler.tags].sort((a, b) => a - b)).toEqual([12, 59, 72, 82]);
  });

  it('defers ABC frame script binding to resolve', () => {
    expect(swfScriptHandler.resolve).toBeDefined();
  });

  it('does not define finishTimeline or instantiate', () => {
    expect(swfScriptHandler.finishTimeline).toBeUndefined();
    expect(swfScriptHandler.instantiate).toBeUndefined();
  });
});
