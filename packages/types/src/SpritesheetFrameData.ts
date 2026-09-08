import type { Entity } from './Entity';

export interface SpritesheetFrameData extends Entity {
  height: number;
  name: string;
  offsetX: number;
  offsetY: number;
  // Normalized pivot in the original, untrimmed frame (0..1). Null means no authored pivot.
  pivotX: number | null;
  pivotY: number | null;
  rotated: boolean;
  sourceHeight: number;
  sourceWidth: number;
  width: number;
  x: number;
  y: number;
}
