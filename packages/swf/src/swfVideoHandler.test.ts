import { swfVideoHandler } from './swfVideoHandler.ts';

describe('swfVideoHandler', () => {
  it('claims the video tag', () => {
    expect([...swfVideoHandler.tags]).toEqual([60]);
  });

  it('provides full placement instantiation', () => {
    expect(swfVideoHandler.instantiate?.createPlacementNode).toBeDefined();
    expect(swfVideoHandler.instantiate?.hasPlacementContent).toBeDefined();
  });

  it('does not define resolve, finishTimeline, or createResources', () => {
    expect(swfVideoHandler.resolve).toBeUndefined();
    expect(swfVideoHandler.finishTimeline).toBeUndefined();
    expect(swfVideoHandler.instantiate?.createResources).toBeUndefined();
  });
});
