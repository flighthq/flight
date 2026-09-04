import type { Entity } from './Entity';

export interface SpritesheetFrameData extends Entity {
  height: number;
  name: string;
  offsetX: number;
  offsetY: number;
  pivotX: number | null;
  pivotY: number | null;
  rotated: boolean;
  sourceHeight: number;
  sourceWidth: number;
  width: number;
  x: number;
  y: number;
}
