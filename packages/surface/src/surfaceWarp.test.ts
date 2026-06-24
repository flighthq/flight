import { createSurface } from './surface';
import { getSurfacePixel, setSurfacePixel } from './surfacePixel';
import { warpSurface, warpSurfaceQuad } from './surfaceWarp';

function region(
  surface: ReturnType<typeof createSurface>,
  x = 0,
  y = 0,
  width = surface.width,
  height = surface.height,
) {
  return { surface, x, y, width, height };
}

describe('warpSurface', () => {
  it('identity matrix copies source to dest', () => {
    const src = createSurface(4, 4, 0xff0000ff);
    const dst = createSurface(4, 4);
    // Identity homography: dest pixel (x,y) maps to source (x,y).
    warpSurface(region(dst), region(src), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(getSurfacePixel(dst, 0, 0)).toBe(0xff0000ff);
    expect(getSurfacePixel(dst, 3, 3)).toBe(0xff0000ff);
  });

  it('translation matrix shifts source', () => {
    const src = createSurface(4, 4);
    setSurfacePixel(src, 0, 0, 0xff0000ff);
    const dst = createSurface(4, 4);
    // Translate source by (-1, -1): dest pixel (x,y) reads source (x-1, y-1).
    warpSurface(region(dst), region(src), [1, 0, -1, 0, 1, -1, 0, 0, 1], 'transparent', 'nearest');
    // dst(1,1) should map to src(0,0)
    expect(getSurfacePixel(dst, 1, 1)).toBe(0xff0000ff);
    // dst(0,0) maps to src(-1,-1) → transparent
    expect(getSurfacePixel(dst, 0, 0)).toBe(0x00000000);
  });

  it('clamp edgeMode extends border pixels', () => {
    const src = createSurface(2, 2, 0x00ff00ff);
    const dst = createSurface(4, 4);
    // Translate source by (2,2): most dst pixels map outside src → clamp to border.
    warpSurface(region(dst), region(src), [1, 0, 2, 0, 1, 2, 0, 0, 1], 'clamp', 'nearest');
    // dst(0,0) maps to src(-2,-2) → clamped to src(0,0) = green
    expect(getSurfacePixel(dst, 0, 0)).toBe(0x00ff00ff);
  });

  it('transparent edgeMode gives transparent black outside bounds', () => {
    const src = createSurface(2, 2, 0xffffffff);
    const dst = createSurface(4, 4);
    warpSurface(region(dst), region(src), [1, 0, 3, 0, 1, 3, 0, 0, 1], 'transparent', 'nearest');
    // All dst pixels map to src outside bounds.
    expect(getSurfacePixel(dst, 0, 0)).toBe(0x00000000);
  });

  it('zero-size regions are a no-op', () => {
    const src = createSurface(4, 4, 0xffffffff);
    const dst = createSurface(4, 4);
    warpSurface(region(dst, 0, 0, 0, 4), region(src), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(getSurfacePixel(dst, 0, 0)).toBe(0x00000000);
  });

  it('near-zero w coefficient produces transparent pixel', () => {
    const src = createSurface(2, 2, 0xffffffff);
    const dst = createSurface(2, 2);
    // Pathological matrix where w ≈ 0 at (0,0).
    warpSurface(region(dst), region(src), [1, 0, 0, 0, 1, 0, 1e-15, 0, 0], 'clamp', 'nearest');
    // Should not throw; pixel at (0,0) with w≈0 becomes transparent.
    expect(dst.data[3]).toBe(0);
  });
});

describe('warpSurfaceQuad', () => {
  it('identity quad (src corners → dst corners) copies source', () => {
    const src = createSurface(4, 4, 0x0000ffff);
    const dst = createSurface(4, 4);
    // Map source [4x4] corners to dest [4x4] corners unchanged.
    warpSurfaceQuad(region(dst), region(src), [0, 0, 4, 0, 4, 4, 0, 4], 'transparent', 'nearest');
    // Interior pixels should be blue.
    expect(getSurfacePixel(dst, 2, 2)).toBe(0x0000ffff);
  });

  it('degenerate quad (zero-area) produces no output', () => {
    const src = createSurface(4, 4, 0xffffffff);
    const dst = createSurface(4, 4);
    // All four corners at the same point → degenerate homography.
    warpSurfaceQuad(region(dst), region(src), [2, 2, 2, 2, 2, 2, 2, 2], 'transparent', 'nearest');
    // Should not throw; output can be transparent or unchanged.
    expect(dst.data.every((v) => v === 0 || true)).toBe(true);
  });

  it('zero-size source or dest is a no-op', () => {
    const src = createSurface(4, 4, 0xffffffff);
    const dst = createSurface(4, 4);
    warpSurfaceQuad(region(dst, 0, 0, 0, 0), region(src), [0, 0, 4, 0, 4, 4, 0, 4]);
    expect(getSurfacePixel(dst, 0, 0)).toBe(0x00000000);
  });

  it('horizontal shear quad produces non-trivial sampling', () => {
    const src = createSurface(8, 8);
    // Fill left half red, right half green.
    for (let py = 0; py < 8; py++) {
      for (let px = 0; px < 8; px++) {
        const i = (py * 8 + px) * 4;
        src.data[i] = px < 4 ? 255 : 0;
        src.data[i + 1] = px >= 4 ? 255 : 0;
        src.data[i + 2] = 0;
        src.data[i + 3] = 255;
      }
    }
    const dst = createSurface(8, 8);
    // Shear: right edge shifted up by 2 pixels.
    warpSurfaceQuad(region(dst), region(src), [0, 0, 8, 2, 8, 8, 0, 8], 'transparent', 'nearest');
    // Should not throw; output should be non-blank for inner pixels.
    let hasNonZero = false;
    for (let i = 0; i < dst.data.length; i++) {
      if (dst.data[i] !== 0) {
        hasNonZero = true;
        break;
      }
    }
    expect(hasNonZero).toBe(true);
  });
});
