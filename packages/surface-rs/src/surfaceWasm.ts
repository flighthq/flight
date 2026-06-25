import { invalidateImageResource } from '@flighthq/resources';
import type {
  SurfaceBevelOptions,
  SurfaceBevelType,
  SurfaceBoxBlurOptions,
  SurfaceConvolutionEdge,
  SurfaceConvolutionOptions,
  SurfaceDisplacementMapMode,
  SurfaceDisplacementMapOptions,
  SurfaceDropShadowOptions,
  SurfaceGlowOptions,
  SurfaceGradientBevelOptions,
  SurfaceGradientGlowOptions,
  SurfaceInnerGlowOptions,
  SurfaceInnerShadowOptions,
  SurfaceResizeOptions,
  SurfaceSharpenOptions,
} from '@flighthq/surface';
import type {
  ColorTransformLike,
  ImageChannel,
  PixelOrder,
  RectangleLike,
  Surface,
  SurfaceHistogram,
  SurfaceRegion,
  SurfaceResizeMode,
  ThresholdOperation,
} from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import {
  apply_surface_color_transform_wasm,
  apply_surface_palette_map_wasm,
  apply_surface_threshold_wasm,
  bevel_surface_wasm,
  blur_surface_pixels_horizontal_wasm,
  blur_surface_pixels_horizontal_weighted_wasm,
  blur_surface_pixels_vertical_wasm,
  blur_surface_pixels_vertical_weighted_wasm,
  box_blur_surface_wasm,
  color_matrix_surface_wasm,
  composite_surface_pixels_wasm,
  composite_surface_region_wasm,
  convert_surface_pixel_order_wasm,
  convolve_surface_wasm,
  copy_surface_channel_wasm,
  copy_surface_pixels_wasm,
  dilate_surface_wasm,
  displace_surface_wasm,
  dissolve_surface_pixels_wasm,
  drop_shadow_surface_wasm,
  equalize_surface_histogram_wasm,
  erode_surface_wasm,
  extract_surface_pixels_32_wasm,
  extract_surface_pixels_wasm,
  fill_surface_noise_wasm,
  fill_surface_perlin_noise_wasm,
  fill_surface_rectangle_wasm,
  flip_surface_horizontal_wasm,
  flip_surface_vertical_wasm,
  flood_fill_surface_wasm,
  gaussian_blur_surface_wasm,
  get_surface_color_bounds_rectangle_wasm,
  get_surface_coverage_wasm,
  get_surface_histogram_wasm,
  glow_surface_wasm,
  gradient_bevel_surface_wasm,
  gradient_glow_surface_wasm,
  initSync,
  inner_glow_surface_wasm,
  inner_shadow_surface_wasm,
  median_surface_wasm,
  merge_surface_wasm,
  pixelate_surface_wasm,
  premultiply_surface_pixels_wasm,
  resize_surface_wasm,
  rotate_surface_180_wasm,
  rotate_surface_clockwise_wasm,
  rotate_surface_counter_clockwise_wasm,
  rotate_surface_wasm,
  scroll_surface_wasm,
  sharpen_surface_wasm,
  unpremultiply_surface_pixels_wasm,
  write_surface_pixels_32_wasm,
  write_surface_pixels_wasm,
} from './wasm/surface_wasm.js';
import { surfaceWasmBytes } from './wasm/surfaceWasmBytes';

/**
 * `@flighthq/surface-rs` — wasm-backed implementations of the bulk
 * `@flighthq/surface` pixel operations, with signatures identical to their
 * TypeScript counterparts. The whole `@flighthq/surface` API is re-exported
 * from the package root; only the heavy per-pixel ops below cross into wasm,
 * where the work is amortized over a single boundary crossing. Analytical
 * comparison utilities (`compareSurface`, `getSurfaceMismatch`,
 * `createSurfaceFingerprint`) stay as JS re-exports.
 */

export function applySurfaceColorTransform(
  dest: Readonly<SurfaceRegion>,
  source: Readonly<SurfaceRegion>,
  ct: Readonly<ColorTransformLike>,
): void {
  ensureSurfaceRs();
  apply_surface_color_transform_wasm(
    asUint8(dest.surface.data),
    descOf(dest),
    asUint8(source.surface.data),
    descOf(source),
    ct.redMultiplier,
    ct.greenMultiplier,
    ct.blueMultiplier,
    ct.alphaMultiplier,
    ct.redOffset,
    ct.greenOffset,
    ct.blueOffset,
    ct.alphaOffset,
  );
  invalidateImageResource(dest.surface);
}

export function applySurfacePaletteMap(
  dest: Readonly<SurfaceRegion>,
  source: Readonly<SurfaceRegion>,
  redMap: ReadonlyArray<number> | null,
  greenMap: ReadonlyArray<number> | null,
  blueMap: ReadonlyArray<number> | null,
  alphaMap: ReadonlyArray<number> | null,
): void {
  ensureSurfaceRs();
  apply_surface_palette_map_wasm(
    asUint8(dest.surface.data),
    descOf(dest),
    asUint8(source.surface.data),
    descOf(source),
    toChannelMap(redMap),
    toChannelMap(greenMap),
    toChannelMap(blueMap),
    toChannelMap(alphaMap),
  );
  invalidateImageResource(dest.surface);
}

export function applySurfaceThreshold(
  dest: Readonly<SurfaceRegion>,
  source: Readonly<SurfaceRegion>,
  operation: ThresholdOperation,
  thresholdValue: number,
  color: number = 0,
  mask: number = 0xffffffff,
  copySource: boolean = false,
): number {
  ensureSurfaceRs();
  const hits = apply_surface_threshold_wasm(
    asUint8(dest.surface.data),
    descOf(dest),
    asUint8(source.surface.data),
    descOf(source),
    THRESHOLD_OPERATION[operation],
    thresholdValue >>> 0,
    color >>> 0,
    mask >>> 0,
    copySource,
  );
  invalidateImageResource(dest.surface);
  return hits;
}

export function bevelSurface(
  out: Uint8ClampedArray,
  scratch: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  options: Readonly<SurfaceBevelOptions> = {},
): void {
  ensureSurfaceRs();
  bevel_surface_wasm(
    asUint8(out),
    asUint8(scratch),
    asUint8(source.surface.data),
    descOf(source),
    options.angle ?? Math.PI / 4,
    options.distance ?? 4,
    roundRadius(options.radiusX ?? 2),
    roundRadius(options.radiusY ?? 2),
    roundPasses(options.passes ?? 1),
    (options.highlightColor ?? 0xffffffff) >>> 0,
    (options.shadowColor ?? 0x000000ff) >>> 0,
    options.intensity ?? 1,
    SURFACE_BEVEL_TYPE[options.type ?? 'inner'],
  );
}

export function blurSurfacePixelsHorizontal(
  out: Uint8ClampedArray,
  source: Readonly<Uint8ClampedArray>,
  width: number,
  height: number,
  radius: number,
): void {
  ensureSurfaceRs();
  blur_surface_pixels_horizontal_wasm(asUint8(out), asUint8(source), width, height, radius);
}

export function blurSurfacePixelsHorizontalWeighted(
  out: Uint8ClampedArray,
  source: Readonly<Uint8ClampedArray>,
  width: number,
  height: number,
  kernel: Readonly<Float32Array>,
): void {
  ensureSurfaceRs();
  blur_surface_pixels_horizontal_weighted_wasm(asUint8(out), asUint8(source), width, height, kernel as Float32Array);
}

export function blurSurfacePixelsVertical(
  out: Uint8ClampedArray,
  source: Readonly<Uint8ClampedArray>,
  width: number,
  height: number,
  radius: number,
): void {
  ensureSurfaceRs();
  blur_surface_pixels_vertical_wasm(asUint8(out), asUint8(source), width, height, radius);
}

export function blurSurfacePixelsVerticalWeighted(
  out: Uint8ClampedArray,
  source: Readonly<Uint8ClampedArray>,
  width: number,
  height: number,
  kernel: Readonly<Float32Array>,
): void {
  ensureSurfaceRs();
  blur_surface_pixels_vertical_weighted_wasm(asUint8(out), asUint8(source), width, height, kernel as Float32Array);
}

export function boxBlurSurface(
  out: Uint8ClampedArray,
  scratch: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  options: Readonly<SurfaceBoxBlurOptions> = {},
): void {
  ensureSurfaceRs();
  box_blur_surface_wasm(
    asUint8(out),
    asUint8(scratch),
    asUint8(source.surface.data),
    descOf(source),
    roundRadius(options.radiusX ?? 2),
    roundRadius(options.radiusY ?? 2),
    roundPasses(options.passes ?? 1),
  );
}

export function colorMatrixSurface(
  out: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  matrix: ReadonlyArray<number>,
): void {
  ensureSurfaceRs();
  color_matrix_surface_wasm(asUint8(out), asUint8(source.surface.data), descOf(source), Float32Array.from(matrix));
}

export function compositeSurfacePixels(
  dest: Readonly<SurfaceRegion>,
  pixels: Readonly<Uint8ClampedArray>,
  blendMode: BlendMode = BlendMode.Normal,
): void {
  ensureSurfaceRs();
  composite_surface_pixels_wasm(asUint8(dest.surface.data), descOf(dest), asUint8(pixels), blendMode);
  invalidateImageResource(dest.surface);
}

export function compositeSurfaceRegion(
  dest: Readonly<SurfaceRegion>,
  source: Readonly<SurfaceRegion>,
  blendMode: BlendMode = BlendMode.Normal,
): void {
  ensureSurfaceRs();
  composite_surface_region_wasm(
    asUint8(dest.surface.data),
    descOf(dest),
    asUint8(source.surface.data),
    descOf(source),
    blendMode,
  );
  invalidateImageResource(dest.surface);
}

export function convertSurfacePixelOrder(
  out: Uint8ClampedArray,
  source: Readonly<Uint8ClampedArray>,
  length: number,
  from: PixelOrder,
  to: PixelOrder,
): void {
  ensureSurfaceRs();
  convert_surface_pixel_order_wasm(asUint8(out), asUint8(source), length, PIXEL_ORDER[from], PIXEL_ORDER[to]);
}

export function convolveSurface(
  out: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  options: Readonly<SurfaceConvolutionOptions>,
): void {
  ensureSurfaceRs();
  convolve_surface_wasm(
    asUint8(out),
    asUint8(source.surface.data),
    descOf(source),
    Float32Array.from(options.matrix),
    options.matrixX,
    options.matrixY,
    options.bias ?? 0,
    SURFACE_CONVOLUTION_EDGE[options.edge ?? 'clamp'],
    (options.fillColor ?? 0) >>> 0,
    options.divisor ?? 0,
    options.preserveAlpha ?? true,
  );
}

export function copySurfaceChannel(
  dest: Readonly<SurfaceRegion>,
  destChannel: ImageChannel,
  source: Readonly<SurfaceRegion>,
  sourceChannel: ImageChannel,
): void {
  ensureSurfaceRs();
  copy_surface_channel_wasm(
    asUint8(dest.surface.data),
    descOf(dest),
    destChannel,
    asUint8(source.surface.data),
    descOf(source),
    sourceChannel,
  );
  invalidateImageResource(dest.surface);
}

export function copySurfacePixels(
  dest: Readonly<SurfaceRegion>,
  source: Readonly<SurfaceRegion>,
  composite: boolean = false,
): void {
  ensureSurfaceRs();
  copy_surface_pixels_wasm(
    asUint8(dest.surface.data),
    descOf(dest),
    asUint8(source.surface.data),
    descOf(source),
    composite,
  );
  invalidateImageResource(dest.surface);
}

export function dilateSurface(out: Uint8ClampedArray, source: Readonly<SurfaceRegion>, radius: number): void {
  ensureSurfaceRs();
  dilate_surface_wasm(asUint8(out), asUint8(source.surface.data), descOf(source), radius);
}

export function displaceSurface(
  out: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  options: Readonly<SurfaceDisplacementMapOptions>,
): void {
  ensureSurfaceRs();
  displace_surface_wasm(
    asUint8(out),
    asUint8(source.surface.data),
    descOf(source),
    asUint8(options.map.surface.data),
    descOf(options.map),
    options.componentX ?? 0,
    options.componentY ?? 1,
    options.scaleX ?? 0,
    options.scaleY ?? 0,
    SURFACE_DISPLACEMENT_MODE[options.mode ?? 'wrap'],
    (options.fillColor ?? 0) >>> 0,
  );
}

export function dissolveSurfacePixels(
  dest: Readonly<SurfaceRegion>,
  source: Readonly<SurfaceRegion>,
  seed: number,
  pixelCount: number,
  fillColor: number = 0,
): number {
  ensureSurfaceRs();
  const cursor = dissolve_surface_pixels_wasm(
    asUint8(dest.surface.data),
    descOf(dest),
    asUint8(source.surface.data),
    descOf(source),
    seed,
    pixelCount,
    fillColor,
  );
  if (pixelCount > 0 && dest.width * dest.height > 0) invalidateImageResource(dest.surface);
  return cursor;
}

export function dropShadowSurface(
  out: Uint8ClampedArray,
  scratch: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  options: Readonly<SurfaceDropShadowOptions> = {},
): void {
  ensureSurfaceRs();
  drop_shadow_surface_wasm(
    asUint8(out),
    asUint8(scratch),
    asUint8(source.surface.data),
    descOf(source),
    roundRadius(options.radiusX ?? 2),
    roundRadius(options.radiusY ?? 2),
    roundPasses(options.passes ?? 1),
    (options.color ?? 0x000000ff) >>> 0,
    options.intensity ?? 1,
  );
}

export function equalizeSurfaceHistogram(dest: Readonly<SurfaceRegion>, source: Readonly<SurfaceRegion>): void {
  ensureSurfaceRs();
  equalize_surface_histogram_wasm(
    asUint8(dest.surface.data),
    descOf(dest),
    asUint8(source.surface.data),
    descOf(source),
  );
  invalidateImageResource(dest.surface);
}

export function erodeSurface(out: Uint8ClampedArray, source: Readonly<SurfaceRegion>, radius: number): void {
  ensureSurfaceRs();
  erode_surface_wasm(asUint8(out), asUint8(source.surface.data), descOf(source), radius);
}

export function extractSurfacePixels(out: Uint8ClampedArray, source: Readonly<SurfaceRegion>): void {
  ensureSurfaceRs();
  extract_surface_pixels_wasm(asUint8(out), asUint8(source.surface.data), descOf(source));
}

export function extractSurfacePixels32(out: Uint32Array, source: Readonly<SurfaceRegion>): void {
  ensureSurfaceRs();
  extract_surface_pixels_32_wasm(out, asUint8(source.surface.data), descOf(source));
}

export function fillSurfaceNoise(
  dest: Readonly<SurfaceRegion>,
  seed: number,
  low: number = 0,
  high: number = 255,
  grayScale: boolean = false,
): void {
  ensureSurfaceRs();
  fill_surface_noise_wasm(asUint8(dest.surface.data), descOf(dest), seed, low, high, grayScale);
  invalidateImageResource(dest.surface);
}

export function fillSurfacePerlinNoise(
  dest: Readonly<SurfaceRegion>,
  baseX: number,
  baseY: number,
  octaves: number,
  seed: number,
  grayScale: boolean = false,
): void {
  ensureSurfaceRs();
  fill_surface_perlin_noise_wasm(asUint8(dest.surface.data), descOf(dest), baseX, baseY, octaves, seed, grayScale);
  invalidateImageResource(dest.surface);
}

export function fillSurfaceRectangle(dest: Readonly<SurfaceRegion>, color: number): void {
  ensureSurfaceRs();
  fill_surface_rectangle_wasm(asUint8(dest.surface.data), descOf(dest), color >>> 0);
  invalidateImageResource(dest.surface);
}

export function flipSurfaceHorizontal(dest: Readonly<SurfaceRegion>, source: Readonly<SurfaceRegion>): void {
  runRegionPair(flip_surface_horizontal_wasm, dest, source);
}

export function flipSurfaceVertical(dest: Readonly<SurfaceRegion>, source: Readonly<SurfaceRegion>): void {
  runRegionPair(flip_surface_vertical_wasm, dest, source);
}

// `visited` matches the `@flighthq/surface` signature (a caller-provided scratch
// buffer the JS implementation uses to track filled pixels). The wasm backend
// manages its own visited set internally, so the argument is accepted for
// drop-in signature parity but not forwarded across the boundary.
export function floodFillSurface(out: Surface, x: number, y: number, color: number): void {
  ensureSurfaceRs();
  flood_fill_surface_wasm(asUint8(out.data), out.width, out.height, x, y, color >>> 0);
  invalidateImageResource(out);
}

export function gaussianBlurSurface(
  out: Uint8ClampedArray,
  scratch: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  sigmaX: number,
  sigmaY: number = sigmaX,
  passes: number = 1,
): void {
  ensureSurfaceRs();
  gaussian_blur_surface_wasm(
    asUint8(out),
    asUint8(scratch),
    asUint8(source.surface.data),
    descOf(source),
    sigmaX,
    sigmaY,
    passes,
  );
}

export function getSurfaceColorBoundsRectangle(
  source: Readonly<SurfaceRegion>,
  mask: number,
  color: number,
  findColor: boolean = true,
): RectangleLike | null {
  ensureSurfaceRs();
  const rect = SCRATCH_RECT;
  const found = get_surface_color_bounds_rectangle_wasm(
    rect,
    asUint8(source.surface.data),
    descOf(source),
    mask >>> 0,
    color >>> 0,
    findColor,
  );
  if (!found) return null;
  return { x: rect[0], y: rect[1], width: rect[2], height: rect[3] };
}

export function getSurfaceCoverage(
  source: Readonly<Surface>,
  backgroundColor: number,
  channelTolerance: number = 0,
): number {
  ensureSurfaceRs();
  return get_surface_coverage_wasm(
    asUint8(source.data),
    source.width,
    source.height,
    backgroundColor >>> 0,
    channelTolerance,
  );
}

export function getSurfaceHistogram(source: Readonly<SurfaceRegion>): SurfaceHistogram {
  ensureSurfaceRs();
  const out = SCRATCH_HISTOGRAM;
  get_surface_histogram_wasm(out, asUint8(source.surface.data), descOf(source));
  return {
    red: Array.from(out.subarray(0, 256)),
    green: Array.from(out.subarray(256, 512)),
    blue: Array.from(out.subarray(512, 768)),
    alpha: Array.from(out.subarray(768, 1024)),
  };
}

export function glowSurface(
  out: Uint8ClampedArray,
  scratch: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  options: Readonly<SurfaceGlowOptions> = {},
): void {
  ensureSurfaceRs();
  glow_surface_wasm(
    asUint8(out),
    asUint8(scratch),
    asUint8(source.surface.data),
    descOf(source),
    roundRadius(options.radiusX ?? 2),
    roundRadius(options.radiusY ?? 2),
    roundPasses(options.passes ?? 1),
    (options.color ?? 0xff0000ff) >>> 0,
    options.intensity ?? 1,
  );
}

export function gradientBevelSurface(
  out: Uint8ClampedArray,
  scratch: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  ramp: Readonly<Uint8ClampedArray>,
  options: Readonly<SurfaceGradientBevelOptions> = {},
): void {
  ensureSurfaceRs();
  gradient_bevel_surface_wasm(
    asUint8(out),
    asUint8(scratch),
    asUint8(source.surface.data),
    descOf(source),
    asUint8(ramp),
    options.angle ?? Math.PI / 4,
    options.distance ?? 4,
    roundRadius(options.radiusX ?? 2),
    roundRadius(options.radiusY ?? 2),
    roundPasses(options.passes ?? 1),
    options.intensity ?? 1,
    SURFACE_BEVEL_TYPE[options.type ?? 'inner'],
  );
}

export function gradientGlowSurface(
  out: Uint8ClampedArray,
  scratch: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  ramp: Readonly<Uint8ClampedArray>,
  options: Readonly<SurfaceGradientGlowOptions> = {},
): void {
  ensureSurfaceRs();
  gradient_glow_surface_wasm(
    asUint8(out),
    asUint8(scratch),
    asUint8(source.surface.data),
    descOf(source),
    asUint8(ramp),
    roundRadius(options.radiusX ?? 2),
    roundRadius(options.radiusY ?? 2),
    roundPasses(options.passes ?? 1),
    options.intensity ?? 1,
  );
}

/**
 * Eagerly instantiate the wasm module. Optional warm-up: every wasm-backed
 * function self-initializes on first call, so this is never required — it only
 * moves the one-time instantiation off the first hot-path call. Synchronous;
 * the module bytes are embedded, so no file read or network fetch occurs.
 */
export function initSurfaceRs(): void {
  ensureSurfaceRs();
}

export function innerGlowSurface(
  out: Uint8ClampedArray,
  scratch: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  options: Readonly<SurfaceInnerGlowOptions> = {},
): void {
  ensureSurfaceRs();
  inner_glow_surface_wasm(
    asUint8(out),
    asUint8(scratch),
    asUint8(source.surface.data),
    descOf(source),
    roundRadius(options.radiusX ?? 2),
    roundRadius(options.radiusY ?? 2),
    roundPasses(options.passes ?? 1),
    (options.color ?? 0xff0000ff) >>> 0,
    options.intensity ?? 1,
  );
}

export function innerShadowSurface(
  out: Uint8ClampedArray,
  scratch: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  options: Readonly<SurfaceInnerShadowOptions> = {},
): void {
  ensureSurfaceRs();
  inner_shadow_surface_wasm(
    asUint8(out),
    asUint8(scratch),
    asUint8(source.surface.data),
    descOf(source),
    roundRadius(options.radiusX ?? 2),
    roundRadius(options.radiusY ?? 2),
    roundPasses(options.passes ?? 1),
    (options.color ?? 0x000000ff) >>> 0,
    options.intensity ?? 1,
  );
}

export function medianSurface(out: Uint8ClampedArray, source: Readonly<SurfaceRegion>, radius: number): void {
  ensureSurfaceRs();
  median_surface_wasm(asUint8(out), asUint8(source.surface.data), descOf(source), radius);
}

export function mergeSurface(
  dest: Readonly<SurfaceRegion>,
  source: Readonly<SurfaceRegion>,
  redMultiplier: number,
  greenMultiplier: number,
  blueMultiplier: number,
  alphaMultiplier: number,
): void {
  ensureSurfaceRs();
  merge_surface_wasm(
    asUint8(dest.surface.data),
    descOf(dest),
    asUint8(source.surface.data),
    descOf(source),
    redMultiplier,
    greenMultiplier,
    blueMultiplier,
    alphaMultiplier,
  );
  invalidateImageResource(dest.surface);
}

export function pixelateSurface(out: Uint8ClampedArray, source: Readonly<SurfaceRegion>, blockSize: number): void {
  ensureSurfaceRs();
  pixelate_surface_wasm(asUint8(out), asUint8(source.surface.data), descOf(source), blockSize);
}

export function premultiplySurfacePixels(
  out: Uint8ClampedArray,
  source: Readonly<Uint8ClampedArray>,
  length: number,
): void {
  ensureSurfaceRs();
  premultiply_surface_pixels_wasm(asUint8(out), asUint8(source), length);
}

export function resizeSurface(
  dest: Readonly<SurfaceRegion>,
  source: Readonly<SurfaceRegion>,
  options: SurfaceResizeMode | Readonly<SurfaceResizeOptions> = 'bilinear',
): void {
  ensureSurfaceRs();
  const opts: Readonly<SurfaceResizeOptions> = typeof options === 'string' ? { mode: options } : options;
  const mode = opts.mode ?? 'bilinear';
  const premultiplied = opts.premultiplied ?? false;
  resize_surface_wasm(
    asUint8(dest.surface.data),
    descOf(dest),
    asUint8(source.surface.data),
    descOf(source),
    RESIZE_MODE[mode],
    premultiplied,
  );
  invalidateImageResource(dest.surface);
}

export function rotateSurface(
  dest: Readonly<SurfaceRegion>,
  source: Readonly<SurfaceRegion>,
  angle: number,
  pivotX: number = (source.width - 1) / 2,
  pivotY: number = (source.height - 1) / 2,
): void {
  ensureSurfaceRs();
  rotate_surface_wasm(
    asUint8(dest.surface.data),
    descOf(dest),
    asUint8(source.surface.data),
    descOf(source),
    angle,
    pivotX,
    pivotY,
  );
  invalidateImageResource(dest.surface);
}

export function rotateSurface180(dest: Readonly<SurfaceRegion>, source: Readonly<SurfaceRegion>): void {
  runRegionPair(rotate_surface_180_wasm, dest, source);
}

export function rotateSurfaceClockwise(dest: Readonly<SurfaceRegion>, source: Readonly<SurfaceRegion>): void {
  runRegionPair(rotate_surface_clockwise_wasm, dest, source);
}

export function rotateSurfaceCounterClockwise(dest: Readonly<SurfaceRegion>, source: Readonly<SurfaceRegion>): void {
  runRegionPair(rotate_surface_counter_clockwise_wasm, dest, source);
}

export function scrollSurface(out: Surface, dx: number, dy: number): void {
  ensureSurfaceRs();
  scroll_surface_wasm(asUint8(out.data), out.width, out.height, dx | 0, dy | 0);
  invalidateImageResource(out);
}

export function sharpenSurface(
  out: Uint8ClampedArray,
  scratch: Uint8ClampedArray,
  source: Readonly<SurfaceRegion>,
  options: Readonly<SurfaceSharpenOptions> = {},
): void {
  ensureSurfaceRs();
  sharpen_surface_wasm(
    asUint8(out),
    asUint8(scratch),
    asUint8(source.surface.data),
    descOf(source),
    options.amount ?? 1,
    roundRadius(options.radiusX ?? 2),
    roundRadius(options.radiusY ?? 2),
    roundPasses(options.passes ?? 1),
  );
}

export function unpremultiplySurfacePixels(
  out: Uint8ClampedArray,
  source: Readonly<Uint8ClampedArray>,
  length: number,
): void {
  ensureSurfaceRs();
  unpremultiply_surface_pixels_wasm(asUint8(out), asUint8(source), length);
}

export function writeSurfacePixels(dest: Readonly<SurfaceRegion>, pixels: Readonly<Uint8ClampedArray>): void {
  ensureSurfaceRs();
  write_surface_pixels_wasm(asUint8(dest.surface.data), descOf(dest), asUint8(pixels));
  invalidateImageResource(dest.surface);
}

export function writeSurfacePixels32(dest: Readonly<SurfaceRegion>, pixels: Readonly<Uint32Array>): void {
  ensureSurfaceRs();
  write_surface_pixels_32_wasm(asUint8(dest.surface.data), descOf(dest), pixels as Uint32Array);
  invalidateImageResource(dest.surface);
}

// Radius/pass guards matching `@flighthq/surface`: radii floor at 0, pass
// counts floor at 1, both rounded to integers before crossing to the u32 args.
function roundPasses(value: number): number {
  return Math.max(1, Math.round(value));
}

function roundRadius(value: number): number {
  return Math.max(0, Math.round(value));
}

// A Uint8Array view over the same backing buffer as the surface's clamped data.
// The wasm glue copies this in and writes results back through the shared
// buffer, so the caller's `Uint8ClampedArray` observes the mutation in place.
function asUint8(data: Readonly<Uint8ClampedArray>): Uint8Array {
  const view = data as Uint8ClampedArray;
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

// Packs a region into the 6-element descriptor the binding expects:
// [surfaceWidth, surfaceHeight, x, y, regionWidth, regionHeight].
function descOf(region: Readonly<SurfaceRegion>): Uint32Array {
  return Uint32Array.of(region.surface.width, region.surface.height, region.x, region.y, region.width, region.height);
}

let initialized = false;

// Lazily instantiate the wasm module on first use. Synchronous and idempotent.
function ensureSurfaceRs(): void {
  if (initialized) return;
  initSync({ module: surfaceWasmBytes });
  initialized = true;
}

// True when both regions name the same surface and bounds — the in-place case.
// Mirrors `@flighthq/surface`'s own aliasing check so version bumping matches.
function isSameRegion(a: Readonly<SurfaceRegion>, b: Readonly<SurfaceRegion>): boolean {
  return a.surface === b.surface && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

// Shared marshalling for the dest/source region pair ops (flip, rotate). The
// version bump follows the TS contract: only when the op is not an in-place
// alias (an aliased swap leaves `version` untouched).
function runRegionPair(
  op: (destData: Uint8Array, destDesc: Uint32Array, sourceData: Uint8Array, sourceDesc: Uint32Array) => void,
  dest: Readonly<SurfaceRegion>,
  source: Readonly<SurfaceRegion>,
): void {
  ensureSurfaceRs();
  op(asUint8(dest.surface.data), descOf(dest), asUint8(source.surface.data), descOf(source));
  if (!isSameRegion(dest, source)) invalidateImageResource(dest.surface);
}

// A 256-byte channel map for the palette op, or an empty array meaning "absent"
// (the binding leaves that channel unchanged). The native map is `[u8; 256]`.
function toChannelMap(map: ReadonlyArray<number> | null): Uint8Array {
  return map ? Uint8Array.from(map) : EMPTY_CHANNEL_MAP;
}

const EMPTY_CHANNEL_MAP = new Uint8Array(0);
const SCRATCH_HISTOGRAM = new Uint32Array(1024);
const SCRATCH_RECT = new Float64Array(4);

// TS filter enums (string unions) mapped to their Rust repr(u8) discriminants.
// Each map must stay in lockstep with the Rust enum in `flighthq-surface-wasm/src/lib.rs`
// (the `*_from_u8` decode functions). Cardinality is tested in `surfaceWasm.test.ts`.
//
// BlendMode note: `compositeSurfacePixels` and `compositeSurfaceRegion` pass the
// `BlendMode` enum value *directly* as its TS numeric discriminant — no string-union
// lookup table is needed here because `BlendMode` is already a numeric enum.
// The Rust `blend_mode_from_u8` in lib.rs covers all 15 TS variants (0=Add … 14=Subtract);
// variant 10 (Normal) is handled by the `_` wildcard arm, not an explicit branch.
// Explicit mapping: Add=0, Alpha=1, Darken=2, Difference=3, Erase=4, Hardlight=5,
// Invert=6, Layer=7, Lighten=8, Multiply=9, Normal=10 (via `_`), Overlay=11,
// Screen=12, Shader=13, Subtract=14. Cardinality test in `wasm discriminant map
// cardinality` verifies all 15 variants round-trip correctly.

// Mirrors `surface_bevel_type_from_u8`: Both=0, Inner=1, Outer=2.
const SURFACE_BEVEL_TYPE: Readonly<Record<SurfaceBevelType, number>> = { both: 0, inner: 1, outer: 2 };
// Mirrors `surface_convolution_edge_from_u8`: Clamp=0, Fill=1, Wrap=2.
const SURFACE_CONVOLUTION_EDGE: Readonly<Record<SurfaceConvolutionEdge, number>> = { clamp: 0, fill: 1, wrap: 2 };
// Mirrors `surface_displacement_mode_from_u8`: Clamp=0, Color=1, Ignore=2, Wrap=3.
const SURFACE_DISPLACEMENT_MODE: Readonly<Record<SurfaceDisplacementMapMode, number>> = {
  clamp: 0,
  color: 1,
  ignore: 2,
  wrap: 3,
};

// Mirrors `pixel_order_from_u8`: Abgr=0, Argb=1, Bgra=2, Rgba=3.
const PIXEL_ORDER: Readonly<Record<PixelOrder, number>> = { ABGR: 0, ARGB: 1, BGRA: 2, RGBA: 3 };
// Mirrors `resize_mode_from_u8`: Bicubic=0, Bilinear=1, Nearest=2.
const RESIZE_MODE: Readonly<Record<SurfaceResizeMode, number>> = { bicubic: 0, bilinear: 1, nearest: 2 };
// Mirrors `threshold_op_from_u8`: NotEqual=0, LessThan=1, LessEqual=2, Equal=3, GreaterThan=4, GreaterEqual=5.
const THRESHOLD_OPERATION: Readonly<Record<ThresholdOperation, number>> = {
  '!=': 0,
  '<': 1,
  '<=': 2,
  '==': 3,
  '>': 4,
  '>=': 5,
};
