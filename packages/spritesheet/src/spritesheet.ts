import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Spritesheet, SpritesheetAnimation } from '@flighthq/types/contract';

import { createSpritesheetFrame } from './spritesheetFrame';

export function cloneSpritesheet(spritesheet: Readonly<Spritesheet>): Spritesheet {
  const frames = spritesheet.frames.map((f) =>
    createSpritesheetFrame({
      id: f.id,
      offsetX: f.offsetX,
      offsetY: f.offsetY,
      pivotX: f.pivotX,
      pivotY: f.pivotY,
      rotated: f.rotated,
    }),
  );
  const out = allocateEntity<Spritesheet>();
  out.atlas = spritesheet.atlas;
  out.animations = { ...spritesheet.animations };
  out.frames = frames;
  return finishEntity(out);
}

export function createSpritesheet(obj?: Partial<Spritesheet>): Spritesheet {
  const out = allocateEntity<Spritesheet>();
  out.atlas = obj?.atlas ?? null;
  out.animations = obj?.animations ?? {};
  out.frames = obj?.frames ?? [];
  return finishEntity(out);
}

export function getSpritesheetAnimation(spritesheet: Spritesheet, label: string): SpritesheetAnimation | null {
  return spritesheet.animations[label] ?? null;
}
