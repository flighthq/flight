import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createPath, flattenPath, getPathBounds } from '@flighthq/path/contract';
import type {
  Entity,
  EntityConstruction,
  GlyphMetrics,
  GlyphOutlineSource,
  GlyphRasterizeOptions,
  GlyphRasterizedBitmap,
  GlyphRasterizerBackend,
  RectangleLike,
} from '@flighthq/types/contract';

// Adapts an index-keyed vector font into the codepoint-keyed rasterizer consumed by glyphatlas. The
// adapter is bound to one source, so callers can install it on one GlyphAtlas through
// `GlyphAtlasOptions.rasterizerBackend` without changing the process-wide backend. Rasterization is a
// portable 4x4 coverage scan over flattened contours: it needs no DOM/canvas and therefore works for
// imported fonts in browser, worker, native-host, and headless environments alike.
export function createGlyphRasterizerBackendFromGlyphOutlineSource(
  source: GlyphOutlineSource,
): GlyphRasterizerBackend & Entity {
  const out = allocateEntity<unknown>();
  out.measureMetrics = (options): GlyphMetrics | null => {
    const metrics = source.getGlyphOutlineMetrics();
    const scale = resolveGlyphOutlineScale(metrics.unitsPerEm, options.fontSize);
    if (scale === null) return null;
    return {
      ascent: metrics.ascent * scale,
      descent: metrics.descent * scale,
      lineGap: metrics.lineGap * scale,
    };
  };
  out.rasterize = (codePoint, options): GlyphRasterizedBitmap | null => {
    return rasterizeGlyphOutlineSource(source, codePoint, options);
  };
  return finishEntity(out);
}

function rasterizeGlyphOutlineSource(
  source: GlyphOutlineSource,
  codePoint: number,
  options: Readonly<GlyphRasterizeOptions>,
): GlyphRasterizedBitmap | null {
  const glyphIndex = source.getGlyphOutlineIndexForCodePoint(codePoint);
  if (glyphIndex < 0) return null;

  const metrics = source.getGlyphOutlineMetrics();
  const scale = resolveGlyphOutlineScale(metrics.unitsPerEm, options.fontSize);
  if (scale === null) return null;

  const path = createPath();
  if (!source.getGlyphOutline(path, glyphIndex)) return null;
  const advance = source.getGlyphOutlineAdvance(glyphIndex) * scale;
  if (!Number.isFinite(advance)) return null;

  const bounds: RectangleLike = { height: 0, width: 0, x: 0, y: 0 };
  if (!getPathBounds(path, bounds) || bounds.width === 0 || bounds.height === 0) {
    return { advance, bearingX: 0, bearingY: 0, height: 0, pixels: new Uint8ClampedArray(), width: 0 };
  }

  const left = Math.floor(bounds.x * scale) - RASTER_GUARD;
  const top = Math.floor(bounds.y * scale) - RASTER_GUARD;
  const right = Math.ceil((bounds.x + bounds.width) * scale) + RASTER_GUARD;
  const bottom = Math.ceil((bounds.y + bounds.height) * scale) + RASTER_GUARD;
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) return null;

  // Flatten once at quarter-pixel precision in design units. Sampling the Path helper directly would
  // flatten every curve again for every subpixel and turn raster cost into pixels × path decoding.
  const contours = flattenPath(path, 0.25 / scale);
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let pixelY = 0; pixelY < height; pixelY++) {
    for (let pixelX = 0; pixelX < width; pixelX++) {
      let covered = 0;
      for (let sampleY = 0; sampleY < RASTER_SAMPLE_AXIS; sampleY++) {
        const y = (top + pixelY + (sampleY + 0.5) / RASTER_SAMPLE_AXIS) / scale;
        for (let sampleX = 0; sampleX < RASTER_SAMPLE_AXIS; sampleX++) {
          const x = (left + pixelX + (sampleX + 0.5) / RASTER_SAMPLE_AXIS) / scale;
          if (containsFlattenedGlyphOutlinePoint(contours, path.winding, x, y)) covered++;
        }
      }
      if (covered === 0) continue;
      const offset = (pixelY * width + pixelX) * 4;
      pixels[offset] = 0xff;
      pixels[offset + 1] = 0xff;
      pixels[offset + 2] = 0xff;
      pixels[offset + 3] = Math.round((covered * 0xff) / RASTER_SAMPLE_COUNT);
    }
  }
  return { advance, bearingX: left, bearingY: -top, height, pixels, width };
}

function containsFlattenedGlyphOutlinePoint(
  contours: readonly (readonly number[])[],
  winding: 'evenOdd' | 'nonZero',
  x: number,
  y: number,
): boolean {
  let crossings = 0;
  for (const contour of contours) {
    const pointCount = (contour.length / 2) | 0;
    if (pointCount < 2) continue;
    let fromX = contour[(pointCount - 1) * 2];
    let fromY = contour[(pointCount - 1) * 2 + 1];
    for (let pointIndex = 0; pointIndex < pointCount; pointIndex++) {
      const toX = contour[pointIndex * 2];
      const toY = contour[pointIndex * 2 + 1];
      if ((fromY <= y && toY > y) || (toY <= y && fromY > y)) {
        const crossingX = fromX + ((y - fromY) * (toX - fromX)) / (toY - fromY);
        if (x < crossingX) crossings += toY > fromY ? 1 : -1;
      }
      fromX = toX;
      fromY = toY;
    }
  }
  return winding === 'evenOdd' ? (Math.abs(crossings) & 1) !== 0 : crossings !== 0;
}

function resolveGlyphOutlineScale(unitsPerEm: number, fontSize: number): number | null {
  if (!(unitsPerEm > 0) || !(fontSize > 0) || !Number.isFinite(unitsPerEm) || !Number.isFinite(fontSize)) return null;
  return fontSize / unitsPerEm;
}

const RASTER_GUARD = 1;
const RASTER_SAMPLE_AXIS = 4;
const RASTER_SAMPLE_COUNT = RASTER_SAMPLE_AXIS * RASTER_SAMPLE_AXIS;
