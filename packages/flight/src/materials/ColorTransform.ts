import { colorTransform } from '@flighthq/materials';
import type { ColorTransform as ColorTransformType } from '@flighthq/types';

export default class ColorTransform {
  public readonly value: ColorTransformType;

  constructor(
    redMultiplier = 1,
    greenMultiplier = 1,
    blueMultiplier = 1,
    alphaMultiplier = 1,
    redOffset = 0,
    greenOffset = 0,
    blueOffset = 0,
    alphaOffset = 0,
  ) {
    this.value = colorTransform.create();
    colorTransform.setTo(
      this.value,
      redMultiplier,
      greenMultiplier,
      blueMultiplier,
      alphaMultiplier,
      redOffset,
      greenOffset,
      blueOffset,
      alphaOffset,
    );
  }

  clone(): ColorTransform {
    return ColorTransform.fromType(this.value);
  }

  concat(other: Readonly<ColorTransform>): void {
    colorTransform.concat(this.value, this.value, other.value);
  }

  copyFrom(source: Readonly<ColorTransform>): void {
    colorTransform.copy(this.value, source.value);
  }

  equals(b: Readonly<ColorTransform>): boolean {
    if (!b) return false;
    return colorTransform.equals(this.value, b.value);
  }

  static fromType(value: Readonly<ColorTransformType>): ColorTransform {
    const out = new ColorTransform();
    colorTransform.copy(out.value, value);
    return out;
  }

  identity(): void {
    colorTransform.identity(this.value);
  }

  invert(): void {
    colorTransform.invert(this.value, this.value);
  }

  isIdentity(compareAlphaMultiplier: boolean = true): boolean {
    return colorTransform.isIdentity(this.value, compareAlphaMultiplier);
  }

  multiplierEquals(a: Readonly<ColorTransform>, b: Readonly<ColorTransform>, compareAlpha: boolean = true): boolean {
    return colorTransform.multiplierEquals(this.value, b.value, compareAlpha);
  }

  offsetEquals(b: Readonly<ColorTransform>, compareAlpha: boolean = true): boolean {
    return colorTransform.offsetEquals(this.value, b.value, compareAlpha);
  }

  setTo(
    redMultiplier: number,
    greenMultiplier: number,
    blueMultiplier: number,
    alphaMultiplier: number,
    redOffset: number,
    greenOffset: number,
    blueOffset: number,
    alphaOffset: number,
  ): void {
    colorTransform.setTo(
      this.value,
      redMultiplier,
      greenMultiplier,
      blueMultiplier,
      alphaMultiplier,
      redOffset,
      greenOffset,
      blueOffset,
      alphaOffset,
    );
  }

  toArrays(outColorMultipliers: number[], outColorOffsets: number[]): void {
    colorTransform.toArrays(outColorMultipliers, outColorOffsets, this.value);
  }

  // Get & Set Methods

  get redMultiplier(): number {
    return this.value.redMultiplier;
  }

  set redMultiplier(value: number) {
    this.value.redMultiplier = value;
  }

  get greenMultiplier(): number {
    return this.value.greenMultiplier;
  }

  set greenMultiplier(value: number) {
    this.value.greenMultiplier = value;
  }

  get blueMultiplier(): number {
    return this.value.blueMultiplier;
  }

  set blueMultiplier(value: number) {
    this.value.blueMultiplier = value;
  }

  get alphaMultiplier(): number {
    return this.value.alphaMultiplier;
  }

  set alphaMultiplier(value: number) {
    this.value.alphaMultiplier = value;
  }

  get redOffset(): number {
    return this.value.redOffset;
  }

  set redOffset(value: number) {
    this.value.redOffset = value;
  }

  get greenOffset(): number {
    return this.value.greenOffset;
  }

  set greenOffset(value: number) {
    this.value.greenOffset = value;
  }

  get blueOffset(): number {
    return this.value.blueOffset;
  }

  set blueOffset(value: number) {
    this.value.blueOffset = value;
  }

  get alphaOffset(): number {
    return this.value.alphaOffset;
  }

  set alphaOffset(value: number) {
    this.value.alphaOffset = value;
  }

  get offsetRGB(): number {
    return colorTransform.getOffsetRGB(this.value);
  }

  set offsetRGB(value: number) {
    colorTransform.setOffsetRGB(this.value, value);
  }

  get offsetRGBA(): number {
    return colorTransform.getOffsetRGBA(this.value);
  }

  set offsetRGBA(value: number) {
    colorTransform.setOffsetRGBA(this.value, value);
  }
}
