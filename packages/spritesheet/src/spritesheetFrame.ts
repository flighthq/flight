import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { SpritesheetFrame } from '@flighthq/types/contract';

export function createSpritesheetFrame(obj?: Partial<SpritesheetFrame>): SpritesheetFrame {
  const out = allocateEntity<SpritesheetFrame>();
  out.id = obj?.id ?? 0;
  out.offsetX = obj?.offsetX ?? 0;
  out.offsetY = obj?.offsetY ?? 0;
  out.pivotX = obj?.pivotX ?? null;
  out.pivotY = obj?.pivotY ?? null;
  out.rotated = obj?.rotated ?? false;
  return finishEntity(out);
}
