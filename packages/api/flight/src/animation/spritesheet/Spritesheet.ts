import { createSpritesheet } from '@flighthq/animation-spritesheet';
import type { Spritesheet as RawSpritesheet } from '@flighthq/types';

import { TextureAtlas } from '../../assets';
import FlightObject from '../../FlightObject';
import SpritesheetAnimation from './SpritesheetAnimation';

export default class Spritesheet extends FlightObject<RawSpritesheet> {
  constructor(obj?: Partial<Spritesheet>) {
    super();
    if (obj) {
      const raw = this.__raw;
      if (obj.atlas) raw.atlas = obj.atlas.raw;
      if (obj.animations) raw.animations = obj.animations.map((obj) => obj.raw);
    }
  }

  protected override __create() {
    return createSpritesheet();
  }

  static fromRaw(raw: RawSpritesheet): Spritesheet {
    return FlightObject.getOrCreate(raw, Spritesheet)!;
  }

  // Get & Set Methods

  get atlas(): TextureAtlas | null {
    return FlightObject.getOrCreate(this.__raw.atlas, TextureAtlas);
  }

  set atlas(value: TextureAtlas | null) {
    this.__raw.atlas = value ? value.raw : null;
  }

  get animations(): SpritesheetAnimation[] {
    return this.__raw.animations.map((raw) => FlightObject.getOrCreate(raw, SpritesheetAnimation)!);
  }

  set animations(value: SpritesheetAnimation[]) {
    this.__raw.animations = value.map((animation: SpritesheetAnimation) => animation.raw);
  }
}
