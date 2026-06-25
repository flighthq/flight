import { createEntity } from '@flighthq/entity';
import type { Spritesheet, SpritesheetAnimation } from '@flighthq/types';

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
  return createEntity({
    atlas: spritesheet.atlas,
    animations: { ...spritesheet.animations },
    frames,
  });
}

export function createSpritesheet(obj?: Partial<Spritesheet>): Spritesheet {
  return createEntity({
    atlas: obj?.atlas ?? null,
    animations: obj?.animations ?? {},
    frames: obj?.frames ?? [],
  });
}

export function getSpritesheetAnimation(spritesheet: Spritesheet, label: string): SpritesheetAnimation | null {
  return spritesheet.animations[label] ?? null;
}
