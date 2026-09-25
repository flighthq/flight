import { swfBitmapTagFamily } from './swfBitmapTagFamily.ts';
import { swfJpegBitmapHandler } from './swfJpegBitmapHandler.ts';
import { swfLosslessBitmapHandler } from './swfLosslessBitmapHandler.ts';

describe('swfBitmapTagFamily', () => {
  it('is exactly its handlers, in the order a placed character is offered to them', () => {
    expect(swfBitmapTagFamily).toHaveLength(2);
    expect(swfBitmapTagFamily[0]).toBe(swfJpegBitmapHandler);
    expect(swfBitmapTagFamily[1]).toBe(swfLosslessBitmapHandler);
  });

  it('claims the union of its handlers tags, with no tag claimed twice', () => {
    const claimed = swfBitmapTagFamily.flatMap((handler) => [...handler.tags]);
    expect([...claimed].sort((a, b) => a - b)).toEqual(
      [...swfJpegBitmapHandler.tags, ...swfLosslessBitmapHandler.tags].sort((a, b) => a - b),
    );
    expect(new Set(claimed).size).toBe(claimed.length);
  });
});
