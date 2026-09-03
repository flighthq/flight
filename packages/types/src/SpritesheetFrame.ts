import type { Entity } from './Entity';

export interface SpritesheetFrame extends Entity {
  id: number;
  offsetX: number;
  offsetY: number;
  pivotX: number | null;
  pivotY: number | null;
  rotated: boolean;
}
