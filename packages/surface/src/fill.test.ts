import { fillSurfaceRectangle, floodFillSurface } from './fill';
import { getSurfacePixel32 } from './pixel';
import { createSurface } from './surface';

describe('fillSurfaceRectangle', () => {
  it('fills the specified region', () => {
    const img = createSurface(4, 4);
    fillSurfaceRectangle(img, 1, 1, 2, 2, 0xaabbccff);
    expect(getSurfacePixel32(img, 1, 1)).toBe(0xaabbccff);
    expect(getSurfacePixel32(img, 2, 2)).toBe(0xaabbccff);
  });

  it('does not affect pixels outside the region', () => {
    const img = createSurface(4, 4);
    fillSurfaceRectangle(img, 1, 1, 2, 2, 0xaabbccff);
    expect(getSurfacePixel32(img, 0, 0)).toBe(0x00000000);
    expect(getSurfacePixel32(img, 3, 3)).toBe(0x00000000);
  });

  it('clamps to image bounds', () => {
    const img = createSurface(2, 2, 0x000000ff);
    fillSurfaceRectangle(img, -1, -1, 4, 4, 0xffffffff);
    expect(getSurfacePixel32(img, 0, 0)).toBe(0xffffffff);
    expect(getSurfacePixel32(img, 1, 1)).toBe(0xffffffff);
  });
});

describe('floodFillSurface', () => {
  it('fills a connected region', () => {
    const img = createSurface(3, 3, 0xffffffff);
    floodFillSurface(img, 0, 0, 0x000000ff);
    for (let py = 0; py < 3; py++) {
      for (let px = 0; px < 3; px++) {
        expect(getSurfacePixel32(img, px, py)).toBe(0x000000ff);
      }
    }
  });

  it('does not cross a barrier', () => {
    const img = createSurface(3, 3, 0xffffffff);
    for (let py = 0; py < 3; py++) {
      const i = (py * 3 + 1) * 4;
      img.data[i] = 0;
      img.data[i + 1] = 0;
      img.data[i + 2] = 0;
      img.data[i + 3] = 0xff;
    }
    floodFillSurface(img, 0, 0, 0x0000ffff);
    expect(getSurfacePixel32(img, 0, 0)).toBe(0x0000ffff);
    expect(getSurfacePixel32(img, 2, 0)).toBe(0xffffffff);
  });

  it('is a no-op when fill color matches target', () => {
    const img = createSurface(2, 2, 0x112233ff);
    floodFillSurface(img, 0, 0, 0x112233ff);
    expect(getSurfacePixel32(img, 0, 0)).toBe(0x112233ff);
  });

  it('reuses the scratch buffer across calls', () => {
    const img = createSurface(4, 4, 0xffffffff);
    floodFillSurface(img, 0, 0, 0x000000ff);
    floodFillSurface(img, 0, 0, 0xffffffff); // second call reuses buffer
    expect(getSurfacePixel32(img, 0, 0)).toBe(0xffffffff);
  });
});
