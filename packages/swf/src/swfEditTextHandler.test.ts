import { swfEditTextHandler } from './swfEditTextHandler.ts';

describe('swfEditTextHandler', () => {
  it('claims the edit text tag', () => {
    expect([...swfEditTextHandler.tags]).toEqual([37]);
  });

  it('provides placement instantiation', () => {
    expect(swfEditTextHandler.instantiate?.createPlacementNode).toBeDefined();
    expect(swfEditTextHandler.instantiate?.hasPlacementContent).toBeDefined();
  });

  it('does not define resolve, finishTimeline, or createResources', () => {
    expect(swfEditTextHandler.resolve).toBeUndefined();
    expect(swfEditTextHandler.finishTimeline).toBeUndefined();
    expect(swfEditTextHandler.instantiate?.createResources).toBeUndefined();
  });
});
