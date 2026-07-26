import type { Entity, EntityWithoutRuntime } from './Entity';

/**
 * Per-channel affine color adjustment: `out = in * scale + bias`.
 *
 * Scale is dimensionless. Bias is an unbounded normalized-linear float, where `1` adds one full
 * channel of intensity; byte-domain consumers convert it at their boundary.
 */
export interface ColorScaleBias extends Entity {
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

/**
 * @deprecated Flash/OpenFL `ColorTransform` maps to Flight's normalized-linear `ColorScaleBias`.
 * Use `ColorScaleBias` and author it with `createColorScaleBiasAdjustment`.
 */
export type ColorTransform = ColorScaleBias;

/** @deprecated Use `ColorScaleBiasLike`. */
export type ColorTransformLike = ColorScaleBiasLike;
