import { createSurface } from '@flighthq/surface';
import type { SurfaceRegion } from '@flighthq/types';

import {
  applyBevelFilterToSurface,
  applyBlurFilterToSurface,
  applyColorMatrixFilterToSurface,
  applyConvolutionFilterToSurface,
  applyDisplacementMapFilterToSurface,
  applyDropShadowFilterToSurface,
  applyGradientBevelFilterToSurface,
  applyGradientGlowFilterToSurface,
  applyInnerGlowFilterToSurface,
  applyInnerShadowFilterToSurface,
  applyMedianFilterToSurface,
  applyOuterGlowFilterToSurface,
  applyPixelateFilterToSurface,
  applySharpenFilterToSurface,
} from './surface';

function region(surface: ReturnType<typeof createSurface>): SurfaceRegion {
  return { surface, x: 0, y: 0, width: surface.width, height: surface.height };
}

function makeOut(w: number, h: number): Uint8ClampedArray {
  return new Uint8ClampedArray(w * h * 4);
}

describe('applyBevelFilterToSurface', () => {
  it('writes to out without throwing', () => {
    const source = createSurface(4, 4, 0xff0000ff);
    const out = makeOut(4, 4);
    const blurBuffer = makeOut(4, 4);
    expect(() =>
      applyBevelFilterToSurface(out, blurBuffer, region(source), { type: 'bevel', blurX: 0, blurY: 0 }),
    ).not.toThrow();
  });

  it('accepts bevelType outer', () => {
    const source = createSurface(4, 4, 0xff0000ff);
    const out = makeOut(4, 4);
    const blurBuffer = makeOut(4, 4);
    expect(() =>
      applyBevelFilterToSurface(out, blurBuffer, region(source), {
        type: 'bevel',
        bevelType: 'outer',
        blurX: 0,
        blurY: 0,
      }),
    ).not.toThrow();
  });
});

describe('applyBlurFilterToSurface', () => {
  it('writes to out without throwing', () => {
    const source = createSurface(4, 4, 0xff0000ff);
    const out = makeOut(4, 4);
    const blurBuffer = makeOut(4, 4);
    expect(() =>
      applyBlurFilterToSurface(out, blurBuffer, region(source), { type: 'blur', blurX: 4, blurY: 4 }),
    ).not.toThrow();
  });

  it('copies source when blurX and blurY are zero', () => {
    const source = createSurface(2, 2, 0x336699ff);
    const out = makeOut(2, 2);
    const blurBuffer = makeOut(2, 2);
    applyBlurFilterToSurface(out, blurBuffer, region(source), { type: 'blur', blurX: 0, blurY: 0 });
    expect(out[0]).toBe(0x33);
    expect(out[3]).toBe(0xff);
  });
});

describe('applyColorMatrixFilterToSurface', () => {
  it('identity matrix preserves source pixels', () => {
    const source = createSurface(2, 2, 0x336699ff);
    const out = makeOut(2, 2);
    const identity = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
    applyColorMatrixFilterToSurface(out, region(source), { type: 'colorMatrix', matrix: identity });
    expect(out[0]).toBe(0x33);
    expect(out[1]).toBe(0x66);
    expect(out[2]).toBe(0x99);
    expect(out[3]).toBe(0xff);
  });
});

describe('applyConvolutionFilterToSurface', () => {
  it('pass-through kernel copies source', () => {
    const source = createSurface(3, 3, 0x336699ff);
    const out = makeOut(3, 3);
    applyConvolutionFilterToSurface(out, region(source), {
      type: 'convolution',
      matrix: [0, 0, 0, 0, 1, 0, 0, 0, 0],
      matrixX: 3,
      matrixY: 3,
    });
    expect(out[0]).toBe(0x33);
  });
});

describe('applyDisplacementMapFilterToSurface', () => {
  it('writes to out without throwing', () => {
    const source = createSurface(4, 4, 0xff0000ff);
    const map = createSurface(4, 4, 0x808080ff);
    const out = makeOut(4, 4);
    expect(() =>
      applyDisplacementMapFilterToSurface(out, region(source), region(map), {
        type: 'displacementMap',
        scaleX: 0,
        scaleY: 0,
      }),
    ).not.toThrow();
  });
});

describe('applyDropShadowFilterToSurface', () => {
  it('writes to out without throwing', () => {
    const source = createSurface(4, 4, 0xff0000ff);
    const out = makeOut(4, 4);
    const blurBuffer = makeOut(4, 4);
    expect(() =>
      applyDropShadowFilterToSurface(out, blurBuffer, region(source), { type: 'dropShadow', blurX: 0, blurY: 0 }),
    ).not.toThrow();
  });
});

describe('applyGradientBevelFilterToSurface', () => {
  it('writes to out without throwing', () => {
    const source = createSurface(4, 4, 0xff0000ff);
    const out = makeOut(4, 4);
    const blurBuffer = makeOut(4, 4);
    expect(() =>
      applyGradientBevelFilterToSurface(out, blurBuffer, region(source), {
        type: 'gradientBevel',
        colors: [0xffffff, 0x000000],
        alphas: [1, 1],
        ratios: [0, 255],
        blurX: 0,
        blurY: 0,
      }),
    ).not.toThrow();
  });
});

describe('applyGradientGlowFilterToSurface', () => {
  it('writes to out without throwing', () => {
    const source = createSurface(4, 4, 0xff0000ff);
    const out = makeOut(4, 4);
    const blurBuffer = makeOut(4, 4);
    expect(() =>
      applyGradientGlowFilterToSurface(out, blurBuffer, region(source), {
        type: 'gradientGlow',
        colors: [0xff0000, 0x000000],
        alphas: [1, 0],
        ratios: [0, 255],
        blurX: 0,
        blurY: 0,
      }),
    ).not.toThrow();
  });
});

describe('applyInnerGlowFilterToSurface', () => {
  it('writes to out without throwing', () => {
    const source = createSurface(4, 4, 0xff0000ff);
    const out = makeOut(4, 4);
    const blurBuffer = makeOut(4, 4);
    expect(() =>
      applyInnerGlowFilterToSurface(out, blurBuffer, region(source), { type: 'innerGlow', blurX: 0, blurY: 0 }),
    ).not.toThrow();
  });
});

describe('applyInnerShadowFilterToSurface', () => {
  it('writes to out without throwing', () => {
    const source = createSurface(4, 4, 0xff0000ff);
    const out = makeOut(4, 4);
    const blurBuffer = makeOut(4, 4);
    expect(() =>
      applyInnerShadowFilterToSurface(out, blurBuffer, region(source), { type: 'innerShadow', blurX: 0, blurY: 0 }),
    ).not.toThrow();
  });
});

describe('applyMedianFilterToSurface', () => {
  it('writes to out without throwing', () => {
    const source = createSurface(4, 4, 0xff0000ff);
    const out = makeOut(4, 4);
    expect(() => applyMedianFilterToSurface(out, region(source), { type: 'median', radius: 1 })).not.toThrow();
  });
});

describe('applyOuterGlowFilterToSurface', () => {
  it('writes to out without throwing', () => {
    const source = createSurface(4, 4, 0xff0000ff);
    const out = makeOut(4, 4);
    const blurBuffer = makeOut(4, 4);
    expect(() =>
      applyOuterGlowFilterToSurface(out, blurBuffer, region(source), { type: 'outerGlow', blurX: 0, blurY: 0 }),
    ).not.toThrow();
  });
});

describe('applyPixelateFilterToSurface', () => {
  it('writes to out without throwing', () => {
    const source = createSurface(4, 4, 0xff0000ff);
    const out = makeOut(4, 4);
    expect(() => applyPixelateFilterToSurface(out, region(source), { type: 'pixelate', blockSize: 2 })).not.toThrow();
  });
});

describe('applySharpenFilterToSurface', () => {
  it('writes to out without throwing', () => {
    const source = createSurface(4, 4, 0xff0000ff);
    const out = makeOut(4, 4);
    const blurBuffer = makeOut(4, 4);
    expect(() =>
      applySharpenFilterToSurface(out, blurBuffer, region(source), { type: 'sharpen', blurX: 0, blurY: 0 }),
    ).not.toThrow();
  });
});
