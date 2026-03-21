import { createSpritesheetAnimation } from '@flighthq/animation-spritesheet';
import type { SpritesheetAnimation as RawSpritesheetAnimation } from '@flighthq/types';

import { FlightObject } from '../..';

export default class SpritesheetAnimation extends FlightObject<RawSpritesheetAnimation> {
  constructor(obj?: Partial<SpritesheetAnimation>) {
    super();
    if (obj) {
      const raw = this.__raw;
      if (obj.frameDuration) raw.frameDuration = obj.frameDuration;
      if (obj.frames) raw.frames = obj.frames;
      if (obj.label) raw.label = obj.label;
      if (obj.loop) raw.loop = obj.loop;
    }
  }

  protected override __create() {
    return createSpritesheetAnimation();
  }

  static fromRaw(raw: RawSpritesheetAnimation): SpritesheetAnimation {
    return FlightObject.getOrCreate(raw, SpritesheetAnimation)!;
  }

  // Get & Set Methods

  get frameDuration(): number {
    return this.__raw.frameDuration;
  }

  set frameDuration(value: number) {
    this.__raw.frameDuration = value;
  }

  get frames(): number[] {
    return this.__raw.frames;
  }

  set frames(value: number[]) {
    this.__raw.frames = value;
  }

  get label(): string | null {
    return this.__raw.label;
  }

  set label(value: string | null) {
    this.__raw.label = value;
  }

  get loop(): boolean {
    return this.__raw.loop;
  }

  set loop(value: boolean) {
    this.__raw.loop = value;
  }
}
