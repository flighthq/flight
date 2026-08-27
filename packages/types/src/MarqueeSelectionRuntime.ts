import type { EntityRuntime } from './Entity';
import type { Rectangle } from './Rectangle';

export interface MarqueeSelectionRuntime extends EntityRuntime {
  active: boolean;
  rectangle: Rectangle;
  startX: number;
  startY: number;
}
