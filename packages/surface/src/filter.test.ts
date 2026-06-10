import {
  applySurfaceBlurFilter,
  applySurfaceColorMatrixFilter,
  applySurfaceConvolutionFilter,
  applySurfaceDropShadowFilter,
  applySurfaceGlowFilter,
  blurSurfacePixelsHorizontal,
  blurSurfacePixelsVertical,
  compositeSurfacePixels,
  compositeSurfaceRegion,
  extractSurfacePixels,
  tintSurfaceAlphaMask,
  writeSurfacePixels,
} from './filter';
import { createSurface } from './surface';

// ─── Pixel-level ──────────────────────────────────────────────────────────────

describe('applySurfaceBlurFilter', () => {
  it('spreads alpha into neighboring pixels', () => {
    const source = createSurface(3, 1);
    source.data[4] = 255; // pixel 1: [255, 0, 0, 255]
    source.data[5] = 0;
    source.data[6] = 0;
    source.data[7] = 255;
    const out = new Uint8ClampedArray(3 * 4);
    const blurBuffer = new Uint8ClampedArray(3 * 4);

    applySurfaceBlurFilter(out, blurBuffer, source, 0, 0, 3, 1, { blurX: 2, blurY: 0 });

    expect(out[3]).toBeGreaterThan(0); // pixel 0 alpha spread
    expect(out[7]).toBeGreaterThan(0); // pixel 1 alpha
    expect(out[11]).toBeGreaterThan(0); // pixel 2 alpha spread
  });

  it('writes the source rectangle into out when blur is zero', () => {
    const source = createSurface(1, 1, 0xff336699);
    const out = new Uint8ClampedArray(4);
    const blurBuffer = new Uint8ClampedArray(4);

    applySurfaceBlurFilter(out, blurBuffer, source, 0, 0, 1, 1, { blurX: 0, blurY: 0 });

    expect(out[0]).toBe(0x33);
    expect(out[1]).toBe(0x66);
    expect(out[2]).toBe(0x99);
    expect(out[3]).toBe(0xff);
  });

  it('result is always in out regardless of pass parity', () => {
    const source = createSurface(3, 3, 0x88ffffff);
    const out = new Uint8ClampedArray(3 * 3 * 4);
    const blurBuffer = new Uint8ClampedArray(3 * 3 * 4);

    // blurX only (odd parity — result would naturally land in blurBuffer)
    applySurfaceBlurFilter(out, blurBuffer, source, 0, 0, 3, 3, { blurX: 2, blurY: 0 });
    expect(out[3]).toBeGreaterThan(0); // result is in out, not blurBuffer
  });

  it('can place out into a surface via writeSurfacePixels', () => {
    const source = createSurface(1, 1, 0xff336699);
    const dest = createSurface(3, 3);
    const out = new Uint8ClampedArray(4);
    const blurBuffer = new Uint8ClampedArray(4);

    applySurfaceBlurFilter(out, blurBuffer, source, 0, 0, 1, 1, { blurX: 0, blurY: 0 });
    writeSurfacePixels(dest, 1, 1, 1, 1, out);

    const i = (1 * dest.width + 1) * 4;
    expect(dest.data[i]).toBe(0x33);
    expect(dest.data[i + 1]).toBe(0x66);
    expect(dest.data[i + 2]).toBe(0x99);
    expect(dest.data[i + 3]).toBe(0xff);
  });
});

describe('applySurfaceColorMatrixFilter', () => {
  it('applies a 4x5 color matrix to the source rectangle', () => {
    const source = createSurface(1, 1, 0xff204060);
    const out = new Uint8ClampedArray(4);

    applySurfaceColorMatrixFilter(
      out,
      source,
      0,
      0,
      1,
      1,
      [0, 0, 0, 0, 10, 0, 0, 0, 0, 20, 0, 0, 0, 0, 30, 0, 0, 0, 1, 0],
    );

    expect(out[0]).toBe(10);
    expect(out[1]).toBe(20);
    expect(out[2]).toBe(30);
    expect(out[3]).toBe(0xff);
  });

  it('is safe when out aliases source.data for an in-place operation', () => {
    const surface = createSurface(1, 1, 0xff010203);

    applySurfaceColorMatrixFilter(
      surface.data,
      surface,
      0,
      0,
      1,
      1,
      [1, 0, 0, 0, 10, 0, 1, 0, 0, 20, 0, 0, 1, 0, 30, 0, 0, 0, 1, 0],
    );

    expect(surface.data[0]).toBe(11);
    expect(surface.data[1]).toBe(22);
    expect(surface.data[2]).toBe(33);
    expect(surface.data[3]).toBe(0xff);
  });

  it('throws when the matrix is too short', () => {
    const source = createSurface(1, 1);
    const out = new Uint8ClampedArray(4);

    expect(() => applySurfaceColorMatrixFilter(out, source, 0, 0, 1, 1, [])).toThrow(
      'Color matrix filter requires 20 values',
    );
  });
});

describe('applySurfaceConvolutionFilter', () => {
  it('applies a convolution matrix to the source rectangle', () => {
    const source = createSurface(3, 1);
    source.data[0] = 10;
    source.data[4] = 20;
    source.data[8] = 30;
    const out = new Uint8ClampedArray(4);

    applySurfaceConvolutionFilter(out, source, 1, 0, 1, 1, {
      matrix: [1, 1, 1],
      matrixX: 3,
      matrixY: 1,
      preserveAlpha: false,
    });

    expect(out[0]).toBe(20);
  });

  it('can sample a fill color outside source bounds', () => {
    const source = createSurface(1, 1, 0xff000000);
    const out = new Uint8ClampedArray(4);

    applySurfaceConvolutionFilter(out, source, 0, 0, 1, 1, {
      clamp: false,
      color: 0xffff0000,
      divisor: 1,
      matrix: [1, 0, 0],
      matrixX: 3,
      matrixY: 1,
      preserveAlpha: false,
    });

    expect(out[0]).toBe(0xff);
    expect(out[3]).toBe(0xff);
  });

  it('preserves source alpha by default', () => {
    const source = createSurface(1, 1, 0x44000000);
    const out = new Uint8ClampedArray(4);

    applySurfaceConvolutionFilter(out, source, 0, 0, 1, 1, {
      bias: 255,
      matrix: [1],
      matrixX: 1,
      matrixY: 1,
    });

    expect(out[3]).toBe(0x44);
  });
});

describe('applySurfaceDropShadowFilter', () => {
  it('produces a tinted alpha mask in out', () => {
    const source = createSurface(1, 1, 0xffffffff);
    const out = new Uint8ClampedArray(4);
    const blurBuffer = new Uint8ClampedArray(4);

    applySurfaceDropShadowFilter(out, blurBuffer, source, 0, 0, 1, 1, {
      blurX: 0,
      blurY: 0,
      color: 0x0000ff,
    });

    expect(out[0]).toBe(0); // r
    expect(out[1]).toBe(0); // g
    expect(out[2]).toBe(0xff); // b from color
    expect(out[3]).toBe(0xff); // alpha from source
  });

  it('compositing out at an offset places the shadow correctly', () => {
    const source = createSurface(1, 1, 0xffffffff);
    const dest = createSurface(4, 4);
    const out = new Uint8ClampedArray(4);
    const blurBuffer = new Uint8ClampedArray(4);

    applySurfaceDropShadowFilter(out, blurBuffer, source, 0, 0, 1, 1, {
      blurX: 0,
      blurY: 0,
      color: 0x0000ff,
    });

    // angle=0, distance=1 → offsetX=1, offsetY=0
    const angle = (0 * Math.PI) / 180;
    const offsetX = Math.round(Math.cos(angle) * 1);
    const offsetY = Math.round(Math.sin(angle) * 1);
    compositeSurfacePixels(dest, 1 + offsetX, 1 + offsetY, 1, 1, out);

    const i = (1 * dest.width + 2) * 4;
    expect(dest.data[i]).toBe(0);
    expect(dest.data[i + 1]).toBe(0);
    expect(dest.data[i + 2]).toBe(0xff);
    expect(dest.data[i + 3]).toBe(0xff);
  });

  it('compositing both shadow and source produces source-over-shadow', () => {
    const source = createSurface(1, 1, 0xffff0000); // opaque red
    const dest = createSurface(2, 1);
    const out = new Uint8ClampedArray(4);
    const blurBuffer = new Uint8ClampedArray(4);

    applySurfaceDropShadowFilter(out, blurBuffer, source, 0, 0, 1, 1, {
      blurX: 0,
      blurY: 0,
      color: 0x0000ff,
    });

    const angle = (0 * Math.PI) / 180;
    const offsetX = Math.round(Math.cos(angle) * 1);
    compositeSurfacePixels(dest, 0 + offsetX, 0, 1, 1, out); // shadow at offset
    compositeSurfaceRegion(dest, 0, 0, source, 0, 0, 1, 1); // source on top

    expect(dest.data[0]).toBe(0xff); // red source pixel at (0,0)
    expect(dest.data[1]).toBe(0);
    expect(dest.data[2]).toBe(0);
    expect(dest.data[3]).toBe(0xff);
  });
});

describe('applySurfaceGlowFilter', () => {
  it('produces a tinted alpha mask in out', () => {
    const source = createSurface(1, 1, 0xffffffff);
    const out = new Uint8ClampedArray(4);
    const blurBuffer = new Uint8ClampedArray(4);

    applySurfaceGlowFilter(out, blurBuffer, source, 0, 0, 1, 1, {
      blurX: 0,
      blurY: 0,
      color: 0x00ff00,
    });

    expect(out[1]).toBe(0xff); // g from tint color
    expect(out[3]).toBe(0xff); // alpha from source
  });

  it('compositing out places the glow at the same position', () => {
    const source = createSurface(1, 1, 0xffffffff);
    const dest = createSurface(1, 1);
    const out = new Uint8ClampedArray(4);
    const blurBuffer = new Uint8ClampedArray(4);

    applySurfaceGlowFilter(out, blurBuffer, source, 0, 0, 1, 1, {
      blurX: 0,
      blurY: 0,
      color: 0x00ff00,
    });

    compositeSurfacePixels(dest, 0, 0, 1, 1, out); // glow only (knockout)

    expect(dest.data[0]).toBe(0);
    expect(dest.data[1]).toBe(0xff);
    expect(dest.data[2]).toBe(0);
    expect(dest.data[3]).toBe(0xff);
  });

  it('compositing source over glow produces source-over-glow', () => {
    const source = createSurface(1, 1, 0xffff0000); // opaque red
    const dest = createSurface(1, 1);
    const out = new Uint8ClampedArray(4);
    const blurBuffer = new Uint8ClampedArray(4);

    applySurfaceGlowFilter(out, blurBuffer, source, 0, 0, 1, 1, {
      blurX: 0,
      blurY: 0,
      color: 0x00ff00,
    });

    compositeSurfacePixels(dest, 0, 0, 1, 1, out); // glow
    compositeSurfaceRegion(dest, 0, 0, source, 0, 0, 1, 1); // source on top

    expect(dest.data[0]).toBe(0xff); // red source wins
    expect(dest.data[1]).toBe(0);
    expect(dest.data[2]).toBe(0);
    expect(dest.data[3]).toBe(0xff);
  });
});

describe('blurSurfacePixelsHorizontal', () => {
  it('spreads pixel values to horizontal neighbors', () => {
    const source = new Uint8ClampedArray([
      0,
      0,
      0,
      0, // pixel 0: transparent
      0,
      0,
      0,
      255, // pixel 1: opaque
      0,
      0,
      0,
      0, // pixel 2: transparent
    ]);
    const out = new Uint8ClampedArray(12);
    blurSurfacePixelsHorizontal(out, source, 3, 1, 1);
    expect(out[3]).toBeGreaterThan(0); // pixel 0 gained alpha
    expect(out[11]).toBeGreaterThan(0); // pixel 2 gained alpha
  });

  it('does not modify out when radius is 0', () => {
    const source = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 0]);
    const out = new Uint8ClampedArray(8);
    blurSurfacePixelsHorizontal(out, source, 2, 1, 0);
    expect(out[3]).toBe(255);
    expect(out[7]).toBe(0);
  });
});

describe('blurSurfacePixelsVertical', () => {
  it('spreads pixel values to vertical neighbors', () => {
    const source = new Uint8ClampedArray([
      0,
      0,
      0,
      0, // row 0: transparent
      0,
      0,
      0,
      255, // row 1: opaque
      0,
      0,
      0,
      0, // row 2: transparent
    ]);
    const out = new Uint8ClampedArray(12);
    blurSurfacePixelsVertical(out, source, 1, 3, 1);
    expect(out[3]).toBeGreaterThan(0); // row 0 gained alpha
    expect(out[11]).toBeGreaterThan(0); // row 2 gained alpha
  });
});

// ─── Filter-level ─────────────────────────────────────────────────────────────

describe('compositeSurfacePixels', () => {
  it('alpha-composites pixels over the destination', () => {
    const dest = createSurface(1, 1, 0xff0000ff); // opaque blue
    const pixels = new Uint8ClampedArray([0xff, 0, 0, 0xff]); // opaque red
    compositeSurfacePixels(dest, 0, 0, 1, 1, pixels);
    expect(dest.data[0]).toBe(0xff); // red wins (fully opaque src)
    expect(dest.data[2]).toBe(0); // blue gone
    expect(dest.data[3]).toBe(0xff);
  });

  it('blends semi-transparent source over destination', () => {
    const dest = createSurface(1, 1, 0xff000000); // opaque black
    const pixels = new Uint8ClampedArray([0xff, 0xff, 0xff, 0x80]); // half-white
    compositeSurfacePixels(dest, 0, 0, 1, 1, pixels);
    expect(dest.data[0]).toBeGreaterThan(0);
    expect(dest.data[0]).toBeLessThan(0xff);
    expect(dest.data[3]).toBe(0xff);
  });
});

describe('compositeSurfaceRegion', () => {
  it('alpha-composites a region of one surface over another', () => {
    const source = createSurface(1, 1, 0xffff0000); // opaque red
    const dest = createSurface(1, 1, 0xff0000ff); // opaque blue
    compositeSurfaceRegion(dest, 0, 0, source, 0, 0, 1, 1);
    expect(dest.data[0]).toBe(0xff); // red wins
    expect(dest.data[2]).toBe(0); // blue gone
  });
});

describe('extractSurfacePixels', () => {
  it('copies a surface region into a tightly-packed buffer', () => {
    const source = createSurface(2, 2);
    const i = (1 * 2 + 1) * 4;
    source.data[i] = 0xff;
    source.data[i + 3] = 0xff;
    const out = new Uint8ClampedArray(4);
    extractSurfacePixels(out, source, 1, 1, 1, 1);
    expect(out[0]).toBe(0xff);
    expect(out[3]).toBe(0xff);
  });

  it('silently skips pixels outside source bounds', () => {
    const source = createSurface(1, 1, 0xffffffff);
    const out = new Uint8ClampedArray(4 * 4); // 2x2 region, partially out of bounds
    extractSurfacePixels(out, source, -1, -1, 2, 2);
    // only the (0,0) pixel of source lands at out position (1,1)
    const i = (1 * 2 + 1) * 4;
    expect(out[i]).toBe(0xff);
    expect(out[i + 3]).toBe(0xff);
    expect(out[0]).toBe(0); // (-1,-1) is out of bounds
  });
});

describe('tintSurfaceAlphaMask', () => {
  it('replaces RGB with the tint color and preserves scaled alpha', () => {
    const source = createSurface(1, 1, 0xff000000); // full alpha black
    const out = new Uint8ClampedArray(4);
    tintSurfaceAlphaMask(out, source, 0, 0, 1, 1, 0x00ff00, 1, 1);
    expect(out[0]).toBe(0); // r
    expect(out[1]).toBe(0xff); // g from tint color
    expect(out[2]).toBe(0); // b
    expect(out[3]).toBe(0xff); // alpha unchanged
  });

  it('scales alpha by alpha * strength', () => {
    const source = createSurface(1, 1, 0xff000000);
    const out = new Uint8ClampedArray(4);
    tintSurfaceAlphaMask(out, source, 0, 0, 1, 1, 0xffffff, 0.5, 1);
    expect(out[3]).toBe(128); // 255 * 0.5 ≈ 128
  });

  it('clamps alpha at 255 when strength > 1', () => {
    const source = createSurface(1, 1, 0x80000000); // half alpha
    const out = new Uint8ClampedArray(4);
    tintSurfaceAlphaMask(out, source, 0, 0, 1, 1, 0xffffff, 1, 4);
    expect(out[3]).toBe(255); // clamped
  });
});

describe('writeSurfacePixels', () => {
  it('writes pixels at the given destination position', () => {
    const dest = createSurface(3, 3);
    const pixels = new Uint8ClampedArray([0x33, 0x66, 0x99, 0xff]);
    writeSurfacePixels(dest, 1, 1, 1, 1, pixels);
    const i = (1 * 3 + 1) * 4;
    expect(dest.data[i]).toBe(0x33);
    expect(dest.data[i + 1]).toBe(0x66);
    expect(dest.data[i + 2]).toBe(0x99);
    expect(dest.data[i + 3]).toBe(0xff);
  });

  it('overwrites existing content', () => {
    const dest = createSurface(1, 1, 0xff0000ff);
    const pixels = new Uint8ClampedArray([0xff, 0, 0, 0xff]);
    writeSurfacePixels(dest, 0, 0, 1, 1, pixels);
    expect(dest.data[2]).toBe(0); // blue channel gone
    expect(dest.data[0]).toBe(0xff); // red channel set
  });

  it('silently clips writes outside destination bounds', () => {
    const dest = createSurface(1, 1);
    const pixels = new Uint8ClampedArray([0xff, 0xff, 0xff, 0xff]);
    writeSurfacePixels(dest, 5, 5, 1, 1, pixels); // entirely out of bounds
    expect(dest.data[3]).toBe(0); // unchanged
  });
});
