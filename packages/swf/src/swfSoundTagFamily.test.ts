import { swfSoundHandler } from './swfSoundHandler.ts';
import { swfSoundTagFamily } from './swfSoundTagFamily.ts';

describe('swfSoundTagFamily', () => {
  it('is exactly its handlers, in the order a placed character is offered to them', () => {
    expect(swfSoundTagFamily).toHaveLength(1);
    expect(swfSoundTagFamily[0]).toBe(swfSoundHandler);
  });

  it('claims the union of its handlers tags, with no tag claimed twice', () => {
    const claimed = swfSoundTagFamily.flatMap((handler) => [...handler.tags]);
    expect([...claimed].sort((a, b) => a - b)).toEqual([...swfSoundHandler.tags].sort((a, b) => a - b));
    expect(new Set(claimed).size).toBe(claimed.length);
  });
});
