import { createSpritesheet } from '@flighthq/animation-spritesheet';
import type { Spritesheet as RawSpritesheet } from '@flighthq/types';

import { TextureAtlas } from '../../assets';
import FlightObject from '../../FlightObject';
import SpritesheetAnimation from './SpritesheetAnimation';

export default class Spritesheet extends FlightObject<RawSpritesheet> {
  constructor(atlas?: TextureAtlas, animations?: SpritesheetAnimation[]) {
    super();
    if (atlas) this.__raw.atlas = atlas.raw;
    if (animations) this.__raw.animations = animations.map((obj) => obj.raw);
  }

  protected override __create() {
    return createSpritesheet();
  }

  addAnimation(animation: SpritesheetAnimation): void {
    this.__raw.animations.push(animation.raw);
  }

  static fromRaw(raw: RawSpritesheet): Spritesheet {
    return FlightObject.getOrCreate(raw, Spritesheet)!;
  }

  getAnimation(index: number): SpritesheetAnimation | null {
    if (index >= 0 && index < this.__raw.animations.length) {
      return FlightObject.getOrCreate(this.__raw.animations[index], SpritesheetAnimation);
    }
    return null;
  }

  // Get & Set Methods

  get atlas(): TextureAtlas | null {
    return FlightObject.getOrCreate(this.__raw.atlas, TextureAtlas);
  }

  set atlas(value: TextureAtlas | null) {
    this.__raw.atlas = value ? value.raw : null;
  }

  get numAnimations(): number {
    return this.__raw.animations.length;
  }
}
