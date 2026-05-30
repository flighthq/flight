import { createEntity } from '@flighthq/entity';
import type { ColorTransform } from '@flighthq/types';

export function cloneColorTransform(source: Readonly<ColorTransform>): ColorTransform {
  return createColorTransform(source);
}

export function concatColorTransform(
  out: ColorTransform,
  source: Readonly<ColorTransform>,
  other: Readonly<ColorTransform>,
): void {
  out.redOffset = source.redMultiplier * other.redOffset + source.redOffset;
  out.greenOffset = source.greenMultiplier * other.greenOffset + source.greenOffset;
  out.blueOffset = source.blueMultiplier * other.blueOffset + source.blueOffset;
  out.alphaOffset = source.alphaMultiplier * other.alphaOffset + source.alphaOffset;
  out.redMultiplier = source.redMultiplier * other.redMultiplier;
  out.greenMultiplier = source.greenMultiplier * other.greenMultiplier;
  out.blueMultiplier = source.blueMultiplier * other.blueMultiplier;
  out.alphaMultiplier = source.alphaMultiplier * other.alphaMultiplier;
}

export function copyColorTransform(out: ColorTransform, source: Readonly<ColorTransform>): void {
  out.redMultiplier = source.redMultiplier;
  out.greenMultiplier = source.greenMultiplier;
  out.blueMultiplier = source.blueMultiplier;
  out.alphaMultiplier = source.alphaMultiplier;
  out.redOffset = source.redOffset;
  out.greenOffset = source.greenOffset;
  out.blueOffset = source.blueOffset;
  out.alphaOffset = source.alphaOffset;
}

export function copyColorTransformToArrays(
  outColorMultipliers: number[],
  outColorOffsets: number[],
  source: Readonly<ColorTransform>,
): void {
  outColorMultipliers[0] = source.redMultiplier;
  outColorMultipliers[1] = source.greenMultiplier;
  outColorMultipliers[2] = source.blueMultiplier;
  outColorMultipliers[3] = source.alphaMultiplier;
  outColorOffsets[0] = source.redOffset;
  outColorOffsets[1] = source.greenOffset;
  outColorOffsets[2] = source.blueOffset;
  outColorOffsets[3] = source.alphaOffset;
}

export function createColorTransform(obj?: Partial<ColorTransform>): ColorTransform {
  return createEntity({
    redMultiplier: obj?.redMultiplier ?? 1,
    greenMultiplier: obj?.greenMultiplier ?? 1,
    blueMultiplier: obj?.blueMultiplier ?? 1,
    alphaMultiplier: obj?.alphaMultiplier ?? 1,
    redOffset: obj?.redOffset ?? 0,
    greenOffset: obj?.greenOffset ?? 0,
    blueOffset: obj?.blueOffset ?? 0,
    alphaOffset: obj?.alphaOffset ?? 0,
  });
}

export function equalsColorTransform(a: Readonly<ColorTransform>, b: Readonly<ColorTransform>): boolean {
  return equalsColorTransformOffsets(a, b) && equalsColorTransformMultipliers(a, b);
}

export function equalsColorTransformMultipliers(
  a: Readonly<ColorTransform>,
  b: Readonly<ColorTransform>,
  compareAlpha: boolean = true,
): boolean {
  return (
    a.redMultiplier === b.redMultiplier &&
    a.greenMultiplier === b.greenMultiplier &&
    a.blueMultiplier === b.blueMultiplier &&
    (!compareAlpha || a.alphaMultiplier === b.alphaMultiplier)
  );
}

export function equalsColorTransformOffsets(
  a: Readonly<ColorTransform>,
  b: Readonly<ColorTransform>,
  compareAlpha: boolean = true,
): boolean {
  return (
    a.redOffset === b.redOffset &&
    a.greenOffset === b.greenOffset &&
    a.blueOffset === b.blueOffset &&
    (!compareAlpha || a.alphaOffset === b.alphaOffset)
  );
}

export function getColorTransformOffsetRGB(source: Readonly<ColorTransform>): number {
  return (
    (Math.fround(source.redOffset) << 16) | (Math.fround(source.greenOffset) << 8) | Math.fround(source.blueOffset)
  );
}

export function getColorTransformOffsetRGBA(source: Readonly<ColorTransform>): number {
  return (
    (Math.fround(source.redOffset) << 24) |
    (Math.fround(source.greenOffset) << 16) |
    (Math.fround(source.blueOffset) << 8) |
    Math.fround(source.alphaOffset)
  );
}

export function identityColorTransform(out: ColorTransform): void {
  setColorTransform(out, 1, 1, 1, 1, 0, 0, 0, 0);
}

export function invertColorTransform(out: ColorTransform, source: Readonly<ColorTransform>): void {
  out.redMultiplier = source.redMultiplier !== 0 ? 1 / source.redMultiplier : 1;
  out.greenMultiplier = source.greenMultiplier !== 0 ? 1 / source.greenMultiplier : 1;
  out.blueMultiplier = source.blueMultiplier !== 0 ? 1 / source.blueMultiplier : 1;
  out.alphaMultiplier = source.alphaMultiplier !== 0 ? 1 / source.alphaMultiplier : 1;
  out.redOffset = -source.redOffset;
  out.greenOffset = -source.greenOffset;
  out.blueOffset = -source.blueOffset;
  out.alphaOffset = -source.alphaOffset;
}

export function isIdentityColorTransform(
  source: Readonly<ColorTransform>,
  compareAlphaMultiplier: boolean = true,
): boolean {
  return (
    equalsColorTransformOffsets(source, _identity) &&
    equalsColorTransformMultipliers(source, _identity, compareAlphaMultiplier)
  );
}

export function setColorTransform(
  out: ColorTransform,
  redMultiplier: number,
  greenMultiplier: number,
  blueMultiplier: number,
  alphaMultiplier: number,
  redOffset: number,
  greenOffset: number,
  blueOffset: number,
  alphaOffset: number,
): void {
  out.redMultiplier = redMultiplier;
  out.greenMultiplier = greenMultiplier;
  out.blueMultiplier = blueMultiplier;
  out.alphaMultiplier = alphaMultiplier;
  out.redOffset = redOffset;
  out.greenOffset = greenOffset;
  out.blueOffset = blueOffset;
  out.alphaOffset = alphaOffset;
}

export function setColorTransformOffsetRGB(out: ColorTransform, value: number): void {
  out.redOffset = (value >> 16) & 0xff;
  out.greenOffset = (value >> 8) & 0xff;
  out.blueOffset = value & 0xff;
  out.alphaOffset = 0;
  out.redMultiplier = 0;
  out.greenMultiplier = 0;
  out.blueMultiplier = 0;
  out.alphaMultiplier = 1;
}

export function setColorTransformOffsetRGBA(out: ColorTransform, value: number): void {
  out.redOffset = (value >> 24) & 0xff;
  out.greenOffset = (value >> 16) & 0xff;
  out.blueOffset = (value >> 8) & 0xff;
  out.alphaOffset = value & 0xff;
  out.redMultiplier = 0;
  out.greenMultiplier = 0;
  out.blueMultiplier = 0;
  out.alphaMultiplier = 0;
}

const _identity: ColorTransform = createColorTransform();
