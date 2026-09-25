import { swfControlHandler } from './swfControlHandler.ts';

describe('swfControlHandler', () => {
  it('claims the control tags', () => {
    expect([...swfControlHandler.tags].sort((a, b) => a - b)).toEqual([7, 9, 34, 43, 56, 76, 78, 86]);
  });

  it('defines only parse — no instantiate, resolve, or finishTimeline', () => {
    expect(swfControlHandler.resolve).toBeUndefined();
    expect(swfControlHandler.finishTimeline).toBeUndefined();
    expect(swfControlHandler.instantiate).toBeUndefined();
  });
});
