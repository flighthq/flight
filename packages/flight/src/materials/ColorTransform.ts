import { colorTransform } from '@flighthq/materials';
import type { ColorTransform as ColorTransformModel } from '@flighthq/types';

export default class ColorTransform {
  public readonly model: ColorTransformModel;

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
    this.model = colorTransform.create();
    colorTransform.setTo(
      this.model,
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
    return ColorTransform.fromModel(this.model);
  }

  concat(other: Readonly<ColorTransform>): void {
    colorTransform.concat(this.model, this.model, other.model);
  }

  copyFrom(source: Readonly<ColorTransform>): void {
    colorTransform.copy(this.model, source.model);
  }

  equals(b: Readonly<ColorTransform>): boolean {
    if (!b) return false;
    return colorTransform.equals(this.model, b.model);
  }

  static fromModel(model: Readonly<ColorTransformModel>): ColorTransform {
    const out = new ColorTransform();
    colorTransform.copy(out.model, model);
    return out;
  }

  identity(): void {
    colorTransform.identity(this.model);
  }

  invert(): void {
    colorTransform.invert(this.model, this.model);
  }

  isIdentity(compareAlphaMultiplier: boolean = true): boolean {
    return colorTransform.isIdentity(this.model, compareAlphaMultiplier);
  }

  multiplierEquals(a: Readonly<ColorTransform>, b: Readonly<ColorTransform>, compareAlpha: boolean = true): boolean {
    return colorTransform.multiplierEquals(this.model, b.model, compareAlpha);
  }

  offsetEquals(b: Readonly<ColorTransform>, compareAlpha: boolean = true): boolean {
    return colorTransform.offsetEquals(this.model, b.model, compareAlpha);
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
      this.model,
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
    colorTransform.toArrays(outColorMultipliers, outColorOffsets, this.model);
  }

  // Get & Set Methods

  get redMultiplier(): number {
    return this.model.redMultiplier;
  }

  set redMultiplier(value: number) {
    this.model.redMultiplier = value;
  }

  get greenMultiplier(): number {
    return this.model.greenMultiplier;
  }

  set greenMultiplier(value: number) {
    this.model.greenMultiplier = value;
  }

  get blueMultiplier(): number {
    return this.model.blueMultiplier;
  }

  set blueMultiplier(value: number) {
    this.model.blueMultiplier = value;
  }

  get alphaMultiplier(): number {
    return this.model.alphaMultiplier;
  }

  set alphaMultiplier(value: number) {
    this.model.alphaMultiplier = value;
  }

  get redOffset(): number {
    return this.model.redOffset;
  }

  set redOffset(value: number) {
    this.model.redOffset = value;
  }

  get greenOffset(): number {
    return this.model.greenOffset;
  }

  set greenOffset(value: number) {
    this.model.greenOffset = value;
  }

  get blueOffset(): number {
    return this.model.blueOffset;
  }

  set blueOffset(value: number) {
    this.model.blueOffset = value;
  }

  get alphaOffset(): number {
    return this.model.alphaOffset;
  }

  set alphaOffset(value: number) {
    this.model.alphaOffset = value;
  }

  get offsetRGB(): number {
    return colorTransform.getOffsetRGB(this.model);
  }

  set offsetRGB(value: number) {
    colorTransform.setOffsetRGB(this.model, value);
  }

  get offsetRGBA(): number {
    return colorTransform.getOffsetRGBA(this.model);
  }

  set offsetRGBA(value: number) {
    colorTransform.setOffsetRGBA(this.model, value);
  }
}
