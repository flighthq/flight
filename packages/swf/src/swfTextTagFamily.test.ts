import { swfEditTextHandler } from './swfEditTextHandler';
import { swfStaticTextHandler } from './swfStaticTextHandler';
import { swfTextTagFamily } from './swfTextTagFamily';

describe('swfTextTagFamily', () => {
  it('is exactly its handlers, in the order a placed character is offered to them', () => {
    expect(swfTextTagFamily).toHaveLength(2);
    expect(swfTextTagFamily[0]).toBe(swfStaticTextHandler);
    expect(swfTextTagFamily[1]).toBe(swfEditTextHandler);
  });

  it('claims the union of its handlers tags, with no tag claimed twice', () => {
    const claimed = swfTextTagFamily.flatMap((handler) => [...handler.tags]);
    expect([...claimed].sort((a, b) => a - b)).toEqual(
      [...swfStaticTextHandler.tags, ...swfEditTextHandler.tags].sort((a, b) => a - b),
    );
    expect(new Set(claimed).size).toBe(claimed.length);
  });
});
