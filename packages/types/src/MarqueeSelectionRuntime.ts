import type { EntityRuntime } from './Entity.ts';
import type { Rectangle } from './Rectangle.ts';

export interface MarqueeSelectionRuntime extends EntityRuntime {
  active: boolean;
  rectangle: Rectangle;
  startX: number;
  startY: number;
}
