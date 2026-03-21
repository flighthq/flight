import { createImageSource } from '@flighthq/assets';
import type { ImageSource as RawImageSource } from '@flighthq/types';

import FlightObject from '../FlightObject';

export default class ImageSource extends FlightObject<RawImageSource> {
  constructor(src?: HTMLImageElement) {
    super();
    if (src) {
      const raw = this.__raw;
      raw.src = src;
      raw.width = src.width;
      raw.height = src.height;
    }
  }

  protected override __create() {
    return createImageSource();
  }

  static fromRaw(raw: RawImageSource): ImageSource {
    return FlightObject.getOrCreate(raw, ImageSource)!;
  }

  get height(): number {
    return this.__raw.width;
  }

  set height(value: number) {
    this.__raw.height = value;
  }

  get src(): HTMLImageElement | null {
    return this.__raw.src;
  }

  set src(value: HTMLImageElement | null) {
    this.__raw.src = value;
  }

  get width(): number {
    return this.__raw.width;
  }

  set width(value: number) {
    this.__raw.width = value;
  }
}
