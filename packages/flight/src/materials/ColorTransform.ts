import { colorTransform } from '@flighthq/materials';
import type { ColorTransform as ColorTransformModel } from '@flighthq/types';

export default class ColorTransform {
  protected _model: ColorTransformModel;

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
    this._model = colorTransform.create();
    colorTransform.setTo(
      this._model,
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
    return ColorTransform.fromModel(this._model);
  }

  concat(other: Readonly<ColorTransform>): void {
    colorTransform.concat(this._model, this._model, other.model);
  }

  copyFrom(source: Readonly<ColorTransform>): void {
    colorTransform.copy(this._model, source.model);
  }

  equals(b: Readonly<ColorTransform>): boolean {
    if (!b) return false;
    return colorTransform.equals(this._model, b.model);
  }

  static fromModel(model: Readonly<ColorTransformModel>): ColorTransform {
    const out = new ColorTransform();
    colorTransform.copy(out.model, model);
    return out;
  }

  identity(): void {
    colorTransform.identity(this._model);
  }

  invert(): void {
    colorTransform.invert(this._model, this._model);
  }

  isIdentity(compareAlphaMultiplier: boolean = true): boolean {
    return colorTransform.isIdentity(this._model, compareAlphaMultiplier);
  }

  multiplierEquals(a: Readonly<ColorTransform>, b: Readonly<ColorTransform>, compareAlpha: boolean = true): boolean {
    return colorTransform.multiplierEquals(this._model, b.model, compareAlpha);
  }

  offsetEquals(b: Readonly<ColorTransform>, compareAlpha: boolean = true): boolean {
    return colorTransform.offsetEquals(this._model, b.model, compareAlpha);
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
      this._model,
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
    colorTransform.toArrays(outColorMultipliers, outColorOffsets, this._model);
  }

  // Get & Set Methods

  get redMultiplier(): number {
    return this._model.redMultiplier;
  }

  set redMultiplier(value: number) {
    this._model.redMultiplier = value;
  }

  get greenMultiplier(): number {
    return this._model.greenMultiplier;
  }

  set greenMultiplier(value: number) {
    this._model.greenMultiplier = value;
  }

  get blueMultiplier(): number {
    return this._model.blueMultiplier;
  }

  set blueMultiplier(value: number) {
    this._model.blueMultiplier = value;
  }

  get alphaMultiplier(): number {
    return this._model.alphaMultiplier;
  }

  set alphaMultiplier(value: number) {
    this._model.alphaMultiplier = value;
  }

  get redOffset(): number {
    return this._model.redOffset;
  }

  set redOffset(value: number) {
    this._model.redOffset = value;
  }

  get greenOffset(): number {
    return this._model.greenOffset;
  }

  set greenOffset(value: number) {
    this._model.greenOffset = value;
  }

  get blueOffset(): number {
    return this._model.blueOffset;
  }

  set blueOffset(value: number) {
    this._model.blueOffset = value;
  }

  get alphaOffset(): number {
    return this._model.alphaOffset;
  }

  set alphaOffset(value: number) {
    this._model.alphaOffset = value;
  }

  get model(): ColorTransformModel {
    return this._model;
  }

  get offsetRGB(): number {
    return colorTransform.getOffsetRGB(this._model);
  }

  set offsetRGB(value: number) {
    colorTransform.setOffsetRGB(this._model, value);
  }

  get offsetRGBA(): number {
    return colorTransform.getOffsetRGBA(this._model);
  }

  set offsetRGBA(value: number) {
    colorTransform.setOffsetRGBA(this._model, value);
  }
}
