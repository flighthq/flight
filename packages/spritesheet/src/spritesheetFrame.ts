import type { SpritesheetFrame } from '@flighthq/types';

export function createSpritesheetFrame(obj?: Partial<SpritesheetFrame>): SpritesheetFrame {
  return {
    id: obj?.id ?? 0,
    offsetX: obj?.offsetX ?? 0,
    offsetY: obj?.offsetY ?? 0,
  };
}
