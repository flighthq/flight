import { copySurfaceChannel, copySurfacePixels } from './copy';
import { ImageChannel } from './imageChannel';
import { getSurfacePixel32, setSurfacePixel32 } from './pixel';
import { createSurface } from './surface';

describe('copySurfaceChannel', () => {
  it('copies the red channel to the blue channel', () => {
    const src = createSurface(2, 2);
    src.data[0] = 0xab;
    const dst = createSurface(2, 2);
    copySurfaceChannel(dst, ImageChannel.Blue, src, ImageChannel.Red);
    expect(dst.data[2]).toBe(src.data[0]);
  });

  it('copies the alpha channel independently', () => {
    const src = createSurface(1, 1);
    setSurfacePixel32(src, 0, 0, 0x000000de);
    const dst = createSurface(1, 1);
    copySurfaceChannel(dst, ImageChannel.Alpha, src, ImageChannel.Alpha);
    expect(dst.data[3]).toBe(0xde);
  });
});

describe('copySurfacePixels', () => {
  it('copies a region without alpha blend', () => {
    const src = createSurface(2, 2, 0xaabbccff);
    const dst = createSurface(4, 4);
    copySurfacePixels(dst, 1, 1, src, 0, 0, 2, 2);
    expect(getSurfacePixel32(dst, 1, 1)).toBe(0xaabbccff);
    expect(getSurfacePixel32(dst, 0, 0)).toBe(0x00000000);
  });

  it('alpha-blends when mergeAlpha is true', () => {
    const src = createSurface(1, 1);
    setSurfacePixel32(src, 0, 0, 0xff000080);
    const dst = createSurface(1, 1);
    setSurfacePixel32(dst, 0, 0, 0x0000ffff);
    copySurfacePixels(dst, 0, 0, src, 0, 0, 1, 1, true);
    const result = getSurfacePixel32(dst, 0, 0);
    expect(result & 0xff).toBe(0xff); // alpha opaque after merge
    expect((result >>> 24) & 0xff).toBeGreaterThan(0); // red blended in
    expect((result >> 8) & 0xff).toBeGreaterThan(0); // blue retained
  });
});
