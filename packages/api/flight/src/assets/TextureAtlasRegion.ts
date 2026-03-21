import { createTextureAtlasRegion } from '@flighthq/assets';
import type { TextureAtlasRegion as RawTextureAtlasRegion } from '@flighthq/types';

import FlightObject from '../FlightObject';

export default class TextureAtlasRegion extends FlightObject<RawTextureAtlasRegion> {
  constructor() {
    super();
  }

  protected override __create() {
    return createTextureAtlasRegion();
  }

  static fromRaw(raw: Readonly<RawTextureAtlasRegion>): TextureAtlasRegion {
    return FlightObject.getOrCreate(raw, TextureAtlasRegion)!;
    // const region = new TextureAtlasRegion();
    // region.__raw.height = raw.height;
    // region.__raw.id = raw.id;
    // region.__raw.pivotX = raw.pivotX;
    // region.__raw.pivotY = raw.pivotY;
    // region.__raw.width = raw.width;
    // region.__raw.x = raw.x;
    // region.__raw.y = raw.y;
    // return region;
  }
}
