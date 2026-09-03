import { createEntity } from '@flighthq/entity/contract';
import type { SpritesheetFrame } from '@flighthq/types/contract';

export function createSpritesheetFrame(obj?: Partial<SpritesheetFrame>): SpritesheetFrame {
  return createEntity({
    id: obj?.id ?? 0,
    offsetX: obj?.offsetX ?? 0,
    offsetY: obj?.offsetY ?? 0,
    pivotX: obj?.pivotX ?? null,
    pivotY: obj?.pivotY ?? null,
    rotated: obj?.rotated ?? false,
  });
}
