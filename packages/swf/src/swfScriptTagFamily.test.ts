import { swfScriptHandler } from './swfScriptHandler.ts';
import { swfScriptTagFamily } from './swfScriptTagFamily.ts';

describe('swfScriptTagFamily', () => {
  it('is exactly its handlers, in the order a placed character is offered to them', () => {
    expect(swfScriptTagFamily).toHaveLength(1);
    expect(swfScriptTagFamily[0]).toBe(swfScriptHandler);
  });

  it('claims the union of its handlers tags, with no tag claimed twice', () => {
    const claimed = swfScriptTagFamily.flatMap((handler) => [...handler.tags]);
    expect([...claimed].sort((a, b) => a - b)).toEqual([...swfScriptHandler.tags].sort((a, b) => a - b));
    expect(new Set(claimed).size).toBe(claimed.length);
  });
});
