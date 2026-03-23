import { createTextureAtlasRegion } from '@flighthq/assets';
import type { TextureAtlasRegion as RawTextureAtlasRegion } from '@flighthq/types';

import FlightObject from '../FlightObject';

export default class TextureAtlasRegion extends FlightObject<RawTextureAtlasRegion> {
  constructor(x?: number, y?: number, width?: number, height?: number, pivotX?: number, pivotY?: number) {
    super();
    const raw = this.__raw;
    if (x !== undefined) raw.x = x;
    if (y !== undefined) raw.y = y;
    if (width !== undefined) raw.width = width;
    if (height !== undefined) raw.height = height;
    if (pivotX !== undefined) raw.pivotX = pivotX;
    if (pivotY !== undefined) raw.pivotY = pivotY;
  }

  protected override __create() {
    return createTextureAtlasRegion();
  }

  static fromRaw(raw: Readonly<RawTextureAtlasRegion>): TextureAtlasRegion {
    return FlightObject.getOrCreate(raw, TextureAtlasRegion)!;
  }

  get height(): number {
    return this.__raw.height;
  }

  set height(value: number) {
    this.__raw.height = value;
  }

  get id(): number {
    return this.__raw.id;
  }

  get pivotX(): number | null {
    return this.__raw.pivotX;
  }

  set pivotX(value: number | null) {
    this.__raw.pivotX = value;
  }

  get pivotY(): number | null {
    return this.__raw.pivotY;
  }

  set pivotY(value: number | null) {
    this.__raw.pivotY = value;
  }

  get width(): number {
    return this.__raw.width;
  }

  set width(value: number) {
    this.__raw.width = value;
  }

  get x(): number {
    return this.__raw.x;
  }

  set x(value: number) {
    this.__raw.x = value;
  }

  get y(): number {
    return this.__raw.y;
  }

  set y(value: number) {
    this.__raw.y = value;
  }
}
