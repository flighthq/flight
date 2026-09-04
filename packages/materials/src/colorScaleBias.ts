import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { ColorScaleBias, ColorScaleBiasLike } from '@flighthq/types/contract';

export function cloneColorScaleBias(source: Readonly<ColorScaleBiasLike>): ColorScaleBias {
  return createColorScaleBias(source);
}

export function concatColorScaleBias(
  out: ColorScaleBiasLike,
  source: Readonly<ColorScaleBiasLike>,
  other: Readonly<ColorScaleBiasLike>,
): void {
  out.redBias = source.redScale * other.redBias + source.redBias;
  out.greenBias = source.greenScale * other.greenBias + source.greenBias;
  out.blueBias = source.blueScale * other.blueBias + source.blueBias;
  out.alphaBias = source.alphaScale * other.alphaBias + source.alphaBias;
  out.redScale = source.redScale * other.redScale;
  out.greenScale = source.greenScale * other.greenScale;
  out.blueScale = source.blueScale * other.blueScale;
  out.alphaScale = source.alphaScale * other.alphaScale;
}

export function copyColorScaleBias(out: ColorScaleBiasLike, source: Readonly<ColorScaleBiasLike>): void {
  out.redScale = source.redScale;
  out.greenScale = source.greenScale;
  out.blueScale = source.blueScale;
  out.alphaScale = source.alphaScale;
  out.redBias = source.redBias;
  out.greenBias = source.greenBias;
  out.blueBias = source.blueBias;
  out.alphaBias = source.alphaBias;
}

export function copyColorScaleBiasToArrays(
  outColorScales: number[],
  outColorBiases: number[],
  source: Readonly<ColorScaleBiasLike>,
): void {
  outColorScales[0] = source.redScale;
  outColorScales[1] = source.greenScale;
  outColorScales[2] = source.blueScale;
  outColorScales[3] = source.alphaScale;
  outColorBiases[0] = source.redBias;
  outColorBiases[1] = source.greenBias;
  outColorBiases[2] = source.blueBias;
  outColorBiases[3] = source.alphaBias;
}

export function createColorScaleBias(opts?: Readonly<Partial<ColorScaleBiasLike>>): ColorScaleBias {
  const out = allocateEntity<ColorScaleBias>();
  out.redScale = opts?.redScale ?? 1;
  out.greenScale = opts?.greenScale ?? 1;
  out.blueScale = opts?.blueScale ?? 1;
  out.alphaScale = opts?.alphaScale ?? 1;
  out.redBias = opts?.redBias ?? 0;
  out.greenBias = opts?.greenBias ?? 0;
  out.blueBias = opts?.blueBias ?? 0;
  out.alphaBias = opts?.alphaBias ?? 0;
  return finishEntity(out);
}

export function equalsColorScaleBias(a: Readonly<ColorScaleBiasLike>, b: Readonly<ColorScaleBiasLike>): boolean {
  return equalsColorScaleBiasBiases(a, b) && equalsColorScaleBiasScales(a, b);
}

export function equalsColorScaleBiasBiases(
  a: Readonly<ColorScaleBiasLike>,
  b: Readonly<ColorScaleBiasLike>,
  compareAlpha: boolean = true,
): boolean {
  return (
    a.redBias === b.redBias &&
    a.greenBias === b.greenBias &&
    a.blueBias === b.blueBias &&
    (!compareAlpha || a.alphaBias === b.alphaBias)
  );
}

export function equalsColorScaleBiasScales(
  a: Readonly<ColorScaleBiasLike>,
  b: Readonly<ColorScaleBiasLike>,
  compareAlpha: boolean = true,
): boolean {
  return (
    a.redScale === b.redScale &&
    a.greenScale === b.greenScale &&
    a.blueScale === b.blueScale &&
    (!compareAlpha || a.alphaScale === b.alphaScale)
  );
}

export function getColorScaleBiasBiasRgb(source: Readonly<ColorScaleBiasLike>): number {
  return (
    (Math.round(source.redBias * 255) << 16) |
    (Math.round(source.greenBias * 255) << 8) |
    Math.round(source.blueBias * 255)
  );
}

export function getColorScaleBiasBiasRgba(source: Readonly<ColorScaleBiasLike>): number {
  return (
    (Math.round(source.redBias * 255) << 24) |
    (Math.round(source.greenBias * 255) << 16) |
    (Math.round(source.blueBias * 255) << 8) |
    Math.round(source.alphaBias * 255)
  );
}

export function invertColorScaleBias(out: ColorScaleBiasLike, source: Readonly<ColorScaleBiasLike>): void {
  out.redScale = source.redScale !== 0 ? 1 / source.redScale : 1;
  out.greenScale = source.greenScale !== 0 ? 1 / source.greenScale : 1;
  out.blueScale = source.blueScale !== 0 ? 1 / source.blueScale : 1;
  out.alphaScale = source.alphaScale !== 0 ? 1 / source.alphaScale : 1;
  out.redBias = -source.redBias;
  out.greenBias = -source.greenBias;
  out.blueBias = -source.blueBias;
  out.alphaBias = -source.alphaBias;
}

export function isIdentityColorScaleBias(
  source: Readonly<ColorScaleBiasLike>,
  compareAlphaScale: boolean = true,
): boolean {
  return (
    equalsColorScaleBiasBiases(source, _identity) && equalsColorScaleBiasScales(source, _identity, compareAlphaScale)
  );
}

export function setColorScaleBias(
  out: ColorScaleBiasLike,
  redScale: number,
  greenScale: number,
  blueScale: number,
  alphaScale: number,
  redBias: number,
  greenBias: number,
  blueBias: number,
  alphaBias: number,
): void {
  out.redScale = redScale;
  out.greenScale = greenScale;
  out.blueScale = blueScale;
  out.alphaScale = alphaScale;
  out.redBias = redBias;
  out.greenBias = greenBias;
  out.blueBias = blueBias;
  out.alphaBias = alphaBias;
}

export function setColorScaleBiasBiasRgb(out: ColorScaleBiasLike, value: number): void {
  out.redBias = ((value >> 16) & 0xff) / 255;
  out.greenBias = ((value >> 8) & 0xff) / 255;
  out.blueBias = (value & 0xff) / 255;
  out.alphaBias = 0;
  out.redScale = 0;
  out.greenScale = 0;
  out.blueScale = 0;
  out.alphaScale = 1;
}

export function setColorScaleBiasBiasRgba(out: ColorScaleBiasLike, value: number): void {
  out.redBias = ((value >> 24) & 0xff) / 255;
  out.greenBias = ((value >> 16) & 0xff) / 255;
  out.blueBias = ((value >> 8) & 0xff) / 255;
  out.alphaBias = (value & 0xff) / 255;
  out.redScale = 0;
  out.greenScale = 0;
  out.blueScale = 0;
  out.alphaScale = 0;
}

export function setColorScaleBiasIdentity(out: ColorScaleBias): void {
  setColorScaleBias(out, 1, 1, 1, 1, 0, 0, 0, 0);
}

const _identity: ColorScaleBias = createColorScaleBias();
