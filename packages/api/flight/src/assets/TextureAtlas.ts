import { createTextureAtlas } from '@flighthq/assets';
import type { TextureAtlas as RawTextureAtlas } from '@flighthq/types';

import FlightObject from '../FlightObject';
import ImageSource from './ImageSource';
import TextureAtlasRegion from './TextureAtlasRegion';

export default class TextureAtlas extends FlightObject<RawTextureAtlas> {
  constructor() {
    super();
  }

  protected override __create() {
    return createTextureAtlas();
  }

  static fromRaw(raw: RawTextureAtlas): TextureAtlas {
    return FlightObject.getOrCreate(raw, TextureAtlas)!;
  }

  // Get & Set Methods

  get image(): ImageSource | null {
    return FlightObject.getOrCreate(this.__raw.image, ImageSource);
  }

  set image(value: ImageSource | null) {
    this.__raw.image = value ? value.raw : null;
  }

  get regions(): TextureAtlasRegion[] {
    return this.__raw.regions.map((raw) => FlightObject.getOrCreate(raw, TextureAtlasRegion)!);
  }

  set regions(value: TextureAtlasRegion[]) {
    this.__raw.regions = value.map((region: TextureAtlasRegion) => region.raw);
  }
}
