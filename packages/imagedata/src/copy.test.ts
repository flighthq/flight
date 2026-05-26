import { describe, expect, it } from 'vitest';

import { copyChannel, copyPixels } from './copy';
import { ImageChannel } from './imageChannel';
import { createImageData } from './imageData';
import { getPixel32, setPixel32 } from './pixel';

describe('copyPixels', () => {
  it('copies a region without alpha blend', () => {
    const src = createImageData(2, 2, 0xffaabbcc);
    const dst = createImageData(4, 4);
    copyPixels(src, 0, 0, 2, 2, dst, 1, 1);
    expect(getPixel32(dst, 1, 1)).toBe(0xffaabbcc);
    expect(getPixel32(dst, 0, 0)).toBe(0x00000000);
  });

  it('alpha-blends when mergeAlpha is true', () => {
    const src = createImageData(1, 1);
    setPixel32(src, 0, 0, 0x80ff0000);
    const dst = createImageData(1, 1);
    setPixel32(dst, 0, 0, 0xff0000ff);
    copyPixels(src, 0, 0, 1, 1, dst, 0, 0, true);
    const result = getPixel32(dst, 0, 0);
    expect((result >>> 24) & 0xff).toBe(0xff);
    expect((result >> 16) & 0xff).toBeGreaterThan(0);
    expect(result & 0xff).toBeGreaterThan(0);
  });
});

describe('copyChannel', () => {
  it('copies the red channel to the blue channel', () => {
    const src = createImageData(2, 2);
    setPixel32(src, 0, 0, 0xff1100000);
    src.data[0] = 0xab;
    const dst = createImageData(2, 2);
    copyChannel(src, ImageChannel.Red, dst, ImageChannel.Blue);
    expect(dst.data[2]).toBe(src.data[0]);
  });

  it('copies the alpha channel independently', () => {
    const src = createImageData(1, 1);
    setPixel32(src, 0, 0, 0xde000000);
    const dst = createImageData(1, 1);
    copyChannel(src, ImageChannel.Alpha, dst, ImageChannel.Alpha);
    expect(dst.data[3]).toBe(0xde);
  });
});
