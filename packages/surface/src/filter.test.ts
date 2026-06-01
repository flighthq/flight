import {
  applySurfaceBlurFilter,
  applySurfaceColorMatrixFilter,
  applySurfaceConvolutionFilter,
  applySurfaceDropShadowFilter,
  applySurfaceGlowFilter,
} from './filter';
import { createSurface } from './surface';

describe('applySurfaceBlurFilter', () => {
  it('spreads alpha into neighboring pixels', () => {
    const source = createSurface(3, 1);
    const dest = createSurface(3, 1);
    source.data[4] = 255;
    source.data[5] = 0;
    source.data[6] = 0;
    source.data[7] = 255;

    applySurfaceBlurFilter(source, 0, 0, 3, 1, dest, 0, 0, { blurX: 2, blurY: 0 });

    expect(dest.data[3]).toBeGreaterThan(0);
    expect(dest.data[7]).toBeGreaterThan(0);
    expect(dest.data[11]).toBeGreaterThan(0);
  });

  it('writes the filtered rectangle at the destination point', () => {
    const source = createSurface(1, 1, 0xff336699);
    const dest = createSurface(3, 3);

    applySurfaceBlurFilter(source, 0, 0, 1, 1, dest, 1, 1, { blurX: 0, blurY: 0 });

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
    const dest = createSurface(1, 1);

    applySurfaceColorMatrixFilter(
      source,
      0,
      0,
      1,
      1,
      dest,
      0,
      0,
      [0, 0, 0, 0, 10, 0, 0, 0, 0, 20, 0, 0, 0, 0, 30, 0, 0, 0, 1, 0],
    );

    expect(dest.data[0]).toBe(10);
    expect(dest.data[1]).toBe(20);
    expect(dest.data[2]).toBe(30);
    expect(dest.data[3]).toBe(0xff);
  });

  it('is safe when source and destination are the same surface', () => {
    const surface = createSurface(1, 1, 0xff010203);

    applySurfaceColorMatrixFilter(
      surface,
      0,
      0,
      1,
      1,
      surface,
      0,
      0,
      [1, 0, 0, 0, 10, 0, 1, 0, 0, 20, 0, 0, 1, 0, 30, 0, 0, 0, 1, 0],
    );

    expect(surface.data[0]).toBe(11);
    expect(surface.data[1]).toBe(22);
    expect(surface.data[2]).toBe(33);
    expect(surface.data[3]).toBe(0xff);
  });

  it('throws when the matrix is too short', () => {
    const source = createSurface(1, 1);
    const dest = createSurface(1, 1);

    expect(() => applySurfaceColorMatrixFilter(source, 0, 0, 1, 1, dest, 0, 0, [])).toThrow(
      'Color matrix filter requires 20 values',
    );
  });
});

describe('applySurfaceConvolutionFilter', () => {
  it('applies a convolution matrix to the source rectangle', () => {
    const source = createSurface(3, 1);
    const dest = createSurface(1, 1);
    source.data[0] = 10;
    source.data[4] = 20;
    source.data[8] = 30;

    applySurfaceConvolutionFilter(source, 1, 0, 1, 1, dest, 0, 0, {
      matrix: [1, 1, 1],
      matrixX: 3,
      matrixY: 1,
      preserveAlpha: false,
    });

    expect(dest.data[0]).toBe(20);
  });

  it('can sample a fill color outside source bounds', () => {
    const source = createSurface(1, 1, 0xff000000);
    const dest = createSurface(1, 1);

    applySurfaceConvolutionFilter(source, 0, 0, 1, 1, dest, 0, 0, {
      clamp: false,
      color: 0xffff0000,
      divisor: 1,
      matrix: [1, 0, 0],
      matrixX: 3,
      matrixY: 1,
      preserveAlpha: false,
    });

    expect(dest.data[0]).toBe(0xff);
    expect(dest.data[3]).toBe(0xff);
  });

  it('preserves source alpha by default', () => {
    const source = createSurface(1, 1, 0x44000000);
    const dest = createSurface(1, 1);

    applySurfaceConvolutionFilter(source, 0, 0, 1, 1, dest, 0, 0, {
      bias: 255,
      matrix: [1],
      matrixX: 1,
      matrixY: 1,
    });

    expect(dest.data[3]).toBe(0x44);
  });
});

describe('applySurfaceDropShadowFilter', () => {
  it('draws a tinted alpha shadow at the requested offset', () => {
    const source = createSurface(1, 1, 0xffffffff);
    const dest = createSurface(4, 4);

    applySurfaceDropShadowFilter(source, 0, 0, 1, 1, dest, 1, 1, {
      angle: 0,
      blurX: 0,
      blurY: 0,
      color: 0x0000ff,
      distance: 1,
      hideObject: true,
    });

    const i = (1 * dest.width + 2) * 4;
    expect(dest.data[i]).toBe(0);
    expect(dest.data[i + 1]).toBe(0);
    expect(dest.data[i + 2]).toBe(0xff);
    expect(dest.data[i + 3]).toBe(0xff);
  });

  it('draws the source over the shadow by default', () => {
    const source = createSurface(1, 1, 0xffff0000);
    const dest = createSurface(2, 1);

    applySurfaceDropShadowFilter(source, 0, 0, 1, 1, dest, 0, 0, {
      angle: 0,
      blurX: 0,
      blurY: 0,
      color: 0x0000ff,
      distance: 1,
    });

    expect(dest.data[0]).toBe(0xff);
    expect(dest.data[1]).toBe(0);
    expect(dest.data[2]).toBe(0);
    expect(dest.data[3]).toBe(0xff);
  });
});

describe('applySurfaceGlowFilter', () => {
  it('draws a tinted glow from the source alpha', () => {
    const source = createSurface(1, 1, 0xffffffff);
    const dest = createSurface(1, 1);

    applySurfaceGlowFilter(source, 0, 0, 1, 1, dest, 0, 0, {
      blurX: 0,
      blurY: 0,
      color: 0x00ff00,
      knockout: true,
    });

    expect(dest.data[0]).toBe(0);
    expect(dest.data[1]).toBe(0xff);
    expect(dest.data[2]).toBe(0);
    expect(dest.data[3]).toBe(0xff);
  });

  it('draws the source over the glow by default', () => {
    const source = createSurface(1, 1, 0xffff0000);
    const dest = createSurface(1, 1);

    applySurfaceGlowFilter(source, 0, 0, 1, 1, dest, 0, 0, {
      blurX: 0,
      blurY: 0,
      color: 0x00ff00,
    });

    expect(dest.data[0]).toBe(0xff);
    expect(dest.data[1]).toBe(0);
    expect(dest.data[2]).toBe(0);
    expect(dest.data[3]).toBe(0xff);
  });
});
