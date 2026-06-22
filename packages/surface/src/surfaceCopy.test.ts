import { createSurface } from './surface';
import { copySurfaceChannel, copySurfacePixels } from './surfaceCopy';
import { ImageChannel } from './surfaceImageChannel';
import { getSurfacePixel, setSurfacePixel } from './surfacePixel';

function region(
  surface: ReturnType<typeof createSurface>,
  x = 0,
  y = 0,
  width = surface.width,
  height = surface.height,
) {
  return { surface, x, y, width, height };
}

describe('copySurfaceChannel', () => {
  it('copies the red channel to the blue channel', () => {
    const src = createSurface(2, 2);
    src.data[0] = 0xab;
    const dst = createSurface(2, 2);
    copySurfaceChannel(region(dst), ImageChannel.Blue, region(src), ImageChannel.Red);
    expect(dst.data[2]).toBe(src.data[0]);
  });

  it('copies the alpha channel independently', () => {
    const src = createSurface(1, 1);
    setSurfacePixel(src, 0, 0, 0x000000de);
    const dst = createSurface(1, 1);
    copySurfaceChannel(region(dst), ImageChannel.Alpha, region(src), ImageChannel.Alpha);
    expect(dst.data[3]).toBe(0xde);
  });
});

describe('copySurfacePixels', () => {
  it('copies a region without alpha blend', () => {
    const src = createSurface(2, 2, 0xaabbccff);
    const dst = createSurface(4, 4);
    copySurfacePixels(region(dst, 1, 1, 2, 2), region(src, 0, 0, 2, 2));
    expect(getSurfacePixel(dst, 1, 1)).toBe(0xaabbccff);
    expect(getSurfacePixel(dst, 0, 0)).toBe(0x00000000);
  });

  it('alpha-composites when composite is true', () => {
    const src = createSurface(1, 1);
    setSurfacePixel(src, 0, 0, 0xff000080);
    const dst = createSurface(1, 1);
    setSurfacePixel(dst, 0, 0, 0x0000ffff);
    copySurfacePixels(region(dst), region(src), true);
    const result = getSurfacePixel(dst, 0, 0);
    expect(result & 0xff).toBe(0xff); // alpha opaque after composite
    expect((result >>> 24) & 0xff).toBeGreaterThan(0); // red blended in
    expect((result >> 8) & 0xff).toBeGreaterThan(0); // blue retained
  });
});
