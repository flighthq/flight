import { copySurfaceChannel, copySurfacePixels } from './copy';
import { ImageChannel } from './imageChannel';
import { getSurfacePixel32, setSurfacePixel32 } from './pixel';
import { createSurface } from './surface';

describe('copySurfaceChannel', () => {
  it('copies the red channel to the blue channel', () => {
    const src = createSurface(2, 2);
    setSurfacePixel32(src, 0, 0, 0xff1100000);
    src.data[0] = 0xab;
    const dst = createSurface(2, 2);
    copySurfaceChannel(src, ImageChannel.Red, dst, ImageChannel.Blue);
    expect(dst.data[2]).toBe(src.data[0]);
  });

  it('copies the alpha channel independently', () => {
    const src = createSurface(1, 1);
    setSurfacePixel32(src, 0, 0, 0xde000000);
    const dst = createSurface(1, 1);
    copySurfaceChannel(src, ImageChannel.Alpha, dst, ImageChannel.Alpha);
    expect(dst.data[3]).toBe(0xde);
  });
});

describe('copySurfacePixels', () => {
  it('copies a region without alpha blend', () => {
    const src = createSurface(2, 2, 0xffaabbcc);
    const dst = createSurface(4, 4);
    copySurfacePixels(src, 0, 0, 2, 2, dst, 1, 1);
    expect(getSurfacePixel32(dst, 1, 1)).toBe(0xffaabbcc);
    expect(getSurfacePixel32(dst, 0, 0)).toBe(0x00000000);
  });

  it('alpha-blends when mergeAlpha is true', () => {
    const src = createSurface(1, 1);
    setSurfacePixel32(src, 0, 0, 0x80ff0000);
    const dst = createSurface(1, 1);
    setSurfacePixel32(dst, 0, 0, 0xff0000ff);
    copySurfacePixels(src, 0, 0, 1, 1, dst, 0, 0, true);
    const result = getSurfacePixel32(dst, 0, 0);
    expect((result >>> 24) & 0xff).toBe(0xff);
    expect((result >> 16) & 0xff).toBeGreaterThan(0);
    expect(result & 0xff).toBeGreaterThan(0);
  });
});
