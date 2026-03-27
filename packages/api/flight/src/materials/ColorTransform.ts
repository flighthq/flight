import { colorTransform } from '@flighthq/materials';
import type { ColorTransform as RawColorTransform } from '@flighthq/types';

import FlightObject from '../FlightObject';

export default class ColorTransform extends FlightObject<RawColorTransform> {
  constructor(
    redMultiplier?: number,
    greenMultiplier?: number,
    blueMultiplier?: number,
    alphaMultiplier?: number,
    redOffset?: number,
    greenOffset?: number,
    blueOffset?: number,
    alphaOffset?: number,
  ) {
    super();
    const raw = this.__raw;
    if (redMultiplier !== undefined) raw.redMultiplier = redMultiplier;
    if (greenMultiplier !== undefined) raw.greenMultiplier = greenMultiplier;
    if (blueMultiplier !== undefined) raw.blueMultiplier = blueMultiplier;
    if (alphaMultiplier !== undefined) raw.alphaMultiplier = alphaMultiplier;
    if (redOffset !== undefined) raw.redOffset = redOffset;
    if (greenOffset !== undefined) raw.greenOffset = greenOffset;
    if (blueOffset !== undefined) raw.blueOffset = blueOffset;
    if (alphaOffset !== undefined) raw.alphaOffset = alphaOffset;
  }

  protected override __create() {
    return colorTransform.create();
  }

  clone(): ColorTransform {
    return ColorTransform.fromRaw(this.__raw);
  }

  concat(other: Readonly<ColorTransform>): void {
    colorTransform.concat(this.__raw, this.__raw, other.raw);
  }

  copyFrom(source: Readonly<ColorTransform>): void {
    colorTransform.copy(this.__raw, source.raw);
  }

  equals(b: Readonly<ColorTransform>): boolean {
    if (!b) return false;
    return colorTransform.equals(this.__raw, b.raw);
  }

  static fromRaw(raw: Readonly<RawColorTransform>): ColorTransform {
    return FlightObject.getOrCreate(raw, ColorTransform)!;
  }

  identity(): void {
    colorTransform.identity(this.__raw);
  }

  invert(): void {
    colorTransform.invert(this.__raw, this.__raw);
  }

  isIdentity(compareAlphaMultiplier: boolean = true): boolean {
    return colorTransform.isIdentity(this.__raw, compareAlphaMultiplier);
  }

  multiplierEquals(b: Readonly<ColorTransform>, compareAlpha: boolean = true): boolean {
    return colorTransform.multiplierEquals(this.__raw, b.raw, compareAlpha);
  }

  offsetEquals(b: Readonly<ColorTransform>, compareAlpha: boolean = true): boolean {
    return colorTransform.offsetEquals(this.__raw, b.raw, compareAlpha);
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
      this.__raw,
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
    colorTransform.toArrays(outColorMultipliers, outColorOffsets, this.__raw);
  }

  // Get & Set Methods

  get redMultiplier(): number {
    return this.__raw.redMultiplier;
  }

  set redMultiplier(value: number) {
    this.__raw.redMultiplier = value;
  }

  get greenMultiplier(): number {
    return this.__raw.greenMultiplier;
  }

  set greenMultiplier(value: number) {
    this.__raw.greenMultiplier = value;
  }

  get blueMultiplier(): number {
    return this.__raw.blueMultiplier;
  }

  set blueMultiplier(value: number) {
    this.__raw.blueMultiplier = value;
  }

  get alphaMultiplier(): number {
    return this.__raw.alphaMultiplier;
  }

  set alphaMultiplier(value: number) {
    this.__raw.alphaMultiplier = value;
  }

  get redOffset(): number {
    return this.__raw.redOffset;
  }

  set redOffset(value: number) {
    this.__raw.redOffset = value;
  }

  get greenOffset(): number {
    return this.__raw.greenOffset;
  }

  set greenOffset(value: number) {
    this.__raw.greenOffset = value;
  }

  get blueOffset(): number {
    return this.__raw.blueOffset;
  }

  set blueOffset(value: number) {
    this.__raw.blueOffset = value;
  }

  get alphaOffset(): number {
    return this.__raw.alphaOffset;
  }

  set alphaOffset(value: number) {
    this.__raw.alphaOffset = value;
  }

  get offsetRGB(): number {
    return colorTransform.getOffsetRGB(this.__raw);
  }

  set offsetRGB(value: number) {
    colorTransform.setOffsetRGB(this.__raw, value);
  }

  get offsetRGBA(): number {
    return colorTransform.getOffsetRGBA(this.__raw);
  }

  set offsetRGBA(value: number) {
    colorTransform.setOffsetRGBA(this.__raw, value);
  }
}
