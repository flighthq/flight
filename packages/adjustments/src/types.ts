import type { EntityRaw, EntityRuntime, EntityRuntimeKey, EntityWithoutRuntime } from '@flighthq/entity/contract';

// Substrate-agnostic pointwise value-remap intents. Each is plain data carrying a `kind` discriminant;
// a stack of adjustments (a plain `readonly Adjustment[]`) fuses into ONE artifact as data — a single
// 4×5 color matrix (linear ops) or one baked LUT (arbitrary value→value) — and folds into the draw,
// never bouncing through an offscreen pass. This is the fuse-and-fold sibling of the chain-and-bounce
// Effect; see agents/effect-adjustment-architecture.md for the full model.
// Adjustment is an open base contract: a new adjustment is added by defining its interface (extending
// Adjustment with a literal `kind`) and contributing its matrix/LUT — no central union to edit here.
// There is deliberately no container/wrapper type: the plural is a function name, not an invented noun.

// Open base contract for every pointwise adjustment. The `kind` is the canonical PascalCase type name
// and the registry key a per-backend realization is registered against.
export interface Adjustment extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  kind: AdjustmentKind;
}

/**
 * Identifies a pointwise value-remap adjustment for realization dispatch. An open-registry string
 * key: the canonical PascalCase type name (`'ColorScaleBiasAdjustment'`, `'Brightness'`), simultaneously the
 * registry key and the serialized form. Third-party adjustments namespace with a vendor prefix
 * (`'acme.Duotone'`). Concrete kinds are declared by the packages that own them.
 */
export type AdjustmentKind = string;

export interface BrightnessContrastAdjustment extends ColorMatrixAdjustment {
  kind: 'BrightnessContrastAdjustment';
  brightness?: number; // additive offset around mid-grey, 0 = neutral. Default 0.
  contrast?: number; // multiplier about mid-grey 0.5, 1 = neutral. Default 1.
}

export interface ChannelMixerAdjustment extends ColorMatrixAdjustment {
  kind: 'ChannelMixerAdjustment';
  matrix: readonly number[]; // 3×4 row-major RGB->RGB plus per-row offset (offsets in normalized 0–1). Default identity.
}

// Pointwise color-adjustment authoring and its fused bind caches live on the base Node runtime so one
// dimension-agnostic API serves 2D and 3D. Null is the allocation-free untinted default.
export interface ColorAdjustmentRuntime {
  colorAdjustments: readonly Adjustment[] | null;
  // True only when the stack contains a non-matrix operation that neither compact nor 4×5 data can carry.
  colorAdjustmentsUnsupported: boolean;
  // Full fused 4×5 matrix when the stack mixes channels; null for the common diagonal-affine path.
  resolvedColorMatrix: Readonly<Float32Array> | null;
  resolvedColorScaleBias: ColorScaleBias | null;
}

// The color-vision-deficiency variants a ColorBlindSimulationAdjustment can bake. The three dichromacies
// (protan/deutan/tritan -opia) plus their anomalous-trichromacy (-omaly) partial forms and the two
// monochromacies (achromatopsia = full, achromatomaly = partial).
export type ColorBlindType =
  | 'protanopia'
  | 'deuteranopia'
  | 'tritanopia'
  | 'protanomaly'
  | 'deuteranomaly'
  | 'tritanomaly'
  | 'achromatopsia'
  | 'achromatomaly';

export interface ColorBlindSimulationAdjustment extends ColorMatrixAdjustment {
  kind: 'ColorBlindSimulationAdjustment';
  type?: ColorBlindType; // which deficiency to simulate. Default 'deuteranopia'.
}

// The full pointwise color grade as one LUT-tier adjustment: exposure/brightness/contrast/saturation/
// temperature/tint (the linear-ish tone controls) plus a lift/gamma/gain scene2d (shadows/midtones/
// highlights). All fields default to neutral, so a grade setting only some fields leaves the rest
// unchanged. Because gamma makes the composite nonlinear, the whole grade bakes into one ColorLut.
export interface ColorGradeAdjustment extends ColorLutAdjustment {
  kind: 'ColorGradeAdjustment';
  exposure?: number; // exposure in stops, 0 = unchanged.
  brightness?: number; // additive brightness, 0 = unchanged.
  contrast?: number; // contrast multiplier about mid-grey, 1 = unchanged.
  saturation?: number; // saturation multiplier, 1 = unchanged.
  temperature?: number; // warm(+)/cool(-) shift, 0 = unchanged.
  tint?: number; // green(+)/magenta(-) shift, 0 = unchanged.
  lift?: number; // packed RGBA shadow offset, neutral 0x000000ff.
  gamma?: number; // packed RGBA midtone gamma, neutral 0x808080ff.
  gain?: number; // packed RGBA highlight gain, neutral 0xffffffff.
}

// A baked 3D color lookup table: the LUT-tier fuse artifact. A stack of pointwise adjustments whose
// composition is not a pure affine matrix (gamma, hue/saturation, posterize, a supplied grade LUT)
// bakes into ONE ColorLut — `size³` RGB cells sampling the composed rgb→rgb function on the unit cube —
// and folds into the draw as a single trilinear texture tap instead of one pass per op. `samples` holds
// `size³ · 3` values in `[0, 1]`, R fastest then G then B: cell (ri, gi, bi) starts at
// `((bi · size + gi) · size + ri) · 3`. Larger `size` reduces banding at a memory/upload cost (default 32).
export interface ColorLut {
  size: number;
  samples: readonly number[];
}

// A LUT-tier adjustment: its pointwise value remap is an arbitrary rgb→rgb function (`transform`), not a
// pure affine matrix. Carrying `transform` is what makes an adjustment LUT-tier, independent of `kind`: a
// run of consecutive pointwise adjustments containing any LUT-tier member bakes the WHOLE run (matrices
// folded in) into one ColorLut and applies it in a single trilinear pass, never one pass per op. A
// third-party adjustment that contributes a `transform` fuses through the same path.
export interface ColorLutAdjustment extends Adjustment {
  transform: ColorTransformFunction;
}

// A single-slot memo of the fused color LUT for a run of pointwise adjustments, so a static grade does
// not re-bake its size³ cells every frame. `signature` is the run's content key — its ops' kinds and
// serialized params, with the `transform` closures excluded (an adjustment must be fully determined by
// its serialized data, the data-fed contract) — and `lut` is the ColorLut baked for that signature,
// reused by reference on a hit so GPU-upload caches can skip re-uploading by identity. Owned by the
// effect pipeline; plain GC-managed memory, so resetting it is dropping the references. See
// bakeColorLutForRun in @flighthq/adjustments.
export interface ColorLutCache extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  signature: string | null;
  lut: ColorLut | null;
}

// A matrix-tier adjustment: its pointwise value remap is a pure affine 4×5 color matrix (the
// @flighthq/adjustments colorMatrixMath convention — linear RGBA coefficients with a normalized bias
// column). Carrying `colorMatrix` is what makes an adjustment matrix-tier and fusable, independent of
// `kind`: a run of consecutive matrix-tier adjustments in an effect stack composes into ONE matrix
// (concatColorMatrix) and folds into a single generic color-matrix pass, never one pass per op. A
// third-party adjustment that contributes a `colorMatrix` fuses through the same path.
export interface ColorMatrixAdjustment extends Adjustment {
  colorMatrix: Readonly<Float32Array>;
}

/**
 * Per-channel affine color adjustment: `out = in * scale + bias`.
 *
 * Scale is dimensionless. Bias is an unbounded normalized-linear float, where `1` adds one full
 * channel of intensity; byte-domain consumers convert it at their boundary.
 */
export interface ColorScaleBias extends EntityRaw {
  [EntityRuntimeKey]: EntityRuntime | undefined;
  alphaScale: number;
  alphaBias: number;
  blueScale: number;
  blueBias: number;
  greenScale: number;
  greenBias: number;
  redScale: number;
  redBias: number;
}

export type ColorScaleBiasLike = EntityWithoutRuntime<ColorScaleBias>;

// Explicit per-channel `out = in * scale + bias` adjustment. Biases are normalized-linear, unbounded
// floats. `colorMatrix` is carried alongside the legible payload so it fuses through the same
// matrix-tier path as every semantic adjustment.
export interface ColorScaleBiasAdjustment extends ColorMatrixAdjustment {
  colorScaleBias: Readonly<ColorScaleBiasLike>;
  kind: 'ColorScaleBiasAdjustment';
}

// A pointwise rgb→rgb value remap on normalized `[0, 1]` color, the LUT-tier's composable unit. Reads
// (r, g, b) and writes the remapped color into `out` (length-3, R/G/B). Alpha is not an input — the LUT
// is a 3D rgb cube — so a transform that needs alpha belongs in the Effect tier, not here. A stack of
// these composes by function composition and bakes into one ColorLut (bakeColorLut); a matrix-tier
// adjustment contributes one of these too (its 4×5 matrix evaluated at opaque alpha), so a mixed run
// still bakes into a single LUT.
export type ColorTransformFunction = (out: [number, number, number], r: number, g: number, b: number) => void;

// Linear exposure as a matrix-tier adjustment: a `2^exposure` scalar multiply on RGB. The baked matrix
// runs through the default rgba8 pipeline, which clamps to [0,1] — correct SDR exposure. An unclamped
// HDR exposure variant (writing values >1 to a float target) is a future add; it cannot fold through
// the clamping color-matrix pass and would be its own realization.
export interface ExposureAdjustment extends ColorMatrixAdjustment {
  kind: 'ExposureAdjustment';
  exposure?: number; // stops, applied as 2^exposure. Default 0 (identity).
}

export interface GrayscaleAdjustment extends ColorMatrixAdjustment {
  kind: 'GrayscaleAdjustment';
  intensity?: number; // 0..1 mix toward luma (ITU-R BT.709). Default 1.
}

export interface HueSaturationAdjustment extends ColorLutAdjustment {
  kind: 'HueSaturationAdjustment';
  hue?: number; // degrees of hue rotation. Default 0.
  saturation?: number; // saturation multiplier, 1 = unchanged. Default 1.
  lightness?: number; // additive lightness in [-1, 1], 0 = unchanged. Default 0.
}

export interface InvertAdjustment extends ColorMatrixAdjustment {
  kind: 'InvertAdjustment';
  intensity?: number; // 0 = original, 1 = fully inverted. Default 1.
}

export interface LiftGammaGainAdjustment extends ColorLutAdjustment {
  kind: 'LiftGammaGainAdjustment';
  lift?: number; // packed RGBA shadow offset, neutral 0x000000ff.
  gamma?: number; // packed RGBA midtone gamma, neutral 0x808080ff.
  gain?: number; // packed RGBA highlight gain, neutral 0xffffffff.
}

// A supplied 3D color grade LUT applied at `strength` (0 = original, 1 = full grade). Already a LUT, so
// it carries one directly (`lut`); with no `lut` it is identity (a neutral passthrough). Its `transform`
// samples `lut` and mixes toward it by `strength`, so it fuses with neighbouring adjustments like any
// other LUT-tier op.
export interface LookupTableGradeAdjustment extends ColorLutAdjustment {
  kind: 'LookupTableGradeAdjustment';
  lut?: ColorLut;
  strength?: number; // 0 = original, 1 = full grade. Default 1.
}

export interface SepiaAdjustment extends ColorMatrixAdjustment {
  kind: 'SepiaAdjustment';
  intensity?: number; // 0..1 mix toward the sepia tone. Default 1.
}

// A packed-RGBA tint (`0xRRGGBBAA`) expressed as a matrix-tier adjustment: it multiplies each channel of
// the (premultiplied) pixel by the tint's `r,g,b,a / 255`. It bakes to a diagonal-affine 4×5 `colorMatrix`
// — zero bias, no channel mixing — so it fuses with other matrix-tier adjustments and folds into the draw
// as one uniform via the diagonal fast path (`isAffineColorMatrix`). The common single-tint case, authored
// with `createTintAdjustment` / `setNodeColorAdjustmentsTint`.
export interface TintAdjustment extends ColorMatrixAdjustment {
  kind: 'TintAdjustment';
}
