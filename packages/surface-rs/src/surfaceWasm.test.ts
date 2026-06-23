import { createSurface, createSurfaceRegion } from '@flighthq/surface';
import * as reference from '@flighthq/surface';
import type { ColorTransformLike, Surface, SurfaceRegion } from '@flighthq/types';
import { ImageChannel } from '@flighthq/types';

import {
  applySurfaceColorTransform,
  applySurfacePaletteMap,
  applySurfaceThreshold,
  bevelSurface,
  blurSurfacePixelsHorizontal,
  blurSurfacePixelsHorizontalWeighted,
  blurSurfacePixelsVertical,
  blurSurfacePixelsVerticalWeighted,
  boxBlurSurface,
  colorMatrixSurface,
  compositeSurfacePixels,
  compositeSurfaceRegion,
  convertSurfacePixelOrder,
  convolveSurface,
  copySurfaceChannel,
  copySurfacePixels,
  dilateSurface,
  displaceSurface,
  dissolveSurfacePixels,
  dropShadowSurface,
  equalizeSurfaceHistogram,
  erodeSurface,
  extractSurfacePixels,
  extractSurfacePixels32,
  fillSurfaceNoise,
  fillSurfacePerlinNoise,
  fillSurfaceRectangle,
  flipSurfaceHorizontal,
  flipSurfaceVertical,
  floodFillSurface,
  gaussianBlurSurface,
  getSurfaceColorBoundsRectangle,
  getSurfaceCoverage,
  getSurfaceHistogram,
  glowSurface,
  gradientBevelSurface,
  gradientGlowSurface,
  initSurfaceRs,
  innerGlowSurface,
  innerShadowSurface,
  medianSurface,
  mergeSurface,
  pixelateSurface,
  premultiplySurfacePixels,
  resizeSurface,
  rotateSurface,
  rotateSurface180,
  rotateSurfaceClockwise,
  rotateSurfaceCounterClockwise,
  scrollSurface,
  sharpenSurface,
  unpremultiplySurfacePixels,
  writeSurfacePixels,
  writeSurfacePixels32,
} from './surfaceWasm';

// Fills a surface's pixels with a deterministic, varied RGBA pattern so byte
// equality is meaningful (not all-zero) and alpha varies across pixels.
function paintSurface(width: number, height: number): Surface {
  const surface = createSurface(width, height, 0);
  const data = surface.data;
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = (i * 37 + 11) & 0xff;
    data[i * 4 + 1] = (i * 53 + 7) & 0xff;
    data[i * 4 + 2] = (i * 97 + 3) & 0xff;
    data[i * 4 + 3] = (i * 17 + 1) & 0xff;
  }
  return surface;
}

function paintedPixels(length: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(length);
  for (let i = 0; i < length; i += 4) {
    pixels[i] = (i * 7 + 3) & 0xff;
    pixels[i + 1] = (i * 13 + 5) & 0xff;
    pixels[i + 2] = (i * 29 + 9) & 0xff;
    pixels[i + 3] = (i * 3 + 17) & 0xff;
  }
  return pixels;
}

function fullRegion(surface: Surface): SurfaceRegion {
  return createSurfaceRegion(surface, 0, 0, surface.width, surface.height);
}

// Filters that scale a channel by a fractional intensity/amount do that math in
// f32 inside the Rust crate, where @flighthq/surface uses f64 (JS numbers), so a
// channel can land one least-significant bit apart. This is a known Rust-port
// precision divergence (not a marshalling difference); every other op is exact.
function expectByteClose(actual: Uint8ClampedArray, expected: Uint8ClampedArray, tolerance = 1): void {
  expect(actual.length).toBe(expected.length);
  let maxDiff = 0;
  for (let i = 0; i < actual.length; i += 1) maxDiff = Math.max(maxDiff, Math.abs(actual[i] - expected[i]));
  expect(maxDiff).toBeLessThanOrEqual(tolerance);
}

const COLOR_TRANSFORM: Readonly<ColorTransformLike> = {
  redMultiplier: 0.5,
  greenMultiplier: 1.2,
  blueMultiplier: 0.8,
  alphaMultiplier: 1,
  redOffset: 16,
  greenOffset: -8,
  blueOffset: 4,
  alphaOffset: 0,
};

describe('applySurfaceColorTransform', () => {
  it('matches @flighthq/surface', () => {
    const refDest = createSurface(6, 4, 0);
    const rsDest = createSurface(6, 4, 0);
    const refSource = paintSurface(6, 4);
    const rsSource = paintSurface(6, 4);
    reference.applySurfaceColorTransform(fullRegion(refDest), fullRegion(refSource), COLOR_TRANSFORM);
    applySurfaceColorTransform(fullRegion(rsDest), fullRegion(rsSource), COLOR_TRANSFORM);
    expect(rsDest.data).toEqual(refDest.data);
    expect(rsDest.version).toBe(refDest.version);
  });
});

describe('applySurfacePaletteMap', () => {
  it('matches @flighthq/surface with a red map and null others', () => {
    const redMap = Array.from({ length: 256 }, (_, i) => 255 - i);
    const refDest = createSurface(6, 4, 0);
    const rsDest = createSurface(6, 4, 0);
    const refSource = paintSurface(6, 4);
    const rsSource = paintSurface(6, 4);
    reference.applySurfacePaletteMap(fullRegion(refDest), fullRegion(refSource), redMap, null, null, null);
    applySurfacePaletteMap(fullRegion(rsDest), fullRegion(rsSource), redMap, null, null, null);
    expect(rsDest.data).toEqual(refDest.data);
  });
});

describe('applySurfaceThreshold', () => {
  it('matches @flighthq/surface pixels and hit count', () => {
    const refDest = createSurface(8, 4, 0);
    const rsDest = createSurface(8, 4, 0);
    const refSource = paintSurface(8, 4);
    const rsSource = paintSurface(8, 4);
    const refHits = reference.applySurfaceThreshold(
      fullRegion(refDest),
      fullRegion(refSource),
      '>',
      0x808080ff,
      0xff0000ff,
      0x00ffffff,
      true,
    );
    const rsHits = applySurfaceThreshold(
      fullRegion(rsDest),
      fullRegion(rsSource),
      '>',
      0x808080ff,
      0xff0000ff,
      0x00ffffff,
      true,
    );
    expect(rsHits).toBe(refHits);
    expect(rsDest.data).toEqual(refDest.data);
  });
});

describe('bevelSurface', () => {
  it('matches @flighthq/surface', () => {
    const source = paintSurface(8, 8);
    const refOut = new Uint8ClampedArray(8 * 8 * 4);
    const rsOut = new Uint8ClampedArray(8 * 8 * 4);
    const refScratch = new Uint8ClampedArray(8 * 8 * 4);
    const rsScratch = new Uint8ClampedArray(8 * 8 * 4);
    reference.bevelSurface(refOut, refScratch, fullRegion(source), { distance: 3, intensity: 0.8, type: 'both' });
    bevelSurface(rsOut, rsScratch, fullRegion(source), { distance: 3, intensity: 0.8, type: 'both' });
    expectByteClose(rsOut, refOut);
  });
});

describe('blurSurfacePixelsHorizontal', () => {
  it('matches @flighthq/surface', () => {
    const source = paintedPixels(6 * 4 * 4);
    const refOut = new Uint8ClampedArray(6 * 4 * 4);
    const rsOut = new Uint8ClampedArray(6 * 4 * 4);
    reference.blurSurfacePixelsHorizontal(refOut, source, 6, 4, 2);
    blurSurfacePixelsHorizontal(rsOut, source, 6, 4, 2);
    expect(rsOut).toEqual(refOut);
  });
});

describe('blurSurfacePixelsHorizontalWeighted', () => {
  it('matches @flighthq/surface', () => {
    const source = paintedPixels(6 * 4 * 4);
    const kernel = Float32Array.of(0.25, 0.5, 0.25);
    const refOut = new Uint8ClampedArray(6 * 4 * 4);
    const rsOut = new Uint8ClampedArray(6 * 4 * 4);
    reference.blurSurfacePixelsHorizontalWeighted(refOut, source, 6, 4, kernel);
    blurSurfacePixelsHorizontalWeighted(rsOut, source, 6, 4, kernel);
    expect(rsOut).toEqual(refOut);
  });
});

describe('blurSurfacePixelsVertical', () => {
  it('matches @flighthq/surface', () => {
    const source = paintedPixels(4 * 6 * 4);
    const refOut = new Uint8ClampedArray(4 * 6 * 4);
    const rsOut = new Uint8ClampedArray(4 * 6 * 4);
    reference.blurSurfacePixelsVertical(refOut, source, 4, 6, 2);
    blurSurfacePixelsVertical(rsOut, source, 4, 6, 2);
    expect(rsOut).toEqual(refOut);
  });
});

describe('blurSurfacePixelsVerticalWeighted', () => {
  it('matches @flighthq/surface', () => {
    const source = paintedPixels(4 * 6 * 4);
    const kernel = Float32Array.of(0.2, 0.6, 0.2);
    const refOut = new Uint8ClampedArray(4 * 6 * 4);
    const rsOut = new Uint8ClampedArray(4 * 6 * 4);
    reference.blurSurfacePixelsVerticalWeighted(refOut, source, 4, 6, kernel);
    blurSurfacePixelsVerticalWeighted(rsOut, source, 4, 6, kernel);
    expect(rsOut).toEqual(refOut);
  });
});

describe('boxBlurSurface', () => {
  it('matches @flighthq/surface', () => {
    const source = paintSurface(8, 8);
    const refOut = new Uint8ClampedArray(8 * 8 * 4);
    const rsOut = new Uint8ClampedArray(8 * 8 * 4);
    const refScratch = new Uint8ClampedArray(8 * 8 * 4);
    const rsScratch = new Uint8ClampedArray(8 * 8 * 4);
    reference.boxBlurSurface(refOut, refScratch, fullRegion(source), { radiusX: 2, radiusY: 1, passes: 2 });
    boxBlurSurface(rsOut, rsScratch, fullRegion(source), { radiusX: 2, radiusY: 1, passes: 2 });
    expect(rsOut).toEqual(refOut);
  });
});

describe('colorMatrixSurface', () => {
  it('matches @flighthq/surface', () => {
    const source = paintSurface(6, 4);
    const matrix: number[] = [];
    reference.buildSurfaceSepiaColorMatrix(matrix);
    const refOut = new Uint8ClampedArray(6 * 4 * 4);
    const rsOut = new Uint8ClampedArray(6 * 4 * 4);
    reference.colorMatrixSurface(refOut, fullRegion(source), matrix);
    colorMatrixSurface(rsOut, fullRegion(source), matrix);
    expect(rsOut).toEqual(refOut);
  });
});

describe('compositeSurfacePixels', () => {
  it('matches @flighthq/surface', () => {
    const refDest = paintSurface(4, 4);
    const rsDest = paintSurface(4, 4);
    const pixels = paintedPixels(4 * 4 * 4);
    reference.compositeSurfacePixels(fullRegion(refDest), pixels);
    compositeSurfacePixels(fullRegion(rsDest), pixels);
    expect(rsDest.data).toEqual(refDest.data);
    expect(rsDest.version).toBe(refDest.version);
  });
});

describe('compositeSurfaceRegion', () => {
  it('matches @flighthq/surface with Multiply blend', () => {
    const refDest = paintSurface(5, 5);
    const rsDest = paintSurface(5, 5);
    const refSource = createSurface(5, 5, 0x80c0ffff);
    const rsSource = createSurface(5, 5, 0x80c0ffff);
    reference.compositeSurfaceRegion(fullRegion(refDest), fullRegion(refSource), 9);
    compositeSurfaceRegion(fullRegion(rsDest), fullRegion(rsSource), 9);
    expect(rsDest.data).toEqual(refDest.data);
  });
});

describe('convertSurfacePixelOrder', () => {
  it('matches @flighthq/surface for RGBA to BGRA', () => {
    const source = paintedPixels(64);
    const refOut = new Uint8ClampedArray(64);
    const rsOut = new Uint8ClampedArray(64);
    reference.convertSurfacePixelOrder(refOut, source, 64, 'RGBA', 'BGRA');
    convertSurfacePixelOrder(rsOut, source, 64, 'RGBA', 'BGRA');
    expect(rsOut).toEqual(refOut);
  });
});

describe('convolveSurface', () => {
  it('matches @flighthq/surface', () => {
    const source = paintSurface(8, 6);
    const options = { matrix: [0, 1, 0, 1, 2, 1, 0, 1, 0], matrixX: 3, matrixY: 3, edge: 'wrap' as const };
    const refOut = new Uint8ClampedArray(8 * 6 * 4);
    const rsOut = new Uint8ClampedArray(8 * 6 * 4);
    reference.convolveSurface(refOut, fullRegion(source), options);
    convolveSurface(rsOut, fullRegion(source), options);
    expect(rsOut).toEqual(refOut);
  });
});

describe('copySurfaceChannel', () => {
  it('matches @flighthq/surface copying source red into dest alpha', () => {
    const refDest = paintSurface(5, 4);
    const rsDest = paintSurface(5, 4);
    const refSource = paintSurface(5, 4);
    const rsSource = paintSurface(5, 4);
    reference.copySurfaceChannel(fullRegion(refDest), ImageChannel.Alpha, fullRegion(refSource), ImageChannel.Red);
    copySurfaceChannel(fullRegion(rsDest), ImageChannel.Alpha, fullRegion(rsSource), ImageChannel.Red);
    expect(rsDest.data).toEqual(refDest.data);
  });
});

describe('copySurfacePixels', () => {
  it('matches @flighthq/surface', () => {
    const refDest = createSurface(5, 4, 0);
    const rsDest = createSurface(5, 4, 0);
    const refSource = paintSurface(5, 4);
    const rsSource = paintSurface(5, 4);
    reference.copySurfacePixels(fullRegion(refDest), fullRegion(refSource));
    copySurfacePixels(fullRegion(rsDest), fullRegion(rsSource));
    expect(rsDest.data).toEqual(refDest.data);
  });
});

describe('dilateSurface', () => {
  it('matches @flighthq/surface', () => {
    const source = paintSurface(6, 6);
    const refOut = new Uint8ClampedArray(6 * 6 * 4);
    const rsOut = new Uint8ClampedArray(6 * 6 * 4);
    reference.dilateSurface(refOut, fullRegion(source), 1);
    dilateSurface(rsOut, fullRegion(source), 1);
    expect(rsOut).toEqual(refOut);
  });
});

describe('displaceSurface', () => {
  it('matches @flighthq/surface', () => {
    const source = paintSurface(8, 8);
    const map = paintSurface(8, 8);
    const options = {
      map: fullRegion(map),
      scaleX: 4,
      scaleY: 4,
      componentX: 0,
      componentY: 1,
      mode: 'clamp' as const,
    };
    const refOut = new Uint8ClampedArray(8 * 8 * 4);
    const rsOut = new Uint8ClampedArray(8 * 8 * 4);
    reference.displaceSurface(refOut, fullRegion(source), options);
    displaceSurface(rsOut, fullRegion(source), options);
    expect(rsOut).toEqual(refOut);
  });
});

describe('dissolveSurfacePixels', () => {
  it('matches @flighthq/surface pixels and return value', () => {
    const refDest = paintSurface(8, 6);
    const rsDest = paintSurface(8, 6);
    const refSource = createSurface(8, 6, 0xff00ffff);
    const rsSource = createSurface(8, 6, 0xff00ffff);
    const refCursor = reference.dissolveSurfacePixels(fullRegion(refDest), fullRegion(refSource), 1234, 20, 0x112233ff);
    const rsCursor = dissolveSurfacePixels(fullRegion(rsDest), fullRegion(rsSource), 1234, 20, 0x112233ff);
    expect(rsCursor).toBe(refCursor);
    expect(rsDest.data).toEqual(refDest.data);
    expect(rsDest.version).toBe(refDest.version);
  });
});

describe('dropShadowSurface', () => {
  it('matches @flighthq/surface', () => {
    const source = paintSurface(8, 8);
    const refOut = new Uint8ClampedArray(8 * 8 * 4);
    const rsOut = new Uint8ClampedArray(8 * 8 * 4);
    const refScratch = new Uint8ClampedArray(8 * 8 * 4);
    const rsScratch = new Uint8ClampedArray(8 * 8 * 4);
    reference.dropShadowSurface(refOut, refScratch, fullRegion(source), {
      radiusX: 2,
      color: 0x112233ff,
      intensity: 0.7,
    });
    dropShadowSurface(rsOut, rsScratch, fullRegion(source), { radiusX: 2, color: 0x112233ff, intensity: 0.7 });
    expectByteClose(rsOut, refOut);
  });
});

describe('equalizeSurfaceHistogram', () => {
  it('matches @flighthq/surface', () => {
    const refDest = createSurface(8, 6, 0);
    const rsDest = createSurface(8, 6, 0);
    const refSource = paintSurface(8, 6);
    const rsSource = paintSurface(8, 6);
    reference.equalizeSurfaceHistogram(fullRegion(refDest), fullRegion(refSource));
    equalizeSurfaceHistogram(fullRegion(rsDest), fullRegion(rsSource));
    expect(rsDest.data).toEqual(refDest.data);
  });
});

describe('erodeSurface', () => {
  it('matches @flighthq/surface', () => {
    const source = paintSurface(6, 6);
    const refOut = new Uint8ClampedArray(6 * 6 * 4);
    const rsOut = new Uint8ClampedArray(6 * 6 * 4);
    reference.erodeSurface(refOut, fullRegion(source), 1);
    erodeSurface(rsOut, fullRegion(source), 1);
    expect(rsOut).toEqual(refOut);
  });
});

describe('extractSurfacePixels', () => {
  it('matches @flighthq/surface', () => {
    const source = paintSurface(4, 4);
    const refOut = new Uint8ClampedArray(4 * 4 * 4);
    const rsOut = new Uint8ClampedArray(4 * 4 * 4);
    reference.extractSurfacePixels(refOut, fullRegion(source));
    extractSurfacePixels(rsOut, fullRegion(source));
    expect(rsOut).toEqual(refOut);
  });
});

describe('extractSurfacePixels32', () => {
  it('matches @flighthq/surface', () => {
    const source = paintSurface(4, 4);
    const refOut = new Uint32Array(16);
    const rsOut = new Uint32Array(16);
    reference.extractSurfacePixels32(refOut, fullRegion(source));
    extractSurfacePixels32(rsOut, fullRegion(source));
    expect(rsOut).toEqual(refOut);
  });
});

describe('fillSurfaceNoise', () => {
  it('matches @flighthq/surface', () => {
    const refDest = createSurface(6, 4, 0);
    const rsDest = createSurface(6, 4, 0);
    reference.fillSurfaceNoise(fullRegion(refDest), 99, 20, 200, false);
    fillSurfaceNoise(fullRegion(rsDest), 99, 20, 200, false);
    expect(rsDest.data).toEqual(refDest.data);
  });
});

describe('fillSurfacePerlinNoise', () => {
  it('matches @flighthq/surface', () => {
    const refDest = createSurface(8, 8, 0);
    const rsDest = createSurface(8, 8, 0);
    reference.fillSurfacePerlinNoise(fullRegion(refDest), 16, 16, 3, 42, false);
    fillSurfacePerlinNoise(fullRegion(rsDest), 16, 16, 3, 42, false);
    expect(rsDest.data).toEqual(refDest.data);
  });
});

describe('fillSurfaceRectangle', () => {
  it('matches @flighthq/surface', () => {
    const refDest = paintSurface(6, 4);
    const rsDest = paintSurface(6, 4);
    reference.fillSurfaceRectangle(createSurfaceRegion(refDest, 1, 1, 3, 2), 0x11223344);
    fillSurfaceRectangle(createSurfaceRegion(rsDest, 1, 1, 3, 2), 0x11223344);
    expect(rsDest.data).toEqual(refDest.data);
  });
});

describe('flipSurfaceHorizontal', () => {
  it('matches into a distinct dest', () => {
    const refDest = createSurface(5, 4, 0);
    const rsDest = createSurface(5, 4, 0);
    const refSource = paintSurface(5, 4);
    const rsSource = paintSurface(5, 4);
    reference.flipSurfaceHorizontal(fullRegion(refDest), fullRegion(refSource));
    flipSurfaceHorizontal(fullRegion(rsDest), fullRegion(rsSource));
    expect(rsDest.data).toEqual(refDest.data);
    expect(rsDest.version).toBe(refDest.version);
  });

  it('matches for an in-place aliased flip', () => {
    const refSurface = paintSurface(5, 4);
    const rsSurface = paintSurface(5, 4);
    const refRegion = fullRegion(refSurface);
    reference.flipSurfaceHorizontal(refRegion, refRegion);
    const rsRegion = fullRegion(rsSurface);
    flipSurfaceHorizontal(rsRegion, rsRegion);
    expect(rsSurface.data).toEqual(refSurface.data);
    expect(rsSurface.version).toBe(refSurface.version);
  });
});

describe('flipSurfaceVertical', () => {
  it('matches into a distinct dest', () => {
    const refDest = createSurface(4, 5, 0);
    const rsDest = createSurface(4, 5, 0);
    const refSource = paintSurface(4, 5);
    const rsSource = paintSurface(4, 5);
    reference.flipSurfaceVertical(fullRegion(refDest), fullRegion(refSource));
    flipSurfaceVertical(fullRegion(rsDest), fullRegion(rsSource));
    expect(rsDest.data).toEqual(refDest.data);
  });
});

describe('floodFillSurface', () => {
  it('matches @flighthq/surface', () => {
    const refSurface = createSurface(8, 8, 0x000000ff);
    const rsSurface = createSurface(8, 8, 0x000000ff);
    reference.floodFillSurface(refSurface, 4, 4, 0xff8800ff);
    floodFillSurface(rsSurface, 4, 4, 0xff8800ff);
    expect(rsSurface.data).toEqual(refSurface.data);
    expect(rsSurface.version).toBe(refSurface.version);
  });
});

describe('gaussianBlurSurface', () => {
  it('matches @flighthq/surface', () => {
    const refSource = paintSurface(8, 6);
    const rsSource = paintSurface(8, 6);
    const refOut = new Uint8ClampedArray(8 * 6 * 4);
    const rsOut = new Uint8ClampedArray(8 * 6 * 4);
    const refScratch = new Uint8ClampedArray(8 * 6 * 4);
    const rsScratch = new Uint8ClampedArray(8 * 6 * 4);
    reference.gaussianBlurSurface(refOut, refScratch, fullRegion(refSource), 1.5, 1.5, 2);
    gaussianBlurSurface(rsOut, rsScratch, fullRegion(rsSource), 1.5, 1.5, 2);
    expect(rsOut).toEqual(refOut);
  });
});

describe('getSurfaceColorBoundsRectangle', () => {
  it('matches @flighthq/surface for a found color', () => {
    const refSurface = createSurface(8, 8, 0x000000ff);
    const rsSurface = createSurface(8, 8, 0x000000ff);
    reference.fillSurfaceRectangle(createSurfaceRegion(refSurface, 2, 3, 3, 2), 0xff0000ff);
    reference.fillSurfaceRectangle(createSurfaceRegion(rsSurface, 2, 3, 3, 2), 0xff0000ff);
    const refRect = reference.getSurfaceColorBoundsRectangle(fullRegion(refSurface), 0xffffffff, 0xff0000ff, true);
    const rsRect = getSurfaceColorBoundsRectangle(fullRegion(rsSurface), 0xffffffff, 0xff0000ff, true);
    expect(rsRect).toEqual(refRect);
  });

  it('matches @flighthq/surface returning null when absent', () => {
    const surface = createSurface(4, 4, 0x000000ff);
    const refRect = reference.getSurfaceColorBoundsRectangle(fullRegion(surface), 0xffffffff, 0x123456ff, true);
    const rsRect = getSurfaceColorBoundsRectangle(fullRegion(surface), 0xffffffff, 0x123456ff, true);
    expect(rsRect).toBe(null);
    expect(refRect).toBe(null);
  });
});

describe('getSurfaceCoverage', () => {
  it('matches @flighthq/surface', () => {
    const surface = paintSurface(8, 8);
    expect(getSurfaceCoverage(surface, 0x000000ff, 8)).toBe(reference.getSurfaceCoverage(surface, 0x000000ff, 8));
  });
});

describe('getSurfaceHistogram', () => {
  it('matches @flighthq/surface', () => {
    const surface = paintSurface(8, 8);
    expect(getSurfaceHistogram(fullRegion(surface))).toEqual(reference.getSurfaceHistogram(fullRegion(surface)));
  });
});

describe('glowSurface', () => {
  it('matches @flighthq/surface', () => {
    const source = paintSurface(8, 8);
    const refOut = new Uint8ClampedArray(8 * 8 * 4);
    const rsOut = new Uint8ClampedArray(8 * 8 * 4);
    const refScratch = new Uint8ClampedArray(8 * 8 * 4);
    const rsScratch = new Uint8ClampedArray(8 * 8 * 4);
    reference.glowSurface(refOut, refScratch, fullRegion(source), { radiusX: 2, color: 0x00ff00ff });
    glowSurface(rsOut, rsScratch, fullRegion(source), { radiusX: 2, color: 0x00ff00ff });
    expectByteClose(rsOut, refOut);
  });
});

describe('gradientBevelSurface', () => {
  it('matches @flighthq/surface', () => {
    const source = paintSurface(8, 8);
    const ramp = new Uint8ClampedArray(1024);
    reference.buildSurfaceGradientRamp(ramp, [0xff0000ff, 0x0000ffff], [1, 1], [0, 255]);
    const refOut = new Uint8ClampedArray(8 * 8 * 4);
    const rsOut = new Uint8ClampedArray(8 * 8 * 4);
    const refScratch = new Uint8ClampedArray(8 * 8 * 4);
    const rsScratch = new Uint8ClampedArray(8 * 8 * 4);
    reference.gradientBevelSurface(refOut, refScratch, fullRegion(source), ramp, { distance: 3 });
    gradientBevelSurface(rsOut, rsScratch, fullRegion(source), ramp, { distance: 3 });
    expectByteClose(rsOut, refOut);
  });
});

describe('gradientGlowSurface', () => {
  it('matches @flighthq/surface', () => {
    const source = paintSurface(8, 8);
    const ramp = new Uint8ClampedArray(1024);
    reference.buildSurfaceGradientRamp(ramp, [0x00000000, 0xffff00ff], [0, 1], [0, 255]);
    const refOut = new Uint8ClampedArray(8 * 8 * 4);
    const rsOut = new Uint8ClampedArray(8 * 8 * 4);
    const refScratch = new Uint8ClampedArray(8 * 8 * 4);
    const rsScratch = new Uint8ClampedArray(8 * 8 * 4);
    reference.gradientGlowSurface(refOut, refScratch, fullRegion(source), ramp, { radiusX: 2 });
    gradientGlowSurface(rsOut, rsScratch, fullRegion(source), ramp, { radiusX: 2 });
    expectByteClose(rsOut, refOut);
  });
});

describe('initSurfaceRs', () => {
  it('is idempotent and lets bulk ops run afterward', () => {
    initSurfaceRs();
    initSurfaceRs();
    const out = new Uint8ClampedArray(8);
    expect(() => premultiplySurfacePixels(out, paintedPixels(8), 8)).not.toThrow();
  });
});

describe('innerGlowSurface', () => {
  it('matches @flighthq/surface', () => {
    const source = paintSurface(8, 8);
    const refOut = new Uint8ClampedArray(8 * 8 * 4);
    const rsOut = new Uint8ClampedArray(8 * 8 * 4);
    const refScratch = new Uint8ClampedArray(8 * 8 * 4);
    const rsScratch = new Uint8ClampedArray(8 * 8 * 4);
    reference.innerGlowSurface(refOut, refScratch, fullRegion(source), { radiusX: 2, color: 0x00ffffff });
    innerGlowSurface(rsOut, rsScratch, fullRegion(source), { radiusX: 2, color: 0x00ffffff });
    expectByteClose(rsOut, refOut);
  });
});

describe('innerShadowSurface', () => {
  it('matches @flighthq/surface', () => {
    const source = paintSurface(8, 8);
    const refOut = new Uint8ClampedArray(8 * 8 * 4);
    const rsOut = new Uint8ClampedArray(8 * 8 * 4);
    const refScratch = new Uint8ClampedArray(8 * 8 * 4);
    const rsScratch = new Uint8ClampedArray(8 * 8 * 4);
    reference.innerShadowSurface(refOut, refScratch, fullRegion(source), { radiusX: 2, intensity: 0.9 });
    innerShadowSurface(rsOut, rsScratch, fullRegion(source), { radiusX: 2, intensity: 0.9 });
    expectByteClose(rsOut, refOut);
  });
});

describe('medianSurface', () => {
  it('matches @flighthq/surface', () => {
    const source = paintSurface(6, 6);
    const refOut = new Uint8ClampedArray(6 * 6 * 4);
    const rsOut = new Uint8ClampedArray(6 * 6 * 4);
    reference.medianSurface(refOut, fullRegion(source), 1);
    medianSurface(rsOut, fullRegion(source), 1);
    expect(rsOut).toEqual(refOut);
  });
});

describe('mergeSurface', () => {
  it('matches @flighthq/surface', () => {
    const refDest = paintSurface(5, 4);
    const rsDest = paintSurface(5, 4);
    const refSource = createSurface(5, 4, 0x88aa44ff);
    const rsSource = createSurface(5, 4, 0x88aa44ff);
    reference.mergeSurface(fullRegion(refDest), fullRegion(refSource), 0.25, 0.5, 0.75, 1);
    mergeSurface(fullRegion(rsDest), fullRegion(rsSource), 0.25, 0.5, 0.75, 1);
    expect(rsDest.data).toEqual(refDest.data);
  });
});

describe('pixelateSurface', () => {
  it('matches @flighthq/surface', () => {
    const source = paintSurface(8, 8);
    const refOut = new Uint8ClampedArray(8 * 8 * 4);
    const rsOut = new Uint8ClampedArray(8 * 8 * 4);
    reference.pixelateSurface(refOut, fullRegion(source), 3);
    pixelateSurface(rsOut, fullRegion(source), 3);
    expect(rsOut).toEqual(refOut);
  });
});

describe('premultiplySurfacePixels', () => {
  it('matches @flighthq/surface byte for byte', () => {
    const source = paintedPixels(64);
    const refOut = new Uint8ClampedArray(64);
    const rsOut = new Uint8ClampedArray(64);
    reference.premultiplySurfacePixels(refOut, source, 64);
    premultiplySurfacePixels(rsOut, source, 64);
    expect(rsOut).toEqual(refOut);
  });
});

describe('resizeSurface', () => {
  it('matches @flighthq/surface for nearest downscale', () => {
    const refDest = createSurface(3, 2, 0);
    const rsDest = createSurface(3, 2, 0);
    const refSource = paintSurface(6, 4);
    const rsSource = paintSurface(6, 4);
    reference.resizeSurface(fullRegion(refDest), fullRegion(refSource), 'nearest');
    resizeSurface(fullRegion(rsDest), fullRegion(rsSource), 'nearest');
    expect(rsDest.data).toEqual(refDest.data);
  });
});

describe('rotateSurface', () => {
  it('matches @flighthq/surface at an arbitrary angle into a larger dest', () => {
    const refDest = createSurface(7, 6, 0);
    const rsDest = createSurface(7, 6, 0);
    const refSource = paintSurface(5, 4);
    const rsSource = paintSurface(5, 4);
    reference.rotateSurface(fullRegion(refDest), fullRegion(refSource), 0.6);
    rotateSurface(fullRegion(rsDest), fullRegion(rsSource), 0.6);
    expect(rsDest.data).toEqual(refDest.data);
    expect(rsDest.version).toBe(refDest.version);
  });

  it('matches with an explicit pivot', () => {
    const refDest = createSurface(5, 4, 0);
    const rsDest = createSurface(5, 4, 0);
    const refSource = paintSurface(5, 4);
    const rsSource = paintSurface(5, 4);
    reference.rotateSurface(fullRegion(refDest), fullRegion(refSource), -1.2, 1, 1.5);
    rotateSurface(fullRegion(rsDest), fullRegion(rsSource), -1.2, 1, 1.5);
    expect(rsDest.data).toEqual(refDest.data);
  });
});

describe('rotateSurface180', () => {
  it('matches into a distinct dest', () => {
    const refDest = createSurface(5, 4, 0);
    const rsDest = createSurface(5, 4, 0);
    const refSource = paintSurface(5, 4);
    const rsSource = paintSurface(5, 4);
    reference.rotateSurface180(fullRegion(refDest), fullRegion(refSource));
    rotateSurface180(fullRegion(rsDest), fullRegion(rsSource));
    expect(rsDest.data).toEqual(refDest.data);
  });
});

describe('rotateSurfaceClockwise', () => {
  it('matches with swapped dest dimensions', () => {
    const refDest = createSurface(3, 5, 0);
    const rsDest = createSurface(3, 5, 0);
    const refSource = paintSurface(5, 3);
    const rsSource = paintSurface(5, 3);
    reference.rotateSurfaceClockwise(fullRegion(refDest), fullRegion(refSource));
    rotateSurfaceClockwise(fullRegion(rsDest), fullRegion(rsSource));
    expect(rsDest.data).toEqual(refDest.data);
  });
});

describe('rotateSurfaceCounterClockwise', () => {
  it('matches with swapped dest dimensions', () => {
    const refDest = createSurface(3, 5, 0);
    const rsDest = createSurface(3, 5, 0);
    const refSource = paintSurface(5, 3);
    const rsSource = paintSurface(5, 3);
    reference.rotateSurfaceCounterClockwise(fullRegion(refDest), fullRegion(refSource));
    rotateSurfaceCounterClockwise(fullRegion(rsDest), fullRegion(rsSource));
    expect(rsDest.data).toEqual(refDest.data);
  });
});

describe('scrollSurface', () => {
  it('matches @flighthq/surface', () => {
    const refSurface = paintSurface(6, 6);
    const rsSurface = paintSurface(6, 6);
    reference.scrollSurface(refSurface, 2, -1);
    scrollSurface(rsSurface, 2, -1);
    expect(rsSurface.data).toEqual(refSurface.data);
    expect(rsSurface.version).toBe(refSurface.version);
  });
});

describe('sharpenSurface', () => {
  it('matches @flighthq/surface', () => {
    const source = paintSurface(8, 8);
    const refOut = new Uint8ClampedArray(8 * 8 * 4);
    const rsOut = new Uint8ClampedArray(8 * 8 * 4);
    const refScratch = new Uint8ClampedArray(8 * 8 * 4);
    const rsScratch = new Uint8ClampedArray(8 * 8 * 4);
    reference.sharpenSurface(refOut, refScratch, fullRegion(source), { amount: 1.5, radiusX: 1 });
    sharpenSurface(rsOut, rsScratch, fullRegion(source), { amount: 1.5, radiusX: 1 });
    expectByteClose(rsOut, refOut);
  });
});

describe('unpremultiplySurfacePixels', () => {
  it('matches @flighthq/surface byte for byte', () => {
    const source = paintedPixels(64);
    const refOut = new Uint8ClampedArray(64);
    const rsOut = new Uint8ClampedArray(64);
    reference.unpremultiplySurfacePixels(refOut, source, 64);
    unpremultiplySurfacePixels(rsOut, source, 64);
    expect(rsOut).toEqual(refOut);
  });
});

describe('writeSurfacePixels', () => {
  it('matches @flighthq/surface', () => {
    const refDest = createSurface(4, 4, 0);
    const rsDest = createSurface(4, 4, 0);
    const pixels = paintedPixels(4 * 4 * 4);
    reference.writeSurfacePixels(fullRegion(refDest), pixels);
    writeSurfacePixels(fullRegion(rsDest), pixels);
    expect(rsDest.data).toEqual(refDest.data);
    expect(rsDest.version).toBe(refDest.version);
  });
});

describe('writeSurfacePixels32', () => {
  it('matches @flighthq/surface', () => {
    const refDest = createSurface(4, 4, 0);
    const rsDest = createSurface(4, 4, 0);
    const pixels = new Uint32Array(16);
    for (let i = 0; i < 16; i += 1) pixels[i] = (i * 0x01020304 + 0x11223344) >>> 0;
    reference.writeSurfacePixels32(fullRegion(refDest), pixels);
    writeSurfacePixels32(fullRegion(rsDest), pixels);
    expect(rsDest.data).toEqual(refDest.data);
  });
});
