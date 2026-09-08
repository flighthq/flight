import type { Entity } from './Entity';

export interface SpritesheetFrame extends Entity {
  id: number;
  offsetX: number;
  offsetY: number;
  // Normalized pivot in the original, untrimmed frame (0..1). Null means no authored pivot.
  pivotX: number | null;
  pivotY: number | null;
  rotated: boolean;
}
