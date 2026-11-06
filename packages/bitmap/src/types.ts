// The bitmap-owned contracts in an acyclic lane: they import nothing from @flighthq/types, which now
// re-exports them. Contract-only projects select this file through the `.bitmap-types` module suffix.

import type { EntityRaw, EntityRuntime } from '@flighthq/entity/contract';
import type { EntityRuntimeKey } from '@flighthq/entity/contract';
import type { BitmapTextureSourceKind, PixelFormat, TextureSource } from '@flighthq/texture/contract';

interface BitmapEntity extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
}

export type ImageFormat = 'jpeg' | 'png';

export type PixelOrder = 'ABGR' | 'ARGB' | 'BGRA' | 'RGBA';

/**
 * Controls what happens when a gradient coordinate falls outside the defined
 * stop range (the span from the first stop to the last stop).
 *
 * - `'pad'`: extends the first or last stop color to the boundary.
 * - `'repeat'`: tiles the gradient pattern (wraps).
 * - `'reflect'`: alternately mirrors the gradient pattern.
 */
export type GradientSpread = 'pad' | 'reflect' | 'repeat';

export type ThresholdOperation = '!=' | '<' | '<=' | '==' | '>' | '>=';

// The complete vocabulary of ways surface combines a source pixel with its backdrop — a single umbrella
// over both the color-blend functions (Multiply, Overlay, …) and the Porter-Duff coverage operators
// (DestinationOut = erase, DestinationIn = alpha mask, …). surface has no fixed-function-vs-effect cost
// split — it composites in software, pixel by pixel — so unlike the GPU vocabularies it carries both axes
// under one name and one parameter. This mirrors the Canvas globalCompositeOperation model, which likewise
// unifies blend and composite in a single value.
//
// It is independent of BlendMode / CompositeOperator / AdvancedBlendMode: surface owns its domain
// vocabulary (WASM-bound, self-contained), so reshaping the GPU-facing enums never touches it. It shares
// their canonical PascalCase string values, so any GPU mode string is already a valid BitmapCompositeMode.
// Third-party modes namespace with a vendor prefix (e.g. 'acme.Foo'); unknown modes composite source-over.
export const BitmapCompositeMode = {
  Add: 'Add',
  Clear: 'Clear',
  ColorBurn: 'ColorBurn',
  ColorDodge: 'ColorDodge',
  Copy: 'Copy',
  Darken: 'Darken',
  DestinationAtop: 'DestinationAtop',
  DestinationIn: 'DestinationIn',
  DestinationOut: 'DestinationOut',
  DestinationOver: 'DestinationOver',
  Difference: 'Difference',
  Exclusion: 'Exclusion',
  HardLight: 'HardLight',
  Invert: 'Invert',
  Lighten: 'Lighten',
  Multiply: 'Multiply',
  Normal: 'Normal',
  Overlay: 'Overlay',
  Screen: 'Screen',
  SoftLight: 'SoftLight',
  SourceAtop: 'SourceAtop',
  SourceIn: 'SourceIn',
  SourceOut: 'SourceOut',
  SourceOver: 'SourceOver',
  Subtract: 'Subtract',
  Xor: 'Xor',
} as const;

export type BitmapCompositeMode = string;

/**
 * Controls how out-of-bounds source coordinates are resolved when sampling a surface.
 *
 * - `'clamp'`: clamps coordinates to the surface edge (border pixels repeat).
 * - `'wrap'`: tiles the surface (coordinates wrap modulo surface size).
 * - `'mirror'`: mirrors the surface at each edge.
 * - `'transparent'`: out-of-bounds pixels are treated as transparent black.
 */
export type BitmapEdgeMode = 'clamp' | 'mirror' | 'transparent' | 'wrap';

export type BitmapResizeMode = 'bicubic' | 'bilinear' | 'nearest';

export type BitmapBevelType = 'both' | 'inner' | 'outer';

export interface BitmapBevelOptions {
  /** Light direction in radians, pointing toward the light source. Default π/4. */
  angle?: number;
  /** Sampling offset along the light axis, in pixels. Default 4. */
  distance?: number;
  radiusX?: number;
  radiusY?: number;
  passes?: number;
  /** Packed 0xRRGGBBAA color of the lit edge. Default 0xffffffff. */
  // Packed sRGB RGBA (`0xRRGGBBAA`); the offscreen tint reads all four channels. Default 0xffffffff.
  // ★ BevelEffect.highlightColor, the render-tier sibling, is 24-bit RGB — the two tiers differ.
  highlightColor?: number;
  /** Packed 0xRRGGBBAA color of the shaded edge. Default 0x000000ff. */
  // Packed sRGB RGBA (`0xRRGGBBAA`). Default 0x000000ff.
  shadowColor?: number;
  /** Overall intensity multiplier. Default 1. */
  intensity?: number;
  /** Where the bevel is drawn relative to the shape. Default 'inner'. */
  type?: BitmapBevelType;
}

export interface BitmapBoxBlurOptions {
  radiusX?: number;
  radiusY?: number;
  passes?: number;
}

export interface BitmapConvolutionOptions {
  bias?: number;
  /** How to handle kernel samples outside the surface. Default 'clamp'. */
  edge?: BitmapEdgeMode;
  divisor?: number;
  matrix: ReadonlyArray<number>;
  matrixX: number;
  matrixY: number;
  preserveAlpha?: boolean;
}

export interface BitmapDropShadowOptions extends BitmapShadowBlurOptions {
  /** Packed 0xRRGGBBAA shadow color. Default 0x000000ff (opaque black). */
  // Packed sRGB RGBA (`0xRRGGBBAA`); the offscreen tint reads all four channels. Default 0x000000ff.
  // ★ DropShadowEffect.color, the render-tier sibling, is 24-bit RGB — the two tiers differ.
  color?: number;
  /** Overall intensity multiplier applied to the shadow alpha. Default 1. */
  intensity?: number;
}

export interface BitmapGlowOptions extends BitmapShadowBlurOptions {
  /** Packed 0xRRGGBBAA glow color. Default 0xff0000ff (opaque red). */
  // Packed sRGB RGBA (`0xRRGGBBAA`). Default 0xff0000ff.
  color?: number;
  /** Overall intensity multiplier applied to the glow alpha. Default 1. */
  intensity?: number;
}

export interface BitmapGradientBevelOptions {
  /** Light direction in radians, pointing toward the light source. Default π/4. */
  angle?: number;
  /** Sampling offset along the light axis, in pixels. Default 4. */
  distance?: number;
  radiusX?: number;
  radiusY?: number;
  passes?: number;
  /** Overall opacity multiplier. Default 1. */
  intensity?: number;
  /** Where the bevel is drawn relative to the shape. Default 'inner'. */
  type?: BitmapBevelType;
}

export interface BitmapGradientGlowOptions {
  radiusX?: number;
  radiusY?: number;
  passes?: number;
  /** Overall opacity multiplier. Default 1. */
  intensity?: number;
}

export interface BitmapInnerGlowOptions extends BitmapShadowBlurOptions {
  /** Packed 0xRRGGBBAA inner glow color. Default 0xff0000ff (opaque red). */
  // Packed sRGB RGBA (`0xRRGGBBAA`). Default 0xff0000ff.
  color?: number;
  /** Overall intensity multiplier applied to the glow alpha. Default 1. */
  intensity?: number;
}

export interface BitmapInnerShadowOptions extends BitmapShadowBlurOptions {
  /** Packed 0xRRGGBBAA inner shadow color. Default 0x000000ff (opaque black). */
  // Packed sRGB RGBA (`0xRRGGBBAA`). Default 0x000000ff.
  color?: number;
  /** Overall intensity multiplier applied to the shadow alpha. Default 1. */
  intensity?: number;
  /**
   * Pixel offset of the shadow inside the shape, from the filter's angle+distance (dx = cos(angle) *
   * distance, dy = sin(angle) * distance; see getShadowFilterOffset). The inverted-alpha field is
   * sampled shifted by (offsetX, offsetY) before the blur, so the shadow lands off-center against the
   * boundary — the Photoshop/OpenFL inner-shadow construction. Default 0 (shadow centered on the edge).
   */
  offsetX?: number;
  offsetY?: number;
}

export interface BitmapShadowBlurOptions {
  radiusX?: number;
  radiusY?: number;
  passes?: number;
}

export interface BitmapSharpenOptions {
  /** Sharpen strength. 0 is a no-op; 1 is a moderate sharpen; >1 is stronger. Default 1. */
  amount?: number;
  /** Blur radius of the unsharp mask, in pixels. Larger radii sharpen coarser detail. Default 2. */
  radiusX?: number;
  radiusY?: number;
  /** Blur pass count, forwarded to the box blur. Default 1. */
  passes?: number;
}

export interface BitmapResizeOptions {
  mode?: BitmapResizeMode;
  edgeMode?: BitmapEdgeMode;
  /**
   * When true, pre-multiplies alpha before interpolation and unpremultiplies
   * after. This prevents the dark-halo bleed that bilinear and bicubic sampling
   * produce at semi-transparent edges when blending in straight-alpha space.
   */
  premultiplied?: boolean;
}

export interface BitmapHistogram {
  alpha: number[];
  blue: number[];
  green: number[];
  red: number[];
}

/**
 * A coarse, downscaled RGB summary of a bitmap used for tolerant visual-regression checks (see
 * createBitmapFingerprint). The bitmap is reduced to a gridSize × gridSize grid of averaged RGB
 * cells, so sub-pixel antialiasing and minor jitter — which break an exact pixel hash — wash out,
 * while gross changes (blank output, wrong colour, large layout shifts) still register. Small enough
 * to commit as text instead of a PNG (see formatBitmapFingerprint / parseBitmapFingerprint).
 */
export interface BitmapFingerprint extends BitmapEntity {
  /** Cells per axis; the grid is gridSize × gridSize. */
  readonly gridSize: number;
  /** Row-major averaged cells, three bytes (R, G, B) each: length gridSize × gridSize × 3. */
  readonly cells: number[];
}

/**
 * The result of a tolerant pixel comparison of two equally sized surfaces (see getBitmapMismatch).
 * A pixel counts as mismatched when its largest RGBA channel difference exceeds the comparison's
 * per-channel tolerance. Used for cross-backend differential checks and regression gates that must
 * allow sub-pixel antialiasing noise while still catching real divergence.
 */
export interface BitmapMismatch {
  /** Pixels whose maximum channel difference exceeded the tolerance. */
  readonly mismatchedPixels: number;
  /** Total pixels compared (width × height). */
  readonly totalPixels: number;
  /** mismatchedPixels / totalPixels, in the range 0..1. */
  readonly fraction: number;
  /** The largest single-channel absolute difference seen across all pixels, 0..255. */
  readonly maxChannelDelta: number;
}

export interface BitmapEncodeFailureExplanation {
  readonly format: ImageFormat;
  readonly reason: 'backend-not-installed' | 'format-unsupported';
}

// Plain-data answer to "why did createBitmapFromImageSource return null?", the pull half of the
// diagnostics convention for CPU readback. Recomputed on demand by explainBitmapReadback against the
// same seam the constructor uses, holding no reference to the source. Format for humans in a separate
// format* companion, never here.
export interface BitmapReadbackExplanation {
  // The readback would succeed. When false, createBitmapFromImageSource returns null for `reason`.
  readonly readable: boolean;
  readonly reason: BitmapReadbackBlockReason;
}

// `ok` — the readback succeeds.
// `tainted-source` — the source is cross-origin without CORS approval, so drawing it taints the
//   scratch canvas and the platform refuses to hand back its pixels. A same-origin source, or a
//   cross-origin one served with permissive CORS headers and requested with `crossOrigin`, is
//   readable; nothing about the image itself can be changed after the fact to make it so.
// `backend-not-installed` — no host or custom readback backend has been enabled.
// `no-canvas` — the selected backend cannot allocate a 2D scratch canvas in this host.
// `empty-size` — the requested capture is zero or negative in a dimension, so there are no pixels to
//   read. Distinguished from a failure because it is a caller arithmetic error, not a platform one.
export type BitmapReadbackBlockReason = 'backend-not-installed' | 'empty-size' | 'no-canvas' | 'ok' | 'tainted-source';

/**
 * Mutable, CPU-readable pixel bytes. Bitmap is a sibling of Image rather than a subtype:
 * converting between raw pixels and a host-drawable image is an explicit allocating operation.
 */
export interface Bitmap extends TextureSource {
  readonly data: Uint8Array<ArrayBuffer>;
  format: PixelFormat;
  readonly kind: typeof BitmapTextureSourceKind;
}

export interface BitmapRegion {
  height: number;
  bitmap: Bitmap;
  width: number;
  x: number;
  y: number;
}

// Synchronous Bitmap encoding implemented by a host or native codec. `supportedFormats` is plain
// capability data so callers can explain an unsupported-format sentinel without invoking the encoder.
export interface HostBitmapEncodeCapability {
  encodeBitmap(source: Readonly<Bitmap>, format: ImageFormat, quality: number): Uint8Array;
  readonly supportedFormats: readonly ImageFormat[];
}

export type BitmapEncodeOperation = Exclude<keyof HostBitmapEncodeCapability, 'supportedFormats'>;

// `probe` settles only expected source/canvas refusal with one pixel and never allocates a Bitmap.
// `bitmap` performs the full read and returns the materialized Bitmap on success.
export type BitmapReadbackMode = 'bitmap' | 'probe';

export type BitmapReadbackBackendReason = Exclude<BitmapReadbackBlockReason, 'backend-not-installed' | 'empty-size'>;

export interface BitmapReadbackOutcome {
  readonly bitmap: Bitmap | null;
  readonly reason: BitmapReadbackBackendReason;
}

export interface HostBitmapReadbackCapability {
  readBitmap(source: CanvasImageSource, width: number, height: number, mode: BitmapReadbackMode): BitmapReadbackOutcome;
}

export type BitmapDisplacementMapMode = 'clamp' | 'color' | 'ignore' | 'wrap';

export interface BitmapDisplacementMapOptions {
  /** Map bitmap whose channels drive the per-pixel displacement. */
  map: Readonly<BitmapRegion>;
  /** Channel index (0=R, 1=G, 2=B, 3=A) of `map` that drives X displacement. Default 0. */
  componentX?: number;
  /** Channel index (0=R, 1=G, 2=B, 3=A) of `map` that drives Y displacement. Default 1. */
  componentY?: number;
  /**
   * X displacement scale in pixels. A map value of 128 produces no shift; 0
   * shifts by -0.5 × scaleX; 255 shifts by +0.5 × scaleX. Default 0.
   */
  scaleX?: number;
  /** Y displacement scale in pixels. Default 0. */
  scaleY?: number;
  /** How to handle sample positions that fall outside the source region. Default 'wrap'. */
  mode?: BitmapDisplacementMapMode;
  /**
   * Standard edge mode — when set, overrides `mode` for standard edge behaviours.
   * Use for API consistency with other bitmap geometric ops. Default undefined
   * (falls back to `mode`).
   */
  edgeMode?: BitmapEdgeMode;
  /** Packed 0xRRGGBBAA fill used when `mode` is 'color'. Default 0. */
  // Packed sRGB RGBA (`0xRRGGBBAA`), the color written where the displaced sample falls outside.
  fillColor?: number;
}

// Channel selector for per-channel bitmap operations (copyBitmapChannel, displacement maps). Values are
// the byte offsets of each channel within an RGBA8 pixel.
export const ImageChannel = {
  Red: 0,
  Green: 1,
  Blue: 2,
  Alpha: 3,
};

export type ImageChannel = (typeof ImageChannel)[keyof typeof ImageChannel];
