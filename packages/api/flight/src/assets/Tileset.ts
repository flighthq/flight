import { createTileset } from '@flighthq/assets';
import type { Tileset as RawTileset } from '@flighthq/types';

import FlightObject from '../FlightObject';
import ImageSource from './ImageSource';
import TextureAtlas from './TextureAtlas';
import TextureAtlasRegion from './TextureAtlasRegion';

export default class Tileset extends FlightObject<RawTileset> {
  constructor() {
    super();
  }

  protected override __create() {
    return createTileset();
  }

  static fromRaw(raw: RawTileset): Tileset {
    return FlightObject.getOrCreate(raw, Tileset)!;
  }
}
